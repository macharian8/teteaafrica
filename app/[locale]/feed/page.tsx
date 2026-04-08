/**
 * app/[locale]/feed/page.tsx
 * Consequence-first public feed — no auth required to view.
 *
 * Three states:
 *   1. Unauthenticated → general feed, "What's happening in Kenya right now"
 *   2. Authenticated with subscription → personalised feed, "[Region] right now"
 *   3. Authenticated, no subscription → general feed + dismissible location banner
 *
 * Empty states:
 *   - Documents being processed → processing message + refresh button
 *   - No matching documents → standard empty message
 *
 * Pagination via ?page=N query param.
 */

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getFeedDocuments, getGeneralFeed } from '@/lib/feed/query';
import FeedCard from '@/components/FeedCard';
import DismissibleBanner from '@/components/DismissibleBanner';
import { Newspaper, RefreshCw } from 'lucide-react';

interface PageProps {
  params: { locale: string };
  searchParams: { page?: string };
}

export default async function FeedPage({ params, searchParams }: PageProps) {
  const { locale } = params;
  const t = await getTranslations({ locale, namespace: 'feed' });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  let documents: Awaited<ReturnType<typeof getGeneralFeed>>['documents'] = [];
  let hasMore = false;
  let showSubsBanner = false;
  let hasDocumentsBeingProcessed = false;
  let userRegion: string | null = null;

  if (user) {
    const matched = await getFeedDocuments(user.id, page);
    if (matched === null) {
      // No subscriptions — show general feed + location banner
      const general = await getGeneralFeed(page);
      documents = general.documents;
      hasMore = general.hasMore;
      hasDocumentsBeingProcessed = general.hasDocumentsBeingProcessed;
      showSubsBanner = true;
    } else {
      documents = matched.documents;
      hasMore = matched.hasMore;
      hasDocumentsBeingProcessed = matched.hasDocumentsBeingProcessed;
      userRegion = matched.userRegion;
    }
  } else {
    const general = await getGeneralFeed(page);
    documents = general.documents;
    hasMore = general.hasMore;
    hasDocumentsBeingProcessed = general.hasDocumentsBeingProcessed;
  }

  // Header text: personalised when subscription with region, generic otherwise
  const headerTitle = userRegion
    ? t('authTitle', { region: userRegion })
    : t('unauthTitle');

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{headerTitle}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('unauthSubtext')}</p>
      </div>

      {/* ── Location banner (authenticated, no subscription) ─────────── */}
      {showSubsBanner && (
        <DismissibleBanner
          message={t('locationBanner')}
          linkText={t('setLocation')}
          linkHref={`/${locale}/settings/subscriptions`}
        />
      )}

      {/* ── Processing empty state ───────────────────────────────────── */}
      {documents.length === 0 && hasDocumentsBeingProcessed && (
        <div className="text-center py-16 text-gray-400">
          <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-gray-500">{t('processingEmpty')}</p>
          {/* Inline refresh — next/navigation router.refresh() needs a client component */}
          <Link
            href={`/${locale}/feed?page=${page}&t=${Date.now()}`}
            replace
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            {t('refresh')}
          </Link>
        </div>
      )}

      {/* ── No-match empty state ─────────────────────────────────────── */}
      {documents.length === 0 && !hasDocumentsBeingProcessed && (
        <div className="text-center py-16 text-gray-400">
          <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{t('noDocuments')}</p>
        </div>
      )}

      {/* ── Document cards ───────────────────────────────────────────── */}
      {documents.length > 0 && (
        <div className="space-y-3">
          {documents.map((doc) => (
            <FeedCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {(hasMore || page > 1) && (
        <div className="flex justify-center gap-4 mt-8">
          {page > 1 && (
            <Link
              href={`/${locale}/feed?page=${page - 1}`}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              &larr;
            </Link>
          )}
          <span className="flex items-center text-sm text-gray-500">{page}</span>
          {hasMore && (
            <Link
              href={`/${locale}/feed?page=${page + 1}`}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              &rarr;
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
