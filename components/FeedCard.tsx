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
import { MapPin, Share2, Check, AlertCircle, Clock, Zap, BookOpen } from 'lucide-react';
import type { FeedDocument } from '@/lib/feed/query';

interface FeedCardProps {
  doc: FeedDocument;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTitle(summary: string | null): string {
  if (!summary) return 'Government document';
  // Take first sentence (up to first . ! or ?)
  const sentence = summary.split(/(?<=[.!?])\s/)[0]?.trim() ?? summary;
  const clean = sentence
    .replace(/^the\s+kenya\s+gazette\s+(?:supplement\s+)?no\.?\s*\d+[^—–]*/i, '')
    .replace(/^legal\s+notice\s+no\.?\s*\d+\.?\s*/i, '')
    .replace(/^gazette\s+notice\s+no\.?\s*\d+\.?\s*/i, '')
    .replace(/^[\s—–:,]+/, '')
    .trim();
  const title = clean || sentence;
  return title.length > 130 ? title.slice(0, 127).trimEnd() + '…' : title;
}

function relativeDate(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(dateStr).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
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
  const isInformOnly =
    !hasExecutableAction && action_count > 0;

  // ── Urgency hook content ──────────────────────────────────────────────────
  type UrgencyLevel = 'critical' | 'warning' | 'action' | 'inform' | null;
  let urgencyLevel: UrgencyLevel = null;
  let urgencyText = '';

  if (daysLeft !== null) {
    if (daysLeft < 0) {
      urgencyLevel = 'critical';
      urgencyText = t('urgency.overdue');
    } else if (daysLeft === 0) {
      urgencyLevel = 'critical';
      urgencyText = t('urgency.closesToday');
    } else if (daysLeft === 1) {
      urgencyLevel = 'critical';
      urgencyText = t('urgency.closesTomorrow');
    } else if (daysLeft <= 3) {
      urgencyLevel = 'critical';
      urgencyText = t('urgency.closesIn', { count: daysLeft });
    } else if (daysLeft <= 7) {
      urgencyLevel = 'warning';
      urgencyText = t('urgency.daysLeft', { count: daysLeft });
    }
  }
  if (!urgencyLevel) {
    if (hasExecutableAction) {
      urgencyLevel = 'action';
      urgencyText = t('urgency.canAct');
    } else if (isInformOnly) {
      urgencyLevel = 'inform';
      urgencyText = t('urgency.knowRights');
    }
  }

  // ── Text content ──────────────────────────────────────────────────────────
  const summary =
    locale === 'sw' ? (analysis.summary_sw ?? analysis.summary_en) : analysis.summary_en;
  const title = extractTitle(summary);
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
  const urgencyStyles: Record<NonNullable<UrgencyLevel>, string> = {
    critical: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    action: 'bg-green-50 border-green-200 text-green-700',
    inform: 'bg-gray-50 border-gray-200 text-gray-500',
  };
  const urgencyIcons: Record<NonNullable<UrgencyLevel>, React.ElementType> = {
    critical: AlertCircle,
    warning: Clock,
    action: Zap,
    inform: BookOpen,
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
      {urgencyLevel && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b text-xs font-medium ${urgencyStyles[urgencyLevel]}`}>
          {(() => {
            const Icon = urgencyIcons[urgencyLevel!];
            return <Icon className="w-3.5 h-3.5 shrink-0" />;
          })()}
          {urgencyText}
        </div>
      )}

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

        {/* ── 4. Affected region ─────────────────────────────────────────── */}
        {(regions.length > 0 || analysis.affected_region_l1 !== undefined) && (
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="w-3 h-3 shrink-0" />
            {regions.length > 0
              ? t('affecting', { region: regions.slice(0, 2).join(', ') + (regions.length > 2 ? ` +${regions.length - 2}` : '') })
              : t('affectingAll')}
          </p>
        )}

        {/* ── 5. Social proof ────────────────────────────────────────────── */}
        {execution_count > 0 && (
          <p className="text-xs text-blue-600 font-medium">
            {t('socialProof', { count: execution_count })}
          </p>
        )}

        {/* ── 6. Footer ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-1 text-[11px] text-gray-400 mt-auto">
          {/* Source badge */}
          <span className="bg-gray-100 rounded px-1.5 py-0.5 text-gray-500 font-medium">
            {SOURCE_LABELS[doc.source] ?? doc.source}
          </span>

          {/* Relative date */}
          <span>{relativeDate(doc.scraped_at ?? doc.created_at)}</span>

          {/* Action count */}
          {action_count > 0 && (
            <span className="text-gray-500">
              {t('actionCountBadge', { count: action_count })}
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
