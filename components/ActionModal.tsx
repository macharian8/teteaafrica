'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import type { ActionDraft } from '@/lib/types';

interface Props {
  action: ActionDraft;
  open: boolean;
  onClose: () => void;
  /** The language to show the draft in ('en' | 'sw') */
  langPref: string;
  actionId: string; // DB actions.id
}

type Status = 'editing' | 'confirming' | 'submitting' | 'done' | 'error';

export default function ActionModal({ action, open, onClose, langPref, actionId }: Props) {
  const tAction = useTranslations('action');
  const tCommon = useTranslations('common');

  const initialDraft = langPref === 'sw'
    ? (action.draft_content_sw || action.draft_content_en)
    : (action.draft_content_en || action.draft_content_sw);

  const [draft, setDraft] = useState(initialDraft ?? '');
  const [status, setStatus] = useState<Status>('editing');
  const [errorMsg, setErrorMsg] = useState('');
  const [referenceId, setReferenceId] = useState('');

  async function handleConfirm() {
    setStatus('submitting');
    try {
      const res = await fetch('/api/action-executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, draft }),
      });
      const data = await res.json() as { success: boolean; data?: { referenceId?: string }; error?: string };
      if (!data.success) throw new Error(data.error ?? 'Failed');
      setReferenceId(data.data?.referenceId ?? '');
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : tCommon('error'));
      setStatus('error');
    }
  }

  function handleClose() {
    setStatus('editing');
    setDraft(initialDraft ?? '');
    setErrorMsg('');
    onClose();
  }

  const actionTypeLabel = tAction(`types.${action.type}`);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tAction('draft.title', { actionType: actionTypeLabel })}</DialogTitle>
        </DialogHeader>

        {status !== 'done' && (
          <>
            {/* Editable draft */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{tAction('draft.editableNote')}</p>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={14}
                className="font-mono text-sm resize-y"
                disabled={status === 'submitting'}
              />
            </div>

            {/* Legal basis */}
            {action.legal_basis && (
              <details className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground select-none">
                  {tAction('legalBasis')}
                </summary>
                <p className="mt-2 text-muted-foreground leading-relaxed">{action.legal_basis}</p>
              </details>
            )}

            {status === 'error' && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}

            {status === 'confirming' && (
              <p className="text-sm font-medium">{tAction('draft.submitConfirm')}</p>
            )}
          </>
        )}

        {status === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <p className="font-semibold text-lg">{tAction('draft.submitted')}</p>
              {referenceId && (
                <p className="text-sm text-muted-foreground mt-1">
                  {tAction('draft.referenceId', { id: referenceId })}
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{tAction('draft.trackPrompt')}</p>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleClose}>
              <ExternalLink className="h-4 w-4" />
              {tAction('trackThis')}
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2">
          {status === 'done' ? (
            <Button onClick={handleClose}>{tCommon('close')}</Button>
          ) : status === 'confirming' ? (
            <>
              <Button variant="outline" onClick={() => setStatus('editing')}>{tCommon('back')}</Button>
              <Button onClick={handleConfirm}>{tAction('confirmAction')}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>{tCommon('cancel')}</Button>
              <Button
                onClick={() => setStatus('confirming')}
                disabled={!draft.trim() || status === 'submitting'}
              >
                {tAction('execute')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
