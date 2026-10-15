-- Grant and actor hardening.
--
-- Several RPCs granted to `authenticated` trusted values the caller chose:
--
--   * create_request took p_risk_tier / p_risk_factors, computed by
--     POST /api/requests/submit. A requester calling the RPC directly could
--     store LOW for any request. It is now service-only: the route calls it
--     through the admin client and names the requester in p_requester_id.
--   * approve_weekend / decline_weekend / approve_guest_weekend took the
--     deciding Dean as p_hod_id and never compared it with the session, so any
--     signed-in user could approve as any Dean — and approve_weekend also took
--     p_signature_verified from the caller. The app only ever calls them from
--     decideWeekend through the admin client, so they become service-only.
--   * dismiss_expired_request (p_actor_id), issue_key / return_key
--     (p_verifier_id) took the actor as a parameter with no session check.
--     issue_key and return_key did not check the actor's role either, so a
--     requester could issue or return a key themselves. They now assert the
--     actor is the session user (unless the caller is service_role or a direct
--     database connection) and that issue/return come from a VERIFIER.
--   * request_return / generate_weekend_code / expire_request already used
--     auth.uid() over their parameter, but compared ownership with `<>`, which
--     is NULL — and so passes — for a guest request (requester_id IS NULL). Any
--     requester could mint a guest's collection or return code. They now use
--     the same actor assertion and `is distinct from`.
--   * mark_key_overdue was executable by `authenticated` although it is
--     cron-only. Every cron-only function is now revoked from public, anon and
--     authenticated and granted to service_role; pg_cron runs as postgres.
--
-- And four write policies let a user session skip an audited RPC:
-- keys_update_cso, the three departments_* policies (the table is now units),
-- authorisations_insert/delete_hod_dept (nominate_collector /
-- remove_collector) and requests_insert_requester (create_request — a direct
-- insert could even choose its own collection code). No application code
-- writes those tables from a user session, so the policies go.
--
-- Deploy order: this migration revokes create_request from `authenticated`,
-- so the submit route that calls it through the admin client must be live
-- first. The new route is incompatible with the old function (it passes
-- p_requester_id), so code and migration have to ship together: deploy the
-- code, then apply this migration immediately (see docs/CHANGELOG.md).

-- ---------------------------------------------------------------------------
-- _assert_session_actor — the actor a caller names must be the session user
--
-- service_role and a direct database connection (pg_cron, migrations,
-- pgTAP — no request.jwt.claims at all) name the actor themselves. Any other
-- caller must have a session, and the named actor must be that session.
-- ---------------------------------------------------------------------------

