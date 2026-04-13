/**
 * app/[locale]/page.tsx
 * Homepage — slim hero + public document feed with county filter.
 */

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getFeedDocuments, getGeneralFeed, getFeedStats } from '@/lib/feed/query';
import HomeFeed from '@/components/HomeFeed';
import DismissibleBanner from '@/components/DismissibleBanner';
import { Newspaper, RefreshCw } from 'lucide-react';

interface PageProps {
  params: { locale: string };
  searchParams: { page?: string };
}

export default async function HomePage({ params, searchParams }: PageProps) {
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

  // Collect unique regions from all documents for the filter
  const allRegions: string[] = [];
  for (const doc of documents) {
    for (const r of doc.analysis.affected_region_l1 ?? []) {
      if (!allRegions.includes(r)) allRegions.push(r);
    }
  }
  allRegions.sort();

  const stats = await getFeedStats('KE');

  const headerTitle = userRegion
    ? t('authTitle', { region: userRegion })
    : t('unauthTitle');

  return (
    <main>
      {/* ── Compact hero ──────────────────────────────────────────────── */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{headerTitle}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('unauthSubtext')}</p>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────── */}
      {stats.documentCount > 0 && (
        <p className="text-sm text-gray-500 mb-4">
          {t('statsDocuments', { count: stats.documentCount })}
          {' · '}
          {t('statsActions', { count: stats.actionCount })}
          {' · '}
          {t('statsCounties', { count: stats.countiesCovered })}
        </p>
      )}

      {/* ── Sign-in incentive banner (unauthenticated only, homepage) ── */}
      {!user && (
        <DismissibleBanner
          message={t('signInBanner')}
          linkText={t('signInBannerLink')}
          linkHref={`/${locale}/sign-in`}
        />
      )}

      {/* ── Location banner (authenticated, no subscription) ────────── */}
      {showSubsBanner && (
        <DismissibleBanner
          message={t('locationBanner')}
          linkText={t('setLocation')}
          linkHref={`/${locale}/settings/subscriptions`}
        />
      )}

      {/* ── Processing empty state ──────────────────────────────────── */}
      {documents.length === 0 && hasDocumentsBeingProcessed && (
        <div className="text-center py-16 text-gray-400">
          <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-gray-500">{t('processingEmpty')}</p>
          <Link
            href={`/${locale}?page=${page}&t=${Date.now()}`}
            replace
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            {t('refresh')}
          </Link>
        </div>
      )}

      {/* ── No-match empty state ────────────────────────────────────── */}
      {documents.length === 0 && !hasDocumentsBeingProcessed && (
        <div className="text-center py-16 text-gray-400">
          <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{t('noDocuments')}</p>
        </div>
      )}

      {/* ── Feed with client-side county filter + 2-up grid ─────────── */}
      {documents.length > 0 && (
        <HomeFeed documents={documents} availableRegions={allRegions} />
      )}

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {(hasMore || page > 1) && (
        <div className="flex justify-center gap-4 mt-8">
          {page > 1 && (
            <Link
              href={`/${locale}?page=${page - 1}`}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] flex items-center"
            >
              &larr;
            </Link>
          )}
          <span className="flex items-center text-sm text-gray-500">{page}</span>
          {hasMore && (
            <Link
              href={`/${locale}?page=${page + 1}`}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] flex items-center"
            >
              &rarr;
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
