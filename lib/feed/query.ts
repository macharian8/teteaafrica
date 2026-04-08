/**
 * lib/feed/query.ts
 * Subscription-matched document feed query.
 *
 * Documents are sorted by citizen consequence:
 *   Primary:   soonest deadline first (nulls last)
 *   Secondary: most recent scraped_at / created_at
 *
 * Each FeedDocument carries pre-computed:
 *   action_count, execution_count, soonest_deadline, top_action
 *
 * For general (unauthenticated) feed: latest KE docs with ≥1 action.
 * For subscription feed: country_code + region + topic match, same sort.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CountryCode } from '@/lib/types';

const PAGE_SIZE = 20;
// Fetch generously so JS sort+filter leaves enough for the requested page.
// Uses .limit() from offset 0 so sorting across the whole recent window is correct.
const FETCH_LIMIT = 200;

// ── Public types ──────────────────────────────────────────────────────────────

export interface FeedAction {
  id: string;
  action_type: string;
  executability: 'auto' | 'scaffolded' | 'inform_only';
  title_en: string;
  title_sw: string | null;
  description_en: string | null;
  deadline: string | null;
}

export interface FeedDocument {
  id: string;
  url: string | null;
  source: 'manual' | 'scraper' | 'whatsapp';
  created_at: string;
  scraped_at: string | null;
  analysis: {
    id: string;
    document_type: string | null;
    summary_en: string | null;
    summary_sw: string | null;
    affected_region_l1: string[] | null;
    confidence_score: number | null;
  };
  /** Number of actions available for this document */
  action_count: number;
  /** Total action_executions across all actions (social proof) */
  execution_count: number;
  /** Earliest deadline across all actions, or null */
  soonest_deadline: string | null;
  /** Best actionable action (auto > scaffolded > first) */
  top_action: FeedAction | null;
}

export interface FeedResult {
  documents: FeedDocument[];
  page: number;
  hasMore: boolean;
  /** True when docs exist in DB but have no analyses yet (show processing state) */
  hasDocumentsBeingProcessed: boolean;
  /** region_l1 from user's first subscription, for personalised header */
  userRegion: string | null;
}

// ── Internal raw types ────────────────────────────────────────────────────────

type RawExecution = { id: string };

