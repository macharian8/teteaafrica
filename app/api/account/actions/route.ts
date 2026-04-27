import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse } from '@/lib/types';

export const runtime = 'nodejs';

interface ActionExecution {
  id: string;
  status: string;
  draft_content: string | null;
  created_at: string;
  action: {
    action_type: string;
    title_en: string;
    title_sw: string | null;
    analysis_id: string;
  } | null;
}

/**
 * GET /api/account/actions
 * Returns the current user's action executions with joined action + document data.
 */
export async function GET(): Promise<NextResponse<ApiResponse<ActionExecution[]>>> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('action_executions')
    .select(`
      id,
      status,
      draft_content,
      created_at,
      actions (
        action_type,
        title_en,
        title_sw,
        analysis_id
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ success: false, error: 'Failed to load actions' }, { status: 500 });
  }

  // Normalize the joined data
  const executions: ActionExecution[] = (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    draft_content: row.draft_content,
    created_at: row.created_at,
    action: Array.isArray(row.actions) ? row.actions[0] ?? null : row.actions,
  }));

  return NextResponse.json({ success: true, data: executions });
}
