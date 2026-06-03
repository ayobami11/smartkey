import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types';

// Service-role client — bypasses RLS.
// NEVER import this from any browser-reachable code or from a file that
// could be bundled into the client bundle. Use only in server-side
// route handlers that need admin operations (auth.admin.*, service-role writes).
export const createAdminClient = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
