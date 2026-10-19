-- One implementation per request-lifecycle step, for registered and guest.
--
-- Three steps existed twice, once keyed on (request_id, requester_id) for a
-- signed-in requester and once keyed on access_token for an external guest:
--
--   step          registered                  guest
--   weekend code  generate_weekend_code       generate_guest_weekend_code
--   return code   request_return              request_return_guest
--   expire        expire_request              expire_guest_request
--
-- The copies had drifted (see docs/CHANGELOG.md 2026-10-19 for the full
-- table). The ones that changed behaviour:
--
--   * request_return_guest raised CONFLICT (P0006) for a request that is not
--     KEY_ISSUED; request_return raised NOT_ISSUED (P0009). Both now raise
--     NOT_ISSUED. The guest route still answers 409.
--   * request_return_guest and expire_guest_request wrote the guest's audit
--     name as '<name> (external)'. 20260616115954 removed that suffix on
--     purpose (payload->>'external' is the discriminator), but both were
--     recreated later from older copies and brought it back. Both now write
--     the plain name, like generate_guest_weekend_code and the cron sweeps.
--   * The missing-guest fallback name was 'External requester' in the three
--     guest RPCs and 'Guest' in expire_lapsed_codes; it is now 'Guest'
--     wherever these steps write (unreachable in practice: guest_id is a
--     foreign key and full_name is required).
--   * request_return's ownership refusal said 'FORBIDDEN: request does not
--     belong to the caller'; the other two said 'FORBIDDEN: not your
--     request'. All three say the latter. Same kind and SQLSTATE (P0010).
--   * expire_guest_request returned mid-function on its idempotent branch;
--     expire_request had already been changed to fall through. The single
--     implementation falls through.
--
-- Shape after this migration:
--
--   _lifecycle_weekend_code(request_id, actor)   the step, once each
--   _lifecycle_return_code(request_id, actor)
--   _lifecycle_expire_code(request_id, actor)
--
--   `actor` is the registered requester's profile id, or NULL for the guest
--   who holds the request. Each step locks the row (_lock_lifecycle_request,
--   which also refuses a request the actor does not hold), checks the state,
--   writes, and records exactly one audit entry (_write_lifecycle_audit,
--   which picks _write_audit or _write_audit_guest from the actor).
--
--   The six public RPCs keep their names, signatures, return types, SECURITY
--   DEFINER and grants. Each is now a thin wrapper that authorises the caller
--   and hands the resolved request id to the step:
--     registered: _assert_session_actor(requester_id), then the step with
--                 that requester as actor (the step checks ownership);
--     guest:      _resolve_guest_request(access_token) -> request id, then
--                 the step with a NULL actor.
--
-- The new internal functions are SECURITY INVOKER and executable by no API
-- role. They are reached only through the SECURITY DEFINER wrappers, which
-- run them as the function owner.
--
-- Deploy order: safe to apply before the application code. No signature,
-- return type or grant changes. The one new error kind (NOT_ISSUED from
-- request_return_guest) maps through the old guest route's catalogue default
-- to the same 409 status; only its copy differs until the code ships.

-- ---------------------------------------------------------------------------
-- _resolve_guest_request — an access_token to the request it unlocks
-- ---------------------------------------------------------------------------

