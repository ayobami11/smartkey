import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_NAMESPACE,
  cookieNameForNamespace,
  namespaceFromPath,
  type SessionNamespace,
} from '@/lib/supabase/cookies';

// One singleton per namespace, so a page that only ever runs as a single role
// reuses one websocket connection while different roles stay isolated.
const clients = new Map<SessionNamespace, SupabaseClient<Database>>();

const currentNamespace = (): SessionNamespace => {
  if (typeof window === 'undefined') return DEFAULT_NAMESPACE;
  return namespaceFromPath(window.location.pathname) ?? DEFAULT_NAMESPACE;
};

/**
 * Creates (or returns the existing) Supabase client for use in Client
 * Components and browser-side hooks.
 *
 * The auth cookie is namespaced by the current URL's role area (e.g. `/cso/*`
 * uses the `cso` cookie) so that sessions for different roles can coexist in
 * one browser without overwriting each other.
 */
export const createBrowserClient = (): SupabaseClient<Database> => {
  const ns = currentNamespace();

  const existing = clients.get(ns);
  if (existing) return existing;

  const client = createSSRBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: cookieNameForNamespace(ns) },
    }
  );

  clients.set(ns, client);
  return client;
};
