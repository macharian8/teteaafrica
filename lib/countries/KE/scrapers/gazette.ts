/**
 * lib/countries/KE/scrapers/gazette.ts
 * Kenya Gazette scraper — kenyalaw.org/kenya_gazette
 *
 * Strategy:
 * 1. Fetch the gazette listing page
 * 2. Parse PDF links (weekly gazette issues)
 * 3. Skip any link whose URL-hash already exists in documents table (dedup)
 * 4. Download new PDFs, parse text, upload to Supabase Storage
 * 5. Insert document record with source='gazette'
 * 6. If scanned PDF (text < 500 chars), flag is_scanned=true, store anyway
 * 7. Crawl delay: minimum 2 s between requests
 *
 * Called by the pg_cron job: every Friday at 08:00 EAT.
 * Can also be run manually: npx tsx scripts/run-scraper.ts gazette
 */

import { load } from 'cheerio';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { scrapeFetch, sleep, DEFAULT_CRAWL_DELAY_MS } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer } from '@/lib/parsers/pdfParser';

const GAZETTE_INDEX_URL = 'https://www.kenyalaw.org/kenya_gazette/';
const GAZETTE_BASE_URL  = 'https://www.kenyalaw.org';
const COUNTRY_CODE      = 'KE' as const;
const SCANNED_THRESHOLD = 500; // chars — below this = scanned PDF
const MAX_ISSUES_PER_RUN = 10; // don't fetch more than 10 new issues per run

/**
 * Parse the gazette listing page and return PDF links with titles.
 */
async function fetchGazetteLinks(): Promise<{ url: string; title: string }[]> {
  const response = await scrapeFetch(GAZETTE_INDEX_URL);
  const html = await response.text();
  const $ = load(html);

  const links: { url: string; title: string }[] = [];

  // kenyalaw.org gazette page has links to gazette issues — look for PDF links
  // and anchor links to gazette issue pages
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().trim();

    // Match direct PDF links and gazette issue page links
    if (href.endsWith('.pdf') || href.includes('/kenya_gazette/')) {
      const absoluteUrl = href.startsWith('http')
        ? href
        : `${GAZETTE_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

      // Filter out the index page itself
      if (absoluteUrl !== GAZETTE_INDEX_URL && absoluteUrl !== `${GAZETTE_INDEX_URL}/`) {
        links.push({ url: absoluteUrl, title: text || 'Kenya Gazette Issue' });
      }
    }
  });

  // Deduplicate by URL
  const seen = new Set<string>();
  return links.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

/**
 * If a gazette issue link points to an HTML page rather than a PDF,
 * fetch that page and extract the first PDF download link.
 */
async function resolvePdfUrl(url: string): Promise<string | null> {
  if (url.endsWith('.pdf')) return url;

  try {
    const response = await scrapeFetch(url);
    const html = await response.text();
    const $ = load(html);

    let pdfUrl: string | null = null;
    $('a[href$=".pdf"]').each((_, el) => {
      if (pdfUrl) return;
      const href = $(el).attr('href') ?? '';
      pdfUrl = href.startsWith('http')
        ? href
        : `${GAZETTE_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
    });
    return pdfUrl;
  } catch {
    return null;
  }
}

/**
 * Main gazette scraper function.
 * Returns a run summary.
 */
