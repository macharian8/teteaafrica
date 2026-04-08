export const runtime = 'nodejs';

/**
 * POST /api/notifications/dispatch
 * Legacy pg_cron endpoint — delegates to the real processor.
 * Kept for backwards compatibility with existing pg_cron schedule.
 *
 * Auth: Bearer token (SCRAPER_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { processNotificationBatch } from '@/lib/notifications/processor';
import type { ApiResponse } from '@/lib/types';

interface DispatchResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<DispatchResult>>> {
  const token  = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  const secret = process.env.SCRAPER_SECRET;

  if (!secret || token !== secret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processNotificationBatch();

  return NextResponse.json({
    success: true,
    data: {
      processed: result.processed,
      succeeded: result.succeeded,
      failed:    result.failed,
    },
  });
}
