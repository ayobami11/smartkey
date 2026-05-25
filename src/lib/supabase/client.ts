import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient<Database> | undefined;

/**
 * Creates (or returns the existing) Supabase client for use in Client
 * Components and browser-side hooks.
 *
 * Implements a singleton so that a single websocket connection is reused
 * across all Realtime subscriptions on the page.
 */
export const createBrowserClient = (): SupabaseClient<Database> => {
  if (client) return client;

  client = createSSRBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  return client;
};
