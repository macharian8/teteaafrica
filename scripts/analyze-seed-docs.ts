#!/usr/bin/env tsx
/**
 * scripts/analyze-seed-docs.ts
 * Reads the 9 law txt files from supabase/seed/law/KE/,
 * creates document records in Supabase, runs analyzeDocument on each,
 * and stores the analysis results. Skips files that already have an
 * analysis with confidence_score > 0.3.
 *
 * Usage:
 *   npm run analyze:seed
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { analyzeDocument } from '../lib/analysis/analyzeDocument';

// ── Client ───────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function fileToTitle(filename: string): string {
  return basename(filename, '.txt')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seedDir = join(process.cwd(), 'supabase', 'seed', 'law', 'KE');

  let files: string[];
  try {
    files = readdirSync(seedDir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => join(seedDir, f));
  } catch {
    console.error(`No seed directory found at ${seedDir}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('No .txt files found in seed directory.');
    process.exit(0);
  }

  console.log(`\nAnalysing ${files.length} seed document(s) for KE\n`);

  let analysed = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    const title = fileToTitle(filePath);
    process.stdout.write(`→ ${title} ... `);

    const rawText = readFileSync(filePath, 'utf-8');

    if (rawText.trim().length < 500) {
      console.log('SKIP (text too short)');
      skipped++;
      continue;
    }

    const contentHash = crypto.createHash('sha256').update(rawText).digest('hex');

    // Get or create document record
    let documentId: string;
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('content_hash', contentHash)
      .maybeSingle();

    if (existingDoc) {
      documentId = existingDoc.id;
    } else {
      const { data: newDoc, error: insertErr } = await supabase
        .from('documents')
        .insert({
          country_code: 'KE',
          url: null,
          raw_text: rawText,
          storage_path: null,
          content_hash: contentHash,
          source: 'seed',
          scraped_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertErr || !newDoc) {
        console.log(`FAIL (insert error: ${insertErr?.message ?? 'unknown'})`);
        failed++;
        continue;
      }
      documentId = newDoc.id;
    }

    // analyzeDocument handles its own cache check (confidence_score > 0.3)
    try {
      const output = await analyzeDocument({
        documentId,
        rawText,
        countryCode: 'KE',
      });

      if (output.alreadyExisted) {
        console.log(`SKIP (cached, confidence=${
          typeof output.result.confidence_score === 'number'
            ? output.result.confidence_score.toFixed(2)
            : 'n/a'
        })`);
        skipped++;
      } else {
        console.log(`OK   (confidence=${
          typeof output.result.confidence_score === 'number'
            ? output.result.confidence_score.toFixed(2)
            : 'n/a'
        }, actions=${output.result.actions?.length ?? 0})`);
        analysed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL (${msg})`);
      failed++;
    }
  }

  console.log(`\nDone. Analysed: ${analysed}  Skipped: ${skipped}  Failed: ${failed}\n`);
}

main().catch((err) => {
  console.error('analyze-seed-docs failed:', err);
  process.exit(1);
});
