/**
 * components/FeedCard.tsx
 * Consequence-first document card.
 *
 * Structure (top → bottom):
 *   1. Urgency hook — the first thing the eye hits
 *   2. Document title — first sentence of summary_en, stripped of gazette prefixes
 *   3. One-line consequence — top_action.title_en
 *   4. Affected region
 *   5. Social proof — execution_count (shown only if > 0)
 *   6. Footer — source badge, relative date, action count, share button
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Share2, Check, AlertCircle, Zap, BookOpen, FileText, Users } from 'lucide-react';
import type { FeedDocument } from '@/lib/feed/query';

interface FeedCardProps {
  doc: FeedDocument;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTitle(titleField: string | null, summary: string | null): string {
  // Prefer the headline-style title from analysis if available
  if (titleField && titleField.trim().length > 0) {
    const t = titleField.trim();
    return t.length > 100 ? t.slice(0, 97).trimEnd() + '...' : t;
  }
  if (!summary) return 'Government document';
  // Fallback: take first sentence (up to first . ! or ?)
  const sentence = summary.split(/(?<=[.!?])\s/)[0]?.trim() ?? summary;
  const clean = sentence
    .replace(/^the\s+kenya\s+gazette\s+(?:supplement\s+)?no\.?\s*\d+[^—–]*/i, '')
    .replace(/^legal\s+notice\s+no\.?\s*\d+\.?\s*/i, '')
    .replace(/^gazette\s+notice\s+no\.?\s*\d+\.?\s*/i, '')
    .replace(/^[\s—–:,]+/, '')
    .trim();
  const title = clean || sentence;
  return title.length > 100 ? title.slice(0, 97).trimEnd() + '...' : title;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  // Relative part
  let relative: string;
  if (days === 0) relative = 'Today';
  else if (days === 1) relative = 'Yesterday';
  else if (days < 7) relative = `${days} days ago`;
  else if (days < 30) {
    const weeks = Math.floor(days / 7);
    relative = weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  } else {
    const months = Math.floor(days / 30);
    relative = months === 1 ? '1 month ago' : `${months} months ago`;
  }

  // Absolute part — "3 Feb" or "3 Feb 2025" if not current year
  if (days <= 1) return relative;
  const isCurrentYear = date.getFullYear() === new Date().getFullYear();
  const abs = date.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    ...(isCurrentYear ? {} : { year: 'numeric' }),
  });
  return `${relative} · ${abs}`;
}

