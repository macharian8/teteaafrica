import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createServiceRoleClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import AnalysisResultsClient from './AnalysisResultsClient';
import type { DocumentAnalysisResult, ActionDraft } from '@/lib/types';

interface Props {
  params: { documentId: string; locale: string };
}

export default async function ResultsPage({ params }: Props) {
  const { documentId, locale } = params;
  const t = await getTranslations({ locale, namespace: 'document' });
  // Service role bypasses RLS — safe in Server Component, never sent to client
  const supabase = createServiceRoleClient();
  // Separate anon client only for reading the session cookie (language preference)
  const authClient = await createServerSupabaseClient();

  // Fetch document
  const { data: document } = await supabase
    .from('documents')
    .select('id, url, created_at')
    .eq('id', documentId)
    .maybeSingle();

  if (!document) notFound();

  // Fetch latest analysis
  const { data: analysis } = await supabase
    .from('document_analyses')
    .select('id, analysis_json, confidence_score, needs_review, summary_en, summary_sw, document_type, affected_region_l1, affected_region_l2, key_dates')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!analysis) {
    return (
      <div className="text-center py-24 text-muted-foreground">{t('noResults')}</div>
    );
  }

  // Fetch actions for this analysis
  const { data: actionsRows } = await supabase
    .from('actions')
    .select('id, action_type, executability, title_en, title_sw, description_en, description_sw, legal_basis, draft_content_en, draft_content_sw, deadline')
    .eq('analysis_id', analysis.id)
    .order('created_at');

  // Read language preference from the session user (fallback to locale)
  const { data: { user } } = await authClient.auth.getUser();
  let langPref = locale;
  if (user) {
    const { data: userRow } = await supabase
      .from('users')
      .select('language_preference')
      .eq('id', user.id)
      .maybeSingle();
    if (userRow?.language_preference) langPref = userRow.language_preference;
  } else {
    // Check cookie set by LanguageSwitcher localStorage (best-effort)
    const cookieStore = await cookies();
    langPref = cookieStore.get('NEXT_LOCALE')?.value ?? locale;
  }

  const analysisResult = analysis.analysis_json as unknown as DocumentAnalysisResult;
  const keyDates = analysisResult.key_dates ?? [];

  const actions: (ActionDraft & { dbId: string })[] = (actionsRows ?? []).map((r) => ({
    dbId: r.id,
    id: r.id,
    type: r.action_type,
    executability: r.executability,
    title_en: r.title_en,
    title_sw: r.title_sw ?? r.title_en,
    description_en: r.description_en ?? '',
    description_sw: r.description_sw ?? r.description_en ?? '',
    legal_basis: r.legal_basis ?? '',
    deadline: r.deadline,
    draft_content_en: r.draft_content_en ?? '',
    draft_content_sw: r.draft_content_sw ?? '',
  }));

  return (
    <>
      <div className="max-w-3xl mx-auto mb-4">
        <Link
          href={`/${locale}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          ← {t('backToFeed')}
        </Link>
      </div>
      <AnalysisResultsClient
      documentUrl={document.url}
      analysisId={analysis.id}
      summaryEn={analysis.summary_en ?? ''}
      summarySw={analysis.summary_sw ?? ''}
      documentType={analysis.document_type}
      confidenceScore={analysis.confidence_score}
      needsReview={analysis.needs_review}
      affectedRegionL1={analysis.affected_region_l1 ?? []}
      affectedRegionL2={analysis.affected_region_l2 ?? []}
      keyDates={keyDates as DocumentAnalysisResult['key_dates']}
      actions={actions}
      langPref={langPref}
    />
    </>
  );
}
