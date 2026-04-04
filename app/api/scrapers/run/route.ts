export const runtime = 'nodejs';

/**
 * POST /api/scrapers/run
 * Internal webhook called by pg_cron to trigger scraper runs.
 *
 * Body: { scraper: 'gazette' | 'county-nairobi' | 'parliament', country: 'KE' }
 * Auth: Bearer token from Authorization header (matches SCRAPER_SECRET env var)
 *
 * Returns: { success, data: ScraperRunSummary }
 */

import { NextRequest, NextResponse } from 'next/server';
import { runGazetteScraper } from '@/lib/countries/KE/scrapers/gazette';
import { runNairobiCountyScraper } from '@/lib/countries/KE/scrapers/county-nairobi';
import { runParliamentScraper } from '@/lib/countries/KE/scrapers/parliament';
import type { ApiResponse } from '@/lib/types';
import type { ScraperRunSummary } from '@/lib/scrapers/base';

interface RunScraperBody {
  scraper: 'gazette' | 'county-nairobi' | 'parliament';
  country: string;
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<ScraperRunSummary>>> {
  // Authenticate — must match SCRAPER_SECRET env var
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

  // Only KE scrapers in Sprint 3
  if (country && country !== 'KE') {
    return NextResponse.json({ success: false, error: `Country ${country} not yet supported` }, { status: 400 });
  }

  try {
    let summary: ScraperRunSummary;

    switch (scraper) {
      case 'gazette':
        summary = await runGazetteScraper();
        break;
      case 'county-nairobi':
        summary = await runNairobiCountyScraper();
        break;
      case 'parliament':
        summary = await runParliamentScraper();
        break;
      default:
        return NextResponse.json(
          { success: false, error: `Unknown scraper: ${scraper}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scraper failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
