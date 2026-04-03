'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { useTransition, useEffect } from 'react';

const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'sw', label: 'Kiswahili' },
] as const;

type LocaleCode = (typeof LOCALES)[number]['code'];

export default function LanguageSwitcher() {
  const t = useTranslations('language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  async function handleChange(nextLocale: LocaleCode) {
    if (nextLocale === locale) return;

    // Persist to localStorage (works for unauthenticated users too)
    if (typeof window !== 'undefined') {
      localStorage.setItem('language_preference', nextLocale);
    }

    // Persist to DB if authenticated (fire-and-forget)
    fetch('/api/user/language', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: nextLocale }),
    }).catch(() => {
      // Not authenticated — ignore silently
    });

    startTransition(() => {
      const segments = pathname.split('/');
      segments[1] = nextLocale;
      router.replace(segments.join('/'));
    });
  }

  // Restore from localStorage on first render (before DB preference is available)
  useEffect(() => {
    const stored = localStorage.getItem('language_preference') as LocaleCode | null;
    if (stored && stored !== locale && LOCALES.some((l) => l.code === stored)) {
      handleChange(stored);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-1" aria-label={t('switchTo')}>
      {LOCALES.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => handleChange(code)}
          disabled={isPending || locale === code}
          className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
            locale === code
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          aria-current={locale === code ? 'true' : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
