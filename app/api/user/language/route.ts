import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse } from '@/lib/types';

export const runtime = 'nodejs';

const ALLOWED_LOCALES = ['en', 'sw', 'fr', 'lg', 'rw'];

/** PATCH /api/user/language — persist language_preference to users table. */
export async function PATCH(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let language: string;
  try {
    const body = await request.json() as { language?: unknown };
    if (typeof body.language !== 'string' || !ALLOWED_LOCALES.includes(body.language)) {
      return NextResponse.json({ success: false, error: 'Invalid language' }, { status: 400 });
    }
    language = body.language;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const { error } = await supabase
    .from('users')
    .update({ language_preference: language })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ success: false, error: 'Failed to update preference' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
