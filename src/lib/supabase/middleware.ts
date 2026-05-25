import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/lib/supabase/types';

/**
 * Refreshes the Supabase auth session cookie and returns an updated response.
 * Must be called at the start of every middleware invocation so that the
 * session cookie is kept alive across page navigations.
 */
export const updateSession = async (
  request: NextRequest,
): Promise<{
  response: NextResponse;
  supabase: ReturnType<typeof createServerClient<Database>>;
}> => {
  // Start with a plain next response so we can attach Set-Cookie headers.
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Apply cookies to the request so subsequent middleware reads are
          // consistent, and to the response so the browser receives them.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return { response, supabase };
};
