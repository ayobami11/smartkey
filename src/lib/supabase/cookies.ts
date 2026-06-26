import type { Database } from '@/lib/supabase/types';

type UserRole = Database['public']['Enums']['user_role'];

// Each role gets its own auth-cookie namespace so that sessions for different
// roles can coexist in one browser without overwriting one another. The
// transient `activate` namespace covers invite-activation and password-reset
// flows, which run before any role-specific URL prefix exists.
export type SessionNamespace =
  | 'cso'
  | 'dean'
  | 'verifier'
  | 'requester'
  | 'activate';

// Fallback used when no role can be derived (transient public/auth flows).
export const DEFAULT_NAMESPACE: SessionNamespace = 'activate';

// Request header the middleware injects so server clients (RSC + route
// handlers) know which namespace to read without inspecting the URL themselves.
export const NAMESPACE_HEADER = 'x-smartkey-namespace';

const PATH_PREFIX_TO_NAMESPACE: ReadonlyArray<
  readonly [string, SessionNamespace]
> = [
  ['/cso', 'cso'],
  ['/hod', 'dean'],
  ['/dean', 'dean'],
  ['/verifier', 'verifier'],
  ['/requester', 'requester'],
  ['/me', 'requester'], // legacy alias for the requester area
];

const ROLE_TO_NAMESPACE: Record<string, SessionNamespace> = {
  CSO: 'cso',
  DEAN: 'dean',
  VERIFIER: 'verifier',
  REQUESTER: 'requester',
};

const ALL_NAMESPACES: ReadonlySet<string> = new Set([
  'cso',
  'hod',
  'verifier',
  'requester',
  'activate',
]);

export const namespaceForRole = (
  role: UserRole | string | null | undefined
): SessionNamespace | null => (role ? (ROLE_TO_NAMESPACE[role] ?? null) : null);

export const namespaceFromPath = (
  pathname: string | null | undefined
): SessionNamespace | null => {
  if (!pathname) return null;
  for (const [prefix, ns] of PATH_PREFIX_TO_NAMESPACE) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return ns;
  }
  return null;
};

export const namespaceFromReferer = (
  referer: string | null | undefined
): SessionNamespace | null => {
  if (!referer) return null;
  try {
    return namespaceFromPath(new URL(referer).pathname);
  } catch {
    return null;
  }
};

// Narrows an arbitrary header value to a known namespace, or null.
export const asNamespace = (
  value: string | null | undefined
): SessionNamespace | null =>
  value && ALL_NAMESPACES.has(value) ? (value as SessionNamespace) : null;

const projectRef = (): string => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const match = url.match(/https?:\/\/([^.]+)\./);
  return match?.[1] ?? 'smartkey';
};

// The cookie base name @supabase/ssr will use as its storage key for this
// namespace. The library appends chunk suffixes (.0, .1, …) as needed.
export const cookieNameForNamespace = (ns: SessionNamespace): string =>
  `sb-${projectRef()}-${ns}`;
