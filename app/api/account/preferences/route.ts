import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse, CountryCode } from '@/lib/types';

export const runtime = 'nodejs';

interface PreferencesBody {
  county?: string | null;
  topics?: string[];
  email_notifications?: boolean;
  sms_notifications?: boolean;
  phone?: string | null;
  language_preference?: string;
}

/**
 * PATCH /api/account/preferences
 * Updates subscription preferences (county, topics, notifications, language).
 */
export async function PATCH(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ ok: true }>>> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: PreferencesBody;
  try {
    body = await request.json() as PreferencesBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const countryCode: CountryCode = 'KE';

  // Build subscription update
  const subUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.county !== undefined) subUpdate.region_l1 = body.county;
  if (body.topics !== undefined) subUpdate.topics = body.topics;
  if (body.email_notifications !== undefined || body.sms_notifications !== undefined) {
    const email = body.email_notifications ?? true;
    const sms = body.sms_notifications ?? false;
    subUpdate.channel = email && sms ? 'both' : sms ? 'sms' : 'email';
  }
  if (body.language_preference) subUpdate.language_preference = body.language_preference;

  // Upsert subscription
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('subscriptions')
      .update(subUpdate)
      .eq('id', existing.id);
  } else {
    await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        country_code: countryCode,
        region_l1: (body.county as string) || null,
        topics: body.topics || [],
        channel: 'email',
        language_preference: body.language_preference || 'en',
        ...subUpdate,
      });
  }

  // Update language_preference + phone on users table too
  const userUpdate: Record<string, unknown> = {};
  if (body.language_preference) userUpdate.language_preference = body.language_preference;
  if (body.phone !== undefined) userUpdate.phone = body.phone || null;

  if (Object.keys(userUpdate).length > 0) {
    await supabase.from('users').update(userUpdate).eq('id', user.id);
  }

  return NextResponse.json({ success: true, data: { ok: true } });
}