const SOURCE_LABELS: Record<string, string> = {
  scraper: 'Auto',
  manual: 'Upload',
  whatsapp: 'WhatsApp',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function FeedCard({ doc }: FeedCardProps) {
  const locale = useLocale();
  const t = useTranslations('feed');
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const { analysis, top_action, soonest_deadline, action_count, execution_count } = doc;

  // ── Deadline urgency ──────────────────────────────────────────────────────
  let daysLeft: number | null = null;
  if (soonest_deadline) {
    daysLeft = Math.ceil(
      (new Date(soonest_deadline).getTime() - Date.now()) / 86_400_000,
    );
  }

  const hasExecutableAction =
    top_action && top_action.executability !== 'inform_only';

  const CIVIC_DOC_TYPES = new Set([
    'parliamentary_bill', 'county_policy', 'budget', 'environment', 'land',
  ]);

  // ── 5-tier urgency label ──────────────────────────────────────────────────
  // Every card gets exactly one label. Past-deadline is checked first
  // regardless of executability.
  type UrgencyLevel = 'green' | 'yellow' | 'blue' | 'red' | 'gray';
  let urgencyLevel: UrgencyLevel;
  let urgencyText: string;

  const isRoutineType = !analysis.document_type
    || analysis.document_type === 'gazette_notice'
    || analysis.document_type === 'other';
  const isInformOnly = !top_action || top_action.executability === 'inform_only';

  if (daysLeft !== null && daysLeft <= 0) {
    // Tier 4: Past deadline — regardless of executability
    urgencyLevel = 'red';
    urgencyText = t('urgency.passed');
  } else if (daysLeft !== null && daysLeft <= 7 && hasExecutableAction) {
    // Tier 1: Imminent deadline + executable action
    urgencyLevel = 'green';
    urgencyText = t('urgency.actNow', { days: daysLeft });
  } else if (hasExecutableAction) {
    // Tier 2: Executable action, no imminent deadline
    urgencyLevel = 'yellow';
    urgencyText = t('urgency.canAct');
  } else if (!isInformOnly && action_count > 0 && CIVIC_DOC_TYPES.has(analysis.document_type ?? '')) {
    // Tier 3: Inform-only but civically important
    urgencyLevel = 'blue';
    urgencyText = t('urgency.knowRights');
  } else if (isInformOnly && isRoutineType) {
    // Tier 5a: Routine — inform_only + gazette_notice/other/null
    urgencyLevel = 'gray';
    urgencyText = t('urgency.routine');
  } else {
    // Tier 5b: Anything else not caught above
    urgencyLevel = 'gray';
    urgencyText = t('urgency.routine');
  }

  // ── Text content ──────────────────────────────────────────────────────────
  const summary =
    locale === 'sw' ? (analysis.summary_sw ?? analysis.summary_en) : analysis.summary_en;
  const titleField = locale === 'sw' ? (analysis.title_sw ?? analysis.title_en ?? null) : (analysis.title_en ?? null);
  const title = extractTitle(titleField, summary);
  const regions = analysis.affected_region_l1 ?? [];

  // ── Share ─────────────────────────────────────────────────────────────────
  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const deadline = soonest_deadline
      ? `Act by ${new Date(soonest_deadline).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}.`
      : '';
    const shareUrl = `${window.location.origin}/${locale}/results/${doc.id}`;
    const parts = [title, top_action?.title_en, deadline, `Full details: ${shareUrl}`];
    const text = parts.filter(Boolean).join(' ');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // clipboard not available — silently skip
    }
  }

  // ── Urgency banner style ──────────────────────────────────────────────────
  const urgencyStyles: Record<UrgencyLevel, string> = {
    green:  'bg-green-50 text-green-700 border border-green-200',
    yellow: 'bg-green-50 text-green-700 border border-green-200',
    blue:   'bg-blue-50 text-blue-700 border border-blue-200',
    red:    'bg-red-50 text-red-600 border border-red-200 font-normal',
    gray:   'bg-gray-50 text-gray-400 border border-gray-100 text-[11px]',
  };
  const urgencyIcons: Record<UrgencyLevel, React.ElementType> = {
    green:  Zap,
    yellow: Zap,
    blue:   BookOpen,
    red:    AlertCircle,
    gray:   FileText,
  };

  return (
    <div
      role="article"
      tabIndex={0}
      onClick={() => router.push(`/${locale}/results/${doc.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/${locale}/results/${doc.id}`)}
      className="rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/50 h-full flex flex-col"
    >
      {/* ── 1. Urgency hook ─────────────────────────────────────────────── */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b text-xs font-medium ${urgencyStyles[urgencyLevel]}`}>
        {(() => {
          const Icon = urgencyIcons[urgencyLevel];
          return <Icon className="w-3.5 h-3.5 shrink-0" />;
        })()}
        {urgencyText}
      </div>

      <div className="p-4 space-y-2 flex-1 flex flex-col">
        {/* ── 2. Document title ──────────────────────────────────────────── */}
        <p className="font-semibold text-gray-900 text-sm leading-snug">
          {title}
        </p>

        {/* ── 3. One-line consequence ────────────────────────────────────── */}
        {top_action && (
          <p className="text-sm text-gray-600">
            {locale === 'sw' ? (top_action.title_sw ?? top_action.title_en) : top_action.title_en}
          </p>
        )}

        {/* ── 4. Social proof ────────────────────────────────────────────── */}
        {execution_count > 0 && (
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <Users className="w-3 h-3 shrink-0" />
            {t('socialProof', { count: execution_count })}
          </p>
        )}

        {/* ── 5. Affected region ─────────────────────────────────────────── */}
        {(regions.length > 0 || analysis.affected_region_l1 !== undefined) && (
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="w-3 h-3 shrink-0" />
            {regions.length > 0
              ? t('affecting', { region: regions.slice(0, 2).join(', ') + (regions.length > 2 ? ` +${regions.length - 2}` : '') })
              : t('affectingAll')}
          </p>
        )}

        {/* ── 6. Footer ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-1 text-[11px] text-gray-400 mt-auto">
          {/* Source badge */}
          <span className="bg-gray-100 rounded px-1.5 py-0.5 text-gray-500 font-medium">
            {SOURCE_LABELS[doc.source] ?? doc.source}
          </span>

          {/* Relative date */}
          <span>{formatDate(doc.scraped_at ?? doc.created_at)}</span>

          {/* Action count */}
          {action_count > 0 && (
            <span className="text-gray-500">
              {action_count === 1
                ? t('actionCountBadgeOne')
                : t('actionCountBadge', { count: action_count })}
            </span>
          )}

          {/* Share button */}
          <button
            onClick={handleShare}
            className={`ml-auto flex items-center gap-1 rounded px-2 py-1 transition-colors ${
              copied
                ? 'bg-green-50 text-green-600'
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
            }`}
            aria-label={copied ? t('copied') : t('share')}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                <span className="hidden sm:inline">{t('copied')}</span>
              </>
            ) : (
              <>
                <Share2 className="w-3 h-3" />
                <span className="hidden sm:inline">{t('share')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
