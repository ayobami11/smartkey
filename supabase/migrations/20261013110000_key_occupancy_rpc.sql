-- Key occupancy: one rule for "is this key free?" and "is this key overdue?".
--
-- Why
-- ---
-- keys.key_count is the number of interchangeable copies of a room's key
-- (20260906120000_key_count_as_capacity.sql). Since then "is this key free?"
-- had five answers that did not agree:
--
--   * the requests_key_capacity trigger (request_occupies_key) — correct;
--   * a hand mirror of it in src/lib/keys/availability.ts — correct, untested
--     against the SQL;
--   * keys.status — a single scalar that can only say "exhausted or not",
--     which drove the CSO dashboard's zone chart and admin/units
--     has_slot_today. It counted key records, not copies (FENG-005 has 12,
--     ADM-VC has 2), treated copies reserved by a live collection code as
--     available, and only showed OVERDUE after the hourly cron;
--   * five separate TypeScript copies of the overdue rule;
--   * get_digest_stats.overdue_count, which counted key RECORDS with
--     keys.status = 'OVERDUE' rather than overdue holders.
--
-- This migration puts the rule in SQL, once:
--
--   * request_is_overdue(status, return_deadline): the single overdue rule,
--     a physically-held key (KEY_ISSUED) past its deadline. Sits next to
--     request_occupies_key(status, code_expires_at).
--   * get_key_occupancy(p_zone?): per-key copy counts for the CSO dashboard
--     and admin/units — issued, overdue, reserved, occupied, available.
--     CSO/VERIFIER only.
--   * get_digest_stats: overdue_count now counts overdue holders via
--     request_is_overdue. Nothing else in the function changes.
--
-- TypeScript mirrors only the two one-line predicates
-- (src/lib/keys/occupancy.ts), held in step by matching truth tables in
-- src/tests/keys/occupancy.test.ts and supabase/tests/11_key_occupancy_test.sql.
--
-- Deliberately NOT recreated: return_key and mark_key_overdue. Their inline
-- predicate (status = 'KEY_ISSUED' and return_deadline < now()) already is
-- this rule, and rewriting two load-bearing write paths to call a helper buys
-- nothing but risk. Same for check_key_capacity, which already calls
-- request_occupies_key.


-- 1. The overdue rule ---------------------------------------------------------

create or replace function public.request_is_overdue(
  p_status          public.request_status,
  p_return_deadline timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_status = 'KEY_ISSUED'
     and p_return_deadline is not null
     and p_return_deadline < now();
$$;

revoke execute on function public.request_is_overdue(public.request_status, timestamptz)
  from public, anon;
grant  execute on function public.request_is_overdue(public.request_status, timestamptz)
  to authenticated, service_role;
-- service_role explicitly: get_digest_stats is SECURITY INVOKER and runs as
-- service_role from POST /api/cron/daily-digest, so it calls this as that role.


-- 2. Per-key occupancy --------------------------------------------------------
--
-- SECURITY DEFINER because requests_select scopes some roles to their own rows;
-- the counts must see every holder. The role gate below is what limits it.
-- The `r.status in (...)` conjunct is redundant with request_occupies_key but
-- lets the planner use idx_requests_occupying_key.

create or replace function public.get_key_occupancy(
  p_zone public.zone default null
)
returns table(
  key_id    uuid,
  zone      public.zone,
  unit_id   uuid,
  key_count int,
  retired   boolean,
  issued    int,
  overdue   int,
  reserved  int,
  occupied  int,
  available int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  if coalesce(public.user_role(), '') not in ('CSO', 'VERIFIER') then
    raise exception 'FORBIDDEN: only CSO or VERIFIER can read key occupancy'
      using errcode = 'P0002';
  end if;

  return query
  select
    k.id,
    k.zone,
    k.unit_id,
    k.key_count,
    (k.status = 'RETIRED'),
    c.issued,
    c.overdue,
    c.reserved,
    c.issued + c.reserved,
    case
      when k.status = 'RETIRED' then 0
      else greatest(0, k.key_count - (c.issued + c.reserved))
    end
  from public.keys k
  cross join lateral (
    select
      (count(*) filter (where r.status = 'KEY_ISSUED'))::int                as issued,
      (count(*) filter (where public.request_is_overdue(r.status, r.return_deadline)))::int
                                                                             as overdue,
      (count(*) filter (where r.status = 'CODE_ISSUED'))::int               as reserved
    from public.requests r
    where r.key_id = k.id
      and r.status in ('CODE_ISSUED', 'KEY_ISSUED')
      and public.request_occupies_key(r.status, r.code_expires_at)
  ) c
  where p_zone is null or k.zone = p_zone
  order by k.code;
end;
$$;

revoke execute on function public.get_key_occupancy(public.zone) from public, anon;
grant  execute on function public.get_key_occupancy(public.zone) to authenticated;


-- 3. Digest: count overdue holders, not key records --------------------------
--
-- Copied verbatim from 20260812130000_daily_digest.sql; only the third column
-- changes. A twelve-copy room with three late holders now reports 3, and an
-- overdue holder shows from the deadline rather than after the hourly cron.

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
    (select count(*)::int from requests r join keys k on k.id = r.key_id
       where public.request_is_overdue(r.status, r.return_deadline)
         and (p_unit_id is null or k.unit_id = p_unit_id)),
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
