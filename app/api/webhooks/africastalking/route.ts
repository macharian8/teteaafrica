export const runtime = 'nodejs';

/**
 * POST /api/webhooks/africastalking
 * Africa's Talking SMS delivery receipt callback.
 *
 * AT posts a URL-encoded form when a message status changes.
 * Payload fields: id, status, phoneNumber, networkCode, failureReason (optional)
 *
 * Configure this URL in the AT Dashboard:
 *   Sandbox → SMS → Delivery Reports → Callback URL
 *   https://your-domain.com/api/webhooks/africastalking
 *
 * No auth header from AT — we trust the payload shape + validate `id` exists.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// AT status values that mean final delivery
const DELIVERED_STATUSES = new Set(['Success', 'DeliveredToTerminal', 'DeliveredToNetwork']);
const FAILED_STATUSES    = new Set(['Failed', 'InvalidPhoneNumber', 'InsufficientCredit',
                                    'UserInBlacklist', 'CouldNotRoute', 'RiskHold',
                                    'AbsentSubscriber', 'UserAccountSuspended']);

export async function POST(req: NextRequest): Promise<NextResponse> {
  // AT sends URL-encoded form data
  let id = '';
  let status = '';

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    id     = params.get('id') ?? '';
    status = params.get('status') ?? '';
  } else {
    // Accept JSON too (AT sandbox sometimes sends JSON)
    try {
      const body = await req.json() as Record<string, string>;
      id     = body.id ?? '';
      status = body.status ?? '';
    } catch {
      return NextResponse.json({ error: 'Unrecognised payload' }, { status: 400 });
    }
  }

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  // Map AT status to our notifications.status enum
  let newStatus: 'delivered' | 'failed' | null = null;
  if (DELIVERED_STATUSES.has(status)) newStatus = 'delivered';
  else if (FAILED_STATUSES.has(status))   newStatus = 'failed';

  if (!newStatus) {
    // Intermediate state (e.g. "MessageWaiting") — acknowledge without updating
    return NextResponse.json({ ok: true, status: 'ignored' });
  }

  // Update the notification row whose external messageId matches
  // We store the AT messageId in a separate column (added in migration below).
  // If no row found, log and return 200 — AT retries on non-2xx.
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from('notifications')
    .update({
      status: newStatus,
      ...(newStatus === 'delivered' ? { sent_at: new Date().toISOString() } : {}),
    })
    .eq('external_id', id);

  if (error) {
    console.error('[webhook:at] Failed to update notification:', error.message);
    // Return 200 so AT doesn't retry indefinitely
  }

  return NextResponse.json({ ok: true });
}
