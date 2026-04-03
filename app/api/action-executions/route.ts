import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse } from '@/lib/types';

export const runtime = 'nodejs';

interface ExecuteBody {
  actionId: string;
  draft: string;
}

/**
 * POST /api/action-executions
 * Logs an action execution attempt.  The actual delivery (email, API call)
 * is handled by a future Sprint 4 worker; this route just records the intent.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ referenceId: string }>>> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: ExecuteBody;
  try {
    body = await request.json() as ExecuteBody;
    if (!body.actionId || !body.draft) {
      return NextResponse.json({ success: false, error: 'actionId and draft are required' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  // Verify the action exists
  const { data: action } = await supabase
    .from('actions')
    .select('id, country_code')
    .eq('id', body.actionId)
    .maybeSingle();

  if (!action) {
    return NextResponse.json({ success: false, error: 'Action not found' }, { status: 404 });
  }

  // Insert the execution record (status = 'submitted' — delivery is async)
  const referenceId = `TET-${Date.now().toString(36).toUpperCase()}`;
  const { error } = await supabase.from('action_executions').insert({
    action_id: body.actionId,
    user_id: user.id,
    country_code: action.country_code,
    status: 'submitted',
    draft_content: body.draft,
    reference_id: referenceId,
    executed_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ success: false, error: 'Failed to log execution' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { referenceId } });
}
