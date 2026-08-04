-- Backfilled from supabase_migrations.schema_migrations on 2026-08-04.
-- This migration was applied directly to the remote project (via the Supabase
-- dashboard or MCP) and was never committed. Recovered verbatim so that a fresh
-- replay of supabase/migrations/ reproduces production. Do not edit.

-- Merge two permissive UPDATE policies into one to avoid double evaluation on every update.
-- Combined: a user can update their own row, OR a CSO can update any row.
DROP POLICY IF EXISTS profiles_update_cso_any ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR user_role() = 'CSO')
  WITH CHECK (id = auth.uid() OR user_role() = 'CSO');
