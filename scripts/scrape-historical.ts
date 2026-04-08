/**
 * scripts/scrape-historical.ts
 * Bulk-fetch historical documents from all three KE sources.
 * Stores them (with normal dedup) but does NOT analyze them.
 * Run analyze:historical or analyze:historical:all separately.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/scrape-historical.ts
 */

import { load } from 'cheerio';
import { buildScraperSupabaseClient, computeHash, isDuplicate, computeContentHash } from '@/lib/scrapers/dedup';
import { scrapeFetch, sleep, SCRAPER_USER_AGENT } from '@/lib/scrapers/base';
import { parsePdfBuffer } from '@/lib/parsers/pdfParser';

const KENYA_LAW_BASE_URL = 'https://new.kenyalaw.org';
const GAZETTE_INDEX_URL = 'https://new.kenyalaw.org/gazettes/';
const BILLS_URL = 'https://new.kenyalaw.org/bills/';
const COUNTY_RSS_URL = 'https://nairobi.go.ke/download-category/downloads/feed';
const COUNTY_BASE_URL = 'https://nairobi.go.ke';
const COUNTRY_CODE = 'KE' as const;
const SCANNED_THRESHOLD = 500;
const HISTORICAL_DELAY_MS = 3_000; // 3s between requests (polite for bulk)

const supabase = buildScraperSupabaseClient();

// ─── Shared PDF processing ──────────────────────────────────────────────────

async function processAndStorePdf(
  pdfUrl: string,
  sourceLabel: string,
  title: string,
  fetchFn: (url: string, timeout?: number) => Promise<Response> = scrapeFetch
): Promise<'inserted' | 'skipped' | 'error'> {
  try {
    const urlHash = computeHash(pdfUrl);
    if (await isDuplicate(supabase, urlHash)) return 'skipped';

    await sleep(HISTORICAL_DELAY_MS);
    const pdfResponse = await fetchFn(pdfUrl, 60_000);
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    const { text: rawText, pageCount, isScanned: likelyScanned } = await parsePdfBuffer(pdfBuffer);
    const isScanned = likelyScanned || rawText.length < SCANNED_THRESHOLD;

    const contentHash = computeContentHash(pdfBuffer.toString('base64'));
    if (await isDuplicate(supabase, contentHash)) return 'skipped';

    const safeName = `${contentHash}-${sourceLabel}.pdf`;
    const { error: storageErr } = await supabase.storage
      .from('documents')
      .upload(safeName, pdfBuffer, { contentType: 'application/pdf', upsert: false });
    if (storageErr && storageErr.message !== 'The resource already exists') {
      console.warn(`[historical][${sourceLabel}] Storage warning: ${storageErr.message}`);
    }

    const { data: docRow, error: insertErr } = await supabase
      .from('documents')
      .insert({
        country_code: COUNTRY_CODE,
        url: pdfUrl,
        raw_text: isScanned ? '' : rawText,
        storage_path: storageErr ? null : safeName,
        content_hash: contentHash,
        source: 'scraper',
        scraped_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertErr || !docRow) {
      console.error(`[historical][${sourceLabel}] Insert failed: ${insertErr?.message}`);
      return 'error';
    }

    console.log(`[historical][${sourceLabel}] Stored: ${title} | pages=${pageCount} scanned=${isScanned} id=${docRow.id}`);
    return 'inserted';
  } catch (err) {
    console.error(`[historical][${sourceLabel}] Error: ${pdfUrl}`, err instanceof Error ? err.message : err);
    return 'error';
  }
}

// ─── Gazette: fetch all years (last 6 months of issues) ─────────────────────

async function fetchAllGazetteYearLinks(): Promise<string[]> {
  const response = await scrapeFetch(GAZETTE_INDEX_URL);
  const html = await response.text();
  const $ = load(html);
  const years: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (/^\/gazettes\/\d{4}$/.test(href)) {
      years.push(`${KENYA_LAW_BASE_URL}${href}`);
    }
  });
  // Return all years (no cap for historical)
  return [...new Set(years)];
}

