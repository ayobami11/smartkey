-- Weekend code expiry: roll back to APPROVED on same day
--
-- Previously, expiring a weekend collection code (10-min window) moved the
-- request to EXPIRED (terminal), forcing a fresh full request to re-access
-- the key on the same day. That is too strict: the requester may simply have
-- generated the code too early (on their way to the desk) and then been
-- delayed.
--
-- New behaviour:
--   * Code expires, requested_for = current_date  → status = APPROVED
--     (the requester can generate a fresh code again via generate_weekend_code)
--   * Code expires, requested_for < current_date  → status = EXPIRED (terminal,
--     but expire_stale_weekend_requests would have already caught this at 00:15)
--   * Weekday code expires                         → status = EXPIRED (unchanged)
--
-- expire_stale_weekend_requests (already scheduled at 00:15 UTC) terminates
-- any APPROVED/CODE_ISSUED weekend request once the requested date passes,
-- so no request stays in APPROVED beyond midnight of the requested day.
--
-- Three functions are updated: expire_request (registered user, UI-fired),
-- expire_guest_request (guest, UI-fired), and expire_lapsed_codes (cron
-- backstop). All three share the same branching logic.

-- 1. expire_request — registered requester, UI-fired when countdown hits 0.

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

  -- Idempotent: return current status if already moved on.
  if v_req.status <> 'CODE_ISSUED' then
    return query select p_request_id, v_req.status::text;
    return;
  end if;

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

  return query select p_request_id, v_new_status::text;
end;
$$;

-- 2. expire_guest_request — guest, UI-fired. Same branching logic.

create or replace function public.expire_guest_request(
  p_access_token uuid
)
returns table(request_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req        record;
  v_guest_name text;
  v_new_status public.request_status;
begin
  select r.*
  into   v_req
  from   public.requests r
  where  r.access_token = p_access_token
  for update;

  if not found then
    raise exception 'NOT_FOUND: request does not exist'
      using errcode = 'P0007';
  end if;

  if v_req.status <> 'CODE_ISSUED' then
    return query select v_req.id, v_req.status::text;
    return;
  end if;

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

  select g.full_name into v_guest_name
  from   public.guest_requesters g
  where  g.id = v_req.guest_id;

  perform public._write_audit_guest(
    case when v_new_status = 'APPROVED' then 'CODE_EXPIRED' else 'REQUEST_EXPIRED' end,
    'request',
    v_req.id,
    coalesce(v_guest_name, 'External requester') || ' (external)',
    jsonb_build_object(
      'rolled_back_to', v_new_status::text,
      'external', true
    )
  );

  return query select v_req.id, v_new_status::text;
end;
$$;

-- 3. expire_lapsed_codes — cron backstop for closed browser tabs. Same branching.

create or replace function public.expire_lapsed_codes()
returns table(expired_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req        record;
  v_role       public.user_role;
  v_name       text;
  v_new_status public.request_status;
  v_count      int := 0;
begin
  for v_req in
    select r.id, r.requester_id, r.guest_id, r.type, r.requested_for
    from   public.requests r
    where  r.status          = 'CODE_ISSUED'
      and  r.code_expires_at is not null
      and  r.code_expires_at  < now()
    for update
  loop
    -- Weekend request expiring on the same day → APPROVED (regeneratable).
    -- Everything else → EXPIRED (terminal).
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

    if v_req.requester_id is not null then
      select pr.role into v_role
      from   public.profiles pr
      where  pr.id = v_req.requester_id;

      perform public._write_audit(
        case when v_new_status = 'APPROVED' then 'CODE_EXPIRED' else 'REQUEST_EXPIRED' end,
        v_req.requester_id,
        v_role,
        'request',
        v_req.id,
        jsonb_build_object(
          'reason',         'code_lapsed',
          'rolled_back_to', v_new_status::text
        )
      );
    else
      select g.full_name into v_name
      from   public.guest_requesters g
      where  g.id = v_req.guest_id;

      perform public._write_audit_guest(
        case when v_new_status = 'APPROVED' then 'CODE_EXPIRED' else 'REQUEST_EXPIRED' end,
        'request',
        v_req.id,
        coalesce(v_name, 'Guest'),
        jsonb_build_object(
          'reason',         'code_lapsed',
          'rolled_back_to', v_new_status::text,
          'external',        true
        )
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return query select v_count;
end;
$$;

-- Grants unchanged — these functions already have the right permissions.
-- expire_request: authenticated only
-- expire_guest_request: revoked from all (service-role admin client only)
-- expire_lapsed_codes: revoked from all (cron only)
