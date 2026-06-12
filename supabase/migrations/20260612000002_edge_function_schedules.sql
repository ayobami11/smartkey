-- SmartKey — pg_cron schedules for Edge Functions
--
-- Requires the pg_net extension (enabled by default on Supabase Cloud).
-- Before applying, set the DB-level secret used to authenticate cron requests:
--
--   alter database postgres
--     set app.edge_function_key = '<SUPABASE_SERVICE_ROLE_KEY>';
--
-- This setting is stored in postgresql.conf and is never exposed to app clients.
-- The service-role key is already in your .env.local; use the same value here.

-- Enable pg_net if not already active (no-op when it is).
create extension if not exists pg_net with schema extensions;

-- Hourly: mark overdue keys and surface them in the CSO dashboard.
select cron.schedule(
  'overdue-key-check',
  '0 * * * *',
  $$
  select extensions.http_post(
    url     := current_setting('app.supabase_url', true)
               || '/functions/v1/overdue-key-check',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.edge_function_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Daily at 18:00 UTC: create a pending shift report placeholder.
-- The CSO triggers the actual Gemini generation from their dashboard.
select cron.schedule(
  'daily-shift-summary',
  '0 18 * * *',
  $$
  select extensions.http_post(
    url     := current_setting('app.supabase_url', true)
               || '/functions/v1/daily-shift-summary',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.edge_function_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
