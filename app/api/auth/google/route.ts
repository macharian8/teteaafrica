export const runtime = 'nodejs';

/**
 * GET /api/auth/google
 * Initiate Google OAuth2 flow for Calendar access.
 *
 * Query params:
 *   userId — the Supabase user ID (stored in OAuth state for callback)
 *
 * Redirects the user to Google's OAuth consent screen.
 * Only triggered when a user initiates calendar connection from the UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleAuthUrl } from '@/lib/notifications/calendar';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 503 });
  }

  // Encode userId in state so the callback can retrieve it
  const state   = Buffer.from(JSON.stringify({ userId })).toString('base64url');
  const authUrl = buildGoogleAuthUrl(state);

  return NextResponse.redirect(authUrl);
}
