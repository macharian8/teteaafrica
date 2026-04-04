/**
 * lib/scrapers/dedup.ts
 * Shared document deduplication for all scrapers.
 *
 * Strategy: SHA-256 of (url + content) → check against documents.content_hash.
 * If the hash already exists in the DB, the document is a duplicate — skip it.
 */

import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Compute a deterministic SHA-256 hash from a URL and raw content string.
 * Either field may be empty (URL-only hash for early dedup before fetch).
 */
export function computeHash(url: string, content = ''): string {
  return crypto.createHash('sha256').update(`${url}||${content}`).digest('hex');
}

/**
 * Compute hash from content only (used after download, before URL is known).
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Return true if a document with this content_hash already exists in DB.
 */
export async function isDuplicate(
  supabase: SupabaseClient,
  contentHash: string
): Promise<boolean> {
  const { data } = await supabase
    .from('documents')
    .select('id')
    .eq('content_hash', contentHash)
    .maybeSingle();
  return !!data;
}

/**
 * Convenience: compute hash then check DB.
 * Returns the hash and whether it already exists.
 */
export async function checkDuplicate(
  supabase: SupabaseClient,
  url: string,
  content = ''
): Promise<{ hash: string; isDuplicate: boolean }> {
  const hash = computeHash(url, content);
  const exists = await isDuplicate(supabase, hash);
  return { hash, isDuplicate: exists };
}

/**
 * Build a reusable Supabase service-role client for scraper scripts.
 * Must only run server-side (scripts / cron) — never in the browser.
 */
export function buildScraperSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}
