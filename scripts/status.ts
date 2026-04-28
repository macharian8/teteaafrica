#!/usr/bin/env tsx
/**
 * scripts/status.ts
 * Live operations dashboard — prints a snapshot of pipeline state.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/status.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const OCR_MIN_USEFUL_CHARS = 100;
const OCR_DEFAULT_MAX_PAGES = 20;

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  const now = Date.now();
  const ageMin = Math.round((now - d.getTime()) / 60000);
  const rel =
    ageMin < 1 ? 'just now'
    : ageMin < 60 ? `${ageMin}m ago`
    : ageMin < 1440 ? `${Math.round(ageMin / 60)}h ago`
    : `${Math.round(ageMin / 1440)}d ago`;
  return `${d.toISOString()} (${rel})`;
}

async function exactCount(
  table: 'documents' | 'document_analyses' | 'users' | 'waitlist' | 'notifications',
  build?: (q: ReturnType<typeof supabase.from>) => unknown
): Promise<number | null> {
  const base = supabase.from(table).select('*', { count: 'exact', head: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase fluent builder typing varies per filter
  const q: any = build ? build(base as unknown as ReturnType<typeof supabase.from>) : base;
  const { count, error } = await q;
  if (error) {
    console.error(`  [warn] count(${table}) failed: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

async function distinctAnalyzedDocCount(): Promise<number | null> {
  // count distinct document_id where confidence_score > 0.3
  const { data, error } = await supabase
    .from('document_analyses')
    .select('document_id')
    .gt('confidence_score', 0.3)
    .not('document_id', 'is', null);
  if (error) {
    console.error(`  [warn] distinctAnalyzedDocCount failed: ${error.message}`);
    return null;
  }
  const set = new Set<string>();
  for (const r of data ?? []) {
    if (r.document_id) set.add(r.document_id as string);
  }
  return set.size;
}

async function maxTimestamp(
  table: 'documents' | 'document_analyses',
  column: 'scraped_at' | 'created_at'
): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`  [warn] max(${table}.${column}) failed: ${error.message}`);
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic column access
  return (data as any)?.[column] ?? null;
}

async function activeCronJobCount(): Promise<number | string> {
  // pg_cron lives in the `cron` schema, which is not exposed via PostgREST by
  // default. Try an RPC if one is provisioned, otherwise return a hint.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- optional rpc
    const { data, error } = await (supabase as any).rpc('active_cron_job_count');
    if (!error && typeof data === 'number') return data;
  } catch {
    // fall through
  }
  return 'unknown (run `SELECT count(*) FROM cron.job WHERE active` in SQL editor — expected 4)';
}

/**
 * Documents with a stored PDF but missing/short raw_text — i.e. need OCR.
 * PostgREST cannot filter by length(text), so we pull candidate ids+raw_text
 * lengths and tally in JS. Mirrors the logic in scripts/ocr-backfill.ts.
 */
async function ocrNeedsCount(): Promise<number | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, raw_text')
    .not('storage_path', 'is', null);
  if (error) {
    console.error(`  [warn] ocrNeedsCount failed: ${error.message}`);
    return null;
  }
  let n = 0;
  for (const r of data ?? []) {
    const txt = r.raw_text as string | null;
    if (!txt || txt.length < OCR_MIN_USEFUL_CHARS) n++;
  }
  return n;
}

/**
 * Last OCR run proxy — most recent scraped_at among docs with storage_path
 * AND raw_text length > 100. (documents has no updated_at; scraped_at is the
 * closest available timestamp on rows that have been OCR'd.)
 */
async function lastOcrRun(): Promise<string | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('scraped_at, raw_text')
    .not('storage_path', 'is', null)
    .not('raw_text', 'is', null)
    .order('scraped_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error(`  [warn] lastOcrRun failed: ${error.message}`);
    return null;
  }
  for (const r of data ?? []) {
    const txt = r.raw_text as string | null;
    if (txt && txt.length > OCR_MIN_USEFUL_CHARS) {
      return (r.scraped_at as string | null) ?? null;
    }
  }
  return null;
}

async function main() {
  console.log('\n=== TETEA STATUS ===');

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    docsTotal,
    docsAnalyzed,
    cronCount,
    lastScrape,
    lastAnalysis,
    needsOcr,
    lastOcrTs,
    partialOcrCount,
    notifs24h,
    usersTotal,
    waitlistTotal,
  ] = await Promise.all([
    exactCount('documents'),
    distinctAnalyzedDocCount(),
    activeCronJobCount(),
    maxTimestamp('documents', 'scraped_at'),
    maxTimestamp('document_analyses', 'created_at'),
    ocrNeedsCount(),
    lastOcrRun(),
    exactCount('documents', (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fluent builder
      (q as any).gt('page_count', OCR_DEFAULT_MAX_PAGES).not('raw_text', 'is', null)
    ),
    exactCount('notifications', (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fluent builder
      (q as any).gte('sent_at', since24h).in('status', ['sent', 'delivered'])
    ),
    exactCount('users'),
    exactCount('waitlist'),
  ]);

  const total = docsTotal ?? 0;
  const analyzed = docsAnalyzed ?? 0;
  const unanalyzed = Math.max(0, total - analyzed);

  const fmt = (v: number | null) => (v === null ? '?' : v.toString());

  console.log(
    `Documents:     ${fmt(docsTotal)} total | ${fmt(docsAnalyzed)} analyzed | ${unanalyzed} unanalyzed`
  );
  console.log(`Cron jobs:     ${cronCount} active`);
  console.log(`Last scrape:   ${fmtTs(lastScrape)}`);
  console.log(`Last analysis: ${fmtTs(lastAnalysis)}`);
  console.log(`Needs OCR:     ${fmt(needsOcr)} docs (npx tsx --env-file=.env.local scripts/ocr-backfill.ts --limit=3 --max-pages=999)`);
  console.log(`Last OCR run:  ${fmtTs(lastOcrTs)}`);
  console.log(`Notifications: ${fmt(notifs24h)} sent in last 24h`);
  console.log(`Users:         ${fmt(usersTotal)}`);
  console.log(`Waitlist:      ${fmt(waitlistTotal)}`);

  // Partial-coverage warning — docs whose page_count exceeds the historical
  // default of 20 but which still got OCR'd; re-run with --max-pages=999 to
  // capture the rest.
  console.log('');
  console.log(`Docs with page_count > ${OCR_DEFAULT_MAX_PAGES} that have raw_text:`);
  console.log(`${fmt(partialOcrCount)} docs were OCR'd at partial coverage (first ${OCR_DEFAULT_MAX_PAGES} pages only)`);
  console.log(`— re-run with --max-pages=999 to get full text`);
  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
