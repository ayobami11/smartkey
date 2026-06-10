import { type NextRequest, NextResponse } from 'next/server';

import {
  DEFAULT_NAMESPACE,
  namespaceFromPath,
  namespaceFromReferer,
  type SessionNamespace,
} from '@/lib/supabase/cookies';
import { updateSession } from '@/lib/supabase/middleware';

type UserRole = 'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER';

const PROTECTED_ROUTES: Array<{ prefix: string; role: UserRole }> = [
  { prefix: '/cso', role: 'CSO' },
  { prefix: '/hod', role: 'HOD' },
  { prefix: '/verifier', role: 'VERIFIER' },
  { prefix: '/requester', role: 'REQUESTER' },
];

const redirectTo = (request: NextRequest, destination: string): NextResponse =>
  NextResponse.redirect(new URL(destination, request.url));

export const middleware = async (
  request: NextRequest
): Promise<NextResponse> => {
  const { pathname } = request.nextUrl;

  // Guard: if Supabase env vars are missing the whole site would crash.
  // Fail open so non-auth pages still render; protected routes redirect to login.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const isProtected = PROTECTED_ROUTES.some(({ prefix }) =>
      pathname.startsWith(prefix)
    );
    return isProtected ? redirectTo(request, '/login') : NextResponse.next();
  }

  try {
    const matchedProtected = PROTECTED_ROUTES.find(
      ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    // Resolve which role's cookie this request operates on: the URL prefix for
    // role areas, the calling page's Referer for `/api/*` and similar, else the
    // transient default. This keeps each role's session fully isolated.
    const namespace: SessionNamespace =
      namespaceFromPath(pathname) ??
      namespaceFromReferer(request.headers.get('referer')) ??
      DEFAULT_NAMESPACE;

    const { response, supabase } = await updateSession(request, namespace);

    // Only protected routes need an authenticated user; skip the network call
    // to Auth on public routes so they stay fast.
    if (!matchedProtected) {
      return response;
    }

    // getUser() makes a network call to Auth — safe for auth decisions unlike getSession()
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return redirectTo(request, '/login');

    // Role read from DB, not JWT claim — JWT claim may be stale
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // Cast required: Supabase narrows the select-string type to `never` when it
    // can't statically parse the column list against the schema.
    const userRole = (profileData as { role: UserRole } | null)?.role;

    // The cookie is role-namespaced, so a mismatch here means a stale or
    // tampered session for this area — send them back to login.
    if (!userRole || userRole !== matchedProtected.role) {
      return redirectTo(request, '/login');
    }

    return response;
  } catch {
    // If middleware throws (e.g. Supabase unreachable), fail open on public routes
    // and redirect to login for protected routes so the site stays up.
    const isProtected = PROTECTED_ROUTES.some(({ prefix }) =>
      pathname.startsWith(prefix)
    );
    return isProtected ? redirectTo(request, '/login') : NextResponse.next();
  }
};

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$).*)',
  ],
};
