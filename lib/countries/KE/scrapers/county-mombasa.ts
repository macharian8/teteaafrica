/**
 * lib/countries/KE/scrapers/county-mombasa.ts
 * Mombasa County scraper — web.mombasa.go.ke RSS feed + WPDM download
 *
 * Strategy:
 * 1. Try RSS feed at /downloads/feed first (WordPress pattern)
 * 2. Fallback: scrape HTML at /downloads/ for WPDM download links
 * 3. For each item, resolve WPDM download URL and fetch PDF
 * 4. Dedup by URL hash then content hash
 * 5. Upload to Supabase Storage, insert document record
 * 6. Crawl delay: minimum 2 s between requests
 *
 * SSL: Mombasa site may have cert issues — rejectUnauthorized: false scoped here.
 */

import { load } from 'cheerio';
import { Agent } from 'undici';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { sleep, DEFAULT_CRAWL_DELAY_MS, SCRAPER_USER_AGENT } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer } from '@/lib/parsers/pdfParser';

const mombasaAgent = new Agent({ connect: { rejectUnauthorized: false } });

type UndiciRequestInit = Parameters<typeof fetch>[1] & { dispatcher?: Agent };

async function mombasaScrapeFetch(url: string, timeoutMs = 30_000): Promise<Response> {
  const parsedUrl = new URL(url);
  const options: UndiciRequestInit = {
    dispatcher: mombasaAgent,
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

const COUNTY_RSS_URL  = 'https://web.mombasa.go.ke/downloads/feed';
const COUNTY_HTML_URL = 'https://web.mombasa.go.ke/downloads/';
const COUNTY_BASE_URL = 'https://web.mombasa.go.ke';
const COUNTRY_CODE    = 'KE' as const;
const SCANNED_THRESHOLD  = 500;
const MAX_DOCS_PER_RUN   = 15;

interface RssItem {
  packageUrl: string;
  title: string;
  pubDate: string | null;
}

/**
 * Try RSS feed first. Returns package page URLs and titles.
 */
async function fetchRssItems(): Promise<RssItem[]> {
  const response = await mombasaScrapeFetch(COUNTY_RSS_URL);
  const xml = await response.text();
  const $ = load(xml, { xmlMode: true });

  const items: RssItem[] = [];
  $('item').each((_, el) => {
    const title   = $(el).find('title').first().text().trim();
    const link    = $(el).find('link').first().text().trim();
    const pubDate = $(el).find('pubDate').first().text().trim() || null;
    if (link) {
      items.push({ packageUrl: link, title: title || 'Mombasa County Document', pubDate });
    }
  });

  return items;
}

/**
 * Fallback: scrape the HTML downloads page for WPDM package links.
 */
async function fetchHtmlItems(): Promise<RssItem[]> {
  const response = await mombasaScrapeFetch(COUNTY_HTML_URL);
  const html = await response.text();
  const $ = load(html);

  const items: RssItem[] = [];
  const seen = new Set<string>();

  // Look for WPDM package links or direct PDF links
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const title = $(el).text().trim();

    // WPDM package pages
    if (href.includes('/downloads/') && href !== COUNTY_HTML_URL && !seen.has(href) && !href.endsWith('/feed')) {
      const fullUrl = href.startsWith('http') ? href : `${COUNTY_BASE_URL}${href}`;
      seen.add(fullUrl);
      items.push({ packageUrl: fullUrl, title: title || 'Mombasa County Document', pubDate: null });
    }

    // Direct PDF links
    if ((href.includes('wp-content/uploads') || href.endsWith('.pdf')) && !href.includes('cropped-') && !seen.has(href)) {
      const fullUrl = href.startsWith('http') ? href : `${COUNTY_BASE_URL}${href}`;
      seen.add(fullUrl);
      items.push({ packageUrl: fullUrl, title: title || 'Mombasa County Document', pubDate: null });
    }
  });

  return items;
}

/**
 * Fetch a WPDM package page and extract the direct PDF download URL.
 */
