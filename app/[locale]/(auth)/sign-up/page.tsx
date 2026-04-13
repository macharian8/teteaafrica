'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Mail, MessageSquare } from 'lucide-react';
import type { CountryCode } from '@/lib/types';

type Step = 'contact' | 'otp' | 'country' | 'region' | 'topics' | 'language' | 'channel';
type Method = 'email' | 'phone';

const TOTAL_STEPS = 7;
const STEP_INDEX: Record<Step, number> = {
  contact: 1, otp: 2, country: 3, region: 4, topics: 5, language: 6, channel: 7,
};

const COUNTRIES = [
  { code: 'KE' as CountryCode, name: 'Kenya', active: true },
  { code: 'TZ' as CountryCode, name: 'Tanzania', active: false },
  { code: 'UG' as CountryCode, name: 'Uganda', active: false },
  { code: 'RW' as CountryCode, name: 'Rwanda', active: false },
];

const TOPICS = ['land', 'environment', 'budget', 'health', 'tenders', 'general'] as const;

export default function SignUpPage() {
  const t = useTranslations('auth');
  const tSub = useTranslations('subscription');
  const tNotif = useTranslations('notifications');
  const tLang = useTranslations('language');
  const tCommon = useTranslations('common');

  const smsEnabled = process.env.NEXT_PUBLIC_ENABLE_SMS === 'true';
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}`,
      },
    });
  }

  const [step, setStep] = useState<Step>('contact');
  const [method, setMethod] = useState<Method>('email');
  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Onboarding state
  const [country, setCountry] = useState<CountryCode>('KE');
  const [counties, setCounties] = useState<string[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [regionL1, setRegionL1] = useState('');
  const [regionL2, setRegionL2] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [langPref, setLangPref] = useState<string>(locale);
  const [emailChecked, setEmailChecked] = useState(true);
  const [smsChecked, setSmsChecked] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');

  // Load counties when country changes
  const loadCounties = useCallback(async (cc: CountryCode) => {
    const { data } = await supabase
      .from('admin_units')
      .select('region_level_1')
      .eq('country_code', cc)
      .order('region_level_1');
    const unique = [...new Set((data ?? []).map((r) => r.region_level_1))];
    setCounties(unique);
  }, [supabase]);

  useEffect(() => { loadCounties(country); }, [country, loadCounties]);

  // Load wards when county changes
  useEffect(() => {
    if (!regionL1) { setWards([]); return; }
    supabase
      .from('admin_units')
      .select('region_level_2')
      .eq('country_code', country)
      .eq('region_level_1', regionL1)
      .order('region_level_2')
      .then(({ data }) => {
        const unique = [...new Set((data ?? []).map((r) => r.region_level_2).filter(Boolean) as string[])];
        setWards(unique);
      });
  }, [country, regionL1, supabase]);

  async function handleSendOtp() {
    setLoading(true); setError('');
    const trimmed = contact.trim();
    const res =
      method === 'email'
        ? await supabase.auth.signInWithOtp({
            email: trimmed,
            options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
          })
        : await supabase.auth.signInWithOtp({ phone: trimmed });
    setLoading(false);
    if (res.error) { setError(res.error.message); } else { setStep('otp'); }
  }

  async function handleVerifyOtp() {
    setLoading(true); setError('');
    const trimmed = contact.trim();
    const res =
      method === 'email'
        ? await supabase.auth.verifyOtp({ email: trimmed, token: otp.trim(), type: 'email' })
        : await supabase.auth.verifyOtp({ phone: trimmed, token: otp.trim(), type: 'sms' });
    setLoading(false);
    if (res.error) { setError(t('invalidOtp')); } else { setStep('country'); }
  }

  async function handleFinish() {
    setLoading(true);
    const channel = emailChecked && smsChecked ? 'both' : smsChecked ? 'sms' : 'email';
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Upsert subscription record with all preferences
      await supabase.from('subscriptions').upsert({
        user_id: user.id,
        country_code: country,
        region_l1: regionL1 || null,
        region_l2: regionL2 || null,
        topics: selectedTopics,
        language_preference: langPref,
        channel,
      }, { onConflict: 'user_id' });

      // Persist language preference + phone to users table
      const userUpdate: Record<string, string> = { language_preference: langPref };
      if (smsChecked && phoneNumber) {
        userUpdate.phone = `+254${phoneNumber.replace(/\s/g, '')}`;
      }
      await supabase.from('users').update(userUpdate).eq('id', user.id);
    }
    setLoading(false);
    router.replace(`/${locale}`);
  }

  const stepNum = STEP_INDEX[step];

  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">{t('signUp')}</h1>
          <span className="text-sm text-muted-foreground">
            {t('step', { current: stepNum, total: TOTAL_STEPS })}
          </span>
        </div>
        <div className="h-1 rounded-full bg-muted">
          <div
            className="h-1 rounded-full bg-primary transition-all"
            style={{ width: `${(stepNum / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* Step: contact */}
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
            <Label htmlFor="contact">{t(method === 'email' ? 'emailLabel' : 'phoneLabel')}</Label>
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
            {loading ? '…' : tCommon('next')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t('haveAccount')}{' '}
            <Link href={`/${locale}/sign-in`} className="underline underline-offset-4">{t('signIn')}</Link>
          </p>
        </div>
      )}

      {/* Step: OTP */}
      {step === 'otp' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('otpSentTo', { contact: contact.trim() })}</p>
          <div className="space-y-2">
            <Label htmlFor="otp">{t('otpLabel')}</Label>
            <Input
              id="otp" type="text" inputMode="numeric" maxLength={6}
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
          <button className="w-full text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => { setStep('contact'); setOtp(''); setError(''); }}>
            {t('resendOtp')}
          </button>
        </div>
      )}

      {/* Step: country */}
      {step === 'country' && (
        <div className="space-y-4">
          <div>
            <p className="font-medium mb-1">{t('onboarding.selectCountry')}</p>
            <p className="text-sm text-muted-foreground mb-4">{t('onboarding.countryHelpText')}</p>
          </div>
          <div className="grid gap-2">
            {COUNTRIES.map(({ code, name, active }) => (
              <button
                key={code}
                disabled={!active}
                onClick={() => setCountry(code)}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors ${
                  !active ? 'opacity-40 cursor-not-allowed' :
                  country === code ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-accent'
                }`}
              >
                <span>{name}</span>
                {!active && <span className="text-xs text-muted-foreground">{tCommon('comingSoon')}</span>}
              </button>
            ))}
          </div>
          <Button className="w-full" onClick={() => setStep('region')}>{tCommon('next')}</Button>
        </div>
      )}

      {/* Step: region */}
      {step === 'region' && (
        <div className="space-y-4">
          <div>
            <p className="font-medium mb-1">{t('onboarding.selectRegion')}</p>
            <p className="text-sm text-muted-foreground mb-4">{t('onboarding.regionHelpText')}</p>
          </div>
          {counties.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-lg border p-4">
              {t('onboarding.regionNotAvailable')}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{tSub('regionL1')}</Label>
                <select
                  value={regionL1}
                  onChange={(e) => { setRegionL1(e.target.value); setRegionL2(''); }}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">{t('onboarding.regionL1Placeholder')}</option>
                  {counties.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {wards.length > 0 && (
                <div className="space-y-1">
                  <Label>{tSub('regionL2')}</Label>
                  <select
                    value={regionL2}
                    onChange={(e) => setRegionL2(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">{t('onboarding.regionL2Placeholder')}</option>
                    {wards.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep('country')}>{tCommon('back')}</Button>
            <Button className="flex-1" onClick={() => setStep('topics')}>{tCommon('next')}</Button>
          </div>
          <button className="w-full text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => setStep('topics')}>{t('onboarding.skip')}</button>
        </div>
      )}

      {/* Step: topics */}
      {step === 'topics' && (
        <div className="space-y-4">
          <div>
            <p className="font-medium mb-1">{t('onboarding.selectTopics')}</p>
            <p className="text-sm text-muted-foreground mb-4">{t('onboarding.topicsHelpText')}</p>
          </div>
          <div className="grid gap-2">
            {TOPICS.map((topic) => (
              <label key={topic} className="flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer hover:bg-accent">
                <Checkbox
                  checked={selectedTopics.includes(topic)}
                  onCheckedChange={(checked) => {
                    setSelectedTopics(prev =>
                      checked ? [...prev, topic] : prev.filter(t => t !== topic)
                    );
                  }}
                />
                <span className="text-sm">{tSub(`topicOptions.${topic}`)}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep('region')}>{tCommon('back')}</Button>
            <Button className="flex-1" onClick={() => setStep('language')}>{tCommon('next')}</Button>
          </div>
        </div>
      )}

      {/* Step: language preference */}
      {step === 'language' && (
        <div className="space-y-4">
          <div>
            <p className="font-medium mb-1">{t('onboarding.selectLanguage')}</p>
            <p className="text-sm text-muted-foreground mb-4">{t('onboarding.languageHelpText')}</p>
          </div>
          <div className="grid gap-2">
            {(['en', 'sw'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLangPref(l)}
                className={`flex items-center rounded-lg border px-4 py-3 text-sm transition-colors ${
                  langPref === l ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-accent'
                }`}
              >
                {tLang(l)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep('topics')}>{tCommon('back')}</Button>
            <Button className="flex-1" onClick={() => setStep('channel')}>{tCommon('next')}</Button>
          </div>
        </div>
      )}

      {/* Step: notification channel */}
      {step === 'channel' && (
        <div className="space-y-4">
          <div>
            <p className="font-medium mb-1">{tNotif('channelTitle')}</p>
          </div>
          <div className="space-y-3">
            {/* Email option */}
            <label className="flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer hover:bg-accent transition-colors">
              <Checkbox
                checked={emailChecked}
                onCheckedChange={(checked) => {
                  if (!checked && !smsChecked) return;
                  setEmailChecked(!!checked);
                }}
                className="mt-0.5"
              />
              <div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{tNotif('email')}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{tNotif('emailDesc')}</p>
              </div>
            </label>

            {/* SMS option */}
            <div className={`rounded-lg border px-4 py-3 transition-colors ${!smsEnabled ? 'opacity-50' : 'hover:bg-accent'}`}>
              <label className={`flex items-start gap-3 ${smsEnabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                <Checkbox
                  checked={smsChecked}
                  disabled={!smsEnabled}
                  onCheckedChange={(checked) => {
                    if (!checked && !emailChecked) return;
                    setSmsChecked(!!checked);
                  }}
                  className="mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{tNotif('sms')}</span>
                    {!smsEnabled && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {tNotif('smsComingSoon')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{tNotif('smsDesc')}</p>
                </div>
              </label>
              {smsChecked && smsEnabled && (
                <div className="mt-3 ml-8 space-y-1.5">
                  <label className="text-xs text-muted-foreground">{tNotif('phoneNumber')}</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground font-medium">{tNotif('phonePrefix')}</span>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                      placeholder="7XX XXX XXX"
                      className="flex-1 rounded-md border bg-background px-3 py-2 text-sm max-w-[200px]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep('language')}>{tCommon('back')}</Button>
            <Button className="flex-1" onClick={handleFinish} disabled={loading}>
              {loading ? '…' : t('onboarding.finish')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
