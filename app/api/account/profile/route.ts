import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse } from '@/lib/types';

export const runtime = 'nodejs';

interface ProfileBody {
  full_name?: string | null;
  national_id?: string | null;
  ward?: string | null;
  phone?: string | null;
  one_click_consent?: boolean;
}

/**
 * PATCH /api/account/profile
 * Updates user profile fields (full_name, national_id, ward, phone).
 */
export async function PATCH(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ ok: true }>>> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: ProfileBody;
  try {
    body = await request.json() as ProfileBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.full_name !== undefined) update.full_name = body.full_name || null;
  if (body.national_id !== undefined) update.national_id = body.national_id || null;
  if (body.ward !== undefined) update.ward = body.ward || null;
  if (body.phone !== undefined) update.phone = body.phone || null;
  if (body.one_click_consent !== undefined) update.one_click_consent = body.one_click_consent;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true, data: { ok: true } });
  }

  const { error } = await supabase
    .from('users')
    .update(update)
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { ok: true } });
}
