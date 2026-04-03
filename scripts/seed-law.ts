#!/usr/bin/env tsx
/**
 * scripts/seed-law.ts
 * Reads plain-text law files from supabase/seed/law/{CC}/,
 * chunks them, embeds with OpenAI text-embedding-3-small,
 * and upserts into law_chunks.
 *
 * Usage:
 *   pnpm run seed:law               # defaults to --country=KE
 *   pnpm run seed:law -- --country=KE
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { CountryCode } from '../lib/types';

// ── Config ──────────────────────────────────────────────────────────────────

const CHUNK_SIZE_CHARS = 2_000;  // ≈ 500 tokens
const CHUNK_OVERLAP_CHARS = 200; // ≈ 50 tokens
const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_BATCH = 20;          // embed N chunks per OpenAI call
const INSERT_BATCH = 50;         // rows per Supabase insert call

// ── CLI args ─────────────────────────────────────────────────────────────────

const countryArg = process.argv.find((a) => a.startsWith('--country='));
const COUNTRY_CODE: CountryCode = (countryArg?.split('=')[1] as CountryCode) ?? 'KE';

// ── Clients ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Chunker ───────────────────────────────────────────────────────────────────

interface Chunk {
  statuteName: string;
  sectionRef: string | null;
  text: string;
  index: number;
}

function chunkText(text: string, statuteName: string): Chunk[] {
  // Try to split on section/article headers first
  const sectionPattern = /\n(?=(?:PART|SECTION|Article|ARTICLE|Chapter|CHAPTER)\s+[IVXLCDM\d]+)/g;
  const rawSections = text.split(sectionPattern).filter((s) => s.trim().length > 0);

  const chunks: Chunk[] = [];
  let globalIndex = 0;

  for (const section of rawSections) {
    // Extract a section reference from the first line
    const firstLine = section.split('\n')[0].trim();
    const sectionRef =
      /^(?:PART|SECTION|Article|ARTICLE|Chapter|CHAPTER)\s+[IVXLCDM\d]+/.test(firstLine)
        ? firstLine.slice(0, 80)
        : null;

    if (section.length <= CHUNK_SIZE_CHARS) {
      chunks.push({ statuteName, sectionRef, text: section.trim(), index: globalIndex++ });
      continue;
    }

    // Section is too large — slide a window over it
    let offset = 0;
    while (offset < section.length) {
      const slice = section.slice(offset, offset + CHUNK_SIZE_CHARS);
      chunks.push({
        statuteName,
        sectionRef,
        text: slice.trim(),
        index: globalIndex++,
      });
      offset += CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS;
    }
  }

  return chunks;
}

// ── Embedding helper ──────────────────────────────────────────────────────────

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

// ── Upsert helper ─────────────────────────────────────────────────────────────
// Strategy: 1 SELECT to get all existing chunk_indexes for this statute,
// then batch-insert only the new ones (INSERT_BATCH rows per call).
// This reduces N*2 round-trips down to 1 + ceil(N/INSERT_BATCH).

async function upsertChunks(chunks: Chunk[], embeddings: number[][]): Promise<number> {
  if (chunks.length === 0) return 0;

  // 1. Fetch all existing chunk_indexes for this statute in one query
  const { data: existingRows, error: fetchErr } = await supabase
    .from('law_chunks')
    .select('chunk_index')
    .eq('country_code', COUNTRY_CODE)
    .eq('statute_name', chunks[0].statuteName);

  if (fetchErr) {
    console.error(`  ✗ Could not query existing chunks: ${fetchErr.message}`);
  }

  const existingIndexes = new Set(
    (existingRows ?? []).map((r: { chunk_index: number }) => r.chunk_index)
  );

  // 2. Filter to only new chunks (embeddings[i] aligns with chunks[i] positionally)
  const newPairs = chunks
    .map((chunk, i) => ({ chunk, embedding: embeddings[i] }))
    .filter(({ chunk }) => !existingIndexes.has(chunk.index));

  if (newPairs.length === 0) return 0;

  // 3. Batch insert
  let inserted = 0;
  for (let i = 0; i < newPairs.length; i += INSERT_BATCH) {
    const batch = newPairs.slice(i, i + INSERT_BATCH);
    const rows = batch.map(({ chunk, embedding }) => ({
      country_code: COUNTRY_CODE,
      statute_name: chunk.statuteName,
      section_ref: chunk.sectionRef,
      chunk_text: chunk.text,
      chunk_index: chunk.index,
      embedding: embedding as unknown as number[], // pgvector accepts number[]
    }));

    const { error } = await supabase.from('law_chunks').insert(rows);
    if (error) {
      console.error(`  ✗ Batch [${i}–${i + batch.length - 1}] failed: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }
  return inserted;
}

// ── Filename → statute name ───────────────────────────────────────────────────

function fileToStatuteName(filename: string): string {
  return basename(filename, '.txt')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const seedDir = join(process.cwd(), 'supabase', 'seed', 'law', COUNTRY_CODE);

  let files: string[];
  try {
    files = readdirSync(seedDir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => join(seedDir, f));
  } catch {
    console.error(`No seed directory found at ${seedDir}`);
    console.error(`Run: mkdir -p ${seedDir} and add .txt law files.`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(`No .txt files found in ${seedDir}. See README.md for instructions.`);
    process.exit(0);
  }

  console.log(`\nSeeding ${files.length} law document(s) for ${COUNTRY_CODE}\n`);

  let totalChunks = 0;
  let totalInserted = 0;

  for (const filePath of files) {
    const statuteName = fileToStatuteName(filePath);
    console.log(`  → ${statuteName}`);

    const text = readFileSync(filePath, 'utf-8');
    const chunks = chunkText(text, statuteName);
    console.log(`     ${chunks.length} chunks`);

    // Embed in batches
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const batchEmbeddings = await embedBatch(batch.map((c) => c.text));
      embeddings.push(...batchEmbeddings);
      process.stdout.write(`     embedded ${Math.min(i + EMBED_BATCH, chunks.length)}/${chunks.length}\r`);
    }
    console.log();

    process.stdout.write(`     inserting…\r`);
    const inserted = await upsertChunks(chunks, embeddings);
    const skipped = chunks.length - inserted;
    console.log(`     ✓ ${inserted} inserted, ${skipped} skipped (already seeded)\n`);

    totalChunks += chunks.length;
    totalInserted += inserted;
  }

  console.log(`Done. Total: ${totalInserted}/${totalChunks} chunks inserted for ${COUNTRY_CODE}\n`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
