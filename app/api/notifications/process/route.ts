export const runtime = 'nodejs';

/**
 * POST /api/notifications/process
 * Manual trigger for the notification processor (also called by pg_cron).
 *
 * Processes queued notifications AND deadline reminders in one call.
 *
 * Auth: Bearer token (SCRAPER_SECRET — reusing the same internal-service secret)
 */

import { NextRequest, NextResponse } from 'next/server';
import { processNotificationBatch, processDeadlineReminders } from '@/lib/notifications/processor';
import type { ApiResponse } from '@/lib/types';

interface ProcessResponse {
  notifications: { processed: number; succeeded: number; failed: number; skipped: number };
  deadlineReminders: { queued: number };
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<ProcessResponse>>> {
  const token  = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
  const secret = process.env.SCRAPER_SECRET;

  if (!secret || token !== secret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const [notifResult, deadlineResult] = await Promise.all([
    processNotificationBatch(),
    processDeadlineReminders(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      notifications:    notifResult,
      deadlineReminders: deadlineResult,
    },
  });
}
