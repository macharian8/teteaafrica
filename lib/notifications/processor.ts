/**
 * lib/notifications/processor.ts
 * Notification queue processor — reads pending notifications and dispatches
 * to the correct channel (SMS, email, calendar).
 *
 * Called from:
 *   POST /api/notifications/process  — manual trigger / pg_cron
 *
 * Processing order per notification:
 *   1. Load notification + user (phone, email, language)
 *   2. Route to channel sender
 *   3. Update status → 'sent' (external_id stored) or 'failed'
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/notifications/sms';
import { sendEmail } from '@/lib/notifications/email';
// calendar invite: imported for future use in calendar channel routing
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { createCalendarInvite } from '@/lib/notifications/calendar';
import type { Database } from '@/lib/supabase/types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type UserRow = Database['public']['Tables']['users']['Row'];

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

const BATCH_SIZE = 50;

/**
 * Process a batch of queued notifications.
 * Fetches up to BATCH_SIZE rows with status='queued', dispatches each,
 * then updates the row status.
 */
export async function processNotificationBatch(limit = BATCH_SIZE): Promise<ProcessResult> {
  const supabase = createServiceRoleClient();
  const result: ProcessResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

  // Load queued notifications with the user's contact details
  const { data: notifications, error: fetchErr } = await supabase
    .from('notifications')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (fetchErr || !notifications || notifications.length === 0) {
    if (fetchErr) console.error('[processor] Fetch error:', fetchErr.message);
    return result;
  }

  // Load all unique user IDs in one query
  const userIds = [...new Set(notifications.map((n) => n.user_id))];
  const { data: users } = await supabase
    .from('users')
    .select('id, phone, email, language_preference, google_access_token, google_refresh_token')
    .in('id', userIds);

  const userMap = new Map<string, UserRow>(
    (users ?? []).map((u) => [u.id, u as UserRow])
  );

  for (const notification of notifications as NotificationRow[]) {
    result.processed++;
    const user = userMap.get(notification.user_id);

    if (!user) {
      console.warn(`[processor] No user found for notification ${notification.id}`);
      result.skipped++;
      continue;
    }

    let success = false;
    let externalId: string | undefined;
    let errorMsg: string | undefined;

    try {
      switch (notification.channel) {
        case 'sms': {
          const phone = user.phone;
          if (!phone) {
            errorMsg = 'User has no phone number';
            break;
          }
          const smsResult = await sendSMS(phone, notification.body, notification.country_code);
          success    = smsResult.success;
          externalId = smsResult.messageId;
          errorMsg   = smsResult.error;
          break;
        }

        case 'email': {
          const email = user.email;
          if (!email) {
            errorMsg = 'User has no email address';
            break;
          }
          const emailResult = await sendEmail({
            to:      email,
            subject: notification.subject ?? 'Tetea Africa — New Civic Alert',
            body:    notification.body,
            locale:  user.language_preference as 'en' | 'sw',
          });
          success    = emailResult.success;
          externalId = emailResult.emailId;
          errorMsg   = emailResult.error;
          break;
        }

        case 'whatsapp': {
          // WhatsApp delivery not yet implemented — skip without failing
          console.log(`[processor] WhatsApp not wired yet, skipping ${notification.id}`);
          result.skipped++;
          continue;
        }

        default: {
          errorMsg = `Unknown channel: ${notification.channel}`;
        }
      }
    } catch (err) {
      success  = false;
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    // Update notification status
    if (success) {
      await supabase
        .from('notifications')
        .update({
          status:      'sent',
          sent_at:     new Date().toISOString(),
          external_id: externalId ?? null,
        })
        .eq('id', notification.id);
      result.succeeded++;
      console.log(`[processor] Sent ${notification.channel} notification ${notification.id}`);
    } else {
      await supabase
        .from('notifications')
        .update({ status: 'failed' })
        .eq('id', notification.id);
      result.failed++;
      console.error(
        `[processor] Failed ${notification.channel} notification ${notification.id}: ${errorMsg}`
      );
    }
  }

  return result;
}

/**
 * Process deadline reminders.
 * Queries deadlines table for approaching deadlines and creates notification rows.
 *
 * Reminder windows: 7 days, 3 days, 1 day before deadline_date.
 * ATI escalation: if an ATI action_execution has status='submitted' and
 *   no response after 21 days, auto-queues a CAJ complaint draft notification.
 */
export async function processDeadlineReminders(): Promise<{ queued: number }> {
  const supabase = createServiceRoleClient();
  let queued = 0;

  const now = new Date();

  // Helper: days between now and a date
  function daysUntil(dateStr: string): number {
    const target = new Date(dateStr);
    return Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Load all unnotified deadlines
  const { data: deadlines, error } = await supabase
    .from('deadlines')
    .select('id, user_id, document_id, country_code, deadline_date, label, notified_7d, notified_3d, notified_1d')
    .gte('deadline_date', now.toISOString().split('T')[0]); // today or future

  if (error || !deadlines) {
    console.error('[deadlines] Failed to load deadlines:', error?.message);
    return { queued };
  }

  for (const dl of deadlines) {
    const days = daysUntil(dl.deadline_date);
    const notificationsToQueue: Array<{ flag: 'notified_7d' | 'notified_3d' | 'notified_1d'; window: string }> = [];

    if (days <= 7 && !dl.notified_7d)  notificationsToQueue.push({ flag: 'notified_7d', window: '7 days' });
    if (days <= 3 && !dl.notified_3d)  notificationsToQueue.push({ flag: 'notified_3d', window: '3 days' });
    if (days <= 1 && !dl.notified_1d)  notificationsToQueue.push({ flag: 'notified_1d', window: 'tomorrow' });

    for (const { flag, window } of notificationsToQueue) {
      // Get user's subscription channel preference
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('channel, language_preference')
        .eq('user_id', dl.user_id)
        .eq('country_code', dl.country_code)
        .eq('is_active', true)
        .maybeSingle();

      const channel  = sub?.channel ?? 'sms';
      const lang     = (sub?.language_preference as 'en' | 'sw') ?? 'en';
      const body     = lang === 'sw'
        ? `Kikumbusha: ${dl.label} — siku ${days} zimebaki (tarehe ${dl.deadline_date}).`
        : `Reminder: ${dl.label} — ${window} remaining (due ${dl.deadline_date}).`;

      const { error: insertErr } = await supabase.from('notifications').insert({
        user_id:     dl.user_id,
        country_code: dl.country_code,
        channel,
        status:      'queued',
        subject:     lang === 'sw' ? 'Kikumbusha cha Tarehe Muhimu' : 'Deadline Reminder',
        body,
        document_id: dl.document_id,
      });

      if (!insertErr) {
        // Mark the reminder flag so we don't re-queue it
        await supabase.from('deadlines').update({ [flag]: true }).eq('id', dl.id);
        queued++;
      } else {
        console.error(`[deadlines] Failed to queue reminder for deadline ${dl.id}:`, insertErr.message);
      }
    }
  }

  // ATI escalation: action_executions with type='ati_request', status='submitted', submitted 21+ days ago
  const cutoff = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const { data: staleAtis } = await supabase
    .from('action_executions')
    .select('id, user_id, country_code, action_id, executed_at')
    .eq('status', 'submitted')
    .lte('executed_at', cutoff);

  for (const ati of staleAtis ?? []) {
    // Check if we've already escalated this execution
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('action_id', ati.action_id)
      .eq('user_id', ati.user_id);

    if ((count ?? 0) > 0) continue; // already notified

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('channel, language_preference')
      .eq('user_id', ati.user_id)
      .eq('country_code', ati.country_code)
      .eq('is_active', true)
      .maybeSingle();

    const channel = sub?.channel ?? 'sms';
    const lang    = (sub?.language_preference as 'en' | 'sw') ?? 'en';
    const body    = lang === 'sw'
      ? 'Ombi lako la ATI halijapata jibu baada ya siku 21. Tunakusaidia kutoa malalamiko kwa CAJ.'
      : 'Your ATI request has received no response after 21 days. We can help you file a complaint with CAJ.';

    const { error: insertErr } = await supabase.from('notifications').insert({
      user_id:     ati.user_id,
      country_code: ati.country_code,
      channel,
      status:      'queued',
      subject:     lang === 'sw' ? 'Ombi la ATI — Hatua ya CAJ' : 'ATI Request — Escalate to CAJ',
      body,
      action_id:   ati.action_id,
    });

    if (!insertErr) {
      queued++;
      console.log(`[deadlines] Queued ATI escalation for execution ${ati.id}`);
    }
  }

  console.log(`[deadlines] Queued ${queued} deadline reminder notifications`);
  return { queued };
}
