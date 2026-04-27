'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

/**
 * Legacy /settings/subscriptions → redirects to /account.
 * Keeps old bookmarks working.
 */
export default function SubscriptionsRedirectPage() {
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${locale}/account`);
  }, [locale, router]);

  return null;
}
