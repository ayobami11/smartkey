import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/lib/supabase/types';
import {
  NAMESPACE_HEADER,
  cookieNameForNamespace,
  type SessionNamespace,
} from '@/lib/supabase/cookies';

/**
 * Refreshes the Supabase auth session cookie for the given role namespace and
 * returns an updated response. Must be called at the start of every middleware
 * invocation so that the session cookie is kept alive across navigations.
 *
 * The resolved namespace is injected as the `x-smartkey-namespace` request
 * header so downstream Server Components and route handlers read the same
 * role's cookie without re-deriving it from the URL.
 */
export const updateSession = async (
  request: NextRequest,
  namespace: SessionNamespace
): Promise<{
  response: NextResponse;
  supabase: ReturnType<typeof createServerClient<Database>>;
}> => {
  // Carry the resolved namespace to downstream server code via a request header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NAMESPACE_HEADER, namespace);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: cookieNameForNamespace(namespace) },
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
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return { response, supabase };
};
