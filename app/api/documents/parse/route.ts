export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { parsePdfBuffer, parseUrl, preprocessText } from '@/lib/parsers/pdfParser';
import { logError } from '@/lib/supabase/errors';
import type { ApiResponse } from '@/lib/types';

export interface ParseResult {
  document_id: string;
  raw_text: string;
  storage_path: string | null;
  page_count: number;
  is_scanned: boolean;
  content_hash: string;
  already_exists: boolean;
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<ParseResult>>> {
  try {
    const supabase = createServiceRoleClient();

    let rawText = '';
    let pageCount = 1;
    let isScanned = false;
    let fileBuffer: Buffer | null = null;
    let fileName: string | null = null;
    let sourceUrl: string | null = null;
    let storagePath: string | null = null;

    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') {
        return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
      }
      fileBuffer = Buffer.from(await (file as File).arrayBuffer());
      fileName = (file as File).name;
      const parsed = await parsePdfBuffer(fileBuffer);
      rawText = parsed.text;
      pageCount = parsed.pageCount;
      isScanned = parsed.isScanned;
    } else {
      const body = (await req.json()) as { url?: string };
      if (!body.url?.trim()) {
        return NextResponse.json({ success: false, error: 'url is required' }, { status: 400 });
      }
      sourceUrl = body.url.trim();
      const parsed = await parseUrl(sourceUrl);
      rawText = parsed.text;
      pageCount = parsed.pageCount;
      isScanned = parsed.isScanned;
    }

    if (!rawText || rawText.length < 500) {
      return NextResponse.json(
        {
          success: false,
          error: 'insufficient_text',
          message: 'Could not extract readable text. Try a different URL or text-based PDF.',
        },
        { status: 422 }
      );
    }

    const contentHash = crypto.createHash('sha256').update(rawText).digest('hex');

    // Deduplication — return existing record without re-storing
    const { data: existing } = await supabase
      .from('documents')
      .select('id, storage_path')
      .eq('content_hash', contentHash)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        data: {
          document_id: existing.id,
          raw_text: rawText,
          storage_path: existing.storage_path,
          page_count: pageCount,
          is_scanned: isScanned,
          content_hash: contentHash,
          already_exists: true,
        },
      });
    }

    // Upload PDF to Supabase Storage
    if (fileBuffer && fileName) {
      const safeName = `${contentHash}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(safeName, fileBuffer, { contentType: 'application/pdf', upsert: false });
      if (!storageError) storagePath = safeName;
    }

    // Preprocess for storage (the parse route stores raw text as-is;
    // analyzeDocument will preprocess before sending to Claude)
    const textToStore = preprocessText(rawText);

    const { data: doc, error: insertError } = await supabase
      .from('documents')
      .insert({
        country_code: 'KE',
        url: sourceUrl,
        raw_text: textToStore,
        storage_path: storagePath,
        content_hash: contentHash,
        source: 'manual',
        scraped_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError || !doc) {
      await logError(supabase, insertError?.message ?? 'Document insert failed', {
        path: '/api/documents/parse',
      });
      return NextResponse.json(
        { success: false, error: 'Failed to store document' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        document_id: doc.id,
        raw_text: textToStore,
        storage_path: storagePath,
        page_count: pageCount,
        is_scanned: isScanned,
        content_hash: contentHash,
        already_exists: false,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
