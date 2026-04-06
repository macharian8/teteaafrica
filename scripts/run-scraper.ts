/**
 * scripts/run-scraper.ts
 * CLI entry point for running scrapers manually.
 *
 * Usage:
 *   npx tsx scripts/run-scraper.ts gazette
 *   npx tsx scripts/run-scraper.ts nairobi
 *   npx tsx scripts/run-scraper.ts parliament
 *
 * Or via npm scripts:
 *   npm run scraper:gazette
 *   npm run scraper:nairobi
 *   npm run scraper:parliament
 */

import type { ScraperRunSummary } from '@/lib/scrapers/base';

const VALID_SCRAPERS = ['gazette', 'nairobi', 'parliament'] as const;
type ScraperName = typeof VALID_SCRAPERS[number];

async function main() {
  const scraperArg = process.argv[2] as ScraperName | undefined;

  if (!scraperArg || !VALID_SCRAPERS.includes(scraperArg)) {
    console.error(`Usage: tsx scripts/run-scraper.ts <scraper>`);
    console.error(`Valid scrapers: ${VALID_SCRAPERS.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n[run-scraper] Starting scraper: ${scraperArg}`);
  console.log(`[run-scraper] Time: ${new Date().toISOString()}\n`);

  let summary: ScraperRunSummary;

  switch (scraperArg) {
    case 'gazette': {
      const { runGazetteScraper } = await import('@/lib/countries/KE/scrapers/gazette');
      summary = await runGazetteScraper();
      break;
    }
    case 'nairobi': {
      const { runNairobiCountyScraper } = await import('@/lib/countries/KE/scrapers/county-nairobi');
      summary = await runNairobiCountyScraper();
      break;
    }
    case 'parliament': {
      const { runParliamentScraper } = await import('@/lib/countries/KE/scrapers/parliament');
      summary = await runParliamentScraper();
      break;
    }
  }

  const durationMs = summary.finishedAt.getTime() - summary.startedAt.getTime();

  console.log('\n[run-scraper] ─── Run Summary ───────────────────────────');
  console.log(`  scraper   : ${summary.scraperName}`);
  console.log(`  started   : ${summary.startedAt.toISOString()}`);
  console.log(`  finished  : ${summary.finishedAt.toISOString()}`);
  console.log(`  duration  : ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`  processed : ${summary.processed}`);
  console.log(`  inserted  : ${summary.inserted}`);
  console.log(`  skipped   : ${summary.skipped}`);
  console.log(`  errors    : ${summary.errors}`);
  console.log('[run-scraper] ─────────────────────────────────────────────\n');

  process.exit(summary.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[run-scraper] Fatal error:', err);
  process.exit(1);
});
