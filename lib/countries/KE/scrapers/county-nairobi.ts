/**
 * lib/countries/KE/scrapers/county-nairobi.ts
 * Nairobi County scraper — nairobi.go.ke RSS feed + WPDM download
 *
 * Strategy:
 * 1. Fetch the RSS feed at /download-category/downloads/feed
 *    — gives clean titles and package page URLs, no pagination needed
 * 2. For each item, fetch the WPDM package page and extract the
 *    `data-downloadurl` attribute which contains the wpdmdl post ID
 * 3. Download the PDF via https://nairobi.go.ke/?wpdmdl=ID
 * 4. Dedup by URL hash (quick) then content hash (after download)
 * 5. Upload to Supabase Storage, insert document record
 * 6. Crawl delay: minimum 2 s between requests
 *
 * Called by pg_cron: daily at 07:00 EAT.
 */

import { load } from 'cheerio';
import { Agent } from 'undici';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { sleep, DEFAULT_CRAWL_DELAY_MS, SCRAPER_USER_AGENT } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer } from '@/lib/parsers/pdfParser';

/**
 * nairobi.go.ke uses an SSL cert from eMudhra Technologies Limited — a legitimate
 * CA not included in Node.js's default bundle. Browsers accept it; Node rejects it
 * with UNABLE_TO_VERIFY_LEAF_SIGNATURE. Scoped only to this scraper.
 */
const nairobiAgent = new Agent({ connect: { rejectUnauthorized: false } });

type UndiciRequestInit = Parameters<typeof fetch>[1] & { dispatcher?: Agent };

async function nairobiScrapeFetch(url: string, timeoutMs = 30_000): Promise<Response> {
  const parsedUrl = new URL(url);
  const options: UndiciRequestInit = {
    dispatcher: nairobiAgent,
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

const COUNTY_RSS_URL  = 'https://nairobi.go.ke/download-category/downloads/feed';
const COUNTY_BASE_URL = 'https://nairobi.go.ke';
const COUNTRY_CODE    = 'KE' as const;
const SCANNED_THRESHOLD  = 500;
const MAX_DOCS_PER_RUN   = 10;

interface RssItem {
  packageUrl: string;
  title: string;
  pubDate: string | null;
}

/**
 * Fetch and parse the Nairobi County downloads RSS feed.
 * Returns package page URLs and titles; no pagination required.
 */
async function fetchRssItems(): Promise<RssItem[]> {
  const response = await nairobiScrapeFetch(COUNTY_RSS_URL);
  const xml = await response.text();
  const $ = load(xml, { xmlMode: true });

  const items: RssItem[] = [];
  $('item').each((_, el) => {
    const title      = $(el).find('title').first().text().trim();
    const link       = $(el).find('link').first().text().trim();
    const pubDate    = $(el).find('pubDate').first().text().trim() || null;
    if (link) {
      items.push({ packageUrl: link, title: title || 'Nairobi County Document', pubDate });
    }
  });

  return items;
}

/**
 * Fetch a WPDM package page and extract the direct PDF download URL.
 * The page contains: data-downloadurl="...?wpdmdl=ID&refresh=..."
 * We use the stable form: https://nairobi.go.ke/?wpdmdl=ID
 */
async function resolveWpdmDownloadUrl(packageUrl: string): Promise<string | null> {
  const response = await nairobiScrapeFetch(packageUrl);
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

  let items: RssItem[];
  try {
    items = await fetchRssItems();
    console.log(`[county-nairobi] RSS feed returned ${items.length} items`);
  } catch (err) {
    console.error('[county-nairobi] Failed to fetch RSS feed:', err);
    return { scraperName: 'county-nairobi', startedAt, finishedAt: new Date(), processed: 0, inserted: 0, skipped: 0, errors: 1, results: [] };
  }

  let newCount = 0;
  for (const { packageUrl, title } of items) {
    if (newCount >= MAX_DOCS_PER_RUN) break;
    processed++;

    // Quick URL dedup on the package page URL (stable identifier)
    const urlHash = computeHash(packageUrl);
    if (await isDuplicate(supabase, urlHash)) {
      skipped++;
      results.push({ url: packageUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'url_hash_exists' });
      continue;
    }

    await sleep(DEFAULT_CRAWL_DELAY_MS);

    try {
      // Resolve the WPDM download URL from the package page
      await sleep(DEFAULT_CRAWL_DELAY_MS);
      const downloadUrl = await resolveWpdmDownloadUrl(packageUrl);

      if (!downloadUrl) {
        console.warn(`[county-nairobi] No download URL found for: ${packageUrl}`);
        skipped++;
        results.push({ url: packageUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'no_download_url' });
        continue;
      }

      // Download the PDF
      await sleep(DEFAULT_CRAWL_DELAY_MS);
      const pdfResponse = await nairobiScrapeFetch(downloadUrl, 60_000);
      const pdfBuffer   = Buffer.from(await pdfResponse.arrayBuffer());

      // Parse text
      const { text: rawText, pageCount, isScanned: likelyScanned } = await parsePdfBuffer(pdfBuffer);
      const isScanned = likelyScanned || rawText.length < SCANNED_THRESHOLD;

      // Content dedup
      const contentHash = computeContentHash(pdfBuffer.toString('base64'));
      if (await isDuplicate(supabase, contentHash)) {
        skipped++;
        results.push({ url: packageUrl, contentHash, documentId: '', isNew: false, isScanned, skipped: true, skipReason: 'content_hash_exists' });
        continue;
      }

      // Upload to Storage
      let storagePath: string | null = null;
      const safeName = `${contentHash}-nairobi-county.pdf`;
      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
      if (!storageErr) {
        storagePath = safeName;
      } else if (storageErr.message !== 'The resource already exists') {
        console.warn(`[county-nairobi] Storage warning: ${storageErr.message}`);
      }

      // Insert document record
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

      console.log(`[county-nairobi] Stored: ${title} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
      inserted++;
      newCount++;
      results.push({ url: downloadUrl, contentHash, documentId: docRow.id, isNew: true, isScanned, skipped: false });
    } catch (err) {
      errors++;
      console.error(`[county-nairobi] Error: ${packageUrl}`, err);
      results.push({ url: packageUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: false, skipReason: String(err) });
    }
  }

  const finishedAt = new Date();
  console.log(`[county-nairobi] Done. processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { scraperName: 'county-nairobi', startedAt, finishedAt, processed, inserted, skipped, errors, results };
}
