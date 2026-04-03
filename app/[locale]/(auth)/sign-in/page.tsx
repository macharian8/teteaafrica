'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

type Step = 'contact' | 'otp';
type Method = 'email' | 'phone';

export default function SignInPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? `/${locale}`;

  const [step, setStep] = useState<Step>('contact');
  const [method, setMethod] = useState<Method>('email');
  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  async function handleSendOtp() {
    setLoading(true);
    setError('');
    const trimmed = contact.trim();

    const res =
      method === 'email'
        ? await supabase.auth.signInWithOtp({
            email: trimmed,
            options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${next}` },
          })
        : await supabase.auth.signInWithOtp({ phone: trimmed });

    setLoading(false);
    if (res.error) {
      setError(res.error.message);
    } else {
      setStep('otp');
    }
  }

  async function handleVerifyOtp() {
    setLoading(true);
    setError('');
    const trimmed = contact.trim();

    const res =
      method === 'email'
        ? await supabase.auth.verifyOtp({ email: trimmed, token: otp.trim(), type: 'email' })
        : await supabase.auth.verifyOtp({ phone: trimmed, token: otp.trim(), type: 'sms' });

    setLoading(false);
    if (res.error) {
      setError(t('invalidOtp'));
    } else {
      router.replace(next);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold">{t('signIn')}</h1>

      {step === 'contact' && (
        <div className="space-y-4">
          {/* Method toggle */}
          <div className="flex rounded-lg border overflow-hidden">
            {(['email', 'phone'] as Method[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMethod(m); setContact(''); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  method === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {t(m === 'email' ? 'signInWithEmail' : 'signInWithPhone')}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact">
              {t(method === 'email' ? 'emailLabel' : 'phoneLabel')}
            </Label>
            <Input
              id="contact"
              type={method === 'email' ? 'email' : 'tel'}
              placeholder={method === 'phone' ? '+254 7xx xxx xxx' : ''}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" onClick={handleSendOtp} disabled={!contact.trim() || loading}>
            {loading ? '…' : t('sendOtp')}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t('noAccount')}{' '}
            <Link href={`/${locale}/sign-up`} className="underline underline-offset-4">
              {t('signUp')}
            </Link>
          </p>
        </div>
      )}

      {step === 'otp' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('otpSentTo', { contact: contact.trim() })}
          </p>

          <div className="space-y-2">
            <Label htmlFor="otp">{t('otpLabel')}</Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && handleVerifyOtp()}
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" onClick={handleVerifyOtp} disabled={otp.length !== 6 || loading}>
            {loading ? '…' : t('verifyOtp')}
          </Button>

          <button
            className="w-full text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => { setStep('contact'); setOtp(''); setError(''); }}
          >
            {t('resendOtp')}
          </button>
        </div>
      )}
    </div>
  );
}