create or replace function public._assert_session_actor(p_actor_id uuid)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  if v_role = 'service_role' then
    return;
  end if;

  if v_uid is null then
    if v_role is not null then
      raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
    end if;
    return;
  end if;

  if p_actor_id is distinct from v_uid then
    raise exception 'FORBIDDEN: actor does not match the session'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public._assert_session_actor(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_request — service-only; the requester is a parameter
--
-- Body copied from 20261013120100_create_request_risk_and_letters.sql. Only
-- the p_requester_id parameter, where v_requester_id comes from, the
-- session-actor assertion and the `is distinct from` role check differ.
-- ---------------------------------------------------------------------------

drop function if exists public.create_request(
  uuid, text, timestamptz, date, public.risk_tier, jsonb, text, text
);

create function public.create_request(
  p_requester_id    uuid,
  p_key_id          uuid,
  p_type            text,
  p_return_deadline timestamptz,
  p_weekend_date    date default null,
  p_risk_tier       public.risk_tier default 'LOW',
  p_risk_factors    jsonb default null,
  p_letter_url      text default null,
  p_stamp_url       text default null
)
returns table(request_id uuid, code text, code_expires_at timestamptz, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id    uuid;
  v_actor_role      public.user_role;
  v_type_enum       public.request_type;
  v_request_id      uuid;
  v_code            text;
  v_expires_at      timestamptz;
  v_status          public.request_status;
  v_requested_for   date;
  v_expiry_minutes  int;
  v_decision_token  uuid;
  v_own_letter      text;
begin
  v_type_enum := p_type::public.request_type;

  v_requester_id := p_requester_id;
  if v_requester_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  perform public._assert_session_actor(v_requester_id);

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_requester_id;

  if v_actor_role is distinct from 'REQUESTER' then
    raise exception 'FORBIDDEN: only REQUESTER role can create requests'
      using errcode = 'P0002';
  end if;

  -- The letter/stamp are what the Dean's approval is verified against, so
  -- they must be objects this requester uploaded: weekend-letters, in their
  -- own folder. Any other URL — e.g. the Dean's own reference in
  -- hod-signatures — would let the check compare a reference against itself.
  -- Mirrors parseStorageUrl + the folder check in POST /api/requests/submit;
  -- re-checked here because the RPC, not the route, is the boundary.
  if (p_letter_url is not null or p_stamp_url is not null)
     and v_type_enum <> 'WEEKEND' then
    raise exception 'VALIDATION: a letter or stamp is only accepted on a WEEKEND request'
      using errcode = 'P0004';
  end if;

  v_own_letter :=
    '^https?://[^/?#]+/(?:[^?#]*/)?storage/v1/object/(?:public/|sign/|authenticated/)?weekend-letters/'
    || v_requester_id::text
    || '/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(?:[?#].*)?$';

  if (p_letter_url is not null
        and (p_letter_url !~ v_own_letter
             or position('..' in split_part(p_letter_url, '?', 1)) > 0))
     or (p_stamp_url is not null
        and (p_stamp_url !~ v_own_letter
             or position('..' in split_part(p_stamp_url, '?', 1)) > 0)) then
    raise exception 'VALIDATION: letter or stamp is not an upload of this requester'
      using errcode = 'P0004';
  end if;

  if not exists (
    select 1
    from   public.authorisations a
    where  a.key_id    = p_key_id
      and  a.profile_id = v_requester_id
  ) then
    raise exception 'NOT_AUTHORISED: requester is not whitelisted for this key'
      using errcode = 'P0005';
  end if;

  if exists (
    select 1
    from   public.requests r
    where  r.requester_id = v_requester_id
      and  r.key_id       = p_key_id
      and  r.status not in (
             'KEY_RETURNED', 'EXPIRED', 'CANCELLED', 'DECLINED'
           )
  ) then
    raise exception 'CONFLICT: an active request already exists for this key'
      using errcode = 'P0006';
  end if;

  select code_expiry_minutes into v_expiry_minutes
  from   public.operational_config
  where  id = '00000000-0000-0000-0000-000000000002';

  -- Determine status, code, and requested_for date.
  if v_type_enum = 'WEEKDAY' then
    v_status        := 'CODE_ISSUED';
    v_requested_for := current_date;
    v_code          := lpad(floor(random() * 1000000)::int::text, 6, '0');
    v_expires_at    := now() + (coalesce(v_expiry_minutes, 10) || ' minutes')::interval;
  else
    -- WEEKEND: no code now. The requester generates a short-lived code on the
    -- requested day via generate_weekend_code, after the HOD approves.
    v_status        := 'PENDING_HOD';
    v_requested_for := coalesce(p_weekend_date, current_date);
    v_code          := null;
    v_expires_at    := null;

    -- One-click Approve/Decline for the Dean's email. Only Dean-routed units
    -- get one: Administration (authoriser = 'CSO') requests are decided on
    -- the CSO dashboard and never receive a token.
    if exists (
      select 1
      from   public.keys k
      join   public.units u on u.id = k.unit_id
      where  k.id = p_key_id
        and  u.authoriser = 'DEAN'
    ) then
      v_decision_token := gen_random_uuid();
    end if;
  end if;

  insert into public.requests (
    requester_id,
    key_id,
    type,
    requested_for,
    status,
    code,
    code_expires_at,
    return_deadline,
    risk_tier,
    risk_factors,
    letter_url,
    stamp_url,
    decision_token
  ) values (
    v_requester_id,
    p_key_id,
    v_type_enum,
    v_requested_for,
    v_status,
    v_code,
    v_expires_at,
    p_return_deadline,
    coalesce(p_risk_tier, 'LOW'),
    p_risk_factors,
    p_letter_url,
    p_stamp_url,
    v_decision_token
  )
  returning id into v_request_id;

  perform public._write_audit(
    'REQUEST_CREATED',
    v_requester_id,
    v_actor_role,
    'request',
    v_request_id,
    jsonb_build_object(
      'key_id',          p_key_id,
      'type',            p_type,
      'status',          v_status::text,
      'return_deadline', p_return_deadline,
      'risk_tier',       coalesce(p_risk_tier, 'LOW')::text,
      'risk_factors',    coalesce(p_risk_factors, '[]'::jsonb)
    )
  );

  return query
    select v_request_id,
           v_code,
           v_expires_at,
           v_status::text;
end;
$$;

revoke execute on function public.create_request(
  uuid, uuid, text, timestamptz, date, public.risk_tier, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.create_request(
  uuid, uuid, text, timestamptz, date, public.risk_tier, jsonb, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Weekend decisions — service-only (decideWeekend calls them as service_role)
-- ---------------------------------------------------------------------------

revoke execute on function public.approve_weekend(uuid, uuid, text, boolean, numeric, boolean)
  from public, anon, authenticated;
grant execute on function public.approve_weekend(uuid, uuid, text, boolean, numeric, boolean)
  to service_role;

revoke execute on function public.decline_weekend(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.decline_weekend(uuid, uuid, text, boolean)
  to service_role;

revoke execute on function public.approve_guest_weekend(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_guest_weekend(uuid, uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- dismiss_expired_request — the actor must be the session user
--
-- Body copied from 20260802223104_dismiss_expired_request_rpc.sql; only the
-- session-actor assertion is new.
-- ---------------------------------------------------------------------------

create or replace function public.dismiss_expired_request(
  p_request_id uuid,
  p_actor_id   uuid
)
returns table(request_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role public.user_role;
  v_actor_dept uuid;
  v_req        record;
  v_dept_id    uuid;
  v_guest_name text;
begin
  perform public._assert_session_actor(p_actor_id);

  select pr.role, pr.unit_id into v_actor_role, v_actor_dept
  from   public.profiles pr where pr.id = p_actor_id;

  if v_actor_role is null then
    raise exception 'FORBIDDEN: actor has no profile' using errcode = 'P0002';
  end if;

  select r.* into v_req
  from   public.requests r where r.id = p_request_id for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  if v_req.type <> 'WEEKEND' then
    raise exception 'CONFLICT: only weekend requests can be dismissed'
      using errcode = 'P0006';
  end if;

  if v_req.status not in ('PENDING_HOD', 'APPROVED', 'CODE_ISSUED') then
    raise exception 'CONFLICT: request is not dismissable (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  -- Only genuinely lapsed requests. A live one must be approved or declined.
  if v_req.requested_for >= current_date then
    raise exception 'CONFLICT: the requested date has not passed yet'
      using errcode = 'P0006';
  end if;

  v_dept_id := coalesce(
    (select k.unit_id from public.keys k where k.id = v_req.key_id),
    v_req.requested_unit_id
  );

  if v_actor_role <> 'CSO' then
    if v_actor_role is distinct from 'DEAN' or v_actor_dept is distinct from v_dept_id then
      raise exception 'FORBIDDEN: request does not belong to your faculty'
        using errcode = 'P0002';
    end if;
  end if;

  update public.requests
  set    status          = 'EXPIRED',
         code            = null,
         code_expires_at = null
  where  id = p_request_id;

  if v_req.requester_id is not null then
    perform public._write_audit(
      'REQUEST_EXPIRED', p_actor_id, v_actor_role, 'request', p_request_id,
      jsonb_build_object(
        'reason',          'dismissed_by_authoriser',
        'previous_status', v_req.status,
        'dismissed_by',    p_actor_id
      )
    );
  else
    select g.full_name into v_guest_name
    from   public.guest_requesters g where g.id = v_req.guest_id;

    -- Guest request, but the dismissal was performed by a real profile, so the
    -- normal audit writer is correct here; the guest is named in the payload.
    perform public._write_audit(
      'REQUEST_EXPIRED', p_actor_id, v_actor_role, 'request', p_request_id,
      jsonb_build_object(
        'reason',          'dismissed_by_authoriser',
        'previous_status', v_req.status,
        'dismissed_by',    p_actor_id,
        'guest_name',      coalesce(v_guest_name, 'Guest'),
        'external',        true
      )
    );
  end if;

  return query select p_request_id, 'EXPIRED'::text;
end;
$$;

revoke execute on function public.dismiss_expired_request(uuid, uuid) from public, anon;
grant  execute on function public.dismiss_expired_request(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- issue_key — the verifier must be the session user, and a VERIFIER
--
-- Body copied from 20260906120000_key_count_as_capacity.sql; only the actor
-- resolution, the assertion and the role check differ.
-- ---------------------------------------------------------------------------

create or replace function public.issue_key(
  p_request_id uuid,
  p_verifier_id uuid
)
returns table(request_id uuid, issued_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_req         record;
  v_issued_at   timestamptz;
  v_key_count   int;
  v_issued_out  int;
begin
  perform public._assert_session_actor(p_verifier_id);
  v_actor_id := p_verifier_id;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  if v_actor_role is distinct from 'VERIFIER' then
    raise exception 'FORBIDDEN: only a VERIFIER can issue keys'
      using errcode = 'P0002';
  end if;

  -- Load the request.
  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;   -- lock the row to prevent concurrent issue

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  -- Validate state: must be CODE_ISSUED and code must not have expired.
  if v_req.status <> 'CODE_ISSUED' then
    raise exception 'CONFLICT: request is not in CODE_ISSUED state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  if v_req.code_expires_at <= now() then
    raise exception 'EXPIRED_CODE: the 6-digit code has expired'
      using errcode = 'P0008';
  end if;

  select k.key_count
  into   v_key_count
  from   public.keys k
  where  k.id = v_req.key_id
  for update;

  select count(*)
  into   v_issued_out
  from   public.requests r
  where  r.key_id = v_req.key_id
    and  r.id     <> p_request_id
    and  r.status  = 'KEY_ISSUED';

  if v_issued_out >= coalesce(v_key_count, 1) then
    if coalesce(v_key_count, 1) = 1 then
      raise exception 'CONFLICT: this key is already issued and has not been returned'
        using errcode = 'P0006';
    else
      raise exception 'CONFLICT: all % keys on this bunch are out and none has been returned', v_key_count
        using errcode = 'P0006';
    end if;
  end if;

  v_issued_at := now();

  -- Update request: mark issued, clear code.
  update public.requests
  set    status    = 'KEY_ISSUED',
         issued_by = p_verifier_id,
         issued_at = v_issued_at,
         code      = null,
         code_expires_at = null
  where  id = p_request_id;

  if v_issued_out + 1 >= coalesce(v_key_count, 1) then
    update public.keys
    set    status = 'ISSUED'
    where  id = v_req.key_id;
  end if;

  -- Audit entry.
  perform public._write_audit(
    'KEY_ISSUED',
    p_verifier_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'key_id',       v_req.key_id,
      'requester_id', v_req.requester_id,
      'verifier_id',  p_verifier_id,
      'issued_at',    v_issued_at
    )
  );

  return query select p_request_id, v_issued_at;
end;
$$;

revoke execute on function public.issue_key(uuid, uuid) from public, anon;
grant  execute on function public.issue_key(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- return_key — the verifier must be the session user, and a VERIFIER
--
-- Body copied from 20260906120000_key_count_as_capacity.sql; only the actor
-- resolution, the assertion and the role check differ.
-- ---------------------------------------------------------------------------

create or replace function public.return_key(
  p_request_id      uuid,
  p_verifier_id     uuid,
  p_code            text default null,
  p_returner_id     uuid default null,
  p_override_reason text default null
)
returns table(request_id uuid, returned_at timestamptz, verified boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id       uuid;
  v_actor_role     public.user_role;
  v_req            record;
  v_returned_at    timestamptz;
  v_verified       boolean;
  v_shift_id       uuid;
  v_key_count      int;
  v_still_out      int;
  v_still_overdue  int;
begin
  perform public._assert_session_actor(p_verifier_id);
  v_actor_id := p_verifier_id;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  if v_actor_role is distinct from 'VERIFIER' then
    raise exception 'FORBIDDEN: only a VERIFIER can return keys'
      using errcode = 'P0002';
  end if;

  -- Load and lock the request row.
  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  -- Must be in KEY_ISSUED state (KEY_OVERDUE is an issued key at the DB level;
  -- keys.status = 'OVERDUE' but requests.status remains 'KEY_ISSUED').
  if v_req.status <> 'KEY_ISSUED' then
    raise exception 'NOT_ISSUED: request is not in KEY_ISSUED state (current: %)', v_req.status
      using errcode = 'P0009';
  end if;

  -- Determine the verification path.
  if p_code is not null and length(p_code) > 0 then
    if v_req.return_code is null or v_req.return_code <> p_code then
      raise exception 'BAD_RETURN_CODE: the return code does not match'
        using errcode = 'P0011';
    end if;
    if v_req.return_code_expires_at is null or v_req.return_code_expires_at <= now() then
      raise exception 'EXPIRED_RETURN_CODE: the return code has expired'
        using errcode = 'P0012';
    end if;
    v_verified := true;
  elsif p_override_reason is not null and length(trim(p_override_reason)) > 0 then
    v_verified := false;
  else
    raise exception 'NO_VERIFICATION: a return code or an override reason is required'
      using errcode = 'P0013';
  end if;

  v_returned_at := now();

  -- Update request: mark returned, clear any return code.
  update public.requests
  set    status                 = 'KEY_RETURNED',
         returned_at            = v_returned_at,
         return_code            = null,
         return_code_expires_at = null
  where  id = p_request_id;

  -- Recompute the bunch's status from whoever is still holding a key.
  -- Lock order requests -> keys, matching issue_key.
  select k.key_count
  into   v_key_count
  from   public.keys k
  where  k.id = v_req.key_id
  for update;

  select count(*),
         count(*) filter (where r.return_deadline is not null and r.return_deadline < now())
  into   v_still_out, v_still_overdue
  from   public.requests r
  where  r.key_id = v_req.key_id
    and  r.id    <> p_request_id
    and  r.status = 'KEY_ISSUED';

  -- The cast is required: a bare CASE yields text, and keys.status is
  -- public.key_status.
  update public.keys
  set    status = (case
                     when v_still_overdue > 0                     then 'OVERDUE'
                     when v_still_out >= coalesce(v_key_count, 1) then 'ISSUED'
                     else 'AVAILABLE'
                   end)::public.key_status
  where  id = v_req.key_id;

  -- Audit entry. Verified and unverified returns are distinct events so the
  -- CSO can filter for code-free returns in the audit log.
  perform public._write_audit(
    case when v_verified then 'KEY_RETURNED' else 'KEY_RETURNED_UNVERIFIED' end,
    p_verifier_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'key_id',          v_req.key_id,
      'requester_id',    v_req.requester_id,
      'returner_id',     coalesce(p_returner_id, v_req.requester_id),
      'verifier_id',     p_verifier_id,
      'returned_at',     v_returned_at,
      'verified',        v_verified,
      'override_reason', p_override_reason
    )
  );

  -- Unverified returns are surfaced to the CSO as an incident when an open
  -- shift can be resolved. Incident bookkeeping never blocks the return.
  if not v_verified then
    select s.id
    into   v_shift_id
    from   public.shifts s
    where  s.ended_at is null
    order  by s.started_at desc
    limit  1;

    if v_shift_id is not null then
      insert into public.incidents (
        shift_id, logged_by, type, severity, description,
        related_key_id, related_person_id, status, occurred_at
      ) values (
        v_shift_id,
        p_verifier_id,
        'SUSPICIOUS_ACTIVITY',
        'MEDIUM',
        'Key returned without requester verification. Reason: '
          || coalesce(p_override_reason, 'not given'),
        v_req.key_id,
        v_req.requester_id,
        'OPEN',
        v_returned_at
      );
    end if;
  end if;

  return query select p_request_id, v_returned_at, v_verified;
end;
$$;

revoke execute on function public.return_key(uuid, uuid, text, uuid, text) from public, anon;
grant  execute on function public.return_key(uuid, uuid, text, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- request_return — the requester must be the session user
--
-- Body copied from 20260614064344_return_code_flow.sql; only the actor
-- resolution, the assertion and `is distinct from` differ.
-- ---------------------------------------------------------------------------

create or replace function public.request_return(
  p_request_id   uuid,
  p_requester_id uuid
)
returns table(request_id uuid, return_code text, return_code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid;
  v_actor_role public.user_role;
  v_req        record;
  v_code       text;
  v_expires_at timestamptz;
begin
  perform public._assert_session_actor(p_requester_id);
  v_actor_id := p_requester_id;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  -- Load and lock the request row.
  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  -- May only generate a return code for one's own request. A guest request
  -- has no requester_id, so `<>` would be NULL here and let anyone through.
  if v_req.requester_id is distinct from v_actor_id then
    raise exception 'FORBIDDEN: request does not belong to the caller'
      using errcode = 'P0010';
  end if;

  -- The key must currently be issued.
  if v_req.status <> 'KEY_ISSUED' then
    raise exception 'NOT_ISSUED: request is not in KEY_ISSUED state (current: %)', v_req.status
      using errcode = 'P0009';
  end if;

  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + interval '15 minutes';

  update public.requests
  set    return_code            = v_code,
         return_code_expires_at = v_expires_at
  where  id = p_request_id;

  perform public._write_audit(
    'RETURN_CODE_GENERATED',
    v_actor_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'key_id',     v_req.key_id,
      'expires_at', v_expires_at
    )
  );

  return query select p_request_id, v_code, v_expires_at;
end;
$$;

revoke execute on function public.request_return(uuid, uuid) from public, anon;
grant  execute on function public.request_return(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- generate_weekend_code — the requester must be the session user
--
-- Body copied from 20260812090000_operational_config.sql; only the actor
-- resolution, the assertion and `is distinct from` differ.
-- ---------------------------------------------------------------------------

create or replace function public.generate_weekend_code(
  p_request_id   uuid,
  p_requester_id uuid
)
returns table(request_id uuid, code text, code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id       uuid;
  v_actor_role     public.user_role;
  v_req            record;
  v_code           text;
  v_expires_at     timestamptz;
  v_expiry_minutes int;
begin
  perform public._assert_session_actor(p_requester_id);
  v_actor_id := p_requester_id;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  -- A guest request has no requester_id; `<>` would let anyone mint its code.
  if v_req.requester_id is distinct from v_actor_id then
    raise exception 'FORBIDDEN: not your request'
      using errcode = 'P0010';
  end if;

  if v_req.status <> 'APPROVED' then
    raise exception 'CONFLICT: request is not in APPROVED state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  if v_req.requested_for <> current_date then
    raise exception 'TOO_EARLY: a collection code can only be generated on the requested date'
      using errcode = 'P0014';
  end if;

  select code_expiry_minutes into v_expiry_minutes
  from   public.operational_config
  where  id = '00000000-0000-0000-0000-000000000002';

  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + (coalesce(v_expiry_minutes, 10) || ' minutes')::interval;

  update public.requests
  set    status          = 'CODE_ISSUED',
         code            = v_code,
         code_expires_at = v_expires_at
  where  id = p_request_id;

  perform public._write_audit(
    'CODE_ISSUED',
    v_actor_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object('type', 'WEEKEND')
  );

  return query select p_request_id, v_code, v_expires_at;
end;
$$;

revoke execute on function public.generate_weekend_code(uuid, uuid) from public, anon;
grant  execute on function public.generate_weekend_code(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- expire_request — the requester must be the session user
--
-- Body copied from 20260627213347_weekend_code_expiry_rollback.sql. The actor
-- resolution, the assertion and `is distinct from` differ, and the
-- idempotent early exit now falls through to the single final `return query`
-- instead of returning mid-function.
-- ---------------------------------------------------------------------------

create or replace function public.expire_request(
  p_request_id   uuid,
  p_requester_id uuid
)
returns table(request_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid;
  v_actor_role public.user_role;
  v_req        record;
  v_new_status public.request_status;
begin
  perform public._assert_session_actor(p_requester_id);
  v_actor_id := p_requester_id;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  -- A guest request has no requester_id; `<>` would let anyone expire it.
  if v_req.requester_id is distinct from v_actor_id then
    raise exception 'FORBIDDEN: not your request'
      using errcode = 'P0010';
  end if;

  if v_req.status <> 'CODE_ISSUED' then
    -- Idempotent: report the current status if the request already moved on.
    v_new_status := v_req.status;
  else
    if v_req.code_expires_at is null or v_req.code_expires_at > now() then
      raise exception 'NOT_EXPIRED: the code has not expired yet'
        using errcode = 'P0015';
    end if;

    -- Weekend request expiring on the same day → roll back to APPROVED so the
    -- requester can generate a fresh code. Any other case is terminal EXPIRED.
    if v_req.type = 'WEEKEND' and v_req.requested_for = current_date then
      v_new_status := 'APPROVED';
    else
      v_new_status := 'EXPIRED';
    end if;

    update public.requests
    set    status          = v_new_status,
           code            = null,
           code_expires_at = null
    where  id = p_request_id;

    perform public._write_audit(
      case when v_new_status = 'APPROVED' then 'CODE_EXPIRED' else 'REQUEST_EXPIRED' end,
      v_actor_id,
      v_actor_role,
      'request',
      p_request_id,
      jsonb_build_object('rolled_back_to', v_new_status::text)
    );
  end if;

  return query select p_request_id, v_new_status::text;
end;
$$;

revoke execute on function public.expire_request(uuid, uuid) from public, anon;
grant  execute on function public.expire_request(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cron-only functions — pg_cron runs them as postgres; service_role keeps
-- execute for the cron routes (get_digest_stats) and manual runs.
-- ---------------------------------------------------------------------------

revoke execute on function public.mark_key_overdue() from public, anon, authenticated;
grant  execute on function public.mark_key_overdue() to service_role;

revoke execute on function public.expire_lapsed_codes() from public, anon, authenticated;
grant  execute on function public.expire_lapsed_codes() to service_role;

revoke execute on function public.expire_stale_weekend_requests() from public, anon, authenticated;
grant  execute on function public.expire_stale_weekend_requests() to service_role;

revoke execute on function public.schedule_pending_shift_report() from public, anon, authenticated;
grant  execute on function public.schedule_pending_shift_report() to service_role;

revoke execute on function public.get_digest_stats(uuid, timestamptz) from public, anon, authenticated;
grant  execute on function public.get_digest_stats(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Write policies that skipped an audited RPC
-- ---------------------------------------------------------------------------

drop policy if exists keys_update_cso on public.keys;
drop policy if exists departments_insert_cso on public.units;
drop policy if exists departments_update_cso on public.units;
drop policy if exists departments_delete_cso on public.units;
drop policy if exists authorisations_insert_hod_dept on public.authorisations;
drop policy if exists authorisations_delete_hod_dept on public.authorisations;
drop policy if exists requests_insert_requester on public.requests;
