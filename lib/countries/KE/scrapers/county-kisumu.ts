/**
 * lib/countries/KE/scrapers/county-kisumu.ts
 * Kisumu County scraper — kisumu.go.ke downloads + county acts
 *
 * Strategy:
 * 1. Try RSS feed at /feed/ first
 * 2. Fallback: scrape /downloads/ for direct PDF links + WPDM packages
 * 3. Also check /county-acts/ for bills and PP notices
 * 4. Dedup by URL hash then content hash
 * 5. Upload to Supabase Storage, insert document record
 * 6. Crawl delay: minimum 2 s between requests
 */

import { load } from 'cheerio';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { sleep, DEFAULT_CRAWL_DELAY_MS, SCRAPER_USER_AGENT, scrapeFetch } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer } from '@/lib/parsers/pdfParser';

const COUNTY_RSS_URL       = 'https://www.kisumu.go.ke/feed/';
const COUNTY_DOWNLOADS_URL = 'https://www.kisumu.go.ke/downloads/';
const COUNTY_ACTS_URL      = 'https://www.kisumu.go.ke/county-acts/';
const COUNTY_BASE_URL      = 'https://www.kisumu.go.ke';
const COUNTRY_CODE         = 'KE' as const;
const SCANNED_THRESHOLD    = 500;
const MAX_DOCS_PER_RUN     = 15;

interface PageItem {
  url: string;
  title: string;
  isDirect: boolean; // true = direct PDF link, false = WPDM package page
}

/**
 * Try RSS feed for download items containing PDFs.
 */
async function fetchRssItems(): Promise<PageItem[]> {
  const response = await scrapeFetch(COUNTY_RSS_URL);
  const xml = await response.text();
  const $ = load(xml, { xmlMode: true });

  const items: PageItem[] = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').first().text().trim();
    const link  = $(el).find('link').first().text().trim();
    if (link) {
      const isDirect = link.endsWith('.pdf') || link.includes('wp-content/uploads');
      items.push({ url: link, title: title || 'Kisumu County Document', isDirect });
    }
  });

  return items;
}

/**
 * Scrape HTML page for PDF links and WPDM package links.
 */
async function fetchPageItems(pageUrl: string): Promise<PageItem[]> {
  const response = await scrapeFetch(pageUrl);
  const html = await response.text();
  const $ = load(html);

  const items: PageItem[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const title = $(el).text().trim();

    // Direct PDF links
    if ((href.endsWith('.pdf') || (href.includes('wp-content/uploads') && href.match(/\.(pdf|doc|docx)$/i))) && !href.includes('cropped-') && !seen.has(href)) {
      const fullUrl = href.startsWith('http') ? href : `${COUNTY_BASE_URL}${href}`;
      seen.add(fullUrl);
      items.push({ url: fullUrl, title: title || 'Kisumu County Document', isDirect: true });
    }

    // WPDM package pages (links containing /downloads/ that aren't the index)
    if (href.includes('/downloads/') && href !== COUNTY_DOWNLOADS_URL && !href.endsWith('/feed') && !seen.has(href) && !href.endsWith('.pdf')) {
      const fullUrl = href.startsWith('http') ? href : `${COUNTY_BASE_URL}${href}`;
      seen.add(fullUrl);
      items.push({ url: fullUrl, title: title || 'Kisumu County Document', isDirect: false });
    }

    // County acts page links to PDFs or bill pages
    if (href.includes('/county-acts/') && href !== COUNTY_ACTS_URL && !seen.has(href)) {
      const fullUrl = href.startsWith('http') ? href : `${COUNTY_BASE_URL}${href}`;
      seen.add(fullUrl);
      items.push({ url: fullUrl, title: title || 'Kisumu County Act', isDirect: false });
    }
  });

  return items;
}

/**
 * Resolve a WPDM package page to a direct PDF URL.
 */
