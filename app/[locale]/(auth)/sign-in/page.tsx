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
  const tCommon = useTranslations('common');
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

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${next}`,
      },
    });
  }

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
      setError(t('sendOtpError'));
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
          {/* Google OAuth */}
          <Button
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            onClick={handleGoogleSignIn}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {t('continueWithGoogle')}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{tCommon('or')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

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
