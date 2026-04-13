/**
 * lib/countries/KE/scrapers/county-kisii.ts
 * Kisii County scraper — kisii.go.ke downloads + RSS feed
 *
 * Strategy:
 * 1. Try RSS feed at /feed/ first
 * 2. Fallback: scrape /downloads/ for WPDM + direct PDF links
 * 3. Dedup by URL hash then content hash
 * 4. Upload to Supabase Storage, insert document record
 * 5. Crawl delay: minimum 2 s between requests
 *
 * SSL: rejectUnauthorized: false as precaution for Kenyan county sites.
 */

import { load } from 'cheerio';
import { Agent } from 'undici';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { sleep, DEFAULT_CRAWL_DELAY_MS, SCRAPER_USER_AGENT } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer } from '@/lib/parsers/pdfParser';

const kisiiAgent = new Agent({ connect: { rejectUnauthorized: false } });

type UndiciRequestInit = Parameters<typeof fetch>[1] & { dispatcher?: Agent };

async function kisiiScrapeFetch(url: string, timeoutMs = 30_000): Promise<Response> {
  const parsedUrl = new URL(url);
  const options: UndiciRequestInit = {
    dispatcher: kisiiAgent,
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

const COUNTY_DOWNLOADS_URL = 'https://kisii.go.ke/index.php/media-center/cdownloads';
const COUNTY_NOTICES_URL   = 'https://kisii.go.ke/index.php/county-downloads';
const COUNTY_BASE_URL      = 'https://kisii.go.ke';
const COUNTRY_CODE         = 'KE' as const;
const SCANNED_THRESHOLD    = 500;
const MAX_DOCS_PER_RUN     = 15;

interface PageItem {
  url: string;
  title: string;
  isDirect: boolean;
}

/**
 * Scrape a Joomla page for PDF download links.
 * Kisii uses the DropFiles Joomla extension with URLs like:
 * /index.php/files/153/Downloads/{id}/{filename}.pdf
 */
async function fetchPageItems(pageUrl: string): Promise<PageItem[]> {
  const response = await kisiiScrapeFetch(pageUrl);
  const html = await response.text();
  const $ = load(html);

  const items: PageItem[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const title = $(el).text().trim();

    // Joomla DropFiles pattern: /index.php/files/.../Downloads/...pdf
    // Also catch any direct .pdf links
    if (href.endsWith('.pdf') && !seen.has(href)) {
      const fullUrl = href.startsWith('http') ? href : `${COUNTY_BASE_URL}${href}`;
      seen.add(fullUrl);
      items.push({ url: fullUrl, title: title || 'Kisii County Document', isDirect: true });
    }
  });

  return items;
}

/**
 * Main Kisii County scraper function.
 */
export async function runKisiiCountyScraper(): Promise<ScraperRunSummary> {
  const supabase = buildScraperSupabaseClient();
  const startedAt = new Date();
  const results: ScraperResult[] = [];
  let processed = 0;
  let inserted  = 0;
  let skipped   = 0;
  let errors    = 0;

  console.log(`[county-kisii] Starting at ${startedAt.toISOString()}`);

  // Gather items from Joomla downloads pages
  let items: PageItem[] = [];

  try {
    const dlItems = await fetchPageItems(COUNTY_DOWNLOADS_URL);
    console.log(`[county-kisii] Downloads page returned ${dlItems.length} items`);
    items.push(...dlItems);
  } catch (dlErr) {
    console.warn(`[county-kisii] Downloads page failed:`, dlErr instanceof Error ? dlErr.message : dlErr);
  }

  try {
    await sleep(DEFAULT_CRAWL_DELAY_MS);
    const noticeItems = await fetchPageItems(COUNTY_NOTICES_URL);
    console.log(`[county-kisii] Notices page returned ${noticeItems.length} items`);
    items.push(...noticeItems);
  } catch (noticeErr) {
    console.warn(`[county-kisii] Notices page failed:`, noticeErr instanceof Error ? noticeErr.message : noticeErr);
  }

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  items = items.filter((item) => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    return true;
  });

  console.log(`[county-kisii] Total unique items: ${items.length}`);

  if (items.length === 0) {
    console.warn('[county-kisii] No items found from any source');
    return { scraperName: 'county-kisii', startedAt, finishedAt: new Date(), processed: 0, inserted: 0, skipped: 0, errors: 0, results: [] };
  }

  let newCount = 0;
  for (const { url, title } of items) {
    if (newCount >= MAX_DOCS_PER_RUN) break;
    processed++;

    const urlHash = computeHash(url);
    if (await isDuplicate(supabase, urlHash)) {
      skipped++;
      results.push({ url, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'url_hash_exists' });
      continue;
    }

    await sleep(DEFAULT_CRAWL_DELAY_MS);

    try {
      // All Kisii items are direct PDF links (Joomla DropFiles pattern)
      const downloadUrl = url;

      await sleep(DEFAULT_CRAWL_DELAY_MS);
      const pdfResponse = await kisiiScrapeFetch(downloadUrl, 60_000);
      const pdfBuffer   = Buffer.from(await pdfResponse.arrayBuffer());

      const { text: rawText, pageCount, isScanned: likelyScanned } = await parsePdfBuffer(pdfBuffer);
      const isScanned = likelyScanned || rawText.length < SCANNED_THRESHOLD;

      const contentHash = computeContentHash(pdfBuffer.toString('base64'));
      if (await isDuplicate(supabase, contentHash)) {
        skipped++;
        results.push({ url, contentHash, documentId: '', isNew: false, isScanned, skipped: true, skipReason: 'content_hash_exists' });
        continue;
      }

      let storagePath: string | null = null;
      const safeName = `${contentHash}-kisii-county.pdf`;
      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
      if (!storageErr) {
        storagePath = safeName;
      } else if (storageErr.message !== 'The resource already exists') {
        console.warn(`[county-kisii] Storage warning: ${storageErr.message}`);
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

      console.log(`[county-kisii] Stored: ${title} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
      inserted++;
      newCount++;
      results.push({ url: downloadUrl, contentHash, documentId: docRow.id, isNew: true, isScanned, skipped: false });
    } catch (err) {
      errors++;
      console.error(`[county-kisii] Error: ${url}`, err);
      results.push({ url, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: false, skipReason: String(err) });
    }
  }

  const finishedAt = new Date();
  console.log(`[county-kisii] Done. processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { scraperName: 'county-kisii', startedAt, finishedAt, processed, inserted, skipped, errors, results };
}
