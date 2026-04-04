/**
 * lib/scrapers/base.ts
 * Abstract base class for all Tetea scrapers.
 *
 * Handles:
 * - Polite crawl delays (min 2 s between requests)
 * - User-agent identification
 * - fetch with timeout
 * - Standard result type
 */

export interface ScraperResult {
  url: string;
  contentHash: string;
  documentId: string;
  isNew: boolean;
  isScanned: boolean;
  skipped: boolean;
  skipReason?: string;
}

export interface ScraperRunSummary {
  scraperName: string;
  startedAt: Date;
  finishedAt: Date;
  processed: number;
  inserted: number;
  skipped: number;
  errors: number;
  results: ScraperResult[];
}

export const SCRAPER_USER_AGENT =
  'TeteaAfrica/1.0 Scraper (+https://tetea.africa/bot)';

export const DEFAULT_CRAWL_DELAY_MS = 2_000; // 2 seconds between requests

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL with standard headers and a timeout.
 * Throws on non-2xx responses.
 */
export async function scrapeFetch(
  url: string,
  timeoutMs = 30_000
): Promise<Response> {
  const response = await fetch(url, {
    headers: { 'User-Agent': SCRAPER_USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${url}`);
  }
  return response;
}
