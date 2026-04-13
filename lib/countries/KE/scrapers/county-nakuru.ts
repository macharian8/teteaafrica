/**
 * lib/countries/KE/scrapers/county-nakuru.ts
 * Nakuru County scraper — two sources:
 *   A) County Government: nakuru.go.ke WPDM downloads
 *   B) County Assembly: assembly.nakuru.go.ke (HIGH VALUE for PP notices)
 *
 * Strategy:
 * 1. Source A: scrape /download-category/downloads/ for WPDM packages
 * 2. Source B: scrape assembly site for public participation notices, bills
 * 3. Dedup by URL hash then content hash
 * 4. Upload to Supabase Storage, insert document record
 * 5. Crawl delay: minimum 2 s between requests
 *
 * SSL: assembly.nakuru.go.ke likely self-signed — rejectUnauthorized: false.
 */

import { load } from 'cheerio';
import { Agent } from 'undici';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { sleep, DEFAULT_CRAWL_DELAY_MS, SCRAPER_USER_AGENT, scrapeFetch } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer } from '@/lib/parsers/pdfParser';

/** SSL-relaxed agent for assembly.nakuru.go.ke */
const nakuruAssemblyAgent = new Agent({ connect: { rejectUnauthorized: false } });

type UndiciRequestInit = Parameters<typeof fetch>[1] & { dispatcher?: Agent };

