-- decision_token is now created with the request, in the same transaction.
--
-- Until now POST /api/requests/submit and POST /api/public/weekend-request
-- minted it after the response (inside after()) with a separate admin-client
-- UPDATE, and only then sent the Dean's email. If that UPDATE failed, the
-- email went out without its one-click link, and the token was a state change
-- living in email code. Both RPCs now set it for every WEEKEND request whose
-- unit is Dean-authorised; Administration (authoriser = 'CSO') requests still
-- get none. Signatures and return columns are unchanged.
--
-- Bodies are copied verbatim from their latest definitions
-- (20260812090000_operational_config.sql and
-- 20260627111159_rename_departments_to_units.sql); only the token lines and,
-- for the guest RPC, reading the unit's authoriser alongside the existence
-- check are new.

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
  v_expiry_minutes  int;
  v_decision_token  uuid;
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
    'LOW',
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

-- CREATE OR REPLACE keeps existing grants; restated so the ACL is visible
-- here rather than inferred (see the 2026-08-30 PUBLIC-grant finding).
revoke execute on function public.create_request(uuid, text, timestamptz, date)
  from public, anon;
grant execute on function public.create_request(uuid, text, timestamptz, date)
  to authenticated;

create or replace function public.create_guest_weekend_request(
  p_full_name       text,
  p_email           text,
  p_phone           text,
  p_id_type         text,
  p_id_number       text,
  p_department_id   uuid,
  p_weekend_date    date,
  p_return_deadline timestamptz,
  p_letter_url      text,
  p_requested_room  text
)
returns table(request_id uuid, access_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id     uuid;
  v_request_id   uuid;
  v_access_token uuid;
  v_authoriser   public.department_authoriser;
begin
  select d.authoriser into v_authoriser
  from   public.units d
  where  d.id = p_department_id;

  if not found then
    raise exception 'NOT_FOUND: unit % does not exist', p_department_id
      using errcode = 'P0007';
  end if;

  insert into public.guest_requesters (
    full_name, email, phone, id_document_type, id_document_number
  ) values (p_full_name, p_email, p_phone, p_id_type, p_id_number)
  returning id into v_guest_id;

  v_access_token := gen_random_uuid();

  insert into public.requests (
    requester_id, guest_id, key_id, requested_unit_id, type, requested_for,
    status, code, code_expires_at, return_deadline, access_token, letter_url,
    risk_tier, requested_room, decision_token
  ) values (
    null, v_guest_id, null, p_department_id, 'WEEKEND', p_weekend_date,
    'PENDING_HOD', null, null, p_return_deadline, v_access_token, p_letter_url,
    'LOW', p_requested_room,
    -- One-click Approve/Decline for the Dean's email; none for
    -- Administration (authoriser = 'CSO') units.
    case when v_authoriser = 'DEAN' then gen_random_uuid() end
  )
  returning id into v_request_id;

  perform public._write_audit_guest(
    'REQUEST_CREATED', 'request', v_request_id,
    p_full_name || ' (external)',
    jsonb_build_object(
      'type', 'WEEKEND', 'status', 'PENDING_HOD',
      'department_id', p_department_id,
      'requested_for', p_weekend_date, 'return_deadline', p_return_deadline,
      'requested_room', p_requested_room, 'external', true
    )
  );

  return query select v_request_id, v_access_token;
end;
$$;

revoke execute on function public.create_guest_weekend_request(
  text, text, text, text, text, uuid, date, timestamptz, text, text
) from public, anon, authenticated;
