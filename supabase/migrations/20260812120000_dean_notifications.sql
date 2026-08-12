alter table public.notification_preferences
  add column if not exists weekend_submitted_in_app boolean not null default true,
  add column if not exists weekend_submitted_email boolean not null default true;
