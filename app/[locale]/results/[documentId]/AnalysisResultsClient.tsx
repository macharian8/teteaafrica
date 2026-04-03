'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import KeyDatesTimeline from '@/components/KeyDatesTimeline';
import ActionCard from '@/components/ActionCard';
import { AlertTriangle, MapPin, FileText } from 'lucide-react';
import type { DocumentAnalysisResult, ActionDraft, DocumentType } from '@/lib/types';

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  gazette_notice: 'Gazette Notice',
  county_policy: 'County Policy',
  parliamentary_bill: 'Parliamentary Bill',
  budget: 'Budget',
  tender: 'Tender',
  nema: 'NEMA Notice',
  land: 'Land Notice',
  other: 'Document',
};

interface Props {
  documentUrl: string | null;
  analysisId: string;
  summaryEn: string;
  summarySw: string;
  documentType: DocumentAnalysisResult['document_type'] | null;
  confidenceScore: number | null;
  needsReview: boolean;
  affectedRegionL1: string[];
  affectedRegionL2: string[];
  keyDates: DocumentAnalysisResult['key_dates'];
  actions: (ActionDraft & { dbId: string })[];
  langPref: string;
}

export default function AnalysisResultsClient({
  documentUrl,
  summaryEn,
  summarySw,
  documentType,
  confidenceScore,
  needsReview,
  affectedRegionL1,
  affectedRegionL2,
  keyDates,
  actions,
  langPref,
}: Props) {
  const tDoc = useTranslations('document');
  // Content language toggle is independent of UI locale
  const [contentLang, setContentLang] = useState<string>(langPref);

  const summary = contentLang === 'sw' ? (summarySw || summaryEn) : summaryEn;
  const regions = [...affectedRegionL1, ...affectedRegionL2].filter(Boolean);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Low confidence warning */}
      {needsReview && (
        <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-orange-500" />
          <span>{tDoc('lowConfidenceWarning')}</span>
          {confidenceScore !== null && (
            <span className="ml-auto font-mono text-xs shrink-0">
              {Math.round(confidenceScore * 100)}%
            </span>
          )}
        </div>
      )}

      {/* Summary card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex items-start justify-between px-5 py-4 border-b bg-muted/30">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {documentType && (
                <Badge variant="secondary">{DOC_TYPE_LABELS[documentType] ?? documentType}</Badge>
              )}
            </div>
            {documentUrl && (
              <p className="text-xs text-muted-foreground">
                Source:{' '}
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-foreground transition-colors break-all"
                >
                  {documentUrl}
                </a>
              </p>
            )}
          </div>

          {/* EN / SW content toggle */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            {(['en', 'sw'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setContentLang(l)}
                className={`px-3 py-1 font-medium transition-colors ${
                  contentLang === l
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {tDoc(l === 'en' ? 'viewInEnglish' : 'viewInSwahili')}
              </button>
            ))}
          </div>
        </div>

        {/* Summary body */}
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {tDoc('summary')}
            </p>
            <p className="text-sm leading-relaxed">{summary}</p>
          </div>

          {regions.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {tDoc('affectedRegions')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {regions.map((r, i) => (
                    <Badge key={i} variant="outline">{r}</Badge>
                  ))}
                </div>
              </div>
            </>
          )}
          {regions.length === 0 && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground">{tDoc('noRegions')}</p>
            </>
          )}
        </div>
      </div>

      {/* Key dates */}
      <div className="rounded-xl border bg-card shadow-sm p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          {tDoc('keyDates')}
        </h2>
        <KeyDatesTimeline dates={keyDates} />
      </div>

      {/* Actions */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {tDoc('actions')}
        </h2>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tDoc('noActions')}</p>
        ) : (
          <div className="space-y-3">
            {actions.map((action) => (
              <ActionCard
                key={action.dbId}
                action={action}
                actionId={action.dbId}
                langPref={langPref}
                contentLang={contentLang}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
