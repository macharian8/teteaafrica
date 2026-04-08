/**
 * scripts/run-scraper.ts
 * CLI entry point for running scrapers and analysis pipeline.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts gazette
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts nairobi
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts parliament
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts historical
 *   npx tsx --env-file=.env.local scripts/run-scraper.ts historical:all
 */

import { runFullPipeline, runHistoricalAnalysis } from '@/lib/scrapers/pipeline';

const VALID_COMMANDS = ['gazette', 'nairobi', 'parliament', 'historical', 'historical:all'] as const;
type Command = typeof VALID_COMMANDS[number];

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
    const limit = command === 'historical:all' ? 200 : 20;
    const result = await runHistoricalAnalysis(limit);

    console.log('\n[run-scraper] ─── Historical Analysis Summary ────────────');
    console.log(`  analyzed : ${result.analyzed}`);
    console.log(`  skipped  : ${result.skipped}`);
    console.log(`  errors   : ${result.errors}`);
    console.log('[run-scraper] ─────────────────────────────────────────────\n');

    process.exit(result.errors > 0 ? 1 : 0);
  }

  // Scraper pipeline commands
  const scraperName = command as 'gazette' | 'nairobi' | 'parliament';
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

  process.exit((summary.errors + result.errors) > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[run-scraper] Fatal error:', err);
  process.exit(1);
});
