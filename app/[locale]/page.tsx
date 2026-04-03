'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, FileText, Link2, CheckCircle2, Loader2 } from 'lucide-react';

type Stage = 'idle' | 'extracting' | 'checking_law' | 'identifying' | 'done' | 'error';

const PIPELINE_STAGES: Stage[] = ['extracting', 'checking_law', 'identifying'];

export default function HomePage() {
  const t = useTranslations('app');
  const tDoc = useTranslations('document');
  const tErr = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function runPipeline(body: FormData | { url: string }) {
    setStage('extracting');
    setErrorMsg('');

    try {
      // 1. Parse document
      const parseRes = await fetch('/api/documents/parse', {
        method: 'POST',
        ...(body instanceof FormData
          ? { body }
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const parseData = await parseRes.json() as { success: boolean; data?: { document_id: string; is_scanned?: boolean }; error?: string };
      console.log('[parse] response:', parseData);
      if (!parseData.success || !parseData.data?.document_id) {
        throw new Error(parseData.error ?? tErr('parseFailure'));
      }

      setStage('checking_law');
      const documentId = parseData.data.document_id;

      // 2. Analyse document
      setStage('identifying');
      const analyzeRes = await fetch('/api/documents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId }),
      });
      const analyzeData = await analyzeRes.json() as { success: boolean; data?: { analysisId: string }; error?: string };
      if (!analyzeData.success) {
        throw new Error(analyzeData.error ?? tErr('generic'));
      }

      setStage('done');
      router.push(`/${locale}/results/${documentId}`);
    } catch (err) {
      setStage('error');
      setErrorMsg(err instanceof Error ? err.message : tErr('generic'));
    }
  }

  async function handleUrlSubmit() {
    if (!url.trim()) return;
    await runPipeline({ url: url.trim() });
  }

  async function handleFile(file: File) {
    if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
      setStage('error');
      setErrorMsg(tErr('unsupportedFile'));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setStage('error');
      setErrorMsg(tErr('fileTooLarge'));
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    await runPipeline(fd);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isRunning = stage !== 'idle' && stage !== 'error';

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="text-center space-y-3 pt-8">
        <h1 className="text-4xl font-bold tracking-tight">{t('tagline')}</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">{t('description')}</p>
      </div>

      {/* Upload card */}
      <div className="max-w-2xl mx-auto rounded-xl border bg-card shadow-sm p-8 space-y-6">
        {/* PDF drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isRunning && fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/30'
          } ${isRunning ? 'pointer-events-none opacity-60' : ''}`}
        >
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {isDragging ? tDoc('dropzoneActive') : tDoc('dropzone')}
          </p>
          <p className="text-xs text-muted-foreground">{tDoc('uploadLimit')}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        {/* URL paste */}
        <div className="space-y-2">
          <p className="text-sm text-center text-muted-foreground">{tDoc('orPasteUrl')}</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={tDoc('urlPlaceholder')}
                className="pl-9"
                disabled={isRunning}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              />
            </div>
            <Button variant="default" onClick={handleUrlSubmit} disabled={!url.trim() || isRunning}>
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : tDoc('analyzeButton')}
            </Button>
          </div>
        </div>

        {/* Pipeline status */}
        {isRunning && (
          <div className="space-y-2 pt-2">
            {PIPELINE_STAGES.map((s, i) => {
              const currentIdx = PIPELINE_STAGES.indexOf(stage as typeof PIPELINE_STAGES[number]);
              const isDone = i < currentIdx;
              const isCurrent = s === stage;
              return (
                <div key={s} className="flex items-center gap-3 text-sm">
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted shrink-0" />
                  )}
                  <span className={isCurrent ? 'text-foreground' : isDone ? 'text-muted-foreground line-through' : 'text-muted-foreground'}>
                    {tDoc(s === 'extracting' ? 'extractingText' : s === 'checking_law' ? 'checkingLaw' : 'identifyingActions')}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {stage === 'error' && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
