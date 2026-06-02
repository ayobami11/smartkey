import { type NextRequest, NextResponse } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

type UserRole = 'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER';

const PROTECTED_ROUTES: Array<{ prefix: string; role: UserRole }> = [
  { prefix: '/cso', role: 'CSO' },
  { prefix: '/hod', role: 'HOD' },
  { prefix: '/verifier', role: 'VERIFIER' },
  { prefix: '/me', role: 'REQUESTER' },
];

// Paths where authenticated users should be sent to their dashboard instead
const PUBLIC_ONLY_EXACT = new Set(['/', '/login', '/help']);
const PUBLIC_ONLY_PREFIXES = ['/activate', '/forgot-password'];

const ROLE_DASHBOARD: Record<UserRole, string> = {
  CSO: '/cso/dashboard',
  HOD: '/hod/dashboard',
  VERIFIER: '/verifier',
  REQUESTER: '/me',
};

const redirectTo = (request: NextRequest, destination: string): NextResponse =>
  NextResponse.redirect(new URL(destination, request.url));

export const middleware = async (
  request: NextRequest
): Promise<NextResponse> => {
  // Guard: if Supabase env vars are missing the whole site would crash.
  // Fail open so non-auth pages still render; protected routes redirect to login.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const { pathname } = request.nextUrl;
    const isProtected = PROTECTED_ROUTES.some(({ prefix }) =>
      pathname.startsWith(prefix)
    );
    return isProtected ? redirectTo(request, '/login') : NextResponse.next();
  }

  try {
    const { pathname } = request.nextUrl;

    const { response, supabase } = await updateSession(request);

    // getUser() makes a network call to Auth — safe for auth decisions unlike getSession()
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const matchedProtected = PROTECTED_ROUTES.find(({ prefix }) =>
      pathname.startsWith(prefix)
    );
    const isPublicOnly =
      PUBLIC_ONLY_EXACT.has(pathname) ||
      PUBLIC_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    if (!user) {
      if (matchedProtected) return redirectTo(request, '/login');
      return response;
    }

    // Role read from DB, not JWT claim — JWT claim may be stale
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // Cast required: Supabase narrows the select-string type to `never` when it
    // can't statically parse the column list against the schema.
    const userRole = (profileData as { role: UserRole } | null)?.role;

    if (isPublicOnly) {
      return redirectTo(
        request,
        userRole ? (ROLE_DASHBOARD[userRole] ?? '/') : '/'
      );
    }

    if (matchedProtected && (!userRole || userRole !== matchedProtected.role)) {
      return redirectTo(
        request,
        userRole ? ROLE_DASHBOARD[userRole] : '/login'
      );
    }

    return response;
  } catch {
    // If middleware throws (e.g. Supabase unreachable), fail open on public routes
    // and redirect to login for protected routes so the site stays up.
    const { pathname } = request.nextUrl;
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
