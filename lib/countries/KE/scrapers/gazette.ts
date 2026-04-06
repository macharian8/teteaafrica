/**
 * lib/countries/KE/scrapers/gazette.ts
 * Kenya Gazette + County Legislation scraper — new.kenyalaw.org
 *
 * Sources (processed in order, combined cap = MAX_ISSUES_PER_RUN):
 *  A. Gazette issues  — new.kenyalaw.org/gazettes/
 *  B. County legislation — new.kenyalaw.org/legislation/counties → per-county pages
 *
 * Strategy per source:
 * 1. Fetch the index page to discover document page URLs
 * 2. Fetch listing pages with HX-Request: true to get the HTMX document table
 * 3. Skip any URL whose hash already exists in documents table (dedup)
 * 4. Download PDF from {document_page_url}/source.pdf
 * 5. Parse text, upload to Supabase Storage, insert document record
 * 6. Crawl delay: minimum 2 s between requests
 *
 * Called by the pg_cron job: every Friday at 08:00 EAT.
 * Can also be run manually: npx tsx scripts/run-scraper.ts gazette
 */

import { load } from 'cheerio';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { scrapeFetch, sleep, DEFAULT_CRAWL_DELAY_MS, SCRAPER_USER_AGENT } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer } from '@/lib/parsers/pdfParser';

const KENYA_LAW_BASE_URL         = 'https://new.kenyalaw.org';
const GAZETTE_INDEX_URL          = 'https://new.kenyalaw.org/gazettes/';
const COUNTY_LEGISLATION_INDEX   = 'https://new.kenyalaw.org/legislation/counties';
const COUNTRY_CODE               = 'KE' as const;
const SCANNED_THRESHOLD          = 500; // chars — below this = scanned PDF
const MAX_ISSUES_PER_RUN         = 10;  // combined cap across gazette + county legislation
const MAX_GAZETTE_YEARS_TO_SCAN  = 2;   // scan 2 most recent gazette years
const MAX_COUNTIES_TO_SCAN       = 3;   // scan 3 counties per run for legislation

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Fetch a listing page with the HX-Request header so the HTMX component
 * renders the document table. Returns links from td.cell-title anchors.
 */