async function resolveWpdmDownloadUrl(packageUrl: string): Promise<string | null> {
  // If already a direct PDF link, return as-is
  if (packageUrl.endsWith('.pdf') || packageUrl.includes('wp-content/uploads')) {
    return packageUrl;
  }

  const response = await mombasaScrapeFetch(packageUrl);
  const html = await response.text();
  const $ = load(html);

  // Primary: data-downloadurl attribute on the WPDM download button
  const downloadUrl = $('[data-downloadurl]').first().attr('data-downloadurl') ?? '';
  const wpdmMatch = downloadUrl.match(/[?&]wpdmdl=(\d+)/);
  if (wpdmMatch) {
    return `${COUNTY_BASE_URL}/?wpdmdl=${wpdmMatch[1]}`;
  }

  // Fallback: any href containing wp-content/uploads ending in .pdf
  let pdfUrl: string | null = null;
  $('a[href]').each((_, el) => {
    if (pdfUrl) return;
    const href = $(el).attr('href') ?? '';
    if ((href.includes('wp-content/uploads') || href.endsWith('.pdf')) && !href.includes('cropped-')) {
      pdfUrl = href.startsWith('http') ? href : `${COUNTY_BASE_URL}${href}`;
    }
  });

  return pdfUrl;
}

/**
 * Main Mombasa County scraper function.
 */
export async function runMombasaCountyScraper(): Promise<ScraperRunSummary> {
  const supabase = buildScraperSupabaseClient();
  const startedAt = new Date();
  const results: ScraperResult[] = [];
  let processed = 0;
  let inserted  = 0;
  let skipped   = 0;
  let errors    = 0;

  console.log(`[county-mombasa] Starting at ${startedAt.toISOString()}`);

  // Try RSS first, fallback to HTML if RSS fails or returns 0 items
  let items: RssItem[] = [];
  try {
    items = await fetchRssItems();
    console.log(`[county-mombasa] RSS feed returned ${items.length} items`);
  } catch (rssErr) {
    console.warn(`[county-mombasa] RSS feed failed:`, rssErr instanceof Error ? rssErr.message : rssErr);
  }

  if (items.length === 0) {
    try {
      await sleep(DEFAULT_CRAWL_DELAY_MS);
      items = await fetchHtmlItems();
      console.log(`[county-mombasa] HTML fallback returned ${items.length} items`);
    } catch (htmlErr) {
      console.error('[county-mombasa] HTML fallback also failed:', htmlErr);
      return { scraperName: 'county-mombasa', startedAt, finishedAt: new Date(), processed: 0, inserted: 0, skipped: 0, errors: 1, results: [] };
    }
  }

  let newCount = 0;
  for (const { packageUrl, title } of items) {
    if (newCount >= MAX_DOCS_PER_RUN) break;
    processed++;

    const urlHash = computeHash(packageUrl);
    if (await isDuplicate(supabase, urlHash)) {
      skipped++;
      results.push({ url: packageUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'url_hash_exists' });
      continue;
    }

    await sleep(DEFAULT_CRAWL_DELAY_MS);

    try {
      await sleep(DEFAULT_CRAWL_DELAY_MS);
      const downloadUrl = await resolveWpdmDownloadUrl(packageUrl);

      if (!downloadUrl) {
        console.warn(`[county-mombasa] No download URL found for: ${packageUrl}`);
        skipped++;
        results.push({ url: packageUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'no_download_url' });
        continue;
      }

      await sleep(DEFAULT_CRAWL_DELAY_MS);
      const pdfResponse = await mombasaScrapeFetch(downloadUrl, 60_000);
      const pdfBuffer   = Buffer.from(await pdfResponse.arrayBuffer());

      const { text: rawText, pageCount, isScanned: likelyScanned } = await parsePdfBuffer(pdfBuffer);
      const isScanned = likelyScanned || rawText.length < SCANNED_THRESHOLD;

      const contentHash = computeContentHash(pdfBuffer.toString('base64'));
      if (await isDuplicate(supabase, contentHash)) {
        skipped++;
        results.push({ url: packageUrl, contentHash, documentId: '', isNew: false, isScanned, skipped: true, skipReason: 'content_hash_exists' });
        continue;
      }

      let storagePath: string | null = null;
      const safeName = `${contentHash}-mombasa-county.pdf`;
      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
      if (!storageErr) {
        storagePath = safeName;
      } else if (storageErr.message !== 'The resource already exists') {
        console.warn(`[county-mombasa] Storage warning: ${storageErr.message}`);
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

      console.log(`[county-mombasa] Stored: ${title} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
      inserted++;
      newCount++;
      results.push({ url: downloadUrl, contentHash, documentId: docRow.id, isNew: true, isScanned, skipped: false });
    } catch (err) {
      errors++;
      console.error(`[county-mombasa] Error: ${packageUrl}`, err);
      results.push({ url: packageUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: false, skipReason: String(err) });
    }
  }

  const finishedAt = new Date();
  console.log(`[county-mombasa] Done. processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { scraperName: 'county-mombasa', startedAt, finishedAt, processed, inserted, skipped, errors, results };
}
