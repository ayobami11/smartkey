-- Adds an app-owned "last completed login" timestamp on profiles.
alter table public.profiles add column last_login_at timestamptz;
