import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse } from '@/lib/types';
import type { Database } from '@/lib/supabase/types';

export const runtime = 'nodejs';

type Channel = Database['public']['Tables']['subscriptions']['Row']['channel'];

interface SubscriptionBody {
  country_code: string;
  region_l1: string | null;
  region_l2: string | null;
  topics: string[];
  channel: Channel;
  language_preference: string;
  consents: string[]; // action_types granted
  phone_number?: string | null;
}

interface SubscriptionData {
  subscription: Database['public']['Tables']['subscriptions']['Row'] | null;
  consents: string[]; // active action_types
  userContact: { email: string | null; phone: string | null };
}

/**
 * GET /api/subscriptions
 * Returns the current user's subscription settings + standing consents.
 */
export async function GET(): Promise<NextResponse<ApiResponse<SubscriptionData>>> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const [subResult, consentsResult, userResult] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('standing_consents')
      .select('action_type')
      .eq('user_id', user.id)
      .is('revoked_at', null),
    supabase
      .from('users')
      .select('email, phone')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  const consents = (consentsResult.data ?? []).map((r) => r.action_type);
  const userRow = userResult.data;

  return NextResponse.json({
    success: true,
    data: {
      subscription: subResult.data,
      consents,
      userContact: { email: userRow?.email ?? null, phone: userRow?.phone ?? null },
    },
  });
}

/**
 * POST /api/subscriptions
 * Upserts subscription + syncs standing consents + updates language_preference on users table.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ ok: true }>>> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: SubscriptionBody;
  try {
    body = await request.json() as SubscriptionBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  // 1. Upsert subscription — update existing or insert new
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('subscriptions')
      .update({
        country_code: body.country_code as 'KE' | 'TZ' | 'UG' | 'RW',
        region_l1: body.region_l1,
        region_l2: body.region_l2,
        topics: body.topics,
        channel: body.channel,
        language_preference: body.language_preference,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to update subscription' }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        country_code: body.country_code as 'KE' | 'TZ' | 'UG' | 'RW',
        region_l1: body.region_l1,
        region_l2: body.region_l2,
        topics: body.topics,
        channel: body.channel,
        language_preference: body.language_preference,
      });

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to create subscription' }, { status: 500 });
    }
  }

  // 2. Sync standing consents — fetch current, grant new, revoke removed
  const { data: currentConsents } = await supabase
    .from('standing_consents')
    .select('id, action_type, revoked_at')
    .eq('user_id', user.id);

  const CONSENT_TYPES = ['calendar_invite', 'ati_request', 'petition'] as const;
  type ConsentActionType = typeof CONSENT_TYPES[number];
  const grantedSet = new Set(body.consents);

  for (const actionType of CONSENT_TYPES) {
    const existing = (currentConsents ?? []).find((c) => c.action_type === actionType);
    const shouldGrant = grantedSet.has(actionType);

    if (shouldGrant && !existing) {
      // New consent — insert
      await supabase.from('standing_consents').insert({
        user_id: user.id,
        action_type: actionType as ConsentActionType,
      });
    } else if (shouldGrant && existing?.revoked_at) {
      // Re-grant a previously revoked consent
      await supabase
        .from('standing_consents')
        .update({ revoked_at: null, granted_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else if (!shouldGrant && existing && !existing.revoked_at) {
      // Revoke
      await supabase
        .from('standing_consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
  }

  // 3. Update language_preference (and phone if provided) on users table
  const userUpdate: Record<string, string> = { language_preference: body.language_preference };
  if (body.phone_number) {
    userUpdate.phone = body.phone_number;
  }
  await supabase
    .from('users')
    .update(userUpdate)
    .eq('id', user.id);

  return NextResponse.json({ success: true, data: { ok: true } });
}
