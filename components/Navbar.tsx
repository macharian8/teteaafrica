'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import LanguageSwitcher from './LanguageSwitcher';
import { Button } from './ui/button';
import type { User } from '@supabase/supabase-js';

export default function Navbar() {
  const t = useTranslations('nav');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const [user, setUser] = useState<User | null>(null);
  // Memoize client so the same instance is used across renders
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase.auth]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        {/* Logo */}
        <Link href={`/${locale}`} className="font-bold text-lg tracking-tight">
          {tApp('name')}
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <LanguageSwitcher />

          <Link href={`/${locale}/analyze`}>
            <Button variant="ghost" size="sm">
              {t('analyze')}
            </Button>
          </Link>

          {user ? (
            <>
              <Link href={`/${locale}/settings/subscriptions`}>
                <Button variant="ghost" size="sm">
                  {t('subscriptions')}
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                {t('signOut')}
              </Button>
            </>
          ) : (
            <Link href={`/${locale}/sign-in`}>
              <Button size="sm">{t('getAlerts')}</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