export async function runGazetteScraper(): Promise<ScraperRunSummary> {
  const supabase = buildScraperSupabaseClient();
  const startedAt = new Date();
  const results: ScraperResult[] = [];
  let processed = 0;
  let inserted  = 0;
  let skipped   = 0;
  let errors    = 0;

  console.log(`[gazette] Starting Kenya Gazette scraper at ${startedAt.toISOString()}`);

  // 1. Get list of gazette issue links
  let links: { url: string; title: string }[];
  try {
    links = await fetchGazetteLinks();
    console.log(`[gazette] Found ${links.length} gazette issue links`);
  } catch (err) {
    console.error('[gazette] Failed to fetch gazette index:', err);
    return {
      scraperName: 'gazette',
      startedAt,
      finishedAt: new Date(),
      processed: 0,
      inserted: 0,
      skipped: 0,
      errors: 1,
      results: [],
    };
  }

  // 2. Process each link (up to MAX_ISSUES_PER_RUN new ones)
  let newCount = 0;
  for (const { url: issueUrl, title: issueTitle } of links) {
    if (newCount >= MAX_ISSUES_PER_RUN) {
      console.log(`[gazette] Hit max ${MAX_ISSUES_PER_RUN} new issues per run — stopping`);
      break;
    }

    processed++;

    // Quick URL-based dedup before downloading
    const urlHash = computeHash(issueUrl);
    const urlDuplicate = await isDuplicate(supabase, urlHash);
    if (urlDuplicate) {
      skipped++;
      results.push({ url: issueUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'url_hash_exists' });
      continue;
    }

    await sleep(DEFAULT_CRAWL_DELAY_MS);

    try {
      // Resolve to a PDF URL if this is an index page
      let pdfUrl: string | null = issueUrl.endsWith('.pdf') ? issueUrl : null;
      if (!pdfUrl) {
        await sleep(DEFAULT_CRAWL_DELAY_MS);
        pdfUrl = await resolvePdfUrl(issueUrl);
      }

      if (!pdfUrl) {
        console.warn(`[gazette] No PDF found at ${issueUrl} — skipping`);
        skipped++;
        results.push({ url: issueUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'no_pdf_found' });
        continue;
      }

      // Download PDF
      await sleep(DEFAULT_CRAWL_DELAY_MS);
      const pdfResponse = await scrapeFetch(pdfUrl, 60_000);
      const pdfBuffer   = Buffer.from(await pdfResponse.arrayBuffer());

      // Parse text
      const { text: rawText, pageCount, isScanned: likelyScanned } = await parsePdfBuffer(pdfBuffer);
      const isScanned = likelyScanned || rawText.length < SCANNED_THRESHOLD;

      // Content-based dedup
      const contentHash = computeContentHash(pdfBuffer.toString('base64'));
      const contentDuplicate = await isDuplicate(supabase, contentHash);
      if (contentDuplicate) {
        skipped++;
        results.push({ url: pdfUrl, contentHash, documentId: '', isNew: false, isScanned, skipped: true, skipReason: 'content_hash_exists' });
        continue;
      }

      // Upload PDF to Storage
      const safeName = `${contentHash}-gazette.pdf`;
      let storagePath: string | null = null;
      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
      if (!storageErr) {
        storagePath = safeName;
      } else if (storageErr.message !== 'The resource already exists') {
        console.warn(`[gazette] Storage upload warning for ${pdfUrl}: ${storageErr.message}`);
      }

      // Insert document record
      const { data: docRow, error: insertErr } = await supabase
        .from('documents')
        .insert({
          country_code: COUNTRY_CODE,
          url: pdfUrl,
          raw_text: isScanned ? '' : rawText,
          storage_path: storagePath,
          content_hash: contentHash,
          source: 'scraper',
          scraped_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertErr || !docRow) {
        throw new Error(`Insert failed: ${insertErr?.message ?? 'no row returned'}`);
      }

      console.log(`[gazette] Stored: ${issueTitle} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
      inserted++;
      newCount++;
      results.push({
        url: pdfUrl,
        contentHash,
        documentId: docRow.id,
        isNew: true,
        isScanned,
        skipped: false,
      });
    } catch (err) {
      errors++;
      console.error(`[gazette] Error processing ${issueUrl}:`, err);
      results.push({
        url: issueUrl,
        contentHash: urlHash,
        documentId: '',
        isNew: false,
        isScanned: false,
        skipped: false,
        skipReason: err instanceof Error ? err.message : 'unknown_error',
      });
    }
  }

  const finishedAt = new Date();
  console.log(`[gazette] Done. processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { scraperName: 'gazette', startedAt, finishedAt, processed, inserted, skipped, errors, results };
}
