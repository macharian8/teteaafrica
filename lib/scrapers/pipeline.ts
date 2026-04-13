/**
 * lib/scrapers/pipeline.ts
 * Orchestrates scraper → analysis pipeline.
 *
 * A) runFullPipeline(scraperName) — scrape then analyze new documents
 * B) runHistoricalAnalysis(limit) — analyze old unanalyzed documents
 */

import { buildScraperSupabaseClient } from '@/lib/scrapers/dedup';
import { sleep } from '@/lib/scrapers/base';
import { analyzeDocument } from '@/lib/analysis/analyzeDocument';
import type { ScraperRunSummary } from '@/lib/scrapers/base';
import type { CountryCode } from '@/lib/types';

const ANALYSIS_DELAY_MS = 5_000; // 5 seconds between analysis calls

export interface PipelineResult {
  scraped: ScraperRunSummary;
  analyzed: number;
  skipped: number;
  errors: number;
}

export interface HistoricalResult {
  analyzed: number;
  skipped: number;
  errors: number;
}

/**
 * Query documents that need analysis.
 * @param recentOnly — if true, only documents created in the last 2 hours
 */
async function getUnanalyzedDocuments(
  supabase: ReturnType<typeof buildScraperSupabaseClient>,
  recentOnly: boolean,
  limit: number
) {
  let query = supabase
    .from('documents')
    .select('id, raw_text, country_code')
    .not('raw_text', 'is', null);

  if (recentOnly) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', twoHoursAgo);
  }

  const { data: docs, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[pipeline] Error querying documents:', error.message);
    return [];
  }

  // Filter in application: raw_text length > 500, and not already analyzed
  const candidates = (docs ?? []).filter(
    (d) => d.raw_text && d.raw_text.length > 500
  );

  if (candidates.length === 0) return [];

  // Check which already have a good analysis
  const ids = candidates.map((d) => d.id);
  const { data: analyzed } = await supabase
    .from('document_analyses')
    .select('document_id')
    .in('document_id', ids)
    .gt('confidence_score', 0.3);

  const analyzedIds = new Set((analyzed ?? []).map((a) => a.document_id));

  return candidates.filter((d) => !analyzedIds.has(d.id));
}

/**
 * A) Run a named scraper, then analyze all newly scraped documents.
 */
export type ScraperName = 'gazette' | 'nairobi' | 'parliament' | 'county-mombasa' | 'county-kisumu' | 'county-nakuru' | 'county-kisii';

export async function runFullPipeline(
  scraperName: ScraperName
): Promise<PipelineResult> {
  // Run the scraper
  let scraperSummary: ScraperRunSummary;
  switch (scraperName) {
    case 'gazette': {
      const { runGazetteScraper } = await import('@/lib/countries/KE/scrapers/gazette');
      scraperSummary = await runGazetteScraper();
      break;
    }
    case 'nairobi': {
      const { runNairobiCountyScraper } = await import('@/lib/countries/KE/scrapers/county-nairobi');
      scraperSummary = await runNairobiCountyScraper();
      break;
    }
    case 'parliament': {
      const { runParliamentScraper } = await import('@/lib/countries/KE/scrapers/parliament');
      scraperSummary = await runParliamentScraper();
      break;
    }
    case 'county-mombasa': {
      const { runMombasaCountyScraper } = await import('@/lib/countries/KE/scrapers/county-mombasa');
      scraperSummary = await runMombasaCountyScraper();
      break;
    }
    case 'county-kisumu': {
      const { runKisumuCountyScraper } = await import('@/lib/countries/KE/scrapers/county-kisumu');
      scraperSummary = await runKisumuCountyScraper();
      break;
    }
    case 'county-nakuru': {
      const { runNakuruCountyScraper } = await import('@/lib/countries/KE/scrapers/county-nakuru');
      scraperSummary = await runNakuruCountyScraper();
      break;
    }
    case 'county-kisii': {
      const { runKisiiCountyScraper } = await import('@/lib/countries/KE/scrapers/county-kisii');
      scraperSummary = await runKisiiCountyScraper();
      break;
    }
  }

  console.log(`[pipeline] scraper=${scraperName} new=${scraperSummary.inserted} skipped=${scraperSummary.skipped}`);

  // Find documents to analyze (recently created, unanalyzed)
  const supabase = buildScraperSupabaseClient();
  const toAnalyze = await getUnanalyzedDocuments(supabase, true, 50);

  console.log(`[pipeline] scraper=${scraperName} new=${scraperSummary.inserted} analyzing=${toAnalyze.length} skipped=${scraperSummary.skipped}`);

  let analyzed = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of toAnalyze) {
    try {
      const result = await analyzeDocument({
        documentId: doc.id,
        rawText: doc.raw_text!,
        countryCode: (doc.country_code ?? 'KE') as CountryCode,
      });

      if (result.alreadyExisted) {
        skipped++;
        console.log(`[pipeline] Skipped (already analyzed): ${doc.id}`);
      } else {
        analyzed++;
        console.log(`[pipeline] Analyzed: ${doc.id} confidence=${result.result.confidence_score}`);
      }
    } catch (err) {
      errors++;
      console.error(`[pipeline] Analysis error for ${doc.id}:`, err instanceof Error ? err.message : err);
    }

    // Rate limit buffer between analysis calls
    if (toAnalyze.indexOf(doc) < toAnalyze.length - 1) {
      await sleep(ANALYSIS_DELAY_MS);
    }
  }

  console.log(`[pipeline] Pipeline complete: scraped=${scraperSummary.inserted} analyzed=${analyzed} skipped=${skipped} errors=${errors}`);

  return {
    scraped: scraperSummary,
    analyzed,
    skipped,
    errors,
  };
}

/**
 * B) Analyze historical documents that have no analysis yet.
 */
export async function runHistoricalAnalysis(
  limit = 20
): Promise<HistoricalResult> {
  const supabase = buildScraperSupabaseClient();
  const toAnalyze = await getUnanalyzedDocuments(supabase, false, limit);

  console.log(`[pipeline] Historical analysis: ${toAnalyze.length} documents to process (limit=${limit})`);

  let analyzed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toAnalyze.length; i++) {
    const doc = toAnalyze[i];
    console.log(`[pipeline] [${i + 1}/${toAnalyze.length}] Analyzing document ${doc.id}...`);

    try {
      const result = await analyzeDocument({
        documentId: doc.id,
        rawText: doc.raw_text!,
        countryCode: (doc.country_code ?? 'KE') as CountryCode,
      });

      if (result.alreadyExisted) {
        skipped++;
        console.log(`[pipeline] [${i + 1}/${toAnalyze.length}] Skipped (already analyzed): ${doc.id}`);
      } else {
        analyzed++;
        console.log(`[pipeline] [${i + 1}/${toAnalyze.length}] Done: ${doc.id} confidence=${result.result.confidence_score}`);
      }
    } catch (err) {
      errors++;
      console.error(`[pipeline] [${i + 1}/${toAnalyze.length}] Error for ${doc.id}:`, err instanceof Error ? err.message : err);
    }

    // Rate limit buffer between analysis calls
    if (i < toAnalyze.length - 1) {
      await sleep(ANALYSIS_DELAY_MS);
    }
  }

  console.log(`[pipeline] Historical analysis complete: analyzed=${analyzed} skipped=${skipped} errors=${errors}`);

  return { analyzed, skipped, errors };
}
