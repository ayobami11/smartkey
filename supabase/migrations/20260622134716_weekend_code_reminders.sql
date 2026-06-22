-- SmartKey — morning reminder for approved weekend requests
--
-- No collection code is ever emailed for the weekend flow: the requester (or
-- guest) mints a short-lived 6-digit code on the requested day. Without a nudge,
-- an approved request is easy to forget until the day passes — at which point it
-- can no longer be actioned (see expire_stale_weekend_requests). This adds a
-- morning-of email reminder linking to the page where the code is minted.
--
-- reminder_sent_at makes the send idempotent so a cron retry never double-emails.

alter table public.requests
  add column if not exists reminder_sent_at timestamptz;

comment on column public.requests.reminder_sent_at is
  'When the morning-of weekend collection-code reminder email was sent. Null = not yet reminded; stamped by POST /api/cron/weekend-reminders to prevent double-sends.';

-- pg_cron schedule for the morning reminder. Requires pg_net (default on Cloud).
--
-- The bearer secret lives in Supabase Vault (ALTER DATABASE ... SET is not
-- permitted for custom parameters on managed Supabase). Create it once, out of
-- band so the value never lands in version control, with the same value as the
-- app's CRON_SECRET env var:
--
--   select vault.create_secret('<CRON_SECRET>', 'weekend_cron_secret');
--
create extension if not exists pg_net with schema extensions;

-- 06:00 UTC on Saturday and Sunday — the only days a weekend request can be due.
select cron.schedule(
  'weekend-code-reminders',
  '0 6 * * 6,0',
  $$
  select extensions.http_post(
    url     := 'https://smartkey-ochre.vercel.app/api/cron/weekend-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'weekend_cron_secret'
      )
    ),
    body    := '{}'::jsonb
  );
  $$
);
