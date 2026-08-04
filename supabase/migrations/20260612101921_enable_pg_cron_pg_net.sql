-- Backfilled from supabase_migrations.schema_migrations on 2026-08-04.
-- This migration was applied directly to the remote project (via the Supabase
-- dashboard or MCP) and was never committed. Recovered verbatim so that a fresh
-- replay of supabase/migrations/ reproduces production. Do not edit.
--
-- Missed by the first backfill pass earlier the same day, which matched local
-- files to remote rows by name and never enumerated the remote-only remainder.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
