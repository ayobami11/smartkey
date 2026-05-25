import { type NextRequest, NextResponse } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserRole = 'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER';

// ---------------------------------------------------------------------------
// Route configuration
// ---------------------------------------------------------------------------

/**
 * Prefixes that require authentication and are restricted to a single role.
 * Order matters: more-specific prefixes should come before less-specific ones.
 */
const PROTECTED_ROUTES: Array<{ prefix: string; role: UserRole }> = [
  { prefix: '/cso', role: 'CSO' },
  { prefix: '/hod', role: 'HOD' },
  { prefix: '/verifier', role: 'VERIFIER' },
  { prefix: '/me', role: 'REQUESTER' },
];

/**
 * Prefixes that are only accessible when the user is NOT authenticated.
 * Authenticated users are redirected to their role dashboard.
 */
const PUBLIC_ONLY_PREFIXES = ['/login', '/activate', '/forgot-password'];

/**
 * The dashboard home for each role — used when redirecting authenticated
 * users away from public-only pages.
 */
const ROLE_DASHBOARD: Record<UserRole, string> = {
  CSO: '/cso/dashboard',
  HOD: '/hod/dashboard',
  VERIFIER: '/verifier',
  REQUESTER: '/me',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const redirectTo = (request: NextRequest, destination: string): NextResponse =>
  NextResponse.redirect(new URL(destination, request.url));

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export const middleware = async (request: NextRequest): Promise<NextResponse> => {
  const { pathname } = request.nextUrl;

  // Step 1 — Refresh the session cookie so it does not expire mid-session.
  // `supabase` is the server client bound to the current request/response
  // cookie jar; `response` carries any Set-Cookie headers from the refresh.
  const { response, supabase } = await updateSession(request);

  // Step 2 — Verify the session via getUser() (not getSession()).
  // getUser() makes a network call to the Supabase Auth server, making it
  // safe for auth decisions (getSession() only reads the local cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Step 3 — Determine whether the current path is protected or public-only.
  const matchedProtected = PROTECTED_ROUTES.find(({ prefix }) =>
    pathname.startsWith(prefix)
  );
  const isPublicOnly = PUBLIC_ONLY_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // Step 4 — No session: redirect any protected route to /login.
  if (!user) {
    if (matchedProtected) {
      return redirectTo(request, '/login');
    }
    // Unauthenticated users may freely access public-only routes and the
    // root landing page — let the request through.
    return response;
  }

  // Step 5 — Session confirmed. Read the role from the profiles table.
  // We deliberately do NOT rely solely on the JWT role claim because it may
  // be stale; the database row is the authoritative source.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const userRole = profile?.role as UserRole | undefined;

  // Step 6 — Redirect authenticated users away from public-only routes.
  if (isPublicOnly) {
    const dashboard =
      userRole ? (ROLE_DASHBOARD[userRole] ?? '/') : '/';
    return redirectTo(request, dashboard);
  }

  // Step 7 — For protected routes, enforce role match.
  if (matchedProtected) {
    if (!userRole || userRole !== matchedProtected.role) {
      // Wrong role — send the user to their own dashboard (or /login if the
      // role is somehow undefined).
      const destination = userRole ? ROLE_DASHBOARD[userRole] : '/login';
      return redirectTo(request, destination);
    }
  }

  // Step 8 — All checks passed; proceed with the (possibly cookie-refreshed)
  // response.
  return response;
};

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match every path except:
     *   - _next/static  (Next.js build output)
     *   - _next/image   (Next.js image optimisation)
     *   - favicon.ico
     *   - public asset extensions (png, jpg, jpeg, gif, svg, webp, ico, woff, woff2)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$).*)',
  ],
};
