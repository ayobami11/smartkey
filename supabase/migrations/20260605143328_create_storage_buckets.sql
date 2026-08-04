-- Backfilled from supabase_migrations.schema_migrations on 2026-08-04.
-- This migration was applied directly to the remote project (via the Supabase
-- dashboard or MCP) and was never committed. Recovered verbatim so that a fresh
-- replay of supabase/migrations/ reproduces production. Do not edit.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('passport-photos', 'passport-photos', true),
  ('hod-signatures', 'hod-signatures', true)
ON CONFLICT (id) DO NOTHING;
