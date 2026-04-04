/**
 * lib/notifications/matcher.ts
 * Post-analysis notification pipeline.
 *
 * After a document is stored and analysed, this function:
 * 1. Loads the analysis (regions, document_type, affected areas)
 * 2. Queries subscriptions matching country_code + region + topics
 * 3. Inserts a notifications row per matched subscriber (status='queued')
 *
 * Actual send functions (WhatsApp, SMS, email) are stubbed — wired in Sprint 4.
 *
 * Called from: scraper run scripts after each new document is analysed.
 * Entry point: queueNotificationsForDocument(documentId, analysisId, countryCode)
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import type { CountryCode } from '@/lib/types';

// ── Topic keyword mapping ────────────────────────────────────────────────────
// Maps document_type values to subscription topic tags.
// A subscriber is matched if any of their topics overlap.
const DOCUMENT_TYPE_TOPICS: Record<string, string[]> = {
  gazette_notice: ['general'],
  county_policy:  ['general', 'land', 'environment', 'budget'],
  parliamentary_bill: ['general'],
  budget:         ['budget'],
  tender:         ['tenders'],
  nema:           ['environment'],
  land:           ['land'],
  other:          ['general'],
};

export interface NotificationQueueResult {
  documentId: string;
  analysisId: string;
  notificationsQueued: number;
  subscribersMatched: number;
}

/**
 * Match a newly analysed document against active subscriptions and
 * create notification records for all matching subscribers.
 *
 * @param supabase     Service-role Supabase client
 * @param documentId   ID of the newly stored document
 * @param analysisId   ID of the completed analysis
 * @param countryCode  Country of the document
 */
export async function queueNotificationsForDocument(
  supabase: SupabaseClient,
  documentId: string,
  analysisId: string,
  countryCode: CountryCode
): Promise<NotificationQueueResult> {
  // ── 1. Load the analysis ─────────────────────────────────────────────────
  const { data: analysis, error: analysisErr } = await supabase
    .from('document_analyses')
    .select('document_type, summary_en, summary_sw, affected_region_l1, affected_region_l2, confidence_score')
    .eq('id', analysisId)
    .single();

  if (analysisErr || !analysis) {
    console.error(`[notifications] Failed to load analysis ${analysisId}:`, analysisErr?.message);
    return { documentId, analysisId, notificationsQueued: 0, subscribersMatched: 0 };
  }

  // Skip if low-confidence (confidence_score <= 0.3 — fallback row)
  if ((analysis.confidence_score ?? 0) <= 0.3) {
    console.log(`[notifications] Skipping low-confidence analysis ${analysisId}`);
    return { documentId, analysisId, notificationsQueued: 0, subscribersMatched: 0 };
  }

  // Capture fields into locals so nested closures can see narrowed types
  const safeAnalysis = analysis;
  const documentTopics = DOCUMENT_TYPE_TOPICS[safeAnalysis.document_type ?? 'other'] ?? ['general'];
  const affectedL1: string[] = (safeAnalysis.affected_region_l1 as string[]) ?? [];

  // ── 2. Query matching subscriptions ─────────────────────────────────────
  // Match on: country_code + (region overlap OR national) + topic overlap
  const { data: subscriptions, error: subErr } = await supabase
    .from('subscriptions')
    .select('id, user_id, region_l1, topics, channel, language_preference')
    .eq('country_code', countryCode)
    .eq('is_active', true);

  if (subErr || !subscriptions) {
    console.error('[notifications] Failed to load subscriptions:', subErr?.message);
    return { documentId, analysisId, notificationsQueued: 0, subscribersMatched: 0 };
  }

  // Filter in JS (avoids complex Postgres array-overlap queries for now)
  const matched = subscriptions.filter((sub) => {
    // Region match: if affectedL1 is empty = national = always match
    // Otherwise: match if sub.region_l1 is in the affected regions (or null = all regions)
    const regionMatch =
      affectedL1.length === 0 ||
      sub.region_l1 === null ||
      affectedL1.includes(sub.region_l1);

    // Topic match: intersection of subscriber topics and document topics
    const subTopics: string[] = (sub.topics as string[]) ?? [];
    const topicMatch = subTopics.length === 0 ||
      subTopics.some((t) => documentTopics.includes(t));

    return regionMatch && topicMatch;
  });

  if (matched.length === 0) {
    console.log(`[notifications] No subscribers matched for document ${documentId}`);
    return { documentId, analysisId, notificationsQueued: 0, subscribersMatched: 0 };
  }

  // ── 3. Build notification body ───────────────────────────────────────────
  // Use the appropriate language summary per subscriber preference.
  // Sprint 4 send functions will use the body field directly.
  function buildBody(langPref: string): string {
    const summary =
      langPref === 'sw' && safeAnalysis.summary_sw
        ? safeAnalysis.summary_sw
        : (safeAnalysis.summary_en ?? '');
    const truncated = summary.length > 500 ? `${summary.slice(0, 497)}…` : summary;
    return truncated || 'A new government document relevant to you has been published.';
  }

  // ── 4. Insert notifications (batch, max 100 at a time) ──────────────────
  const notificationRows = matched.map((sub) => ({
    user_id:     sub.user_id,
    country_code: countryCode,
    channel:     sub.channel,
    status:      'queued' as const,
    subject:     `New document: ${safeAnalysis.document_type ?? 'government notice'}`,
    body:        buildBody(sub.language_preference as string),
    document_id: documentId,
    action_id:   null,
  }));

  let totalInserted = 0;
  const BATCH_SIZE = 100;
  for (let i = 0; i < notificationRows.length; i += BATCH_SIZE) {
    const batch = notificationRows.slice(i, i + BATCH_SIZE);
    const { error: insertErr } = await supabase.from('notifications').insert(batch);
    if (insertErr) {
      console.error(`[notifications] Batch insert error (offset ${i}):`, insertErr.message);
    } else {
      totalInserted += batch.length;
    }
  }

  console.log(
    `[notifications] Queued ${totalInserted} notifications for document ${documentId} ` +
    `(${matched.length} subscribers matched)`
  );

  return {
    documentId,
    analysisId,
    notificationsQueued: totalInserted,
    subscribersMatched: matched.length,
  };
}

// ── Sprint 4 stubs ───────────────────────────────────────────────────────────
// These will be implemented in Sprint 4 with actual provider SDKs.
/* eslint-disable @typescript-eslint/no-unused-vars */

/** STUB: Send a WhatsApp message via Africa's Talking / WhatsApp Business API */
export async function sendWhatsAppNotification(
  notificationId: string,
  phoneNumber: string,
  body: string
): Promise<void> {
  void notificationId; void phoneNumber; void body;
  console.log(`[notifications:stub] sendWhatsApp called — wired in Sprint 4`);
}

/** STUB: Send an SMS via Africa's Talking */
export async function sendSmsNotification(
  notificationId: string,
  phoneNumber: string,
  body: string
): Promise<void> {
  void notificationId; void phoneNumber; void body;
  console.log(`[notifications:stub] sendSms called — wired in Sprint 4`);
}

/** STUB: Send an email notification */
export async function sendEmailNotification(
  notificationId: string,
  emailAddress: string,
  subject: string,
  body: string
): Promise<void> {
  void notificationId; void emailAddress; void subject; void body;
  console.log(`[notifications:stub] sendEmail called — wired in Sprint 4`);
}

/* eslint-enable @typescript-eslint/no-unused-vars */
