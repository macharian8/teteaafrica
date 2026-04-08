/**
 * app/[locale]/deadlines/page.tsx
 * Server component: list the authenticated user's tracked deadlines,
 * sorted by deadline_date ascending, with urgency colour-coding.
 *
 * Urgency tiers (matching KeyDatesTimeline component):
 *   overdue   — deadline_date < today
 *   today     — deadline_date === today
 *   tomorrow  — days_left === 1
 *   urgent    — days_left <= 3
 *   normal    — > 3 days
 *
 * Reminders (7d / 3d / 1d) are queued by processDeadlineReminders() in the processor.
 */

import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CalendarDays, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

interface PageProps {
  params: { locale: string };
}

type UrgencyTier = 'overdue' | 'today' | 'tomorrow' | 'urgent' | 'normal';

function getUrgency(deadlineDate: string): { tier: UrgencyTier; daysLeft: number } {
  const now    = new Date();
  const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(deadlineDate);
  const diff   = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0)  return { tier: 'overdue',  daysLeft: diff };
  if (diff === 0) return { tier: 'today',   daysLeft: 0 };
  if (diff === 1) return { tier: 'tomorrow', daysLeft: 1 };
  if (diff <= 3)  return { tier: 'urgent',  daysLeft: diff };
  return { tier: 'normal', daysLeft: diff };
}

const TIER_STYLES: Record<UrgencyTier, { bg: string; border: string; text: string }> = {
  overdue:  { bg: 'bg-red-50',    border: 'border-red-300',   text: 'text-red-700'   },
  today:    { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700' },
  tomorrow: { bg: 'bg-amber-50',  border: 'border-amber-300', text: 'text-amber-700' },
  urgent:   { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700' },
  normal:   { bg: 'bg-white',     border: 'border-gray-200',  text: 'text-gray-600'  },
};

const TIER_ICONS: Record<UrgencyTier, React.ReactNode> = {
  overdue:  <AlertTriangle className="w-4 h-4 text-red-500" />,
  today:    <AlertTriangle className="w-4 h-4 text-orange-500" />,
  tomorrow: <Clock className="w-4 h-4 text-amber-500" />,
  urgent:   <Clock className="w-4 h-4 text-yellow-500" />,
  normal:   <CalendarDays className="w-4 h-4 text-gray-400" />,
};

export default async function DeadlinesPage({ params }: PageProps) {
  const { locale } = params;
  const t = await getTranslations({ locale, namespace: 'deadlines' });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const { data: deadlines } = await supabase
    .from('deadlines')
    .select('id, deadline_date, label, document_id, notified_7d, notified_3d, notified_1d, created_at')
    .eq('user_id', user.id)
    .order('deadline_date', { ascending: true });

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('pageDescription')}</p>
        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          {t('reminders')}
        </p>
      </div>

      {/* Deadline list */}
      {!deadlines || deadlines.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{t('empty')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {deadlines.map((dl) => {
            const { tier, daysLeft } = getUrgency(dl.deadline_date);
            const styles = TIER_STYLES[tier];

            let urgencyLabel: string;
            if (tier === 'overdue')  urgencyLabel = t('overdue');
            else if (tier === 'today')    urgencyLabel = t('today');
            else if (tier === 'tomorrow') urgencyLabel = t('tomorrow');
            else urgencyLabel = t('daysLeft', { count: daysLeft });

            return (
              <li
                key={dl.id}
                className={`rounded-lg border p-4 flex items-start gap-3 ${styles.bg} ${styles.border}`}
              >
                <span className="mt-0.5 shrink-0">{TIER_ICONS[tier]}</span>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm leading-snug">{dl.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('due')}: {dl.deadline_date}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-xs font-semibold ${styles.text}`}>{urgencyLabel}</span>

                  {dl.document_id && (
                    <a
                      href={`/${locale}/results/${dl.document_id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {t('viewDocument')}
                    </a>
                  )}

                  {/* Notification sent badges */}
                  <div className="flex gap-1">
                    {dl.notified_7d && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1">7d ✓</span>
                    )}
                    {dl.notified_3d && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1">3d ✓</span>
                    )}
                    {dl.notified_1d && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1">1d ✓</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
