import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/supabase/types';

/**
 * Creates a Supabase client for use in Server Components, Server Actions, and
 * API Route handlers. Reads and writes session cookies via Next.js `cookies()`.
 *
 * Must only be called in a server context.
 */
export const createServerClient = async () => {
  const cookieStore = await cookies();

  return createSSRServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );
};
