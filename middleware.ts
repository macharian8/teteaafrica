import createIntlMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { routing } from './i18n/routing';
import { updateSession } from './lib/supabase/middleware';

const intlMiddleware = createIntlMiddleware(routing);

// Routes that require an authenticated session
const PROTECTED_SEGMENTS = ['/settings', '/account', '/onboarding'];

// Routes exempt from the onboarding redirect
const ONBOARDING_EXEMPT = ['/onboarding', '/sign-in', '/sign-up', '/sign-out'];

export async function middleware(request: NextRequest) {
  // 1. Run next-intl locale routing
  const intlResponse = intlMiddleware(request);

  // 2. Refresh Supabase session — cookies are written onto the intl response
  const { userId } = await updateSession(request, intlResponse);

  // 3. Derive locale and sub-path
  const { pathname } = request.nextUrl;
  const segments = pathname.split('/');
  const locale = segments[1] ?? routing.defaultLocale;
  const subPath = '/' + segments.slice(2).join('/');

  // 4. Guard protected routes — redirect unauthenticated users to sign-in
  const isProtected = PROTECTED_SEGMENTS.some((s) => subPath.startsWith(s));
  if (isProtected && !userId) {
    const signInUrl = new URL(`/${locale}/sign-in`, request.url);
    signInUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 5. Onboarding gate — if authed and not on an exempt route, check completion
  const isExempt = ONBOARDING_EXEMPT.some((s) => subPath.startsWith(s));
  if (userId && !isExempt) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              intlResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: userRow } = await supabase
      .from('users')
      .select('onboarding_completed')
      .eq('id', userId)
      .maybeSingle();

    if (userRow && !userRow.onboarding_completed) {
      return NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url));
    }
  }

  return intlResponse;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)'
  ],
};
