/**
 * lib/countries/KE/scrapers/parliament.ts
 * Kenya Parliament bills scraper — new.kenyalaw.org/bills
 *
 * Strategy:
 * 1. Fetch https://new.kenyalaw.org/bills/ with HX-Request: true to get the
 *    HTMX-rendered document table (same pattern as gazette scraper)
 * 2. Parse td.cell-title links — hrefs are /akn/ke/bill/...
 * 3. Dedup by URL hash (quick) then content hash (after download)
 * 4. Download PDF from {bill_page_url}/source.pdf
 * 5. Parse text, upload to Supabase Storage, insert document record
 * 6. Crawl delay: minimum 2 s between requests
 *
 * Called by pg_cron: daily at 07:15 EAT.
 * Can also be run manually: npx tsx scripts/run-scraper.ts parliament
 */

import { load } from 'cheerio';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { scrapeFetch, sleep, DEFAULT_CRAWL_DELAY_MS, SCRAPER_USER_AGENT } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer } from '@/lib/parsers/pdfParser';

const PARLIAMENT_BILLS_URL = 'https://new.kenyalaw.org/bills/';
const KENYA_LAW_BASE_URL   = 'https://new.kenyalaw.org';
const COUNTRY_CODE         = 'KE' as const;
const SCANNED_THRESHOLD    = 500;
const MAX_BILLS_PER_RUN    = 10;

/**
 * Fetch the bills listing page with the HX-Request header so the HTMX
 * component renders the document table. Returns bill page links + titles.
 */
async function fetchBillLinks(): Promise<{ url: string; title: string }[]> {
  const response = await fetch(PARLIAMENT_BILLS_URL, {
    headers: {
      'User-Agent': SCRAPER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': KENYA_LAW_BASE_URL + '/',
      'HX-Request': 'true',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching bills listing: ${PARLIAMENT_BILLS_URL}`);
  }

  const html = await response.text();
  const $ = load(html);

  const links: { url: string; title: string }[] = [];
  $('td.cell-title a[href]').each((_, el) => {
    const href  = $(el).attr('href') ?? '';
    const title = $(el).text().trim();
    if (href.includes('/akn/ke/bill/')) {
      const absUrl = href.startsWith('http') ? href : `${KENYA_LAW_BASE_URL}${href}`;
      links.push({ url: absUrl, title: title || 'Kenya Parliament Bill' });
    }
  });

  return links;
}

/**
 * Resolve the PDF URL for a bill page.
 * On new.kenyalaw.org the PDF is always at {page_url}/source.pdf.
 * Falls back to scraping data-pdf attribute for any non-standard URL.
 */
async function resolveBillPdfUrl(url: string): Promise<string | null> {
  if (url.endsWith('.pdf')) return url;

  // Predictable pattern for all AKN documents on new.kenyalaw.org
  if (url.includes('/akn/ke/')) return `${url}/source.pdf`;

  // Generic fallback: look for data-pdf attribute or <a href="*.pdf">
  try {
    const response = await scrapeFetch(url);
    const html = await response.text();
    const $ = load(html);

    const dataPdf = $('[data-pdf]').attr('data-pdf');
    if (dataPdf) {
      return dataPdf.startsWith('http') ? dataPdf : `${KENYA_LAW_BASE_URL}${dataPdf}`;
    }

    let pdfUrl: string | null = null;
    $('a[href$=".pdf"]').each((_, el) => {
      if (pdfUrl) return;
      const href = $(el).attr('href') ?? '';
      pdfUrl = href.startsWith('http')
        ? href
        : `${KENYA_LAW_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
    });
    return pdfUrl;
  } catch {
    return null;
  }
}

/**
 * Main Parliament scraper function.
 */
export async function runParliamentScraper(): Promise<ScraperRunSummary> {
  const supabase = buildScraperSupabaseClient();
  const startedAt = new Date();
  const results: ScraperResult[] = [];
  let processed = 0;
  let inserted  = 0;
  let skipped   = 0;
  let errors    = 0;

  console.log(`[parliament] Starting at ${startedAt.toISOString()}`);

  let links: { url: string; title: string }[];
  try {
    links = await fetchBillLinks();
    console.log(`[parliament] Found ${links.length} bill links`);
  } catch (err) {
    console.error('[parliament] Failed to fetch bill listing:', err);
    return { scraperName: 'parliament', startedAt, finishedAt: new Date(), processed: 0, inserted: 0, skipped: 0, errors: 1, results: [] };
  }

  let newCount = 0;
  for (const { url: billUrl, title } of links) {
    if (newCount >= MAX_BILLS_PER_RUN) {
      console.log(`[parliament] Hit max ${MAX_BILLS_PER_RUN} new bills per run — stopping`);
      break;
    }

    processed++;

    const urlHash = computeHash(billUrl);
    if (await isDuplicate(supabase, urlHash)) {
      skipped++;
      results.push({ url: billUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'url_hash_exists' });
      continue;
    }

    await sleep(DEFAULT_CRAWL_DELAY_MS);

    try {
      const pdfUrl = await resolveBillPdfUrl(billUrl);

      if (!pdfUrl) {
        console.warn(`[parliament] No PDF found for: ${billUrl}`);
        skipped++;
        results.push({ url: billUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'no_pdf_found' });
        continue;
      }

      await sleep(DEFAULT_CRAWL_DELAY_MS);
      const pdfResponse = await scrapeFetch(pdfUrl, 60_000);
      const pdfBuffer   = Buffer.from(await pdfResponse.arrayBuffer());

      const { text: rawText, pageCount, isScanned: likelyScanned } = await parsePdfBuffer(pdfBuffer);
      const isScanned = likelyScanned || rawText.length < SCANNED_THRESHOLD;

      const contentHash = computeContentHash(pdfBuffer.toString('base64'));
      if (await isDuplicate(supabase, contentHash)) {
        skipped++;
        results.push({ url: billUrl, contentHash, documentId: '', isNew: false, isScanned, skipped: true, skipReason: 'content_hash_exists' });
        continue;
      }

      let storagePath: string | null = null;
      const safeName = `${contentHash}-parliament-bill.pdf`;
      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
      if (!storageErr) {
        storagePath = safeName;
      } else if (storageErr.message !== 'The resource already exists') {
        console.warn(`[parliament] Storage warning: ${storageErr.message}`);
      }

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
        throw new Error(`Insert failed: ${insertErr?.message ?? 'no row'}`);
      }

      console.log(`[parliament] Stored: ${title} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
      inserted++;
      newCount++;
      results.push({ url: pdfUrl, contentHash, documentId: docRow.id, isNew: true, isScanned, skipped: false });
    } catch (err) {
      errors++;
      console.error(`[parliament] Error: ${billUrl}`, err);
      results.push({ url: billUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: false, skipReason: String(err) });
    }
  }

  const finishedAt = new Date();
  console.log(`[parliament] Done. processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { scraperName: 'parliament', startedAt, finishedAt, processed, inserted, skipped, errors, results };
}
