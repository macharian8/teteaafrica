import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import type { Database } from './types';

/**
 * Refreshes the Supabase auth session from the request cookies and writes
 * updated cookies onto the provided response.  Call this in middleware so
 * the session stays alive across navigations.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse
): Promise<{ response: NextResponse; userId: string | null }> {
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the JWT server-side — never trust getSession() alone
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, userId: user?.id ?? null };
}