async function fetchGazetteLinksFromYear(yearUrl: string): Promise<{ url: string; title: string }[]> {
  const response = await fetch(yearUrl, {
    headers: {
      'User-Agent': SCRAPER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'HX-Request': 'true',
      'Referer': GAZETTE_INDEX_URL,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${yearUrl}`);
  const html = await response.text();
  const $ = load(html);
  const links: { url: string; title: string }[] = [];
  $('td.cell-title a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const title = $(el).text().trim();
    if (href.includes('/officialGazette/')) {
      const absUrl = href.startsWith('http') ? href : `${KENYA_LAW_BASE_URL}${href}`;
      links.push({ url: absUrl, title: title || 'Kenya Gazette' });
    }
  });
  return links;
}

async function scrapeHistoricalGazettes(): Promise<{ inserted: number; skipped: number; errors: number }> {
  console.log('\n[historical] ═══ Gazette: fetching all years ═══');
  let inserted = 0, skipped = 0, errors = 0;

  const yearUrls = await fetchAllGazetteYearLinks();
  console.log(`[historical] Found ${yearUrls.length} gazette years`);

  // Filter to last 6 months worth of years (current year and possibly previous)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const minYear = sixMonthsAgo.getFullYear();
  const relevantYears = yearUrls.filter((url) => {
    const yearMatch = url.match(/\/(\d{4})$/);
    return yearMatch && parseInt(yearMatch[1]) >= minYear;
  });
  console.log(`[historical] Scanning years >= ${minYear}: ${relevantYears.join(', ')}`);

  for (const yearUrl of relevantYears) {
    await sleep(HISTORICAL_DELAY_MS);
    let links: { url: string; title: string }[];
    try {
      links = await fetchGazetteLinksFromYear(yearUrl);
      console.log(`[historical] ${yearUrl} → ${links.length} gazette issues`);
    } catch (err) {
      console.error(`[historical] Failed year ${yearUrl}:`, err);
      errors++;
      continue;
    }

    for (const { url, title } of links) {
      // Resolve PDF URL
      const pdfUrl = url.includes('/akn/ke') ? `${url}/source.pdf` : url;
      const result = await processAndStorePdf(pdfUrl, 'gazette', title);
      if (result === 'inserted') inserted++;
      else if (result === 'skipped') skipped++;
      else errors++;
    }
  }

  console.log(`[historical] Gazette done: inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { inserted, skipped, errors };
}

// ─── Parliament: fetch all bill pages ───────────────────────────────────────

async function fetchAllBillLinks(): Promise<{ url: string; title: string }[]> {
  const response = await fetch(BILLS_URL, {
    headers: {
      'User-Agent': SCRAPER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'HX-Request': 'true',
      'Referer': KENYA_LAW_BASE_URL + '/',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${BILLS_URL}`);
  const html = await response.text();
  const $ = load(html);
  const links: { url: string; title: string }[] = [];
  $('td.cell-title a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const title = $(el).text().trim();
    if (href.includes('/akn/ke/bill/')) {
      const absUrl = href.startsWith('http') ? href : `${KENYA_LAW_BASE_URL}${href}`;
      links.push({ url: absUrl, title: title || 'Parliament Bill' });
    }
  });
  return links;
}

async function scrapeHistoricalBills(): Promise<{ inserted: number; skipped: number; errors: number }> {
  console.log('\n[historical] ═══ Parliament: fetching all bills ═══');
  let inserted = 0, skipped = 0, errors = 0;

  let links: { url: string; title: string }[];
  try {
    links = await fetchAllBillLinks();
    console.log(`[historical] Found ${links.length} bills (no cap)`);
  } catch (err) {
    console.error('[historical] Failed to fetch bills:', err);
    return { inserted: 0, skipped: 0, errors: 1 };
  }

  for (const { url, title } of links) {
    const pdfUrl = url.includes('/akn/ke/') ? `${url}/source.pdf` : url;
    const result = await processAndStorePdf(pdfUrl, 'parliament', title);
    if (result === 'inserted') inserted++;
    else if (result === 'skipped') skipped++;
    else errors++;
  }

  console.log(`[historical] Parliament done: inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { inserted, skipped, errors };
}

// ─── Nairobi County: fetch all RSS items ────────────────────────────────────

async function scrapeHistoricalNairobi(): Promise<{ inserted: number; skipped: number; errors: number }> {
  console.log('\n[historical] ═══ Nairobi County: fetching all RSS items ═══');
  let inserted = 0, skipped = 0, errors = 0;

  // Import undici Agent for Nairobi's SSL cert issue
  const { Agent } = await import('undici');
  const nairobiAgent = new Agent({ connect: { rejectUnauthorized: false } });

  const nairobiFetch = async (url: string, timeoutMs = 30_000): Promise<Response> => {
    const parsedUrl = new URL(url);
    const response = await fetch(url, {
      dispatcher: nairobiAgent,
      headers: {
        'User-Agent': SCRAPER_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${parsedUrl.protocol}//${parsedUrl.host}/`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    } as RequestInit);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response;
  };

  let rssXml: string;
  try {
    const response = await nairobiFetch(COUNTY_RSS_URL);
    rssXml = await response.text();
  } catch (err) {
    console.error('[historical] Failed to fetch Nairobi RSS:', err);
    return { inserted: 0, skipped: 0, errors: 1 };
  }

  const $ = load(rssXml, { xmlMode: true });
  const items: { packageUrl: string; title: string }[] = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').first().text().trim();
    const link = $(el).find('link').first().text().trim();
    if (link) items.push({ packageUrl: link, title: title || 'Nairobi County Document' });
  });
  console.log(`[historical] RSS returned ${items.length} items (no cap)`);

  for (const { packageUrl, title } of items) {
    const urlHash = computeHash(packageUrl);
    if (await isDuplicate(supabase, urlHash)) { skipped++; continue; }

    await sleep(HISTORICAL_DELAY_MS);

    try {
      // Resolve WPDM download URL
      const pageResp = await nairobiFetch(packageUrl);
      const pageHtml = await pageResp.text();
      const page$ = load(pageHtml);
      const downloadAttr = page$('[data-downloadurl]').first().attr('data-downloadurl') ?? '';
      const wpdmMatch = downloadAttr.match(/[?&]wpdmdl=(\d+)/);
      let pdfUrl: string | null = null;
      if (wpdmMatch) {
        pdfUrl = `${COUNTY_BASE_URL}/?wpdmdl=${wpdmMatch[1]}`;
      } else {
        page$('a[href]').each((_, el) => {
          if (pdfUrl) return;
          const href = page$(el).attr('href') ?? '';
          if ((href.includes('wp-content/uploads') || href.endsWith('.pdf')) && !href.includes('cropped-')) {
            pdfUrl = href.startsWith('http') ? href : `${COUNTY_BASE_URL}${href}`;
          }
        });
      }

      if (!pdfUrl) { skipped++; continue; }

      const result = await processAndStorePdf(pdfUrl, 'nairobi', title, nairobiFetch);
      if (result === 'inserted') inserted++;
      else if (result === 'skipped') skipped++;
      else errors++;
    } catch (err) {
      errors++;
      console.error(`[historical] Nairobi error: ${packageUrl}`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[historical] Nairobi done: inserted=${inserted} skipped=${skipped} errors=${errors}`);
  return { inserted, skipped, errors };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[historical] Starting historical document fetch');
  console.log(`[historical] Time: ${new Date().toISOString()}\n`);

  const gazette = await scrapeHistoricalGazettes();
  const parliament = await scrapeHistoricalBills();
  const nairobi = await scrapeHistoricalNairobi();

  const totalInserted = gazette.inserted + parliament.inserted + nairobi.inserted;
  const totalSkipped = gazette.skipped + parliament.skipped + nairobi.skipped;
  const totalErrors = gazette.errors + parliament.errors + nairobi.errors;

  console.log('\n[historical] ═══════════════════════════════════════════');
  console.log(`  Total inserted : ${totalInserted}`);
  console.log(`  Total skipped  : ${totalSkipped}`);
  console.log(`  Total errors   : ${totalErrors}`);
  console.log('[historical] ═══════════════════════════════════════════\n');
  console.log('[historical] Run `npm run analyze:historical` to analyze these documents.');

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[historical] Fatal error:', err);
  process.exit(1);
});
