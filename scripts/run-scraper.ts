/**
 * scripts/run-scraper.ts
 * CLI entry point for running scrapers and analysis pipeline.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts gazette
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts nairobi
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts parliament
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts county-mombasa
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts county-kisumu
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts county-nakuru
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts county-kisii
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts counties
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts historical
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts historical:all
 */

import { runFullPipeline, runHistoricalAnalysis } from '@/lib/scrapers/pipeline';
import type { ScraperName } from '@/lib/scrapers/pipeline';

const SCRAPER_COMMANDS: ScraperName[] = ['gazette', 'nairobi', 'parliament', 'county-mombasa', 'county-kisumu', 'county-nakuru', 'county-kisii'];
const COUNTY_SCRAPERS: ScraperName[] = ['nairobi', 'county-mombasa', 'county-kisumu', 'county-nakuru', 'county-kisii'];
const VALID_COMMANDS = [...SCRAPER_COMMANDS, 'counties', 'historical', 'historical:all'] as const;
type Command = typeof VALID_COMMANDS[number];

async function runSingleScraper(scraperName: ScraperName) {
  const result = await runFullPipeline(scraperName);
  const summary = result.scraped;
  const durationMs = summary.finishedAt.getTime() - summary.startedAt.getTime();

  console.log('\n[run-scraper] ─── Pipeline Summary ──────────────────────');
  console.log(`  scraper    : ${summary.scraperName}`);
  console.log(`  started    : ${summary.startedAt.toISOString()}`);
  console.log(`  finished   : ${summary.finishedAt.toISOString()}`);
  console.log(`  duration   : ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`  scraped    : ${summary.inserted}`);
  console.log(`  skipped    : ${summary.skipped}`);
  console.log(`  analyzed   : ${result.analyzed}`);
  console.log(`  errors     : ${summary.errors + result.errors}`);
  console.log('[run-scraper] ─────────────────────────────────────────────\n');

  return summary.errors + result.errors;
}

async function main() {
  const command = process.argv[2] as Command | undefined;

  if (!command || !VALID_COMMANDS.includes(command)) {
    console.error(`Usage: tsx scripts/run-scraper.ts <command>`);
    console.error(`Valid commands: ${VALID_COMMANDS.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n[run-scraper] Starting: ${command}`);
  console.log(`[run-scraper] Time: ${new Date().toISOString()}\n`);

  if (command === 'historical' || command === 'historical:all') {
    const limitArg = parseInt(process.argv[3] ?? '', 10);
    const limit = command === 'historical:all' ? 200 : (isNaN(limitArg) ? 20 : limitArg);
    const result = await runHistoricalAnalysis(limit);

    console.log('\n[run-scraper] ─── Historical Analysis Summary ────────────');
    console.log(`  analyzed : ${result.analyzed}`);
    console.log(`  skipped  : ${result.skipped}`);
    console.log(`  errors   : ${result.errors}`);
    console.log('[run-scraper] ─────────────────────────────────────────────\n');

    process.exit(result.errors > 0 ? 1 : 0);
  }

  if (command === 'counties') {
    console.log(`[run-scraper] Running all ${COUNTY_SCRAPERS.length} county scrapers in sequence...\n`);
    let totalErrors = 0;
    for (const scraper of COUNTY_SCRAPERS) {
      console.log(`\n[run-scraper] ═══ ${scraper} ═══════════════════════════════\n`);
      const errs = await runSingleScraper(scraper);
      totalErrors += errs;
    }
    console.log(`\n[run-scraper] All counties done. Total errors: ${totalErrors}`);
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  // Single scraper command
  const errs = await runSingleScraper(command as ScraperName);
  process.exit(errs > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[run-scraper] Fatal error:', err);
  process.exit(1);
});
