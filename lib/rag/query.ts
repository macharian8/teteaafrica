import OpenAI from 'openai';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { CountryCode, LawChunk } from '@/lib/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBED_MODEL = 'text-embedding-3-small';
const MAX_CHUNKS = 5;     // CLAUDE.md: RAG bounded to 5 chunks max
const DEFAULT_THRESHOLD = 0.7;

/**
 * Semantic search over law_chunks for a given country.
 * Returns at most MAX_CHUNKS results above the similarity threshold.
 *
 * @example
 *   const chunks = await queryLawChunks('right to petition', 'KE');
 *   // → chunks containing Article 37 + Article 119
 */
export async function queryLawChunks(
  query: string,
  countryCode: CountryCode,
  threshold = DEFAULT_THRESHOLD
): Promise<LawChunk[]> {
  const embeddingResponse = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: query,
  });
  const embedding = embeddingResponse.data[0].embedding;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('match_law_chunks', {
    query_embedding: embedding,
    query_country_code: countryCode,
    match_threshold: threshold,
    match_count: MAX_CHUNKS,
  });

  if (error) throw new Error(`RAG query failed: ${error.message}`);

  return (data ?? []) as LawChunk[];
}

/**
 * Format law chunks into a compact context block for inclusion in a Claude prompt.
 * Each chunk is labelled with its statute and section reference.
 */
export function formatChunksForPrompt(chunks: LawChunk[]): string {
  if (chunks.length === 0) return '(No relevant law provisions found for this document.)';
  return chunks
    .map((c, i) => {
      const label = c.section_ref
        ? `${c.statute_name} — ${c.section_ref}`
        : c.statute_name;
      return `[${i + 1}] ${label}\n${c.chunk_text}`;
    })
    .join('\n\n---\n\n');
}

// ── Quick test ────────────────────────────────────────────────────────────────
// To run: tsx -e "import('./lib/rag/query.ts').then(m => m.testQuery())"

export async function testQuery(): Promise<void> {
  console.log('Testing RAG query: "right to petition"\n');
  const results = await queryLawChunks('right to petition', 'KE');
  if (results.length === 0) {
    console.log('No results — ensure law corpus is seeded (pnpm run seed:law)');
    return;
  }
  for (const r of results) {
    console.log(`  [${r.similarity.toFixed(3)}] ${r.statute_name} — ${r.section_ref ?? 'n/a'}`);
    console.log(`         ${r.chunk_text.slice(0, 120)}…\n`);
  }
}
