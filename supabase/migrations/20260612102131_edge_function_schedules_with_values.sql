-- Backfilled from supabase_migrations.schema_migrations on 2026-08-04.
-- This migration was applied directly to the remote project (via the Supabase
-- dashboard or MCP) and was never committed. Recovered verbatim so that a fresh
-- replay of supabase/migrations/ reproduces production. Do not edit.
--
-- !! SECURITY DEVIATION FROM VERBATIM — READ BEFORE ACTING !!
-- As executed, this migration inlined the project's live service_role JWT as a
-- literal, twice (once per cron job). That key bypasses RLS entirely, so it has
-- been replaced below with the placeholder <REDACTED_SERVICE_ROLE_JWT> rather
-- than committed to version control. This is the ONLY departure from the
-- executed SQL; everything else is byte-for-byte.
--
-- The unredacted original remains readable from the remote project:
--   select array_to_string(statements, E';\n')
--     from supabase_migrations.schema_migrations
--    where version = '20260612102131';
--
-- Redaction is safe for replay: both jobs are superseded by
-- 20260622140052_cron_jobs_direct_sql.sql, which re-registers the same two job
-- names ('overdue-key-check', 'daily-shift-summary') via cron.schedule. Since
-- cron.schedule replaces an existing job of the same name, the placeholder
-- definitions below are fully overwritten later in the replay and never run.
--
-- ACTION REQUIRED: this service_role key was live at the time of writing.
-- Rotate it, and treat it as compromised if this database has been shared.

-- Remove placeholder jobs and re-register with concrete values.
-- pg_cron.job is only readable by superuser in Supabase Cloud, so the key
-- is not exposed to app clients.
select cron.unschedule('overdue-key-check');
select cron.unschedule('daily-shift-summary');

select cron.schedule(
  'overdue-key-check',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://ocpsklbbksuymjdbfpja.supabase.co/functions/v1/overdue-key-check',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <REDACTED_SERVICE_ROLE_JWT>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'daily-shift-summary',
  '0 18 * * *',
  $$
  select net.http_post(
    url     := 'https://ocpsklbbksuymjdbfpja.supabase.co/functions/v1/daily-shift-summary',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <REDACTED_SERVICE_ROLE_JWT>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
