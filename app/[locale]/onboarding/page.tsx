'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle2, Mail, MessageSquare } from 'lucide-react';

type Step = 1 | 2 | 3 | 4;

const TOPIC_OPTIONS = [
  { key: 'land', emoji: '\u{1F3E0}' },
  { key: 'budget', emoji: '\u{1F4B0}' },
  { key: 'environment', emoji: '\u{1F33F}' },
  { key: 'health', emoji: '\u{1F3E5}' },
  { key: 'laws', emoji: '\u{2696}\u{FE0F}' },
  { key: 'everything', emoji: '\u{1F4E2}' },
] as const;

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const tNotif = useTranslations('notifications');
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();
  const smsEnabled = process.env.NEXT_PUBLIC_ENABLE_SMS === 'true';

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [loading, setLoading] = useState(false);

  // Step 1 — County
  const [counties, setCounties] = useState<string[]>([]);
  const [county, setCounty] = useState('');
  const [countySearch, setCountySearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Step 2 — Topics
  const [topics, setTopics] = useState<string[]>([]);

  // Step 3 — Notifications
  const [emailOn, setEmailOn] = useState(true);
  const [smsOn, setSmsOn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Step 4 — Citizen details
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [ward, setWard] = useState('');

  // Load counties
  const loadCounties = useCallback(async () => {
    const res = await fetch('/api/admin-units?country_code=KE');
    if (res.ok) {
      const json = await res.json() as { success: boolean; data?: Array<{ region_level_1: string }> };
      if (json.success && json.data) {
        const unique = [...new Set(json.data.map((u) => u.region_level_1))].sort();
        setCounties(unique);
      }
    }
  }, []);

  useEffect(() => {
    loadCounties();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
  }, [loadCounties, supabase.auth]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredCounties = counties.filter((c) =>
    c.toLowerCase().includes(countySearch.toLowerCase())
  );

  function goTo(s: Step) {
    setDirection(s > step ? 'forward' : 'back');
    setStep(s);
  }

  function toggleTopic(key: string) {
    if (key === 'everything') {
      setTopics((prev) => prev.includes('everything') ? [] : ['everything']);
      return;
    }
    setTopics((prev) => {
      const without = prev.filter((t) => t !== 'everything' && t !== key);
      return prev.includes(key) ? without : [...without, key];
    });
  }

  async function finish() {
    setLoading(true);
    // Map topic keys to subscription topic values
    const mappedTopics = topics.includes('everything')
      ? ['land', 'environment', 'budget', 'health', 'tenders', 'general']
      : topics.map((t) => {
          if (t === 'laws') return 'general';
          if (t === 'health') return 'health';
          return t;
        });

    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county: county || null,
          topics: mappedTopics,
          email_notifications: emailOn,
          sms_notifications: smsOn,
          phone: phone ? `+254${phone.replace(/\s/g, '')}` : null,
          full_name: fullName || null,
          national_id: nationalId || null,
          ward: ward || null,
          language_preference: locale,
        }),
      });
    } finally {
      setLoading(false);
      router.push(`/${locale}`);
    }
  }

  const slideClass = direction === 'forward'
    ? 'animate-in fade-in slide-in-from-right-8 duration-300'
    : 'animate-in fade-in slide-in-from-left-8 duration-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: '#0f1a13' }}>
      <div className="w-full max-w-md bg-white rounded-2xl p-8 relative shadow-2xl">
        {/* Skip — top right */}
        <button
          className="absolute top-6 right-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          onClick={() => {
            if (step < 4) goTo((step + 1) as Step);
            else finish();
          }}
        >
          {t('skip')}
        </button>

        {/* ─── Step 1: County ──────────────────────────────────── */}
        {step === 1 && (
          <div key="step1" className={slideClass}>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('step1Title')}
            </h1>
            <p className="text-sm text-gray-500 mt-1 mb-6">
              {t('step1Subtitle')}
            </p>

            {/* Searchable dropdown */}
            <div className="relative mb-6" ref={dropdownRef}>
              <input
                type="text"
                value={county || countySearch}
                onChange={(e) => {
                  setCountySearch(e.target.value);
                  setCounty('');
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder={t('selectCounty')}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 focus:outline-none transition-all"
              />
              {showDropdown && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                  {filteredCounties.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">
                      {counties.length === 0 ? 'Loading...' : 'No match'}
                    </div>
                  ) : (
                    filteredCounties.map((c) => (
                      <button
                        key={c}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 transition-colors"
                        onClick={() => {
                          setCounty(c);
                          setCountySearch('');
                          setShowDropdown(false);
                        }}
                      >
                        {c}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <Button
              className="w-full h-12 bg-green-700 hover:bg-green-800 text-white font-medium text-base rounded-xl"
              onClick={() => goTo(2)}
            >
              {t('continue')}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ─── Step 2: Topics ──────────────────────────────────── */}
        {step === 2 && (
          <div key="step2" className={slideClass}>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('step2Title')}
            </h1>
            <p className="text-sm text-gray-500 mt-1 mb-6">
              {t('step2Subtitle')}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {TOPIC_OPTIONS.map(({ key, emoji }) => {
                const selected = topics.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleTopic(key)}
                    className={`flex items-center gap-2.5 rounded-xl border py-3 px-4 text-sm font-medium transition-all duration-150 ${
                      selected
                        ? 'bg-[#1a3a2a] border-[#2d6a4f] text-white'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-lg">{emoji}</span>
                    {t(`topics.${key}`)}
                  </button>
                );
              })}
            </div>

            <Button
              className="w-full h-12 bg-green-700 hover:bg-green-800 text-white font-medium text-base rounded-xl"
              onClick={() => goTo(3)}
            >
              {t('continue')}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ─── Step 3: Notifications ──────────────────────────── */}
        {step === 3 && (
          <div key="step3" className={slideClass}>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('step3Title')}
            </h1>
            <p className="text-sm text-gray-500 mt-1 mb-6">
              {t('step3Subtitle')}
            </p>

            <div className="space-y-3 mb-6">
              {/* Email row */}
              <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-green-700" />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{tNotif('email')}</span>
                    {userEmail && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-500">{userEmail}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                          {t('verified')}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className={`relative w-11 h-6 rounded-full transition-colors ${emailOn ? 'bg-green-600' : 'bg-gray-200'}`}
                  onClick={() => setEmailOn(!emailOn)}
                  disabled
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${emailOn ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* SMS row */}
              <div className={`rounded-xl border border-gray-200 px-4 py-3.5 ${!smsEnabled ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-green-700" />
                    <div>
                      <span className="text-sm font-medium text-gray-900">{tNotif('sms')}</span>
                      {!smsEnabled && (
                        <div className="mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-200 text-amber-700 bg-amber-50">
                            {tNotif('smsComingSoon')}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className={`relative w-11 h-6 rounded-full transition-colors ${smsOn ? 'bg-green-600' : 'bg-gray-200'} ${!smsEnabled ? 'cursor-not-allowed' : ''}`}
                    onClick={() => smsEnabled && setSmsOn(!smsOn)}
                    disabled={!smsEnabled}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${smsOn ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
                {smsOn && smsEnabled && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm text-gray-500 font-medium">{tNotif('phonePrefix')}</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                      placeholder="7XX XXX XXX"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600/20 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            <Button
              className="w-full h-12 bg-green-700 hover:bg-green-800 text-white font-medium text-base rounded-xl"
              onClick={() => goTo(4)}
            >
              {t('continue')}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ─── Step 4: Pre-fill details ───────────────────────── */}
        {step === 4 && (
          <div key="step4" className={slideClass}>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('step4Title')}
            </h1>
            <p className="text-sm text-gray-500 mt-1 mb-6">
              {t('step4Subtitle')}
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-gray-700">{t('fullNameLabel')}</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('fullNamePlaceholder')}
                  className="mt-1 h-11 rounded-xl border-gray-200 text-base"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {t('fullNameHint', { name: fullName || 'Your Name' })}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">{t('nationalIdLabel')}</label>
                <Input
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder={t('nationalIdPlaceholder')}
                  className="mt-1 h-11 rounded-xl border-gray-200 text-base"
                />
                <p className="text-xs text-gray-400 mt-1">{t('nationalIdHint')}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">{t('wardLabel')}</label>
                <Input
                  value={ward}
                  onChange={(e) => setWard(e.target.value)}
                  placeholder={t('wardPlaceholder')}
                  className="mt-1 h-11 rounded-xl border-gray-200 text-base"
                />
                <p className="text-xs text-gray-400 mt-1">{t('wardHint')}</p>
              </div>
            </div>

            <Button
              className="w-full h-12 bg-green-700 hover:bg-green-800 text-white font-medium text-base rounded-xl"
              onClick={finish}
              disabled={loading}
            >
              {loading ? '...' : t('finishSetup')}
              {!loading && <ArrowRight className="h-4 w-4 ml-1" />}
            </Button>

            <button
              className="w-full text-center text-sm text-gray-500 mt-3 underline underline-offset-4 cursor-pointer hover:text-gray-700 transition-colors py-2"
              onClick={finish}
              disabled={loading}
            >
              {t('skipForNow')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
