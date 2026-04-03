export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { analyzeDocument } from '@/lib/analysis/analyzeDocument';
import { logError } from '@/lib/supabase/errors';
import type { ApiResponse, DocumentAnalysisResult } from '@/lib/types';
import type { Json } from '@/lib/supabase/types';

interface AnalyzeRequestBody {
  document_id: string;
}

export interface AnalyzeResult {
  analysis_id: string | null;
  result: DocumentAnalysisResult;
  needs_review: boolean;
  already_existed: boolean;
  fallback?: boolean;
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

      const fallbackResult = {
        title: 'Manual Review Required',
        summary_en: 'This document could not be analysed automatically. Please review manually.',
        summary_sw: 'Hati hii haiwezi kuchambuliwa kiotomatiki.',
        actions: [],
        confidence_score: 0,
      };

      // Persist fallback row so results page can display it
      let analysisId: string | null = null;
      try {
        const { data: fallbackRow } = await supabase
          .from('document_analyses')
          .insert({
            document_id: body.document_id,
            country_code: doc.country_code,
            document_type: null,
            summary_en: fallbackResult.summary_en,
            summary_sw: fallbackResult.summary_sw,
            affected_region_l1: [],
            affected_region_l2: [],
            key_dates: [] as unknown as Json,
            analysis_json: fallbackResult as unknown as Json,
            confidence_score: 0,
            needs_review: true,
          })
          .select('id')
          .single();
        analysisId = fallbackRow?.id ?? null;
      } catch {
        // Non-fatal — return fallback response regardless
      }

      return NextResponse.json({
        success: true,
        data: {
          analysis_id: analysisId,
          needs_review: true,
          already_existed: false,
          fallback: true,
          result: fallbackResult as unknown as DocumentAnalysisResult,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    const supabase = createServiceRoleClient();
    await logError(supabase, message, { path: '/api/documents/analyze' });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
