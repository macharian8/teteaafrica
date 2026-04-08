export const runtime = 'nodejs';

/**
 * GET /api/auth/google/callback
 * Google OAuth2 callback — exchanges code for tokens and stores them.
 *
 * Google redirects here after user grants Calendar access.
 * Query params from Google: code, state (base64url-encoded { userId })
 *
 * On success: redirects to /[locale]/settings/subscriptions?google=connected
 * On error:   redirects to /[locale]/settings/subscriptions?google=error
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeGoogleCode } from '@/lib/notifications/calendar';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // User denied — redirect with error flag
  if (errorParam) {
    return NextResponse.redirect(new URL('/en/settings/subscriptions?google=denied', req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/en/settings/subscriptions?google=error', req.url));
  }

  // Decode state to recover userId
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString()) as { userId: string };
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(new URL('/en/settings/subscriptions?google=error', req.url));
  }

  try {
    const { accessToken, refreshToken, expiryDate } = await exchangeGoogleCode(code);

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('users')
      .update({
        google_access_token:  accessToken,
        google_refresh_token: refreshToken,
        google_token_expiry:  expiryDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('[google:callback] Failed to store tokens:', error.message);
      return NextResponse.redirect(new URL('/en/settings/subscriptions?google=error', req.url));
    }

    return NextResponse.redirect(new URL('/en/settings/subscriptions?google=connected', req.url));
  } catch (err) {
    console.error('[google:callback] Token exchange failed:', err);
    return NextResponse.redirect(new URL('/en/settings/subscriptions?google=error', req.url));
  }
}
