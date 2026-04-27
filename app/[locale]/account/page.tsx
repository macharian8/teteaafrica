'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Mail, MessageSquare, ChevronRight, ChevronDown } from 'lucide-react';
import Link from 'next/link';

const TOPIC_OPTIONS = [
  { key: 'land', emoji: '\u{1F3E0}' },
  { key: 'budget', emoji: '\u{1F4B0}' },
  { key: 'environment', emoji: '\u{1F33F}' },
  { key: 'health', emoji: '\u{1F3E5}' },
  { key: 'laws', emoji: '\u{2696}\u{FE0F}' },
  { key: 'everything', emoji: '\u{1F4E2}' },
] as const;

const LANGUAGES = ['en', 'sw'] as const;

interface ActionExecution {
  id: string;
  status: string;
  draft_content: string | null;
  created_at: string;
  action: {
    action_type: string;
    title_en: string;
    title_sw: string | null;
  } | null;
}

export default function AccountPage() {
  const t = useTranslations('account');
  const tOnb = useTranslations('onboarding');
  const tNotif = useTranslations('notifications');
  const tLang = useTranslations('language');
  const tAction = useTranslations('action');
  const locale = useLocale();
  const supabase = createClient();
  const smsEnabled = process.env.NEXT_PUBLIC_ENABLE_SMS === 'true';

  const [loaded, setLoaded] = useState(false);

  // Profile state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [ward, setWard] = useState('');
  const [phone, setPhone] = useState('');
  const [profileBtn, setProfileBtn] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [oneClickConsent, setOneClickConsent] = useState(false);
  const [editing, setEditing] = useState(false);

  // Preferences state
  const [county, setCounty] = useState('');
  const [counties, setCounties] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [emailOn, setEmailOn] = useState(true);
  const [smsOn, setSmsOn] = useState(false);
  const [langPref, setLangPref] = useState('en');
  const [prefSaved, setPrefSaved] = useState(false);
  const prefTimer = useRef<ReturnType<typeof setTimeout>>();

  // County dropdown
  const [countySearch, setCountySearch] = useState('');
  const [showCountyDrop, setShowCountyDrop] = useState(false);
  const countyRef = useRef<HTMLDivElement>(null);

  // Actions state
  const [actions, setActions] = useState<ActionExecution[]>([]);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  // ─── Load all data ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [subRes, unitsRes, actionsRes, userRes] = await Promise.all([
      fetch('/api/subscriptions'),
      fetch('/api/admin-units?country_code=KE'),
      fetch('/api/account/actions'),
      supabase.auth.getUser(),
    ]);

    // User auth data
    const authUser = userRes.data.user;
    if (authUser?.email) setEmail(authUser.email);

    // User profile from DB
    if (authUser) {
      const { data: profile } = await supabase
        .from('users')
        .select('full_name, national_id, ward, phone, one_click_consent')
        .eq('id', authUser.id)
        .maybeSingle();
      if (profile) {
        setFullName(profile.full_name ?? '');
        setNationalId(profile.national_id ?? '');
        setWard(profile.ward ?? '');
        setPhone(profile.phone ?? '');
        setOneClickConsent(profile.one_click_consent ?? false);
      }
    }

    // Subscription preferences
    if (subRes.ok) {
      const json = await subRes.json() as { success: boolean; data?: { subscription: { region_l1: string | null; topics: string[]; channel: string; language_preference: string } | null } };
      if (json.success && json.data?.subscription) {
        const sub = json.data.subscription;
        setCounty(sub.region_l1 ?? '');
        setTopics(sub.topics);
        setEmailOn(sub.channel === 'email' || sub.channel === 'both');
        setSmsOn(sub.channel === 'sms' || sub.channel === 'both');
        setLangPref(sub.language_preference);
      }
    }

    // Admin units
    if (unitsRes.ok) {
      const json = await unitsRes.json() as { success: boolean; data?: Array<{ region_level_1: string }> };
      if (json.success && json.data) {
        const unique = [...new Set(json.data.map((u) => u.region_level_1))].sort();
        setCounties(unique);
      }
    }

    // Actions
    if (actionsRes.ok) {
      const json = await actionsRes.json() as { success: boolean; data?: ActionExecution[] };
      if (json.success && json.data) setActions(json.data);
    }

    setLoaded(true);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // Close county dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (countyRef.current && !countyRef.current.contains(e.target as Node)) {
        setShowCountyDrop(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── Profile save ─────────────────────────────────────────────────
  async function saveProfile() {
    setProfileBtn('saving');
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, national_id: nationalId, ward, phone, one_click_consent: oneClickConsent }),
      });
      if (!res.ok) throw new Error();
      setProfileBtn('saved');
      setTimeout(() => {
        setProfileBtn('idle');
        setEditing(false);
      }, 2000);
    } catch {
      setProfileBtn('error');
      setTimeout(() => setProfileBtn('idle'), 2000);
    }
  }

  // ─── Preferences auto-save ────────────────────────────────────────
  const savePreferences = useCallback(async (updates: Record<string, unknown>) => {
    setPrefSaved(false);
    if (prefTimer.current) clearTimeout(prefTimer.current);
    await fetch('/api/account/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setPrefSaved(true);
    prefTimer.current = setTimeout(() => setPrefSaved(false), 2000);
  }, []);

  function handleCountyChange(c: string) {
    setCounty(c);
    setCountySearch('');
    setShowCountyDrop(false);
    savePreferences({ county: c });
  }

  function toggleTopic(key: string) {
    let next: string[];
    if (key === 'everything') {
      next = topics.includes('everything') ? [] : ['everything'];
    } else {
      const without = topics.filter((t) => t !== 'everything' && t !== key);
      next = topics.includes(key) ? without : [...without, key];
    }
    setTopics(next);
    // Map to subscription topics
    const mapped = next.includes('everything')
      ? ['land', 'environment', 'budget', 'health', 'tenders', 'general']
      : next.map((t) => (t === 'laws' ? 'general' : t));
    savePreferences({ topics: mapped });
  }

  function handleNotifChange(type: 'email' | 'sms', val: boolean) {
    const newEmail = type === 'email' ? val : emailOn;
    const newSms = type === 'sms' ? val : smsOn;
    if (type === 'email') setEmailOn(val);
    if (type === 'sms') setSmsOn(val);
    savePreferences({ email_notifications: newEmail, sms_notifications: newSms });
  }

  function handleLangChange(l: string) {
    setLangPref(l);
    savePreferences({ language_preference: l });
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  function getInitials(): string {
    if (fullName) {
      const parts = fullName.trim().split(/\s+/);
      return parts.map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    }
    if (email) return email[0].toUpperCase();
    return '?';
  }

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-400',
    draft_shown: 'bg-yellow-400',
    confirmed: 'bg-blue-500',
    submitted: 'bg-blue-500',
    failed: 'bg-red-500',
    cancelled: 'bg-gray-400',
  };

  const filteredCounties = counties.filter((c) =>
    c.toLowerCase().includes(countySearch.toLowerCase())
  );

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>

      {/* ═══════ SECTION 1: PROFILE ═══════════════════════════════════ */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('profile')}</h2>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="rounded-xl text-sm"
            >
              {t('editProfile')}
            </Button>
          )}
        </div>

        {/* Avatar + name + email */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: '#1a3a2a' }}>
            {getInitials()}
          </div>
          <div>
            <p className="font-medium text-gray-900">
              {fullName || <span className="text-gray-400">{t('addYourName')}</span>}
            </p>
            <p className="text-sm text-gray-500">{email}</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 mb-6">
          {t('trustCopy')}
        </div>

        {editing ? (
          <>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">{tOnb('fullNameLabel')}</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={tOnb('fullNamePlaceholder')}
                  className="mt-1 rounded-xl border-gray-200"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">{tOnb('nationalIdLabel')}</label>
                <Input
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder={tOnb('nationalIdPlaceholder')}
                  className="mt-1 rounded-xl border-gray-200"
                />
                <p className="text-xs text-gray-400 mt-1">{t('nationalIdHint')}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">{tOnb('wardLabel')}</label>
                <Input
                  value={ward}
                  onChange={(e) => setWard(e.target.value)}
                  placeholder={tOnb('wardPlaceholder')}
                  className="mt-1 rounded-xl border-gray-200"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">{tNotif('phoneNumber')}</label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('phoneHint')}
                  className="mt-1 rounded-xl border-gray-200"
                />
              </div>
            </div>

            {/* One-click consent toggle */}
            <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 mt-4">
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium text-gray-900">{t('oneClickLabel')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('oneClickSub')}</p>
              </div>
              <button
                className={`relative w-10 rounded-full transition-colors flex-shrink-0 ${oneClickConsent ? 'bg-green-600' : 'bg-gray-200'}`}
                style={{ height: 22 }}
                onClick={() => setOneClickConsent(!oneClickConsent)}
              >
                <span className="absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform" style={{ width: 18, height: 18, transform: oneClickConsent ? 'translateX(18px)' : '' }} />
              </button>
            </div>

            <div className="mt-5">
              <Button
                onClick={saveProfile}
                disabled={profileBtn === 'saving'}
                className={`rounded-xl text-white transition-colors ${
                  profileBtn === 'saved'
                    ? 'bg-green-500 hover:bg-green-500'
                    : profileBtn === 'error'
                    ? 'bg-red-600 hover:bg-red-600'
                    : 'bg-green-700 hover:bg-green-800'
                }`}
              >
                {profileBtn === 'saving' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {profileBtn === 'saved' && <CheckCircle2 className="h-4 w-4 mr-2" />}
                {profileBtn === 'saving'
                  ? t('saveProfile')
                  : profileBtn === 'saved'
                  ? t('savedCheck')
                  : profileBtn === 'error'
                  ? t('saveError')
                  : t('saveProfile')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700">{tOnb('fullNameLabel')}</p>
                <p className="text-sm text-gray-900 mt-0.5">{fullName || '\u2014'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{tOnb('nationalIdLabel')}</p>
                <p className="text-sm text-gray-900 mt-0.5">{nationalId || '\u2014'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{tOnb('wardLabel')}</p>
                <p className="text-sm text-gray-900 mt-0.5">{ward || '\u2014'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{tNotif('phoneNumber')}</p>
                <p className="text-sm text-gray-900 mt-0.5">{phone || '\u2014'}</p>
              </div>
            </div>

            {/* One-click consent toggle */}
            <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 mt-4">
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium text-gray-900">{t('oneClickLabel')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('oneClickSub')}</p>
              </div>
              <button
                className={`relative w-10 rounded-full transition-colors flex-shrink-0 ${oneClickConsent ? 'bg-green-600' : 'bg-gray-200'}`}
                style={{ height: 22 }}
                onClick={() => {
                  const next = !oneClickConsent;
                  setOneClickConsent(next);
                  fetch('/api/account/profile', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ one_click_consent: next }),
                  });
                }}
              >
                <span className="absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform" style={{ width: 18, height: 18, transform: oneClickConsent ? 'translateX(18px)' : '' }} />
              </button>
            </div>
          </>
        )}
      </section>

      <hr className="border-gray-200" />

      {/* ═══════ SECTION 2: PREFERENCES ═══════════════════════════════ */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('preferences')}</h2>
          {prefSaved && (
            <span className="flex items-center gap-1 text-xs text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('saved')}
            </span>
          )}
        </div>

        {/* County */}
        <div className="mb-5">
          <label className="text-sm font-medium text-gray-700">{t('county')}</label>
          <div className="relative mt-1" ref={countyRef}>
            <input
              type="text"
              value={county || countySearch}
              onChange={(e) => {
                setCountySearch(e.target.value);
                setCounty('');
                setShowCountyDrop(true);
              }}
              onFocus={() => setShowCountyDrop(true)}
              placeholder={t('countyPlaceholder')}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 focus:outline-none"
            />
            {showCountyDrop && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                {filteredCounties.map((c) => (
                  <button
                    key={c}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 transition-colors"
                    onClick={() => handleCountyChange(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Topics */}
        <div className="mb-5">
          <label className="text-sm font-medium text-gray-700">{t('topicsLabel')}</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {TOPIC_OPTIONS.map(({ key, emoji }) => {
              const selected = topics.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleTopic(key)}
                  className={`flex items-center gap-2 rounded-xl border py-2.5 px-3 text-sm font-medium transition-all ${
                    selected
                      ? 'bg-[#1a3a2a] border-[#2d6a4f] text-white'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{emoji}</span>
                  {tOnb(`topics.${key}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notifications */}
        <div className="mb-5">
          <label className="text-sm font-medium text-gray-700">{t('notificationsLabel')}</label>
          <div className="space-y-2 mt-2">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-green-700" />
                <span className="text-sm text-gray-900">{tNotif('email')}</span>
              </div>
              <button
                className={`relative w-10 h-5.5 rounded-full transition-colors ${emailOn ? 'bg-green-600' : 'bg-gray-200'}`}
                onClick={() => handleNotifChange('email', !emailOn)}
              >
                <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${emailOn ? 'translate-x-4.5' : ''}`} style={{ width: 18, height: 18, transform: emailOn ? 'translateX(18px)' : '' }} />
              </button>
            </div>

            <div className={`flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 ${!smsEnabled ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-700" />
                <span className="text-sm text-gray-900">{tNotif('sms')}</span>
                {!smsEnabled && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-200 text-amber-700 bg-amber-50">
                    {tNotif('smsComingSoon')}
                  </Badge>
                )}
              </div>
              <button
                className={`relative w-10 rounded-full transition-colors ${smsOn ? 'bg-green-600' : 'bg-gray-200'} ${!smsEnabled ? 'cursor-not-allowed' : ''}`}
                style={{ height: 22 }}
                onClick={() => smsEnabled && handleNotifChange('sms', !smsOn)}
                disabled={!smsEnabled}
              >
                <span className="absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform" style={{ width: 18, height: 18, transform: smsOn ? 'translateX(18px)' : '' }} />
              </button>
            </div>
          </div>
        </div>

        {/* Content language */}
        <div>
          <label className="text-sm font-medium text-gray-700">{t('contentLanguage')}</label>
          <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit mt-2">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                onClick={() => handleLangChange(l)}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  langPref === l
                    ? 'bg-green-700 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tLang(l)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* ═══════ SECTION 3: MY ACTIONS ════════════════════════════════ */}
      <section className="pb-8">
        <h2 className="text-lg font-semibold mb-4">{t('myActions')}</h2>

        {actions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 mb-3">{t('noActions')}</p>
            <Link
              href={`/${locale}`}
              className="text-sm text-green-700 font-medium underline underline-offset-4 hover:text-green-800"
            >
              {t('browseDocuments')} &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map((ae) => {
              const isExpanded = expandedAction === ae.id;
              const actionTitle = ae.action
                ? locale === 'sw' && ae.action.title_sw ? ae.action.title_sw : ae.action.title_en
                : 'Unknown action';
              const actionType = ae.action?.action_type ?? 'unknown';
              const statusKey = ae.status as keyof typeof statusColors;

              return (
                <div key={ae.id} className="rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedAction(isExpanded ? null : ae.id)}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColors[statusKey] ?? 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">
                        {actionTitle}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {tAction(`types.${actionType}`)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {t(`status.${statusKey}`)}
                        </Badge>
                        <span className="text-xs text-gray-400">{relativeTime(ae.created_at)}</span>
                      </div>
                    </div>
                    {ae.draft_content && (
                      isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                  {isExpanded && ae.draft_content && (
                    <div className="px-4 pb-3 pt-0">
                      <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-sans">
                        {ae.draft_content}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