create or replace function public._resolve_guest_request(p_access_token uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  select r.id
  into   v_request_id
  from   public.requests r
  where  r.access_token = p_access_token;

  -- Raised without the token: it is the guest's only credential.
  if not found then
    raise exception 'NOT_FOUND: request does not exist'
      using errcode = 'P0007';
  end if;

  return v_request_id;
end;
$$;

revoke execute on function public._resolve_guest_request(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- _lock_lifecycle_request — lock the request and check the actor holds it
--
-- p_actor_id is the registered requester, or NULL for a guest. A registered
-- actor must be the request's requester; a NULL actor may act only on a guest
-- request. `is distinct from` keeps a guest request (requester_id IS NULL)
-- out of reach of every registered actor.
-- ---------------------------------------------------------------------------

create or replace function public._lock_lifecycle_request(
  p_request_id uuid,
  p_actor_id   uuid
)
returns public.requests
language plpgsql
set search_path = public
as $$
declare
  v_req public.requests;
begin
  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  if (p_actor_id is null and v_req.guest_id is null)
     or (p_actor_id is not null and v_req.requester_id is distinct from p_actor_id) then
    raise exception 'FORBIDDEN: not your request'
      using errcode = 'P0010';
  end if;

  return v_req;
end;
$$;

revoke execute on function public._lock_lifecycle_request(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- _write_lifecycle_audit — the one audit entry a lifecycle step writes
--
-- Registered actor: _write_audit with the actor's role (name and unit are
-- denormalised there). Guest: _write_audit_guest with the plain guest name
-- and `external: true` added to the payload, the discriminator the CSO audit
-- view and docs/AUDIT_EVENTS.md rely on.
-- ---------------------------------------------------------------------------

create or replace function public._write_lifecycle_audit(
  p_event      text,
  p_request_id uuid,
  p_actor_id   uuid,
  p_guest_id   uuid,
  p_payload    jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_actor_role public.user_role;
  v_guest_name text;
begin
  if p_actor_id is not null then
    select pr.role
    into   v_actor_role
    from   public.profiles pr
    where  pr.id = p_actor_id;

    perform public._write_audit(
      p_event, p_actor_id, v_actor_role, 'request', p_request_id, p_payload
    );
  else
    select g.full_name
    into   v_guest_name
    from   public.guest_requesters g
    where  g.id = p_guest_id;

    perform public._write_audit_guest(
      p_event, 'request', p_request_id, coalesce(v_guest_name, 'Guest'),
      p_payload || jsonb_build_object('external', true)
    );
  end if;
end;
$$;

revoke execute on function public._write_lifecycle_audit(text, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- _lifecycle_weekend_code — mint the on-the-day collection code
--
-- APPROVED weekend request, on its requested date only -> CODE_ISSUED with a
-- code that lives operational_config.code_expiry_minutes (default 10).
-- Moving into CODE_ISSUED is what reserves a copy of the key, so the
-- requests_key_capacity trigger may refuse it (NO_KEYS_AVAILABLE, P0016).
-- ---------------------------------------------------------------------------

create or replace function public._lifecycle_weekend_code(
  p_request_id uuid,
  p_actor_id   uuid
)
returns table(request_id uuid, code text, code_expires_at timestamptz)
language plpgsql
set search_path = public
as $$
declare
  v_req            public.requests;
  v_code           text;
  v_expires_at     timestamptz;
  v_expiry_minutes int;
begin
  select * into v_req from public._lock_lifecycle_request(p_request_id, p_actor_id);

  if v_req.status <> 'APPROVED' then
    raise exception 'CONFLICT: request is not in APPROVED state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  if v_req.requested_for <> current_date then
    raise exception 'TOO_EARLY: a collection code can only be generated on the requested date'
      using errcode = 'P0014';
  end if;

  select oc.code_expiry_minutes
  into   v_expiry_minutes
  from   public.operational_config oc
  where  oc.id = '00000000-0000-0000-0000-000000000002';

  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + (coalesce(v_expiry_minutes, 10) || ' minutes')::interval;

  update public.requests
  set    status          = 'CODE_ISSUED',
         code            = v_code,
         code_expires_at = v_expires_at
  where  id = v_req.id;

  perform public._write_lifecycle_audit(
    'CODE_ISSUED', v_req.id, p_actor_id, v_req.guest_id,
    jsonb_build_object('type', 'WEEKEND')
  );

  return query select v_req.id, v_code, v_expires_at;
end;
$$;

revoke execute on function public._lifecycle_weekend_code(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- _lifecycle_return_code — mint a return code for an issued key
--
-- KEY_ISSUED only; the request stays KEY_ISSUED. 15-minute expiry (not the
-- configurable collection-code expiry).
-- ---------------------------------------------------------------------------

create or replace function public._lifecycle_return_code(
  p_request_id uuid,
  p_actor_id   uuid
)
returns table(request_id uuid, return_code text, return_code_expires_at timestamptz)
language plpgsql
set search_path = public
as $$
declare
  v_req        public.requests;
  v_code       text;
  v_expires_at timestamptz;
begin
  select * into v_req from public._lock_lifecycle_request(p_request_id, p_actor_id);

  if v_req.status <> 'KEY_ISSUED' then
    raise exception 'NOT_ISSUED: request is not in KEY_ISSUED state (current: %)', v_req.status
      using errcode = 'P0009';
  end if;

  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + interval '15 minutes';

  update public.requests
  set    return_code            = v_code,
         return_code_expires_at = v_expires_at
  where  id = v_req.id;

  perform public._write_lifecycle_audit(
    'RETURN_CODE_GENERATED', v_req.id, p_actor_id, v_req.guest_id,
    jsonb_build_object('key_id', v_req.key_id, 'expires_at', v_expires_at)
  );

  return query select v_req.id, v_code, v_expires_at;
end;
$$;

revoke execute on function public._lifecycle_return_code(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- _lifecycle_expire_code — retire a lapsed collection code
--
-- A CODE_ISSUED request whose code has lapsed -> EXPIRED (REQUEST_EXPIRED),
-- except a weekend request whose requested date is today, which rolls back
-- to APPROVED (CODE_EXPIRED) so a fresh code can be minted. Any other status
-- is reported back unchanged, with no write and no audit entry (the UI fires
-- this when its countdown hits zero, possibly after the request moved on).
-- ---------------------------------------------------------------------------

create or replace function public._lifecycle_expire_code(
  p_request_id uuid,
  p_actor_id   uuid
)
returns table(request_id uuid, status text)
language plpgsql
set search_path = public
as $$
declare
  v_req        public.requests;
  v_new_status public.request_status;
begin
  select * into v_req from public._lock_lifecycle_request(p_request_id, p_actor_id);

  if v_req.status <> 'CODE_ISSUED' then
    -- Idempotent: report the current status if the request already moved on.
    v_new_status := v_req.status;
  else
    if v_req.code_expires_at is null or v_req.code_expires_at > now() then
      raise exception 'NOT_EXPIRED: the code has not expired yet'
        using errcode = 'P0015';
    end if;

    if v_req.type = 'WEEKEND' and v_req.requested_for = current_date then
      v_new_status := 'APPROVED';
    else
      v_new_status := 'EXPIRED';
    end if;

    update public.requests
    set    status          = v_new_status,
           code            = null,
           code_expires_at = null
    where  id = v_req.id;

    perform public._write_lifecycle_audit(
      case when v_new_status = 'APPROVED' then 'CODE_EXPIRED' else 'REQUEST_EXPIRED' end,
      v_req.id, p_actor_id, v_req.guest_id,
      jsonb_build_object('rolled_back_to', v_new_status::text)
    );
  end if;

  return query select v_req.id, v_new_status::text;
end;
$$;

revoke execute on function public._lifecycle_expire_code(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Registered entry points — the requester must be the session user
--
-- A NULL requester is refused before the step runs: NULL is how a step is
-- told "the guest", and only the access_token wrappers may say that. (Before
-- this migration a service-role or cron caller passing NULL got through the
-- `is distinct from` ownership test on a guest request.)
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
begin
  perform public._assert_session_actor(p_requester_id);

  if p_requester_id is null then
    raise exception 'FORBIDDEN: not your request'
      using errcode = 'P0010';
  end if;

  return query select * from public._lifecycle_weekend_code(p_request_id, p_requester_id);
end;
$$;

revoke execute on function public.generate_weekend_code(uuid, uuid) from public, anon;
grant  execute on function public.generate_weekend_code(uuid, uuid) to authenticated, service_role;

create or replace function public.request_return(
  p_request_id   uuid,
  p_requester_id uuid
)
returns table(request_id uuid, return_code text, return_code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._assert_session_actor(p_requester_id);

  if p_requester_id is null then
    raise exception 'FORBIDDEN: not your request'
      using errcode = 'P0010';
  end if;

  return query select * from public._lifecycle_return_code(p_request_id, p_requester_id);
end;
$$;

revoke execute on function public.request_return(uuid, uuid) from public, anon;
grant  execute on function public.request_return(uuid, uuid) to authenticated, service_role;

create or replace function public.expire_request(
  p_request_id   uuid,
  p_requester_id uuid
)
returns table(request_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._assert_session_actor(p_requester_id);

  if p_requester_id is null then
    raise exception 'FORBIDDEN: not your request'
      using errcode = 'P0010';
  end if;

  return query select * from public._lifecycle_expire_code(p_request_id, p_requester_id);
end;
$$;

revoke execute on function public.expire_request(uuid, uuid) from public, anon;
grant  execute on function public.expire_request(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Guest entry points — the access_token is the credential
--
-- Service-role only, as before: the public routes call them through the admin
-- client. The revoke is the one each function has carried since it was
-- created; service_role's execute came from Supabase's default privileges
-- and is now stated explicitly.
-- ---------------------------------------------------------------------------

create or replace function public.generate_guest_weekend_code(
  p_access_token uuid
)
returns table(request_id uuid, code text, code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  v_request_id := public._resolve_guest_request(p_access_token);

  return query select * from public._lifecycle_weekend_code(v_request_id, null);
end;
$$;

revoke execute on function public.generate_guest_weekend_code(uuid)
  from public, anon, authenticated;
grant  execute on function public.generate_guest_weekend_code(uuid) to service_role;

create or replace function public.request_return_guest(
  p_access_token uuid
)
returns table(request_id uuid, return_code text, return_code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  v_request_id := public._resolve_guest_request(p_access_token);

  return query select * from public._lifecycle_return_code(v_request_id, null);
end;
$$;

revoke execute on function public.request_return_guest(uuid)
  from public, anon, authenticated;
grant  execute on function public.request_return_guest(uuid) to service_role;

create or replace function public.expire_guest_request(
  p_access_token uuid
)
returns table(request_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  v_request_id := public._resolve_guest_request(p_access_token);

  return query select * from public._lifecycle_expire_code(v_request_id, null);
end;
$$;

revoke execute on function public.expire_guest_request(uuid)
  from public, anon, authenticated;
grant  execute on function public.expire_guest_request(uuid) to service_role;
