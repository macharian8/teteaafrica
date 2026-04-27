import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse, CountryCode } from '@/lib/types';

export const runtime = 'nodejs';

interface OnboardingBody {
  county: string | null;
  topics: string[];
  email_notifications: boolean;
  sms_notifications: boolean;
  phone: string | null;
  full_name: string | null;
  national_id: string | null;
  ward: string | null;
  language_preference: string;
}

/**
 * POST /api/onboarding
 * Saves all 4 onboarding steps, sets onboarding_completed = true.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ ok: true }>>> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: OnboardingBody;
  try {
    body = await request.json() as OnboardingBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  // 1. Update user profile fields + mark onboarding complete
  const userUpdate: Record<string, unknown> = {
    onboarding_completed: true,
    language_preference: body.language_preference || 'en',
  };
  if (body.full_name) userUpdate.full_name = body.full_name;
  if (body.national_id) userUpdate.national_id = body.national_id;
  if (body.ward) userUpdate.ward = body.ward;
  if (body.phone) userUpdate.phone = body.phone;

  const { error: userError } = await supabase
    .from('users')
    .update(userUpdate)
    .eq('id', user.id);

  if (userError) {
    return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 });
  }

  // 2. Upsert subscription with onboarding preferences
  const channel: 'email' | 'sms' | 'both' = body.email_notifications && body.sms_notifications
    ? 'both'
    : body.sms_notifications ? 'sms' : 'email';

  const countryCode: CountryCode = 'KE';

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const subData = {
    country_code: countryCode,
    region_l1: body.county,
    region_l2: body.ward,
    topics: body.topics,
    channel,
    language_preference: body.language_preference || 'en',
  };

  if (existing) {
    await supabase
      .from('subscriptions')
      .update({ ...subData, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('subscriptions')
      .insert({ user_id: user.id, ...subData });
  }

  return NextResponse.json({ success: true, data: { ok: true } });
}
