/**
 * lib/countries/KE/scrapers/parliament.ts
 * Kenya Parliament bills scraper — National Assembly bills RSS feed
 *
 * Strategy:
 * 1. Fetch the Parliament RSS feed for bills
 * 2. Parse each item: title, link, pubDate, description
 * 3. Dedup by URL hash
 * 4. Fetch the bill page/PDF, store in Supabase
 * 5. Insert document record with source='scraper'
 *
 * Called by pg_cron: daily at 07:00 EAT.
 *
 * Note: parliament.go.ke does not publish a stable bills-only RSS feed.
 * We scrape the bills listing page and treat each bill as a document.
 * When a proper RSS endpoint is published, swap fetchBillLinks() accordingly.
 */

import { load } from 'cheerio';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { scrapeFetch, sleep, DEFAULT_CRAWL_DELAY_MS } from '@/lib/scrapers/base';
import type { ScraperRunSummary, ScraperResult } from '@/lib/scrapers/base';
import { parsePdfBuffer, preprocessText } from '@/lib/parsers/pdfParser';

// parliament.go.ke bills page — adjust path if the site structure changes
const PARLIAMENT_BILLS_URL = 'https://www.parliament.go.ke/the-national-assembly/bills';
const PARLIAMENT_BASE_URL  = 'https://www.parliament.go.ke';
const COUNTRY_CODE         = 'KE' as const;
const SCANNED_THRESHOLD    = 500;
const MAX_BILLS_PER_RUN    = 15;

interface BillLink {
  url: string;
  title: string;
  pubDate: string | null; // ISO string or null
}

/**
 * Fetch the Parliament bills listing page and return bill links.
 * Handles both HTML listing pages and RSS/Atom feeds.
 */
async function fetchBillLinks(): Promise<BillLink[]> {
  // Try RSS feed first (faster, more structured)
  const rssUrls = [
    'https://www.parliament.go.ke/rss/bills',
    'https://www.parliament.go.ke/feeds/bills',
    `${PARLIAMENT_BILLS_URL}/feed`,
  ];

  for (const rssUrl of rssUrls) {
    try {
      const response = await scrapeFetch(rssUrl);
      const text = await response.text();
      if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel')) {
        return parseRssFeed(text);
      }
    } catch {
      // RSS URL not available — fall through to HTML scraping
    }
    await sleep(DEFAULT_CRAWL_DELAY_MS);
  }

  // Fall back to scraping the HTML bills page
  return scrapeHtmlBillsPage();
}

/** Parse an RSS/Atom feed and extract bill items */
function parseRssFeed(xml: string): BillLink[] {
  const $ = load(xml, { xmlMode: true });
  const links: BillLink[] = [];

  // RSS 2.0
  $('item').each((_, el) => {
    const title = $(el).find('title').first().text().trim();
    const linkText = $(el).find('link').first().text().trim();
    const linkHref = $(el).find('link').attr('href') ?? '';
    const link  = linkText || linkHref;
    const pubDate = $(el).find('pubDate').first().text().trim() || null;
    if (link) links.push({ url: link, title: title || 'Parliament Bill', pubDate });
  });

  // Atom
  if (!links.length) {
    $('entry').each((_, el) => {
      const title  = $(el).find('title').first().text().trim();
      const link   = $(el).find('link').attr('href') ?? '';
      const updated = $(el).find('updated').first().text().trim() || null;
      if (link) links.push({ url: link, title: title || 'Parliament Bill', pubDate: updated });
    });
  }

  return links;
}

