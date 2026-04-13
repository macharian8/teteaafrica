'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { X, Search, SlidersHorizontal } from 'lucide-react';
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

const DOC_TYPE_OPTIONS = [
  { value: '', labelKey: 'filterAllTypes' },
  { value: 'gazette_notice', labelKey: 'filterGazetteNotice' },
  { value: 'parliamentary_bill', labelKey: 'filterParliamentaryBill' },
  { value: 'county_policy', labelKey: 'filterCountyPolicy' },
  { value: 'budget', labelKey: 'filterBudget' },
  { value: 'environment', labelKey: 'filterEnvironment' },
  { value: 'land', labelKey: 'filterLand' },
  { value: 'other', labelKey: 'filterOther' },
] as const;

const SORT_OPTIONS = [
  { value: 'urgent', labelKey: 'sortUrgent' },
  { value: 'newest', labelKey: 'sortNewest' },
  { value: 'most_actions', labelKey: 'sortMostActions' },
] as const;

type Actionability = 'all' | 'can_act' | 'info_only';

// Debounce hook helper
function useDebounced(fn: (v: string) => void, delay: number) {
  const timerRef = useState<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (value: string) => {
      if (timerRef[0]) clearTimeout(timerRef[0]);
      timerRef[1](setTimeout(() => fn(value), delay));
    },
    [fn, delay, timerRef],
  );
}