type RawAction = {
  id: string;
  action_type: string;
  executability: string;
  title_en: string;
  title_sw: string | null;
  description_en: string | null;
  deadline: string | null;
  // action_executions may be undefined if FK not resolvable — degrade gracefully
  action_executions?: RawExecution[];
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type RawAnalysis = {
  id: string;
  document_type: string | null;
  summary_en: string | null;
  summary_sw: string | null;
  affected_region_l1: string[] | null;
  confidence_score: number | null;
  actions: RawAction[];
};

// ── Query string ──────────────────────────────────────────────────────────────

const FEED_SELECT = `
  id,
  url,
  source,
  created_at,
  scraped_at,
  document_analyses (
    id,
    document_type,
    summary_en,
    summary_sw,
    affected_region_l1,
    confidence_score,
    actions (
      id,
      action_type,
      executability,
      title_en,
      title_sw,
      description_en,
      deadline,
      action_executions ( id )
    )
  )
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickTopAction(actions: RawAction[]): FeedAction | null {
  if (actions.length === 0) return null;
  const auto = actions.find((a) => a.executability === 'auto');
  const scaffolded = actions.find((a) => a.executability === 'scaffolded');
  const best = auto ?? scaffolded ?? actions[0];
  return {
    id: best.id,
    action_type: best.action_type,
    executability: best.executability as FeedAction['executability'],
    title_en: best.title_en,
    title_sw: best.title_sw,
    description_en: best.description_en,
    deadline: best.deadline,
  };
}

function computeSoonestDeadline(actions: RawAction[]): string | null {
  const dates = actions
    .map((a) => a.deadline)
    .filter((d): d is string => !!d)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return dates[0] ?? null;
}

function sortByConsequence(docs: FeedDocument[]): FeedDocument[] {
  return [...docs].sort((a, b) => {
    // Primary: soonest deadline first (nulls last)
    if (a.soonest_deadline && b.soonest_deadline) {
      return new Date(a.soonest_deadline).getTime() - new Date(b.soonest_deadline).getTime();
    }
    if (a.soonest_deadline && !b.soonest_deadline) return -1;
    if (!a.soonest_deadline && b.soonest_deadline) return 1;
    // Secondary: most recent scraped_at / created_at
    const aTime = new Date(a.scraped_at ?? a.created_at).getTime();
    const bTime = new Date(b.scraped_at ?? b.created_at).getTime();
    return bTime - aTime;
  });
}

/**
 * Shape raw Supabase rows into FeedDocument[].
 * Applies optional region/topic filters and requireActions guard.
 */
function shapeDocs(
  docs: Array<Record<string, unknown>>,
  regions: string[],
  topics: string[],
  requireActions: boolean,
): FeedDocument[] {
  const result: FeedDocument[] = [];

  for (const doc of docs) {
    // const analysesArr = doc.document_analyses as unknown as RawAnalysis[];
    // if (!analysesArr || analysesArr.length === 0) continue;
    const rawAnalysis = doc.document_analyses;
    if (!rawAnalysis) continue;
    const analysesArr = Array.isArray(rawAnalysis) ? rawAnalysis : [rawAnalysis];
    if (analysesArr.length === 0) continue;
    const a = analysesArr[0];
    const actions = a.actions ?? [];

    if (requireActions && actions.length === 0) continue;

    // Region filter (only applied when subscriber has a region preference)
    if (regions.length > 0) {
      const docRegions = a.affected_region_l1 ?? [];
      const isNational = docRegions.length === 0;
      const regionMatch = isNational || docRegions.some((r: string) => regions.includes(r));
      if (!regionMatch) continue;
    }

    // Topic filter (only applied when subscriber has topic preferences)
    if (topics.length > 0 && a.document_type) {
      const docTopic = a.document_type.split('_')[0];
      if (!topics.includes(docTopic) && !topics.includes('general')) continue;
    }

    const executionCount = actions.reduce(
      (sum: number, action: RawAction) => sum + (action.action_executions?.length ?? 0),
      0,
    );

    result.push({
      id: doc.id as string,
      url: doc.url as string | null,
      source: doc.source as FeedDocument['source'],
      created_at: doc.created_at as string,
      scraped_at: doc.scraped_at as string | null,
      analysis: {
        id: a.id,
        document_type: a.document_type,
        summary_en: a.summary_en,
        summary_sw: a.summary_sw,
        affected_region_l1: a.affected_region_l1,
        confidence_score: a.confidence_score,
      },
      action_count: actions.length,
      execution_count: executionCount,
      soonest_deadline: computeSoonestDeadline(actions),
      top_action: pickTopAction(actions),
    });
  }

  return sortByConsequence(result);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * General feed: latest analysed KE documents with ≥1 action.
 * Used for unauthenticated visitors and authed users without subscriptions.
 */
export async function getGeneralFeed(
  page = 1,
  countryCode: CountryCode = 'KE',
): Promise<FeedResult> {
  const supabase = await createServerSupabaseClient();

  const { data: docs, error } = await supabase
    .from('documents')
    .select(FEED_SELECT)
    .eq('country_code', countryCode)
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT);
  // ADD THIS:
  console.log('[feed debug] docs count:', docs?.length);
  console.log('[feed debug] first doc raw:', JSON.stringify(docs?.[0], null, 2));
  console.log('[feed debug] error:', error);
  
  if (error || !docs) {
    console.error('[feed] General feed error:', error?.message);
    return { documents: [], page, hasMore: false, hasDocumentsBeingProcessed: false, userRegion: null };
  }

  const shaped = shapeDocs(
    docs as unknown as Array<Record<string, unknown>>,
    [],
    [],
    true,
  );

  // Detect "documents exist but none analysed yet" for better empty state
  let hasDocumentsBeingProcessed = false;
  if (shaped.length === 0) {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('country_code', countryCode);
    hasDocumentsBeingProcessed = (count ?? 0) > 0;
  }

  const offset = (page - 1) * PAGE_SIZE;
  return {
    documents: shaped.slice(offset, offset + PAGE_SIZE),
    page,
    hasMore: shaped.length > offset + PAGE_SIZE,
    hasDocumentsBeingProcessed,
    userRegion: null,
  };
}

/**
 * Subscription-matched feed.
 * Returns null (not empty) when the user has no active subscriptions —
 * so the caller can distinguish "no subs" from "subs with no matches".
 */
export async function getFeedDocuments(
  userId: string,
  page = 1,
): Promise<FeedResult | null> {
  const supabase = await createServerSupabaseClient();

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('country_code, region_l1, topics')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!subs || subs.length === 0) return null;

  const countryCodes = [...new Set(subs.map((s) => s.country_code))];
  const regions = [...new Set(subs.flatMap((s) => (s.region_l1 ? [s.region_l1] : [])))];
  const topics = [...new Set(subs.flatMap((s) => s.topics ?? []))];
  const userRegion = regions[0] ?? null;

  const { data: docs, error } = await supabase
    .from('documents')
    .select(FEED_SELECT)
    .in('country_code', countryCodes)
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT);

  if (error || !docs) {
    console.error('[feed] Query error:', error?.message);
    return { documents: [], page, hasMore: false, hasDocumentsBeingProcessed: false, userRegion };
  }

  const shaped = shapeDocs(
    docs as unknown as Array<Record<string, unknown>>,
    regions,
    topics,
    true,
  );

  // Check processing state for subscription feed too
  let hasDocumentsBeingProcessed = false;
  if (shaped.length === 0) {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('country_code', countryCodes);
    hasDocumentsBeingProcessed = (count ?? 0) > 0;
  }

  const offset = (page - 1) * PAGE_SIZE;
  return {
    documents: shaped.slice(offset, offset + PAGE_SIZE),
    page,
    hasMore: shaped.length > offset + PAGE_SIZE,
    hasDocumentsBeingProcessed,
    userRegion,
  };
}
