'use client';

import { useTranslations } from 'next-intl';
import type { KeyDate } from '@/lib/types';
import { CalendarDays, AlertTriangle } from 'lucide-react';

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export default function KeyDatesTimeline({ dates }: { dates: KeyDate[] }) {
  const t = useTranslations('document');

  if (!dates || dates.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noDeadlines')}</p>;
  }

  const sorted = [...dates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <ol className="space-y-3">
      {sorted.map((item, i) => {
        const days = daysUntil(item.date);
        const isOverdue = days < 0;
        const isToday = days === 0;
        const isUrgent = days >= 0 && days <= 7;

        let badgeClass = 'bg-muted text-muted-foreground';
        let badgeLabel = t('daysLeft', { count: days });
        if (isToday) { badgeClass = 'bg-orange-100 text-orange-700'; badgeLabel = t('today'); }
        else if (isOverdue) { badgeClass = 'bg-destructive/10 text-destructive'; badgeLabel = t('overdue'); }
        else if (isUrgent) { badgeClass = 'bg-orange-100 text-orange-700'; }
        else if (days === 1) { badgeLabel = t('dayLeft'); }

        return (
          <li key={i} className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {(isUrgent || isOverdue) ? (
                <AlertTriangle className={`h-4 w-4 ${isOverdue ? 'text-destructive' : 'text-orange-500'}`} />
              ) : (
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(item.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            {item.is_deadline && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                {badgeLabel}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
