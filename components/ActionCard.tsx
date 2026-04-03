'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ActionModal from './ActionModal';
import type { ActionDraft } from '@/lib/types';
import {
  FileText, Megaphone, CalendarDays, Send, ShieldAlert, Scale,
  Leaf, User, Newspaper, Info, ChevronDown, ChevronUp, Clock,
} from 'lucide-react';

const ACTION_ICONS: Record<string, React.ElementType> = {
  ati_request: FileText,
  petition: Megaphone,
  calendar_invite: CalendarDays,
  submission: Send,
  complaint_anticorruption: ShieldAlert,
  complaint_ombudsman: Scale,
  environment_objection: Leaf,
  representative_contact: User,
  media_pitch: Newspaper,
  inform_only: Info,
};

const EXECUTABILITY_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  auto: 'default',
  scaffolded: 'secondary',
  inform_only: 'outline',
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

interface Props {
  action: ActionDraft;
  actionId: string;
  langPref: string;
  contentLang: string;
}

export default function ActionCard({ action, actionId, langPref, contentLang }: Props) {
  const tAction = useTranslations('action');
  const tDoc = useTranslations('document');
  const [legalOpen, setLegalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const Icon = ACTION_ICONS[action.type] ?? Info;
  const title = contentLang === 'sw' ? (action.title_sw || action.title_en) : action.title_en;
  const description = contentLang === 'sw'
    ? (action.description_sw || action.description_en)
    : action.description_en;

  const hasDraft = !!(action.draft_content_en || action.draft_content_sw);
  const isInformOnly = action.executability === 'inform_only';

  let deadlineBadge: React.ReactNode = null;
  if (action.deadline) {
    const days = daysUntil(action.deadline);
    const label = days < 0 ? tDoc('overdue') : days === 0 ? tDoc('today') : days === 1 ? tDoc('dayLeft') : tDoc('daysLeft', { count: days });
    const cls = days < 0 ? 'bg-destructive/10 text-destructive' : days <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground';
    deadlineBadge = (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
        <Clock className="h-3 w-3" />
        {label}
      </span>
    );
  }

  return (
    <>
      <div className="rounded-xl border bg-card shadow-sm p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-sm">{title}</h3>
              <Badge variant={EXECUTABILITY_VARIANT[action.executability]}>
                {tAction(`executability.${action.executability}`)}
              </Badge>
              {deadlineBadge}
            </div>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        {/* Legal basis expandable */}
        {action.legal_basis && (
          <div>
            <button
              onClick={() => setLegalOpen(!legalOpen)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {legalOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {tAction(legalOpen ? 'legalBasisCollapse' : 'legalBasisExpand')}
            </button>
            {legalOpen && (
              <p className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded p-3 leading-relaxed">
                {action.legal_basis}
              </p>
            )}
          </div>
        )}

        {/* CTAs */}
        {!isInformOnly && hasDraft && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => setModalOpen(true)}>
              {tAction('previewDraft')}
            </Button>
            {action.deadline && (
              <Button size="sm" variant="outline">
                {tAction('saveDeadline')}
              </Button>
            )}
          </div>
        )}
      </div>

      <ActionModal
        action={action}
        actionId={actionId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        langPref={langPref}
      />
    </>
  );
}
