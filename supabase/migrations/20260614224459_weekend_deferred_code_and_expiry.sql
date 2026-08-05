-- Migration: defer weekend collection code + auto-expire stale codes
--
-- Weekend flow change (Option A): the collection code is no longer minted at
-- HOD approval (which left a usable code valid for the whole week until the
-- weekend date). Instead:
--   1. create_request (WEEKEND) stores no code — request sits in PENDING_HOD.
--   2. approve_weekend moves it to APPROVED, still with no code.
--   3. generate_weekend_code mints a short-lived 10-min code on the requested
--      day only, mirroring the weekday flow.
--
-- Plus expire_request: flips a genuinely-expired CODE_ISSUED request to EXPIRED
-- so the requester never has to manually cancel a dead code.

-- 1. create_request — WEEKEND no longer generates a code up front.
create or replace function public.create_request(
  p_key_id          uuid,
  p_type            text,
  p_return_deadline timestamptz,
  p_weekend_date    date default null
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
begin
  v_type_enum := p_type::public.request_type;

  v_requester_id := auth.uid();
  if v_requester_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_requester_id;

  if v_actor_role <> 'REQUESTER' then
    raise exception 'FORBIDDEN: only REQUESTER role can create requests'
      using errcode = 'P0002';
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

  -- Determine status, code, and requested_for date.
  if v_type_enum = 'WEEKDAY' then
    v_status        := 'CODE_ISSUED';
    v_requested_for := current_date;
    v_code          := lpad(floor(random() * 1000000)::int::text, 6, '0');
    v_expires_at    := now() + interval '10 minutes';
  else
    -- WEEKEND: no code now. The requester generates a short-lived code on the
    -- requested day via generate_weekend_code, after the HOD approves.
    v_status        := 'PENDING_HOD';
    v_requested_for := coalesce(p_weekend_date, current_date);
    v_code          := null;
    v_expires_at    := null;
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
    risk_tier
  ) values (
    v_requester_id,
    p_key_id,
    v_type_enum,
    v_requested_for,
    v_status,
    v_code,
    v_expires_at,
    p_return_deadline,
    'LOW'
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
      'return_deadline', p_return_deadline
    )
  );

  return query
    select v_request_id,
           v_code,
           v_expires_at,
           v_status::text;
end;
$$;

-- 2. approve_weekend — approve only; no code minted here.
create or replace function public.approve_weekend(
  p_request_id              uuid,
  p_hod_id                  uuid,
  p_note                    text    default null,
  p_signature_verified      boolean default true,
  p_signature_mismatch_pct  numeric default null
)
returns table(request_id uuid, code text, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id      uuid;
  v_actor_role    public.user_role;
  v_req           record;
  v_key           record;
  v_hod_dept      uuid;
  v_decision_id   uuid;
begin
  v_actor_id := coalesce(auth.uid(), p_hod_id);

  select pr.role, pr.department_id
  into   v_actor_role, v_hod_dept
  from   public.profiles pr
  where  pr.id = p_hod_id;

  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  select k.department_id
  into   v_key
  from   public.keys k
  where  k.id = v_req.key_id;

  if v_hod_dept is null or v_hod_dept <> v_key.department_id then
    raise exception 'FORBIDDEN: HOD department does not match key department'
      using errcode = 'P0002';
  end if;

  insert into public.hod_decisions (
    request_id,
    hod_id,
    decision,
    note,
    signature_verified,
    signature_mismatch_pct
  ) values (
    p_request_id,
    p_hod_id,
    'APPROVED',
    p_note,
    p_signature_verified,
    p_signature_mismatch_pct
  )
  returning id into v_decision_id;

  -- No code is issued at approval. The requester mints a short-lived code on
  -- the requested day via generate_weekend_code.
  update public.requests
  set    status          = 'APPROVED',
         hod_decision_id = v_decision_id,
         code            = null,
         code_expires_at = null
  where  id = p_request_id;

  perform public._write_audit(
    'HOD_APPROVED',
    p_hod_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'decision_id',             v_decision_id,
      'signature_verified',      p_signature_verified,
      'signature_mismatch_pct',  p_signature_mismatch_pct,
      'note',                    p_note
    )
  );

  return query select p_request_id, null::text, v_decision_id;
end;
$$;

-- 3. generate_weekend_code — requester mints a short-lived code on the day.
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
  v_actor_id   uuid;
  v_actor_role public.user_role;
  v_req        record;
  v_code       text;
  v_expires_at timestamptz;
begin
  v_actor_id := coalesce(auth.uid(), p_requester_id);

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

  if v_req.requester_id <> v_actor_id then
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

  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + interval '10 minutes';

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

-- 4. expire_request — auto-close a genuinely-expired collection code.
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
begin
  v_actor_id := coalesce(auth.uid(), p_requester_id);

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

  if v_req.requester_id <> v_actor_id then
    raise exception 'FORBIDDEN: not your request'
      using errcode = 'P0010';
  end if;

  -- Idempotent: only act on a CODE_ISSUED request. If it already moved on
  -- (issued, expired, cancelled), return the current status without error so a
  -- racing client call is harmless.
  if v_req.status <> 'CODE_ISSUED' then
    return query select p_request_id, v_req.status::text;
    return;
  end if;

  if v_req.code_expires_at is null or v_req.code_expires_at > now() then
    raise exception 'NOT_EXPIRED: the code has not expired yet'
      using errcode = 'P0015';
  end if;

  update public.requests
  set    status          = 'EXPIRED',
         code            = null,
         code_expires_at = null
  where  id = p_request_id;

  perform public._write_audit(
    'REQUEST_EXPIRED',
    v_actor_id,
    v_actor_role,
    'request',
    p_request_id,
    '{}'::jsonb
  );

  return query select p_request_id, 'EXPIRED'::text;
end;
$$;

revoke execute on function public.generate_weekend_code(uuid, uuid) from public, anon;
grant execute on function public.generate_weekend_code(uuid, uuid) to authenticated;

revoke execute on function public.expire_request(uuid, uuid) from public, anon;
grant execute on function public.expire_request(uuid, uuid) to authenticated;
