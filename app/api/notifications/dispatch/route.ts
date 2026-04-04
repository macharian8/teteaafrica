export const runtime = 'nodejs';

/**
 * POST /api/notifications/dispatch
 * Called by pg_cron every 5 minutes to process queued notifications.
 *
 * Sprint 3: stub — marks queued notifications as 'sent' without actually sending.
 * Sprint 4: wire in WhatsApp, SMS, email send functions.
 *
 * Auth: Bearer token (SCRAPER_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ApiResponse } from '@/lib/types';

const BATCH_SIZE = 50;

interface DispatchResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<DispatchResult>>> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const secret = process.env.SCRAPER_SECRET;

  if (!secret || token !== secret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Load a batch of queued notifications
  const { data: notifications, error: fetchErr } = await supabase
    .from('notifications')
    .select('id, channel, body, subject')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr || !notifications) {
    return NextResponse.json({ success: false, error: fetchErr?.message ?? 'Fetch failed' }, { status: 500 });
  }

  if (notifications.length === 0) {
    return NextResponse.json({ success: true, data: { processed: 0, succeeded: 0, failed: 0 } });
  }

  let succeeded = 0;
  let failed    = 0;

  for (const notification of notifications) {
    try {
      // STUB: In Sprint 4, dispatch based on notification.channel
      // e.g. sendWhatsAppNotification / sendSmsNotification / sendEmailNotification
      console.log(`[dispatch:stub] Would send ${notification.channel} notification ${notification.id}`);

      // Mark as 'sent' (stub — no actual delivery)
      await supabase
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notification.id);

      succeeded++;
    } catch (err) {
      failed++;
      console.error(`[dispatch] Failed to process notification ${notification.id}:`, err);
      await supabase
        .from('notifications')
        .update({ status: 'failed' })
        .eq('id', notification.id);
    }
  }

  return NextResponse.json({
    success: true,
    data: { processed: notifications.length, succeeded, failed },
  });
}