async function resolveDownloadUrl(pageUrl: string): Promise<string | null> {
  if (pageUrl.endsWith('.pdf') || pageUrl.includes('wp-content/uploads')) {
    return pageUrl;
  }

  const response = await scrapeFetch(pageUrl);
  const html = await response.text();
  const $ = load(html);

  // WPDM data-downloadurl
  const downloadUrl = $('[data-downloadurl]').first().attr('data-downloadurl') ?? '';
  const wpdmMatch = downloadUrl.match(/[?&]wpdmdl=(\d+)/);
  if (wpdmMatch) {
    return `${COUNTY_BASE_URL}/?wpdmdl=${wpdmMatch[1]}`;
  }

  // Fallback: direct PDF href
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
 * Main Kisumu County scraper function.
 */
export async function runKisumuCountyScraper(): Promise<ScraperRunSummary> {
  const supabase = buildScraperSupabaseClient();
  const startedAt = new Date();
  const results: ScraperResult[] = [];
  let processed = 0;
  let inserted  = 0;
  let skipped   = 0;
  let errors    = 0;

  console.log(`[county-kisumu] Starting at ${startedAt.toISOString()}`);

  // Gather items from multiple sources
  let items: PageItem[] = [];

  // Try RSS first
  try {
    const rssItems = await fetchRssItems();
    console.log(`[county-kisumu] RSS feed returned ${rssItems.length} items`);
    items.push(...rssItems);
  } catch (rssErr) {
    console.warn(`[county-kisumu] RSS feed failed:`, rssErr instanceof Error ? rssErr.message : rssErr);
  }

  // Scrape downloads page
  try {
    await sleep(DEFAULT_CRAWL_DELAY_MS);
    const dlItems = await fetchPageItems(COUNTY_DOWNLOADS_URL);
    console.log(`[county-kisumu] Downloads page returned ${dlItems.length} items`);
    items.push(...dlItems);
  } catch (dlErr) {
    console.warn(`[county-kisumu] Downloads page failed:`, dlErr instanceof Error ? dlErr.message : dlErr);
  }

  // Scrape county acts page
  try {
    await sleep(DEFAULT_CRAWL_DELAY_MS);
    const actItems = await fetchPageItems(COUNTY_ACTS_URL);
    console.log(`[county-kisumu] County acts page returned ${actItems.length} items`);
    items.push(...actItems);
  } catch (actErr) {
    console.warn(`[county-kisumu] County acts page failed:`, actErr instanceof Error ? actErr.message : actErr);
  }

  // Deduplicate items by URL
  const seenUrls = new Set<string>();
  items = items.filter((item) => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    return true;
  });

  console.log(`[county-kisumu] Total unique items: ${items.length}`);

  if (items.length === 0) {
    console.warn('[county-kisumu] No items found from any source');
    return { scraperName: 'county-kisumu', startedAt, finishedAt: new Date(), processed: 0, inserted: 0, skipped: 0, errors: 0, results: [] };
  }

  let newCount = 0;
  for (const { url, title, isDirect } of items) {
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
      let downloadUrl: string | null;
      if (isDirect) {
        downloadUrl = url;
      } else {
        await sleep(DEFAULT_CRAWL_DELAY_MS);
        downloadUrl = await resolveDownloadUrl(url);
      }

      if (!downloadUrl) {
        console.warn(`[county-kisumu] No download URL found for: ${url}`);
        skipped++;
        results.push({ url, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'no_download_url' });
        continue;
      }

      await sleep(DEFAULT_CRAWL_DELAY_MS);
      const pdfResponse = await scrapeFetch(downloadUrl, 60_000);
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
      const safeName = `${contentHash}-kisumu-county.pdf`;
      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
      if (!storageErr) {
        storagePath = safeName;
      } else if (storageErr.message !== 'The resource already exists') {
        console.warn(`[county-kisumu] Storage warning: ${storageErr.message}`);
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

      console.log(`[county-kisumu] Stored: ${title} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
      inserted++;
      newCount++;
      results.push({ url: downloadUrl, contentHash, documentId: docRow.id, isNew: true, isScanned, skipped: false });
    } catch (err) {
      errors++;
      console.error(`[county-kisumu] Error: ${url}`, err);
      results.push({ url, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: false, skipReason: String(err) });
    }
  }

  const finishedAt = new Date();
  console.log(`[county-kisumu] Done. processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { scraperName: 'county-kisumu', startedAt, finishedAt, processed, inserted, skipped, errors, results };
}
