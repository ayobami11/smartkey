-- Requester notification preferences + overdue-return reminder email


create table public.notification_preferences (
  profile_id            uuid primary key references public.profiles(id) on delete cascade,
  key_issued_in_app      boolean not null default true,
  overdue_email          boolean not null default true,
  weekend_decided_email  boolean not null default true,
  updated_at             timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

-- Self-service preference data, same trust level as editing your own
-- full_name via PATCH /api/profile/me — no RPC, no audit entry.
create policy notification_preferences_select_own
  on public.notification_preferences
  for select
  using (profile_id = auth.uid());

create policy notification_preferences_insert_own
  on public.notification_preferences
  for insert
  with check (profile_id = auth.uid());

create policy notification_preferences_update_own
  on public.notification_preferences
  for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

alter table public.requests
  add column if not exists overdue_reminder_sent_at timestamptz;

comment on column public.requests.overdue_reminder_sent_at is
  'When the overdue-return reminder cycle was processed for this request
   (email sent, or suppressed by the requester''s notification preference).
   Null = not yet processed. Stamped by POST /api/cron/overdue-reminders.';

select cron.schedule('overdue-key-check', '0 * * * *', $$
  select public.mark_key_overdue();
  select extensions.http_post(
    url     := 'https://smartkey-ochre.vercel.app/api/cron/overdue-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'weekend_cron_secret'
      )
    ),
    body    := '{}'::jsonb
  );
$$);
