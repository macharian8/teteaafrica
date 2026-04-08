#!/usr/bin/env tsx
/**
 * scripts/analyze-scraped-docs.ts
 * Finds scraped documents that have no analysis yet and runs analyzeDocument()
 * on each one. Processes in batches of 5 to respect Claude API rate limits.
 *
 * Criteria for "needs analysis":
 *   - raw_text IS NOT NULL AND length > 500 chars
 *   - No existing document_analyses row with confidence_score > 0.3
 *
 * Usage:
 *   npm run analyze:scraped
 *   -- or --
 *   npx tsx --env-file=.env.local scripts/analyze-scraped-docs.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { analyzeDocument } from '../lib/analysis/analyzeDocument';

// ── Client ────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function docLabel(id: string, url: string | null): string {
  if (url) {
    try {
      const u = new URL(url);
      // Show host + last two path segments
      const parts = u.pathname.split('/').filter(Boolean);
      const tail = parts.slice(-2).join('/');
      return `${u.hostname}/${tail}`;
    } catch {
      return url.slice(0, 80);
    }
  }
  return `doc:${id.slice(0, 8)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── analyze-scraped-docs ──────────────────────────────────────');

  // 1. Find all document IDs already analysed with confidence > 0.3
  const { data: analyzedRows, error: analyzedErr } = await supabase
    .from('document_analyses')
    .select('document_id')
    .not('document_id', 'is', null)
    .gt('confidence_score', 0.3);

  if (analyzedErr) {
    console.error('Failed to query document_analyses:', analyzedErr.message);
    process.exit(1);
  }

  const analyzedIds = new Set(
    (analyzedRows ?? []).map((r) => r.document_id as string).filter(Boolean)
  );
  console.log(`Existing analyses (confidence > 0.3): ${analyzedIds.size}`);

  // 2. Fetch all documents with raw_text
  const { data: allDocs, error: docsErr } = await supabase
    .from('documents')
    .select('id, url, raw_text, country_code, source, scraped_at')
    .not('raw_text', 'is', null)
    .order('scraped_at', { ascending: false });

  if (docsErr || !allDocs) {
    console.error('Failed to query documents:', docsErr?.message);
    process.exit(1);
  }

  // 3. Filter to unanalysed documents with sufficient text
  const unanalyzed = allDocs.filter(
    (doc) =>
      !analyzedIds.has(doc.id) &&
      typeof doc.raw_text === 'string' &&
      (doc.raw_text as string).length > 500
  );

  console.log(`Total documents with raw_text:  ${allDocs.length}`);
  console.log(`Unanalysed (need processing):   ${unanalyzed.length}`);

  if (unanalyzed.length === 0) {
    console.log('\nAll documents already analysed. Nothing to do.\n');
    return;
  }

  console.log('\nProcessing (batches of 5, sequential within each batch):\n');

  const BATCH_SIZE = 5;
  const INTER_BATCH_DELAY_MS = 3000; // pause between batches

  let analysed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < unanalyzed.length; i += BATCH_SIZE) {
    const batch = unanalyzed.slice(i, i + BATCH_SIZE);

    if (i > 0) {
      process.stdout.write(`\n  [batch pause ${INTER_BATCH_DELAY_MS / 1000}s] `);
      await sleep(INTER_BATCH_DELAY_MS);
      console.log('resuming\n');
    }

    for (const doc of batch) {
      const label = docLabel(doc.id, doc.url as string | null);
      const countryCode = (doc.country_code as string) || 'KE';

      process.stdout.write(`  → [${countryCode}] ${label} ... `);

      try {
        const output = await analyzeDocument({
          documentId: doc.id as string,
          rawText: doc.raw_text as string,
          countryCode: countryCode as 'KE' | 'TZ' | 'UG' | 'RW',
        });

        const conf = typeof output.result.confidence_score === 'number'
          ? output.result.confidence_score.toFixed(2)
          : 'n/a';
        const actionCount = output.result.actions?.length ?? 0;

        if (output.alreadyExisted) {
          console.log(`SKIP  (cached, confidence=${conf})`);
          skipped++;
        } else {
          console.log(`OK    confidence=${conf}  actions=${actionCount}`);

          // Log top action titles for visibility
          if (output.result.actions?.length) {
            for (const action of output.result.actions) {
              console.log(`         • [${action.executability}] ${action.title_en}`);
            }
          }
          analysed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAIL  (${msg})`);
        failed++;
        // Continue to next document
      }
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`Analysed: ${analysed}   Skipped (cached): ${skipped}   Failed: ${failed}`);
  console.log(`Total:    ${analysed + skipped + failed} / ${unanalyzed.length} processed\n`);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
