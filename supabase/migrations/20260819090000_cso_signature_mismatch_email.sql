-- CSO email notification for held signature/stamp mismatches

alter table public.notification_preferences
  add column if not exists signature_mismatch_email boolean not null default true;