async function fetchHtmxDocumentList(
  listingUrl: string,
  hrefFilter: (href: string) => boolean,
  referer = KENYA_LAW_BASE_URL + '/'
): Promise<{ url: string; title: string }[]> {
  const response = await fetch(listingUrl, {
    headers: {
      'User-Agent': SCRAPER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': referer,
      'HX-Request': 'true',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching listing: ${listingUrl}`);
  }

  const html = await response.text();
  const $ = load(html);

  const links: { url: string; title: string }[] = [];
  $('td.cell-title a[href]').each((_, el) => {
    const href  = $(el).attr('href') ?? '';
    const title = $(el).text().trim();
    if (hrefFilter(href)) {
      const absUrl = href.startsWith('http') ? href : `${KENYA_LAW_BASE_URL}${href}`;
      links.push({ url: absUrl, title: title || 'Kenya Law Document' });
    }
  });

  return links;
}

/**
 * Resolve the PDF download URL for any new.kenyalaw.org AKN document page.
 * All document types (gazette, bill, county act) follow the same pattern:
 *   {page_url}/source.pdf
 * Falls back to scraping data-pdf attribute for non-AKN URLs.
 */
async function resolvePdfUrl(url: string): Promise<string | null> {
  if (url.endsWith('.pdf')) return url;

  // All AKN document pages on new.kenyalaw.org share this pattern
  if (url.includes('/akn/ke')) return `${url}/source.pdf`;

  // Generic fallback: scrape data-pdf attribute or <a href="*.pdf">
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

// ─── Source A: Gazette issues ─────────────────────────────────────────────────

async function fetchGazetteYearLinks(): Promise<string[]> {
  const response = await scrapeFetch(GAZETTE_INDEX_URL);
  const html = await response.text();
  const $ = load(html);

  const years: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (/^\/gazettes\/\d{4}$/.test(href)) {
      const absUrl = `${KENYA_LAW_BASE_URL}${href}`;
      if (!years.includes(absUrl)) years.push(absUrl);
    }
  });

  return years.slice(0, MAX_GAZETTE_YEARS_TO_SCAN);
}

async function fetchGazetteLinks(): Promise<{ url: string; title: string }[]> {
  const yearUrls = await fetchGazetteYearLinks();
  console.log(`[gazette] Gazette years to scan: ${yearUrls.join(', ')}`);

  const links: { url: string; title: string }[] = [];
  for (const yearUrl of yearUrls) {
    await sleep(DEFAULT_CRAWL_DELAY_MS);
    try {
      const yearLinks = await fetchHtmxDocumentList(
        yearUrl,
        (href) => href.includes('/officialGazette/'),
        GAZETTE_INDEX_URL
      );
      console.log(`[gazette] ${yearUrl} → ${yearLinks.length} gazette issues`);
      links.push(...yearLinks);
    } catch (err) {
      console.warn(`[gazette] Could not fetch gazette year ${yearUrl}:`, err);
    }
  }

  return links;
}

// ─── Source B: County legislation ────────────────────────────────────────────

async function fetchCountyIndexLinks(): Promise<string[]> {
  const response = await scrapeFetch(COUNTY_LEGISLATION_INDEX);
  const html = await response.text();
  const $ = load(html);

  const countyUrls: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    // County pages: /legislation/ke-NNN/
    if (/^\/legislation\/ke-\d+\/?$/.test(href)) {
      const absUrl = `${KENYA_LAW_BASE_URL}${href.replace(/\/$/, '')}`;
      if (!countyUrls.includes(absUrl)) countyUrls.push(absUrl);
    }
  });

  return countyUrls.slice(0, MAX_COUNTIES_TO_SCAN);
}

async function fetchCountyLegislationLinks(): Promise<{ url: string; title: string }[]> {
  let countyUrls: string[];
  try {
    countyUrls = await fetchCountyIndexLinks();
    console.log(`[gazette] County legislation pages to scan: ${countyUrls.join(', ')}`);
  } catch (err) {
    console.warn('[gazette] Could not fetch county index:', err);
    return [];
  }

  const links: { url: string; title: string }[] = [];
  for (const countyUrl of countyUrls) {
    await sleep(DEFAULT_CRAWL_DELAY_MS);
    try {
      const countyLinks = await fetchHtmxDocumentList(
        countyUrl,
        (href) => href.includes('/akn/ke-') && href.includes('/act/'),
        COUNTY_LEGISLATION_INDEX
      );
      console.log(`[gazette] ${countyUrl} → ${countyLinks.length} county acts`);
      links.push(...countyLinks);
    } catch (err) {
      console.warn(`[gazette] Could not fetch county legislation ${countyUrl}:`, err);
    }
  }

  return links;
}

// ─── Shared document processing ───────────────────────────────────────────────

async function processDocumentLink(
  issueUrl: string,
  issueTitle: string,
  supabase: ReturnType<typeof buildScraperSupabaseClient>,
  results: ScraperResult[],
  label: string
): Promise<'inserted' | 'skipped' | 'error'> {
  // URL-based dedup
  const urlHash = computeHash(issueUrl);
  if (await isDuplicate(supabase, urlHash)) {
    results.push({ url: issueUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'url_hash_exists' });
    return 'skipped';
  }

  await sleep(DEFAULT_CRAWL_DELAY_MS);

  try {
    const pdfUrl = await resolvePdfUrl(issueUrl);

    if (!pdfUrl) {
      console.warn(`[gazette] No PDF found at ${issueUrl} — skipping`);
      results.push({ url: issueUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'no_pdf_found' });
      return 'skipped';
    }

    await sleep(DEFAULT_CRAWL_DELAY_MS);
    const pdfResponse = await scrapeFetch(pdfUrl, 60_000);
    const pdfBuffer   = Buffer.from(await pdfResponse.arrayBuffer());

    const { text: rawText, pageCount, isScanned: likelyScanned } = await parsePdfBuffer(pdfBuffer);
    const isScanned = likelyScanned || rawText.length < SCANNED_THRESHOLD;

    const contentHash = computeContentHash(pdfBuffer.toString('base64'));
    if (await isDuplicate(supabase, contentHash)) {
      results.push({ url: pdfUrl, contentHash, documentId: '', isNew: false, isScanned, skipped: true, skipReason: 'content_hash_exists' });
      return 'skipped';
    }

    const safeName = `${contentHash}-gazette.pdf`;
    let storagePath: string | null = null;
    const { error: storageErr } = await supabase.storage
      .from('documents')
      .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
    if (!storageErr) {
      storagePath = safeName;
    } else if (storageErr.message !== 'The resource already exists') {
      console.warn(`[gazette] Storage warning for ${pdfUrl}: ${storageErr.message}`);
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
      throw new Error(`Insert failed: ${insertErr?.message ?? 'no row returned'}`);
    }

    console.log(`[gazette][${label}] Stored: ${issueTitle} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
    results.push({ url: pdfUrl, contentHash, documentId: docRow.id, isNew: true, isScanned, skipped: false });
    return 'inserted';
  } catch (err) {
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
    return 'error';
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runGazetteScraper(): Promise<ScraperRunSummary> {
  const supabase = buildScraperSupabaseClient();
  const startedAt = new Date();
  const results: ScraperResult[] = [];
  let processed = 0;
  let inserted  = 0;
  let skipped   = 0;
  let errors    = 0;

  console.log(`[gazette] Starting Kenya Gazette + County Legislation scraper at ${startedAt.toISOString()}`);

  // Fetch both link lists (gazette first, county legislation second)
  let gazetteLinks: { url: string; title: string }[] = [];
  let countyLinks:  { url: string; title: string }[] = [];

  try {
    gazetteLinks = await fetchGazetteLinks();
    console.log(`[gazette] Gazette issues found: ${gazetteLinks.length}`);
  } catch (err) {
    console.error('[gazette] Failed to fetch gazette index:', err);
    errors++;
  }

  try {
    countyLinks = await fetchCountyLegislationLinks();
    console.log(`[gazette] County acts found: ${countyLinks.length}`);
  } catch (err) {
    console.warn('[gazette] Failed to fetch county legislation:', err);
  }

  // Process gazette issues first, then county legislation, shared cap
  const allLinks: { url: string; title: string; label: string }[] = [
    ...gazetteLinks.map((l) => ({ ...l, label: 'gazette' })),
    ...countyLinks.map((l)  => ({ ...l, label: 'county' })),
  ];

  let newCount = 0;
  for (const { url, title, label } of allLinks) {
    if (newCount >= MAX_ISSUES_PER_RUN) {
      console.log(`[gazette] Hit combined max ${MAX_ISSUES_PER_RUN} — stopping`);
      break;
    }

    processed++;
    const outcome = await processDocumentLink(url, title, supabase, results, label);

    if (outcome === 'inserted') { inserted++; newCount++; }
    else if (outcome === 'skipped') { skipped++; }
    else { errors++; }
  }

  const finishedAt = new Date();
  console.log(`[gazette] Done. processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { scraperName: 'gazette', startedAt, finishedAt, processed, inserted, skipped, errors, results };
}