/** Scrape the HTML bills listing page when no RSS feed is available */
async function scrapeHtmlBillsPage(): Promise<BillLink[]> {
  const response = await scrapeFetch(PARLIAMENT_BILLS_URL);
  const html = await response.text();
  const $ = load(html);

  const links: BillLink[] = [];
  const seen = new Set<string>();

  // Look for bill links — typically in a table or list
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().trim();

    // Filter: only bill-related links (PDF or bill detail pages)
    const isBillLink =
      href.endsWith('.pdf') ||
      href.includes('/bill') ||
      href.includes('/bills/') ||
      /bill\s*no/i.test(text);

    if (!isBillLink || !href || href === '#') return;

    const absoluteUrl = href.startsWith('http')
      ? href
      : `${PARLIAMENT_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

    if (seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);

    links.push({ url: absoluteUrl, title: text || 'Parliament Bill', pubDate: null });
  });

  return links;
}

/**
 * For a bill detail page (not a PDF), try to find a PDF download link.
 */
async function resolveBillPdfUrl(pageUrl: string): Promise<string | null> {
  if (pageUrl.endsWith('.pdf')) return pageUrl;

  try {
    const response = await scrapeFetch(pageUrl);
    const html = await response.text();
    const $ = load(html);

    let pdfUrl: string | null = null;
    $('a[href$=".pdf"]').each((_, el) => {
      if (pdfUrl) return;
      const href = $(el).attr('href') ?? '';
      pdfUrl = href.startsWith('http')
        ? href
        : `${PARLIAMENT_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
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

  let links: BillLink[];
  try {
    links = await fetchBillLinks();
    console.log(`[parliament] Found ${links.length} bill links`);
  } catch (err) {
    console.error('[parliament] Failed to fetch bill listing:', err);
    return { scraperName: 'parliament', startedAt, finishedAt: new Date(), processed: 0, inserted: 0, skipped: 0, errors: 1, results: [] };
  }

  let newCount = 0;
  for (const { url: billUrl, title } of links) {
    if (newCount >= MAX_BILLS_PER_RUN) break;
    processed++;

    const urlHash = computeHash(billUrl);
    if (await isDuplicate(supabase, urlHash)) {
      skipped++;
      results.push({ url: billUrl, contentHash: urlHash, documentId: '', isNew: false, isScanned: false, skipped: true, skipReason: 'url_hash_exists' });
      continue;
    }

    await sleep(DEFAULT_CRAWL_DELAY_MS);

    try {
      // Resolve to PDF if this is a detail page
      let pdfUrl: string | null = billUrl.endsWith('.pdf') ? billUrl : null;
      let htmlText: string | null = null;

      if (!pdfUrl) {
        await sleep(DEFAULT_CRAWL_DELAY_MS);
        pdfUrl = await resolveBillPdfUrl(billUrl);

        if (!pdfUrl) {
          // No PDF link — store the page text itself
          const pageResponse = await scrapeFetch(billUrl);
          const html = await pageResponse.text();
          htmlText = preprocessText(
            html
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
          );
        }
      }

      let rawText = '';
      let pageCount = 1;
      let isScanned = false;
      let pdfBuffer: Buffer | null = null;

      if (pdfUrl) {
        await sleep(DEFAULT_CRAWL_DELAY_MS);
        const pdfResponse = await scrapeFetch(pdfUrl, 60_000);
        pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
        const parsed = await parsePdfBuffer(pdfBuffer);
        rawText   = parsed.text;
        pageCount = parsed.pageCount;
        isScanned = parsed.isScanned || rawText.length < SCANNED_THRESHOLD;
      } else if (htmlText) {
        rawText = htmlText;
      }

      const contentForHash = pdfBuffer ? pdfBuffer.toString('base64') : rawText;
      const contentHash = computeContentHash(contentForHash);
      if (await isDuplicate(supabase, contentHash)) {
        skipped++;
        results.push({ url: billUrl, contentHash, documentId: '', isNew: false, isScanned, skipped: true, skipReason: 'content_hash_exists' });
        continue;
      }

      // Upload PDF
      let storagePath: string | null = null;
      if (pdfBuffer && pdfUrl) {
        const safeName = `${contentHash}-parliament-bill.pdf`;
        const { error: storageErr } = await supabase.storage
          .from('documents')
          .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
        if (!storageErr) storagePath = safeName;
        else if (storageErr.message !== 'The resource already exists') {
          console.warn(`[parliament] Storage warning: ${storageErr.message}`);
        }
      }

      const { data: docRow, error: insertErr } = await supabase
        .from('documents')
        .insert({
          country_code: COUNTRY_CODE,
          url: pdfUrl ?? billUrl,
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
      results.push({ url: pdfUrl ?? billUrl, contentHash, documentId: docRow.id, isNew: true, isScanned, skipped: false });
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
