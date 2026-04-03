import createIntlMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { updateSession } from './lib/supabase/middleware';

const intlMiddleware = createIntlMiddleware(routing);

// Routes that require an authenticated session
const PROTECTED_SEGMENTS = ['/settings'];

export async function middleware(request: NextRequest) {
  // 1. Run next-intl locale routing
  const intlResponse = intlMiddleware(request);

  // 2. Refresh Supabase session — cookies are written onto the intl response
  const { userId } = await updateSession(request, intlResponse);

  // 3. Guard protected routes
  const { pathname } = request.nextUrl;
  // Strip the locale prefix to check the sub-path
  const segments = pathname.split('/');
  const subPath = '/' + segments.slice(2).join('/');

  const isProtected = PROTECTED_SEGMENTS.some((s) => subPath.startsWith(s));
  if (isProtected && !userId) {
    const locale = segments[1] ?? routing.defaultLocale;
    const signInUrl = new URL(`/${locale}/sign-in`, request.url);
    signInUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return intlResponse;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)'
  ],
};
