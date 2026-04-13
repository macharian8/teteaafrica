/**
 * scripts/ocr-backfill.ts
 * Backfill OCR text for scanned PDFs stored in Supabase Storage.
 *
 * Finds documents where:
 *   - is_scanned = true
 *   - raw_text IS NULL or length(raw_text) < 100
 *   - storage_path IS NOT NULL
 *
 * Downloads each PDF, runs OCR, updates raw_text.
 * Processes up to 10 per run (OCR is ~30s/page).
 *
 * Usage: npx tsx --env-file=.env.local scripts/ocr-backfill.ts
 */

import { createClient } from '@supabase/supabase-js';
import { ocrPdfBuffer } from '../lib/parsers/ocrParser';
import { preprocessText } from '../lib/parsers/pdfParser';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAX_DOCS = 10;
const MIN_USEFUL_CHARS = 100;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[ocr-backfill] Missing SUPABASE env vars');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Find docs with a stored PDF but no/minimal extracted text (likely scanned)
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, storage_path, raw_text')
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_DOCS * 5); // fetch extra, filter in app

  if (error) {
    console.error('[ocr-backfill] Query error:', error.message);
    process.exit(1);
  }

  // Filter to those with no/short raw_text
  const candidates = (docs ?? []).filter(
    (d) => !d.raw_text || d.raw_text.length < MIN_USEFUL_CHARS
  );

  console.log(`[ocr-backfill] Found ${candidates.length} scanned docs needing OCR (of ${docs?.length ?? 0} scanned total)`);

  if (candidates.length === 0) {
    console.log('[ocr-backfill] Nothing to process. Exiting.');
    process.exit(0);
  }

  const toProcess = candidates.slice(0, MAX_DOCS);
  let processed = 0;
  let skipped = 0;

  for (const doc of toProcess) {
    console.log(`\n[ocr-backfill] Processing ${processed + skipped + 1}/${toProcess.length}: id=${doc.id}`);
    console.log(`[ocr-backfill] storage_path=${doc.storage_path}`);

    try {
      // Download PDF from Supabase Storage
      const { data: fileData, error: dlError } = await supabase
        .storage
        .from('documents')
        .download(doc.storage_path);

      if (dlError || !fileData) {
        console.error(`[ocr-backfill] Download failed for ${doc.id}:`, dlError?.message);
        skipped++;
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      console.log(`[ocr-backfill] Downloaded ${buffer.length} bytes`);

      // Run OCR
      const ocrResult = await ocrPdfBuffer(buffer);
      const cleanText = preprocessText(ocrResult.text);

      console.log(`[ocr-backfill] id=${doc.id} confidence=${ocrResult.confidence}% chars=${cleanText.length}`);

      // Skip if OCR produced too little text
      if (cleanText.length < MIN_USEFUL_CHARS) {
        console.log(`[ocr-backfill] Skipping ${doc.id}: OCR returned only ${cleanText.length} chars (truly unreadable)`);
        skipped++;
        continue;
      }

      // Update document with OCR'd text
      const { error: updateError } = await supabase
        .from('documents')
        .update({ raw_text: cleanText })
        .eq('id', doc.id);

      if (updateError) {
        console.error(`[ocr-backfill] Update failed for ${doc.id}:`, updateError.message);
        skipped++;
        continue;
      }

      processed++;
      console.log(`[ocr-backfill] Updated ${doc.id} with ${cleanText.length} chars of OCR text`);
    } catch (err) {
      console.error(`[ocr-backfill] Error processing ${doc.id}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  console.log(`\n[ocr-backfill] Done: processed=${processed} skipped=${skipped}`);
}

main().catch((err) => {
  console.error('[ocr-backfill] Fatal error:', err);
  process.exit(1);
});
