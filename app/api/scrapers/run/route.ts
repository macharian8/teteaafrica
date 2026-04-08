export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for pipeline (scrape + analyze)

/**
 * POST /api/scrapers/run
 * Internal webhook called by pg_cron to trigger scraper pipeline runs.
 *
 * Body: { scraper: 'gazette' | 'county-nairobi' | 'parliament' | 'historical', country?: 'KE' }
 * Auth: Bearer token from Authorization header (matches SCRAPER_SECRET env var)
 *
 * Returns 200 immediately for pipeline runs, processes in background.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runFullPipeline, runHistoricalAnalysis } from '@/lib/scrapers/pipeline';
import type { ApiResponse } from '@/lib/types';

interface RunScraperBody {
  scraper: 'gazette' | 'county-nairobi' | 'parliament' | 'historical';
  country?: string;
}

// Map cron body scraper names to pipeline scraper names
const SCRAPER_MAP: Record<string, 'gazette' | 'nairobi' | 'parliament'> = {
  'gazette': 'gazette',
  'county-nairobi': 'nairobi',
  'parliament': 'parliament',
};

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<{ message: string }>>> {
  // Authenticate
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const secret = process.env.SCRAPER_SECRET;

  if (!secret || token !== secret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: RunScraperBody;
  try {
    body = (await req.json()) as RunScraperBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { scraper, country } = body;
  if (!scraper) {
    return NextResponse.json({ success: false, error: 'scraper field is required' }, { status: 400 });
  }

  // Only KE scrapers supported
  if (country && country !== 'KE') {
    return NextResponse.json({ success: false, error: `Country ${country} not yet supported` }, { status: 400 });
  }

  if (scraper === 'historical') {
    // Run historical analysis in background, return immediately
    runHistoricalAnalysis(20).catch((err) => {
      console.error('[api/scrapers/run] Historical analysis error:', err);
    });
    return NextResponse.json({
      success: true,
      data: { message: 'Historical analysis started in background' },
    });
  }

  const pipelineName = SCRAPER_MAP[scraper];
  if (!pipelineName) {
    return NextResponse.json(
      { success: false, error: `Unknown scraper: ${scraper}` },
      { status: 400 }
    );
  }

  // Run full pipeline (scrape + analyze) — fire and forget for cron
  // but await for direct API calls (pg_cron doesn't wait for response anyway)
  try {
    const result = await runFullPipeline(pipelineName);
    return NextResponse.json({
      success: true,
      data: {
        message: `Pipeline complete: scraped=${result.scraped.inserted} analyzed=${result.analyzed} errors=${result.errors}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pipeline failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
