'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import FeedCard from '@/components/FeedCard';
import type { FeedDocument } from '@/lib/feed/query';

interface Props {
  documents: FeedDocument[];
  availableRegions: string[];
}

const COUNTRIES = [
  { code: 'KE', name: 'Kenya', enabled: true },
  { code: 'TZ', name: 'Tanzania', enabled: false },
  { code: 'UG', name: 'Uganda', enabled: false },
  { code: 'RW', name: 'Rwanda', enabled: false },
];

export default function HomeFeed({ documents, availableRegions }: Props) {
  const t = useTranslations('feed');
  const tCommon = useTranslations('common');
  const [selectedCountry] = useState('KE');
  const [selectedRegion, setSelectedRegion] = useState('');

  const filtered = selectedRegion
    ? documents.filter((doc) => {
        const regions = doc.analysis.affected_region_l1 ?? [];
        // National docs (no regions) always show
        return regions.length === 0 || regions.includes(selectedRegion);
      })
    : documents;

  const hasActiveFilter = !!selectedRegion;

  return (
    <div>
      {/* ── Filters bar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Country dropdown */}
        <div className="relative">
          <select
            value={selectedCountry}
            disabled
            className="appearance-none rounded-md border border-gray-200 bg-white pl-3 pr-8 py-2 text-sm text-gray-700 min-h-[44px] cursor-not-allowed"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code} disabled={!c.enabled}>
                {c.enabled ? c.name : `${c.name} — ${tCommon('comingSoon')}`}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>

        {/* County dropdown */}
        <div className="relative">
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="appearance-none rounded-md border border-gray-200 bg-white pl-3 pr-8 py-2 text-sm text-gray-700 min-h-[44px]"
          >
            <option value="">{t('filterAllCounties')}</option>
            {availableRegions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>

        {/* Clear filters */}
        {hasActiveFilter && (
          <button
            onClick={() => setSelectedRegion('')}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 min-h-[44px]"
          >
            <X className="w-3.5 h-3.5" />
            {t('clearFilters')}
          </button>
        )}
      </div>

      {/* ── 2-up card grid ────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((doc) => (
            <FeedCard key={doc.id} doc={doc} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">{t('noDocuments')}</p>
        </div>
      )}
    </div>
  );
}
