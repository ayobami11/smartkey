-- Backfilled from supabase_migrations.schema_migrations on 2026-08-04.
-- This migration was applied directly to the remote project (via the Supabase
-- dashboard or MCP) and was never committed. Recovered verbatim so that a fresh
-- replay of supabase/migrations/ reproduces production. Do not edit.

-- Revoke unauthenticated access to all RPCs.
-- All SmartKey functions require an authenticated session; anon should never reach them.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
