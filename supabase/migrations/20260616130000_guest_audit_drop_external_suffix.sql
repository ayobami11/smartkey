-- Migration: store guest audit actor_name without the " (external)" suffix.
--
-- The guest audit writer previously stored actor_name as "<name> (external)".
-- That suffix was display cruft: a guest-initiated event is already identified
-- by actor_id IS NULL and payload->>'external' = true, so the name itself should
-- be the plain guest name. This recreates the three guest RPCs that write audit
-- entries to pass the bare name; the `external: true` payload boolean (the real
-- discriminator) is preserved unchanged.

-- create_guest_weekend_request — submit a weekend request as an external person.
create or replace function public.create_guest_weekend_request(
  p_full_name        text,
  p_email            text,
  p_phone            text,
  p_id_type          text,
  p_id_number        text,
  p_department_id    uuid,
  p_weekend_date     date,
  p_return_deadline  timestamptz,
  p_letter_url       text,
  p_requested_room   text
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
begin
  if not exists (
    select 1 from public.departments d where d.id = p_department_id
  ) then
    raise exception 'NOT_FOUND: department % does not exist', p_department_id
      using errcode = 'P0007';
  end if;

  insert into public.guest_requesters (
    full_name, email, phone, id_document_type, id_document_number
  ) values (
    p_full_name, p_email, p_phone, p_id_type, p_id_number
  )
  returning id into v_guest_id;

  v_access_token := gen_random_uuid();

  insert into public.requests (
    requester_id,
    guest_id,
    key_id,
    requested_department_id,
    type,
    requested_for,
    status,
    code,
    code_expires_at,
    return_deadline,
    access_token,
    letter_url,
    risk_tier,
    requested_room
  ) values (
    null,
    v_guest_id,
    null,
    p_department_id,
    'WEEKEND',
    p_weekend_date,
    'PENDING_HOD',
    null,
    null,
    p_return_deadline,
    v_access_token,
    p_letter_url,
    'LOW',
    p_requested_room
  )
  returning id into v_request_id;

  perform public._write_audit_guest(
    'REQUEST_CREATED',
    'request',
    v_request_id,
    p_full_name,
    jsonb_build_object(
      'type',            'WEEKEND',
      'status',          'PENDING_HOD',
      'department_id',   p_department_id,
      'requested_for',   p_weekend_date,
      'return_deadline', p_return_deadline,
      'requested_room',  p_requested_room,
      'external',        true
    )
  );

  return query select v_request_id, v_access_token;
end;
$$;

revoke execute on function public.create_guest_weekend_request(
  text, text, text, text, text, uuid, date, timestamptz, text, text
) from public, anon, authenticated;

-- generate_guest_weekend_code — guest mints a short-lived code on the day.
create or replace function public.generate_guest_weekend_code(
  p_access_token uuid
)
returns table(request_id uuid, code text, code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req        record;
  v_guest_name text;
  v_code       text;
  v_expires_at timestamptz;
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
  where  id = v_req.id;

  select g.full_name into v_guest_name
  from   public.guest_requesters g
  where  g.id = v_req.guest_id;

  perform public._write_audit_guest(
    'CODE_ISSUED',
    'request',
    v_req.id,
    coalesce(v_guest_name, 'External requester'),
    jsonb_build_object('type', 'WEEKEND', 'external', true)
  );

  return query select v_req.id, v_code, v_expires_at;
end;
$$;

revoke execute on function public.generate_guest_weekend_code(uuid)
  from public, anon, authenticated;

-- expire_guest_request — auto-close a genuinely-expired guest collection code.
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

  update public.requests
  set    status          = 'EXPIRED',
         code            = null,
         code_expires_at = null
  where  id = v_req.id;

  select g.full_name into v_guest_name
  from   public.guest_requesters g
  where  g.id = v_req.guest_id;

  perform public._write_audit_guest(
    'REQUEST_EXPIRED',
    'request',
    v_req.id,
    coalesce(v_guest_name, 'External requester'),
    jsonb_build_object('external', true)
  );

  return query select v_req.id, 'EXPIRED'::text;
end;
$$;

revoke execute on function public.expire_guest_request(uuid)
  from public, anon, authenticated;
