/**
 * app/api/feed/route.ts
 * GET /api/feed?page=1
 * Public endpoint — returns general feed for unauthenticated users,
 * subscription-matched feed for authenticated users with subscriptions,
 * or general feed for authenticated users without subscriptions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getFeedDocuments, getGeneralFeed } from '@/lib/feed/query';

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10) || 1);

  if (!user) {
    const result = await getGeneralFeed(page);
    return NextResponse.json({ success: true, data: result });
  }

  const matched = await getFeedDocuments(user.id, page);
  if (matched === null) {
    // No subscriptions — fall back to general feed
    const result = await getGeneralFeed(page);
    return NextResponse.json({ success: true, data: { ...result, hasSubscriptions: false } });
  }

  return NextResponse.json({ success: true, data: matched });
}
