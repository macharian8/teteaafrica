'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, Globe, Loader2, Mail, MessageSquare } from 'lucide-react';
import type { Database } from '@/lib/supabase/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOPICS = ['land', 'environment', 'budget', 'health', 'tenders', 'general'] as const;
const CONSENT_TYPES = ['calendar_invite', 'ati_request', 'petition'] as const;
const LANGUAGES = ['en', 'sw'] as const;

const COUNTRIES = [
  { code: 'KE', name: 'Kenya', active: true },
  { code: 'TZ', name: 'Tanzania', active: false },
  { code: 'UG', name: 'Uganda', active: false },
  { code: 'RW', name: 'Rwanda', active: false },
] as const;

type Channel = Database['public']['Tables']['subscriptions']['Row']['channel'];
type AdminUnit = Database['public']['Tables']['admin_units']['Row'];

// ── Component ──────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const tSub = useTranslations('subscription');
  const tNotif = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const tLang = useTranslations('language');

  const smsEnabled = process.env.NEXT_PUBLIC_ENABLE_SMS === 'true';

  // Form state
  const [countryCode, setCountryCode] = useState('KE');
  const [regionL1, setRegionL1] = useState<string>('');
  const [regionL2, setRegionL2] = useState<string>('');
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const [emailChecked, setEmailChecked] = useState(true);
  const [smsChecked, setSmsChecked] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [langPref, setLangPref] = useState<string>('en');
  const [consents, setConsents] = useState<Set<string>>(new Set());

  // Data state
  const [counties, setCounties] = useState<string[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [userContact, setUserContact] = useState<{ email: string | null; phone: string | null }>({ email: null, phone: null });
  const [loaded, setLoaded] = useState(false);

  // Save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ── Load existing data ─────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [settingsRes, adminUnitsRes] = await Promise.all([
        fetch('/api/subscriptions'),
        fetch('/api/admin-units?country_code=KE'),
      ]);

      if (settingsRes.ok) {
        const json = await settingsRes.json() as {
          success: boolean;
          data?: {
            subscription: Database['public']['Tables']['subscriptions']['Row'] | null;
            consents: string[];
            userContact: { email: string | null; phone: string | null };
          };
        };
        if (json.success && json.data) {
          const { subscription, consents: existingConsents, userContact: contact } = json.data;
          if (subscription) {
            setCountryCode(subscription.country_code);
            setRegionL1(subscription.region_l1 ?? '');
            setRegionL2(subscription.region_l2 ?? '');
            setTopics(new Set(subscription.topics));
            const ch = subscription.channel;
            setEmailChecked(ch === 'email' || ch === 'both');
            setSmsChecked(ch === 'sms' || ch === 'both');
            setLangPref(subscription.language_preference);
          }
          setConsents(new Set(existingConsents));
          setUserContact(contact);
          if (contact.phone) {
            // Strip +254 prefix for display
            const stripped = contact.phone.replace(/^\+254/, '');
            setPhoneNumber(stripped);
          }
        }
      }

      if (adminUnitsRes.ok) {
        const unitsJson = await adminUnitsRes.json() as {
          success: boolean;
          data?: AdminUnit[];
        };
        if (unitsJson.success && unitsJson.data) {
          const uniqueL1 = [...new Set(unitsJson.data.map((u) => u.region_level_1))].sort();
          setCounties(uniqueL1);
        }
      }

      setLoaded(true);
    }
    load();
  }, []);

  // Load wards when county changes
  useEffect(() => {
    if (!regionL1) {
      setWards([]);
      setRegionL2('');
      return;
    }
    async function loadWards() {
      const res = await fetch(`/api/admin-units?country_code=KE&region_l1=${encodeURIComponent(regionL1)}`);
      if (res.ok) {
        const json = await res.json() as { success: boolean; data?: AdminUnit[] };
        if (json.success && json.data) {
          const uniqueL2 = [...new Set(
            json.data.map((u) => u.region_level_2).filter(Boolean) as string[]
          )].sort();
          setWards(uniqueL2);
        }
      }
    }
    loadWards();
  }, [regionL1]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleTopic(topic: string) {
    setTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  }

  function toggleConsent(type: string) {
    setConsents((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function deriveChannel(): Channel {
    if (emailChecked && smsChecked) return 'both';
    if (smsChecked) return 'sms';
    return 'email';
  }

  function isValidKenyaPhone(num: string): boolean {
    // Accepts 7XXXXXXXX or 1XXXXXXXX (9 digits after +254)
    return /^[17]\d{8}$/.test(num.replace(/\s/g, ''));
  }

  async function handleSave() {
    setSaveStatus('saving');
    const channel = deriveChannel();
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country_code: countryCode,
          region_l1: regionL1 || null,
          region_l2: regionL2 || null,
          topics: Array.from(topics),
          channel,
          language_preference: langPref,
          consents: Array.from(consents),
          phone_number: smsChecked && phoneNumber ? `+254${phoneNumber.replace(/\s/g, '')}` : null,
        }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? 'Failed');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        {tCommon('loading')}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">{tSub('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{tSub('pageDescription')}</p>
      </div>

      {/* ── Country ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {tSub('country')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {COUNTRIES.map(({ code, name, active }) => (
            <button
              key={code}
              disabled={!active}
              onClick={() => active && setCountryCode(code)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                countryCode === code && active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : active
                  ? 'hover:bg-accent'
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              <Globe className="h-4 w-4" />
              {name}
              {!active && (
                <Badge variant="outline" className="text-xs">
                  {tCommon('comingSoon')}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Region ──────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {tSub('regionL1')} / {tSub('regionL2')}
        </h2>
        {counties.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tSub('regionNotAvailable')}
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <Select
              value={regionL1}
              onValueChange={(v) => {
                setRegionL1(v ?? '');
                setRegionL2('');
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={tSub('regionL1Placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {counties.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={regionL2}
              onValueChange={(v) => setRegionL2(v ?? '')}
              disabled={!regionL1 || wards.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={tSub('regionL2Placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {wards.map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      <Separator />

      {/* ── Topics ──────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {tSub('topics')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TOPICS.map((topic) => (
            <label
              key={topic}
              className="flex items-center gap-2 cursor-pointer rounded-lg border p-3 hover:bg-accent transition-colors"
            >
              <Checkbox
                checked={topics.has(topic)}
                onCheckedChange={() => toggleTopic(topic)}
              />
              <span className="text-sm">{tSub(`topicOptions.${topic}`)}</span>
            </label>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Content language ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {tSub('languagePreference')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{tSub('languageHelpText')}</p>
        </div>
        <div className="flex rounded-md border overflow-hidden w-fit">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => setLangPref(l)}
              className={`px-5 py-2 text-sm font-medium transition-colors ${
                langPref === l
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {tLang(l)}
            </button>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Notification channel ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {tNotif('channelTitle')}
        </h2>
        <div className="space-y-3">
          {/* Email option */}
          <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent transition-colors">
            <Checkbox
              checked={emailChecked}
              onCheckedChange={(checked) => {
                // Don't allow unchecking both
                if (!checked && !smsChecked) return;
                setEmailChecked(!!checked);
              }}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{tNotif('email')}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{tNotif('emailDesc')}</p>
              {emailChecked && userContact.email && (
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs text-muted-foreground">{userContact.email}</p>
                  <Badge variant="secondary" className="flex items-center gap-1 text-[10px] px-1.5 py-0">
                    <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                    {tSub('channelVerified')}
                  </Badge>
                </div>
              )}
            </div>
          </label>

          {/* SMS option */}
          <div className={`rounded-lg border p-4 transition-colors ${!smsEnabled ? 'opacity-50' : 'hover:bg-accent'}`}>
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
              <div className="flex-1">
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
                {phoneNumber && !isValidKenyaPhone(phoneNumber) && (
                  <p className="text-xs text-destructive">Format: 7XX XXX XXX</p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Standing consents ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {tSub('standingConsents')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{tSub('standingConsentsHelpText')}</p>
        </div>
        <div className="space-y-3">
          {CONSENT_TYPES.map((type) => (
            <label
              key={type}
              className="flex items-start gap-3 cursor-pointer rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <Checkbox
                checked={consents.has(type)}
                onCheckedChange={() => toggleConsent(type)}
                className="mt-0.5"
              />
              <span className="text-sm leading-snug">{tSub(`consentLabels.${type}`)}</span>
            </label>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Save ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={saveStatus === 'saving'}>
          {saveStatus === 'saving' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {tCommon('save')}
        </Button>
        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {tSub('saved')}
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-sm text-destructive">{tSub('saveError')}</span>
        )}
      </div>
    </div>
  );
}
