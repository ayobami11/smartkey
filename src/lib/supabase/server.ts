import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/lib/supabase/types';
import {
  DEFAULT_NAMESPACE,
  NAMESPACE_HEADER,
  asNamespace,
  cookieNameForNamespace,
  namespaceFromReferer,
  type SessionNamespace,
} from '@/lib/supabase/cookies';

/**
 * Creates a Supabase client for use in Server Components, Server Actions, and
 * API Route handlers. Reads and writes session cookies via Next.js `cookies()`.
 *
 * The auth cookie is namespaced per role so sessions don't overwrite each
 * other. The namespace is resolved in this order:
 *   1. The explicit `namespace` argument (used by auth routes that establish a
 *      session before any role URL exists, e.g. login, activation).
 *   2. The `x-smartkey-namespace` header injected by the middleware.
 *   3. The `Referer` of the calling page (covers `/api/*` routes).
 *   4. The default transient namespace.
 *
 * Must only be called in a server context.
 */
export const createServerClient = async (namespace?: SessionNamespace) => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const ns: SessionNamespace =
    namespace ??
    asNamespace(headerStore.get(NAMESPACE_HEADER)) ??
    namespaceFromReferer(headerStore.get('referer')) ??
    DEFAULT_NAMESPACE;

  return createSSRServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: cookieNameForNamespace(ns) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — cookies can only be set from
            // Server Actions or Route Handlers. The session will be refreshed
            // by the middleware, so this is safe to ignore here.
          }
        },
      },
    }
  );
};
