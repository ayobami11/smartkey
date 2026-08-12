-- Daily activity digest for Dean and CSO

alter table public.notification_preferences
  add column if not exists digest_email boolean not null default false;

create or replace function public.get_digest_stats(
  p_unit_id uuid default null,
  p_since   timestamptz default now() - interval '24 hours'
)
returns table(
  issued_count int,
  returned_count int,
  overdue_count int,
  weekend_submitted_count int,
  weekend_pending_count int,
  high_risk_count int,
  signature_mismatch_count int,
  incidents_count int
)
language sql
security invoker
set search_path = public
as $$
  select
    (select count(*)::int from requests r join keys k on k.id = r.key_id
       where r.issued_at >= p_since and (p_unit_id is null or k.unit_id = p_unit_id)),
    (select count(*)::int from requests r join keys k on k.id = r.key_id
       where r.returned_at >= p_since and (p_unit_id is null or k.unit_id = p_unit_id)),
    (select count(*)::int from keys k
       where k.status = 'OVERDUE' and (p_unit_id is null or k.unit_id = p_unit_id)),
    (select count(*)::int from requests r left join keys k on k.id = r.key_id
       where r.type = 'WEEKEND' and r.created_at >= p_since
         and (p_unit_id is null or k.unit_id = p_unit_id or r.requested_unit_id = p_unit_id)),
    (select count(*)::int from requests r left join keys k on k.id = r.key_id
       where r.status = 'PENDING_HOD'
         and (p_unit_id is null or k.unit_id = p_unit_id or r.requested_unit_id = p_unit_id)),
    (select count(*)::int from requests where risk_tier = 'HIGH' and created_at >= p_since),
    (select count(*)::int from audit_log where event = 'SIGNATURE_MISMATCH' and occurred_at >= p_since),
    (select count(*)::int from incidents where logged_at >= p_since);
$$;

revoke execute on function public.get_digest_stats(uuid, timestamptz)
  from public, anon, authenticated;

select cron.schedule('daily-digest', '0 7 * * *', $$
  select extensions.http_post(
    url     := 'https://smartkey-ochre.vercel.app/api/cron/daily-digest',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'weekend_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
$$);
