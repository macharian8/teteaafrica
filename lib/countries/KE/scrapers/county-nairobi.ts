/**
 * lib/countries/KE/scrapers/county-nairobi.ts
 * Nairobi County scraper — nairobi.go.ke/downloads
 *
 * Strategy:
 * 1. Fetch the downloads/documents page
 * 2. Parse links to PDFs and policy documents
 * 3. Dedup by URL hash (quick) then content hash (after download)
 * 4. Download, parse, upload, insert document record with source='scraper'
 * 5. Crawl delay: minimum 2 s between requests
 *
 * Called by pg_cron: daily at 07:00 EAT.
 */

import { load } from 'cheerio';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { scrapeFetch, sleep, DEFAULT_CRAWL_DELAY_MS } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer, preprocessText } from '@/lib/parsers/pdfParser';

const COUNTY_DOWNLOADS_URL = 'https://www.nairobi.go.ke/downloads/';
const COUNTY_BASE_URL       = 'https://www.nairobi.go.ke';
const COUNTRY_CODE          = 'KE' as const;
const SCANNED_THRESHOLD     = 500;
const MAX_DOCS_PER_RUN      = 20;

interface DocumentLink {
  url: string;
  title: string;
  type: 'pdf' | 'html';
}

/**
 * Fetch and parse the Nairobi County downloads page.
 * Returns a list of downloadable document links.
 */
async function fetchCountyDocumentLinks(): Promise<DocumentLink[]> {
  const response = await scrapeFetch(COUNTY_DOWNLOADS_URL);
  const html = await response.text();
  const $ = load(html);

  const links: DocumentLink[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().trim();
    if (!href || href === '#' || href.startsWith('mailto:')) return;

    const isPdf = href.endsWith('.pdf') || href.includes('.pdf?');
    const isDoc = /\.(doc|docx|xls|xlsx)(\?|$)/i.test(href);
    if (!isPdf && !isDoc) return;

    const absoluteUrl = href.startsWith('http')
      ? href
      : `${COUNTY_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

    if (seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);

    links.push({
      url: absoluteUrl,
      title: text || 'Nairobi County Document',
      type: 'pdf',
    });
  });

  return links;
}

/**
 * Main Nairobi County scraper function.
 */
export async function runNairobiCountyScraper(): Promise<ScraperRunSummary> {
  const supabase = buildScraperSupabaseClient();
  const startedAt = new Date();
  const results: ScraperResult[] = [];
  let processed = 0;
  let inserted  = 0;
  let skipped   = 0;
  let errors    = 0;

  console.log(`[county-nairobi] Starting at ${startedAt.toISOString()}`);

  let links: DocumentLink[];
  try {
    links = await fetchCountyDocumentLinks();
    console.log(`[county-nairobi] Found ${links.length} document links`);
  } catch (err) {
    console.error('[county-nairobi] Failed to fetch downloads page:', err);
    return { scraperName: 'county-nairobi', startedAt, finishedAt: new Date(), processed: 0, inserted: 0, skipped: 0, errors: 1, results: [] };
  }

  let newCount = 0;
  for (const { url: docUrl, title } of links) {
    if (newCount >= MAX_DOCS_PER_RUN) break;
    processed++;

    // Quick URL dedup
    const urlHash = computeHash(docUrl);
    if (await isDuplicate(supabase, urlHash)) {
      skipped++;
      results.push({ url: docUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'url_hash_exists' });
      continue;
    }

    await sleep(DEFAULT_CRAWL_DELAY_MS);

    try {
      const docResponse = await scrapeFetch(docUrl, 60_000);
      const contentType = docResponse.headers.get('content-type') ?? '';
      const isHtml = contentType.includes('text/html');

      let rawText = '';
      let pageCount = 1;
      let isScanned = false;
      let pdfBuffer: Buffer | null = null;

      if (isHtml) {
        const html = await docResponse.text();
        rawText = preprocessText(
          html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
        );
      } else {
        pdfBuffer = Buffer.from(await docResponse.arrayBuffer());
        const parsed = await parsePdfBuffer(pdfBuffer);
        rawText = parsed.text;
        pageCount = parsed.pageCount;
        isScanned = parsed.isScanned || rawText.length < SCANNED_THRESHOLD;
      }

      // Content dedup
      const contentForHash = pdfBuffer ? pdfBuffer.toString('base64') : rawText;
      const contentHash = computeContentHash(contentForHash);
      if (await isDuplicate(supabase, contentHash)) {
        skipped++;
        results.push({ url: docUrl, contentHash, documentId: '', isNew: false, isScanned, skipped: true, skipReason: 'content_hash_exists' });
        continue;
      }

      // Upload to storage (PDFs only)
      let storagePath: string | null = null;
      if (pdfBuffer) {
        const safeName = `${contentHash}-nairobi-county.pdf`;
        const { error: storageErr } = await supabase.storage
          .from('documents')
          .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
        if (!storageErr) storagePath = safeName;
        else if (storageErr.message !== 'The resource already exists') {
          console.warn(`[county-nairobi] Storage warning: ${storageErr.message}`);
        }
      }

      const { data: docRow, error: insertErr } = await supabase
        .from('documents')
        .insert({
          country_code: COUNTRY_CODE,
          url: docUrl,
          raw_text: isScanned ? '' : rawText,
          storage_path: storagePath,
          content_hash: contentHash,
          source: 'scraper',
          scraped_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertErr || !docRow) {
        throw new Error(`Insert failed: ${insertErr?.message ?? 'no row'}`);
      }

      console.log(`[county-nairobi] Stored: ${title} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
      inserted++;
      newCount++;
      results.push({ url: docUrl, contentHash, documentId: docRow.id, isNew: true, isScanned, skipped: false });
    } catch (err) {
      errors++;
      console.error(`[county-nairobi] Error: ${docUrl}`, err);
      results.push({ url: docUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: false, skipReason: String(err) });
    }
  }

  const finishedAt = new Date();
  console.log(`[county-nairobi] Done. processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { scraperName: 'county-nairobi', startedAt, finishedAt, processed, inserted, skipped, errors, results };
}