export default function HomeFeed({ documents, availableRegions }: Props) {
  const t = useTranslations('feed');
  const tCommon = useTranslations('common');

  // Filter state
  const [selectedCountry] = useState('KE');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('');
  const [sortBy, setSortBy] = useState('urgent');
  const [actionability, setActionability] = useState<Actionability>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const debouncedSetSearch = useDebounced(setSearchQuery, 300);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    debouncedSetSearch(value);
  }

  // "/" keyboard shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Count of non-default hidden filters (type, sort, actionability)
  const hiddenFilterCount =
    (selectedDocType ? 1 : 0) +
    (sortBy !== 'urgent' ? 1 : 0) +
    (actionability !== 'all' ? 1 : 0);

  // Compute filtered + sorted documents
  const filtered = useMemo(() => {
    let result = [...documents];

    // Region filter
    if (selectedRegion) {
      result = result.filter((doc) => {
        const regions = doc.analysis.affected_region_l1 ?? [];
        return regions.length === 0 || regions.includes(selectedRegion);
      });
    }

    // Document type filter
    if (selectedDocType) {
      result = result.filter(
        (doc) => doc.analysis.document_type === selectedDocType,
      );
    }

    // Actionability filter
    if (actionability === 'can_act') {
      result = result.filter(
        (doc) =>
          doc.top_action &&
          (doc.top_action.executability === 'auto' ||
            doc.top_action.executability === 'scaffolded'),
      );
    } else if (actionability === 'info_only') {
      result = result.filter(
        (doc) =>
          !doc.top_action ||
          doc.top_action.executability === 'inform_only',
      );
    }

    // Search filter (client-side, case-insensitive)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((doc) => {
        const summary = (doc.analysis.summary_en ?? '').toLowerCase();
        const actionTitle = (doc.top_action?.title_en ?? '').toLowerCase();
        return summary.includes(q) || actionTitle.includes(q);
      });
    }

    // Sort
    if (sortBy === 'newest') {
      result.sort((a, b) => {
        const aTime = new Date(a.scraped_at ?? a.created_at).getTime();
        const bTime = new Date(b.scraped_at ?? b.created_at).getTime();
        return bTime - aTime;
      });
    } else if (sortBy === 'most_actions') {
      result.sort((a, b) => b.action_count - a.action_count);
    }
    // 'urgent' is the default sort from the server — no re-sort needed

    return result;
  }, [documents, selectedRegion, selectedDocType, sortBy, actionability, searchQuery]);

  const hasActiveFilter =
    !!selectedRegion ||
    !!selectedDocType ||
    sortBy !== 'urgent' ||
    actionability !== 'all' ||
    !!searchQuery.trim();

  function clearAllFilters() {
    setSelectedRegion('');
    setSelectedDocType('');
    setSortBy('urgent');
    setActionability('all');
    setSearchInput('');
    setSearchQuery('');
  }

  const selectClass =
    'appearance-none rounded-md border border-gray-200 bg-white pl-3 pr-8 py-2 text-sm text-gray-700 min-h-[44px]';
  const chevron = (
    <svg
      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  const pillBase =
    'px-3 py-1.5 text-sm rounded-full border transition-colors min-h-[36px]';
  const pillActive = 'bg-gray-900 text-white border-gray-900';
  const pillInactive = 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';

  return (
    <div>
      {/* ── Filters bar ───────────────────────────────────────────────── */}
      <div className="space-y-2 mb-2">
        {/* Row 1: Always-visible filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Country dropdown */}
          <div className="relative">
            <select
              value={selectedCountry}
              disabled
              className={`${selectClass} cursor-not-allowed`}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} disabled={!c.enabled}>
                  {c.enabled ? c.name : `${c.name} — ${tCommon('comingSoon')}`}
                </option>
              ))}
            </select>
            {chevron}
          </div>

          {/* County dropdown */}
          <div className="relative">
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className={selectClass}
            >
              <option value="">{t('filterAllCounties')}</option>
              {availableRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {chevron}
          </div>

          {/* Desktop-only: type, sort, actionability inline */}
          <div className="hidden md:contents">
            {/* Document type dropdown */}
            <div className="relative">
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className={selectClass}
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
              {chevron}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className={selectClass}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
              {chevron}
            </div>

            {/* Actionability pill toggle */}
            <div className="flex items-center gap-1">
              {(['all', 'can_act', 'info_only'] as Actionability[]).map((val) => {
                const labelKeys: Record<Actionability, string> = {
                  all: 'filterAll',
                  can_act: 'filterCanAct',
                  info_only: 'filterInfoOnly',
                };
                return (
                  <button
                    key={val}
                    onClick={() => setActionability(val)}
                    className={`${pillBase} ${actionability === val ? pillActive : pillInactive}`}
                  >
                    {t(labelKeys[val])}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile-only: "More filters" toggle */}
          <button
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className={`md:hidden flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm min-h-[44px] transition-colors ${
              mobileFiltersOpen || hiddenFilterCount > 0
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('moreFilters')}{hiddenFilterCount > 0 ? ` (${hiddenFilterCount})` : ''}
          </button>

          {/* Clear filters */}
          {hasActiveFilter && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 min-h-[44px]"
            >
              <X className="w-3.5 h-3.5" />
              {t('clearFilters')}
            </button>
          )}
        </div>

        {/* Row 2 (mobile only): Expanded filters */}
        {mobileFiltersOpen && (
          <div className="flex flex-wrap items-center gap-3 md:hidden">
            {/* Document type dropdown */}
            <div className="relative">
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className={selectClass}
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
              {chevron}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className={selectClass}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
              {chevron}
            </div>

            {/* Actionability pill toggle */}
            <div className="flex items-center gap-1">
              {(['all', 'can_act', 'info_only'] as Actionability[]).map((val) => {
                const labelKeys: Record<Actionability, string> = {
                  all: 'filterAll',
                  can_act: 'filterCanAct',
                  info_only: 'filterInfoOnly',
                };
                return (
                  <button
                    key={val}
                    onClick={() => setActionability(val)}
                    className={`${pillBase} ${actionability === val ? pillActive : pillInactive}`}
                  >
                    {t(labelKeys[val])}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search input — full width on mobile, grows on desktop */}
        <div className="relative w-full md:min-w-[200px] md:max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-md border border-gray-300 bg-white pl-9 pr-14 py-2 text-sm text-gray-700 min-h-[44px] placeholder:text-gray-400 focus:border-gray-400 focus:ring-1 focus:ring-gray-400 focus:outline-none"
          />
          {searchInput ? (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden md:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* ── Result count ──────────────────────────────────────────────── */}
      <p className="text-xs text-gray-400 mb-4">
        {hasActiveFilter
          ? t('showingOf', { count: filtered.length, total: documents.length })
          : t('showing', { count: documents.length })}
      </p>

      {/* ── 2-up card grid ────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((doc) => (
            <FeedCard key={doc.id} doc={doc} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">{t('noResults')}</p>
          <button
            onClick={clearAllFilters}
            className="mt-3 rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
          >
            {t('clearFilters')}
          </button>
        </div>
      )}
    </div>
  );
}