async function assemblyScrapeFetch(url: string, timeoutMs = 30_000): Promise<Response> {
  const parsedUrl = new URL(url);
  const options: UndiciRequestInit = {
    dispatcher: nakuruAssemblyAgent,
    headers: {
      'User-Agent': SCRAPER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${parsedUrl.protocol}//${parsedUrl.host}/`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
  const response = await fetch(url, options as RequestInit);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${url}`);
  }
  return response;
}

const COUNTY_RSS_URL       = 'https://nakuru.go.ke/feed/';
const COUNTY_BASE_URL      = 'https://nakuru.go.ke';
const ASSEMBLY_URL         = 'https://nakuruassembly.go.ke/downloads/';
const ASSEMBLY_BILLS_URL   = 'https://nakuruassembly.go.ke/bills/';
const ASSEMBLY_BASE_URL    = 'https://nakuruassembly.go.ke';
const COUNTRY_CODE         = 'KE' as const;
const SCANNED_THRESHOLD    = 500;
const MAX_PER_SOURCE       = 10;

interface PageItem {
  url: string;
  title: string;
  isDirect: boolean;
  source: 'county' | 'assembly';
}

/** PP-related keywords for filtering assembly links */
const PP_KEYWORDS = /public\s+participation|memorand|budget|bill|vetting|hearing|consultation/i;

/**
 * Source A: Nakuru County Government RSS feed.
 * The RSS has news posts — we visit each post page and extract any embedded PDF links.
 */
async function fetchCountyItems(): Promise<PageItem[]> {
  const response = await scrapeFetch(COUNTY_RSS_URL);
  const xml = await response.text();
  const $ = load(xml, { xmlMode: true });

  const items: PageItem[] = [];
  const seen = new Set<string>();

  // Collect post URLs from RSS, then visit each to find PDFs
  const postUrls: { url: string; title: string }[] = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').first().text().trim();
    const link  = $(el).find('link').first().text().trim();
    if (link) postUrls.push({ url: link, title });
  });

  // Visit each post page to find embedded PDF links
  for (const post of postUrls.slice(0, 10)) {
    try {
      await sleep(DEFAULT_CRAWL_DELAY_MS);
      const pageRes = await scrapeFetch(post.url);
      const pageHtml = await pageRes.text();
      const page$ = load(pageHtml);

      page$('a[href]').each((_, el) => {
        const href = page$(el).attr('href') ?? '';
        if ((href.endsWith('.pdf') || (href.includes('wp-content/uploads') && href.match(/\.(pdf|doc|docx)$/i))) && !href.includes('cropped-') && !seen.has(href)) {
          const fullUrl = href.startsWith('http') ? href : `${COUNTY_BASE_URL}${href}`;
          seen.add(fullUrl);
          const linkText = page$(el).text().trim();
          items.push({ url: fullUrl, title: linkText || post.title, isDirect: true, source: 'county' });
        }
      });
    } catch (err) {
      console.warn(`[county-nakuru] Failed to fetch post: ${post.url}`, err instanceof Error ? err.message : err);
    }
  }

  return items;
}

/**
 * Scrape a single page for PDF links (wp-content/uploads pattern).
 */
async function scrapePageForPdfs(pageUrl: string, baseUrl: string, source: 'county' | 'assembly', fetchFn: typeof scrapeFetch): Promise<PageItem[]> {
  const response = await fetchFn(pageUrl);
  const html = await response.text();
  const $ = load(html);

  const items: PageItem[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const title = $(el).text().trim();

    if ((href.endsWith('.pdf') || (href.includes('wp-content/uploads') && href.match(/\.(pdf|doc|docx)$/i))) && !href.includes('cropped-') && !seen.has(href)) {
      const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
      seen.add(fullUrl);
      items.push({ url: fullUrl, title: title || 'Nakuru Assembly Document', isDirect: true, source });
    }
  });

  return items;
}

/**
 * Source B: Scrape Nakuru County Assembly downloads + bills pages.
 * HIGH VALUE: PP notices, bill vetting, budget consultations.
 */
async function fetchAssemblyItems(): Promise<PageItem[]> {
  const allItems: PageItem[] = [];
  const seen = new Set<string>();

  // Scrape downloads page
  try {
    const dlItems = await scrapePageForPdfs(ASSEMBLY_URL, ASSEMBLY_BASE_URL, 'assembly', assemblyScrapeFetch);
    for (const item of dlItems) {
      if (!seen.has(item.url)) { seen.add(item.url); allItems.push(item); }
    }
  } catch (err) {
    console.warn(`[county-nakuru] Assembly downloads failed:`, err instanceof Error ? err.message : err);
  }

  // Scrape bills page
  try {
    await sleep(DEFAULT_CRAWL_DELAY_MS);
    const billItems = await scrapePageForPdfs(ASSEMBLY_BILLS_URL, ASSEMBLY_BASE_URL, 'assembly', assemblyScrapeFetch);
    for (const item of billItems) {
      if (!seen.has(item.url)) { seen.add(item.url); allItems.push(item); }
    }
  } catch (err) {
    console.warn(`[county-nakuru] Assembly bills failed:`, err instanceof Error ? err.message : err);
  }

  // Include all PDFs from assembly (all are high-value civic content)
  // Optionally filter by PP keywords if list is very large
  if (allItems.length > MAX_PER_SOURCE * 2) {
    const filtered = allItems.filter((item) => {
      const combinedText = `${item.title} ${item.url}`;
      return PP_KEYWORDS.test(combinedText);
    });
    return filtered.length > 0 ? filtered : allItems;
  }

  return allItems;
}

/**
 * Resolve a page URL to a direct PDF download URL.
 */
async function resolveDownloadUrl(pageUrl: string, source: 'county' | 'assembly'): Promise<string | null> {
  if (pageUrl.endsWith('.pdf') || pageUrl.includes('wp-content/uploads')) {
    return pageUrl;
  }

  const fetchFn = source === 'assembly' ? assemblyScrapeFetch : scrapeFetch;
  const baseUrl = source === 'assembly' ? ASSEMBLY_BASE_URL : COUNTY_BASE_URL;

  const response = await fetchFn(pageUrl);
  const html = await response.text();
  const $ = load(html);

  // WPDM data-downloadurl
  const downloadUrl = $('[data-downloadurl]').first().attr('data-downloadurl') ?? '';
  const wpdmMatch = downloadUrl.match(/[?&]wpdmdl=(\d+)/);
  if (wpdmMatch) {
    return `${baseUrl}/?wpdmdl=${wpdmMatch[1]}`;
  }

  // Fallback: direct PDF href
  let pdfUrl: string | null = null;
  $('a[href]').each((_, el) => {
    if (pdfUrl) return;
    const href = $(el).attr('href') ?? '';
    if ((href.includes('wp-content/uploads') || href.endsWith('.pdf')) && !href.includes('cropped-')) {
      pdfUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
    }
  });

  return pdfUrl;
}

/**
 * Process a single item: dedup, download, parse, store.
 */
async function processItem(
  item: PageItem,
  supabase: ReturnType<typeof buildScraperSupabaseClient>,
  results: ScraperResult[],
  counters: { inserted: number; skipped: number; errors: number }
): Promise<boolean> {
  const urlHash = computeHash(item.url);
  if (await isDuplicate(supabase, urlHash)) {
    counters.skipped++;
    results.push({ url: item.url, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'url_hash_exists' });
    return false;
  }

  await sleep(DEFAULT_CRAWL_DELAY_MS);

  let downloadUrl: string | null;
  if (item.isDirect) {
    downloadUrl = item.url;
  } else {
    await sleep(DEFAULT_CRAWL_DELAY_MS);
    downloadUrl = await resolveDownloadUrl(item.url, item.source);
  }

  if (!downloadUrl) {
    console.warn(`[county-nakuru] No download URL found for: ${item.url}`);
    counters.skipped++;
    results.push({ url: item.url, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'no_download_url' });
    return false;
  }

  await sleep(DEFAULT_CRAWL_DELAY_MS);
  const fetchFn = item.source === 'assembly' ? assemblyScrapeFetch : scrapeFetch;
  const pdfResponse = await fetchFn(downloadUrl, 60_000);
  const pdfBuffer   = Buffer.from(await pdfResponse.arrayBuffer());

  const { text: rawText, pageCount, isScanned: likelyScanned } = await parsePdfBuffer(pdfBuffer);
  const isScanned = likelyScanned || rawText.length < SCANNED_THRESHOLD;

  const contentHash = computeContentHash(pdfBuffer.toString('base64'));
  if (await isDuplicate(supabase, contentHash)) {
    counters.skipped++;
    results.push({ url: item.url, contentHash, documentId: '', isNew: false, isScanned, skipped: true, skipReason: 'content_hash_exists' });
    return false;
  }

  let storagePath: string | null = null;
  const safeName = `${contentHash}-nakuru-${item.source}.pdf`;
  const { error: storageErr } = await supabase.storage
    .from('documents')
    .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
  if (!storageErr) {
    storagePath = safeName;
  } else if (storageErr.message !== 'The resource already exists') {
    console.warn(`[county-nakuru] Storage warning: ${storageErr.message}`);
  }

  const { data: docRow, error: insertErr } = await supabase
    .from('documents')
    .insert({
      country_code: COUNTRY_CODE,
      url: downloadUrl,
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

  console.log(`[county-nakuru] Stored (${item.source}): ${item.title} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
  counters.inserted++;
  results.push({ url: downloadUrl, contentHash, documentId: docRow.id, isNew: true, isScanned, skipped: false });
  return true;
}

/**
 * Main Nakuru County scraper function.
 */
export async function runNakuruCountyScraper(): Promise<ScraperRunSummary> {
  const supabase = buildScraperSupabaseClient();
  const startedAt = new Date();
  const results: ScraperResult[] = [];
  let processed = 0;
  const counters = { inserted: 0, skipped: 0, errors: 0 };

  console.log(`[county-nakuru] Starting at ${startedAt.toISOString()}`);

  // Source A: County Government
  let countyItems: PageItem[] = [];
  try {
    countyItems = await fetchCountyItems();
    console.log(`[county-nakuru] County downloads returned ${countyItems.length} items`);
  } catch (err) {
    console.warn(`[county-nakuru] County downloads failed:`, err instanceof Error ? err.message : err);
  }

  // Source B: County Assembly
  let assemblyItems: PageItem[] = [];
  try {
    await sleep(DEFAULT_CRAWL_DELAY_MS);
    assemblyItems = await fetchAssemblyItems();
    console.log(`[county-nakuru] Assembly returned ${assemblyItems.length} items`);
  } catch (err) {
    console.warn(`[county-nakuru] Assembly site failed:`, err instanceof Error ? err.message : err);
  }

  // Process county items (max 10)
  let countyNew = 0;
  for (const item of countyItems) {
    if (countyNew >= MAX_PER_SOURCE) break;
    processed++;
    try {
      const wasNew = await processItem(item, supabase, results, counters);
      if (wasNew) countyNew++;
    } catch (err) {
      counters.errors++;
      console.error(`[county-nakuru] Error (county): ${item.url}`, err);
      results.push({ url: item.url, contentHash: computeHash(item.url), documentId: '', isNew: false, isScanned: false, skipped: false, skipReason: String(err) });
    }
  }

  // Process assembly items (max 10)
  let assemblyNew = 0;
  for (const item of assemblyItems) {
    if (assemblyNew >= MAX_PER_SOURCE) break;
    processed++;
    try {
      const wasNew = await processItem(item, supabase, results, counters);
      if (wasNew) assemblyNew++;
    } catch (err) {
      counters.errors++;
      console.error(`[county-nakuru] Error (assembly): ${item.url}`, err);
      results.push({ url: item.url, contentHash: computeHash(item.url), documentId: '', isNew: false, isScanned: false, skipped: false, skipReason: String(err) });
    }
  }

  const finishedAt = new Date();
  console.log(`[county-nakuru] Done. processed=${processed} inserted=${counters.inserted} skipped=${counters.skipped} errors=${counters.errors}`);
  return { scraperName: 'county-nakuru', startedAt, finishedAt, processed, inserted: counters.inserted, skipped: counters.skipped, errors: counters.errors, results };
}
