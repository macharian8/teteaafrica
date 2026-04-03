'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import type { CountryCode } from '@/lib/types';

type Step = 'contact' | 'otp' | 'country' | 'region' | 'topics' | 'language';
type Method = 'email' | 'phone';

const TOTAL_STEPS = 6;
const STEP_INDEX: Record<Step, number> = {
  contact: 1, otp: 2, country: 3, region: 4, topics: 5, language: 6,
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
  const tLang = useTranslations('language');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();

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
        channel: 'email',
      }, { onConflict: 'user_id' });

      // Persist language preference to users table
      await supabase.from('users').update({ language_preference: langPref }).eq('id', user.id);
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
            <Button className="flex-1" onClick={handleFinish} disabled={loading}>
              {loading ? '…' : t('onboarding.finish')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
