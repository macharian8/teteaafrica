export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { analyzeDocument } from '@/lib/analysis/analyzeDocument';
import { logError } from '@/lib/supabase/errors';
import type { ApiResponse, DocumentAnalysisResult } from '@/lib/types';

interface AnalyzeRequestBody {
  document_id: string;
}

export interface AnalyzeResult {
  analysis_id: string | null;
  result: DocumentAnalysisResult;
  needs_review: boolean;
  already_existed: boolean;
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<AnalyzeResult>>> {
  try {
    const body = (await req.json()) as AnalyzeRequestBody;

    if (!body.document_id?.trim()) {
      return NextResponse.json(
        { success: false, error: 'document_id is required' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Fetch the stored document
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('id, raw_text, country_code')
      .eq('id', body.document_id)
      .single();

    if (docErr || !doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    if (!doc.raw_text || doc.raw_text.length < 50) {
      return NextResponse.json(
        { success: false, error: 'Document has no extractable text' },
        { status: 422 }
      );
    }

    try {
      const output = await analyzeDocument({
        documentId: doc.id,
        rawText: doc.raw_text,
        countryCode: doc.country_code,
      });

      return NextResponse.json({
        success: true,
        data: {
          analysis_id: output.analysisId,
          result: output.result,
          needs_review: output.needsReview,
          already_existed: output.alreadyExisted,
        },
      });
    } catch (analysisErr) {
      const message = analysisErr instanceof Error ? analysisErr.message : 'Analysis failed';
      await logError(supabase, message, { path: '/api/documents/analyze', document_id: body.document_id });

      return NextResponse.json(
        { success: false, error: 'analysis_failed', message: 'Document too complex. Try uploading a specific section.' },
        { status: 422 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    const supabase = createServiceRoleClient();
    await logError(supabase, message, { path: '/api/documents/analyze' });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
