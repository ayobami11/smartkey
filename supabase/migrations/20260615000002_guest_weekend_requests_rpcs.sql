-- Migration: external (non-registered) weekend key requests — RPCs
--
-- Guest analogues of the registered-user weekend flow. The registered RPCs
-- (create_request, approve_weekend, generate_weekend_code, expire_request) are
-- left untouched; these mirror them but key on an unguessable access_token
-- instead of auth.uid(), because guests have no session.
--
-- All functions are SECURITY DEFINER and called only from server-side routes via
-- the service-role admin client — execute is revoked from anon/public.

-- _write_audit_guest — audit chokepoint for actions with no profile actor.
-- Mirrors _write_audit but records actor_id/actor_role NULL and a human-readable
-- actor_name (e.g. 'Jane Doe (external)') so the CSO audit view still attributes
-- the guest action.
create or replace function public._write_audit_guest(
  p_event       text,
  p_target_type text,
  p_target_id   uuid,
  p_actor_name  text,
  p_payload     jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (
    event,
    actor_id,
    actor_role,
    actor_name,
    actor_department,
    target_type,
    target_id,
    payload
  ) values (
    p_event,
    null,
    null,
    p_actor_name,
    null,
    p_target_type,
    p_target_id,
    p_payload
  );
end;
$$;

revoke execute on function public._write_audit_guest(text, text, uuid, text, jsonb)
  from public, anon, authenticated;

-- create_guest_weekend_request — submit a weekend request as an external person.
-- No code is minted here; the request sits in PENDING_HOD until the HOD assigns a
-- key and approves. Returns the access_token for the guest's status/code page.
create or replace function public.create_guest_weekend_request(
  p_full_name        text,
  p_email            text,
  p_phone            text,
  p_id_type          text,
  p_id_number        text,
  p_department_id    uuid,
  p_weekend_date     date,
  p_return_deadline  timestamptz,
  p_letter_url       text
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
    risk_tier
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
    'LOW'
  )
  returning id into v_request_id;

  perform public._write_audit_guest(
    'REQUEST_CREATED',
    'request',
    v_request_id,
    p_full_name || ' (external)',
    jsonb_build_object(
      'type',            'WEEKEND',
      'status',          'PENDING_HOD',
      'department_id',   p_department_id,
      'requested_for',   p_weekend_date,
      'return_deadline', p_return_deadline,
      'external',        true
    )
  );

  return query select v_request_id, v_access_token;
end;
$$;

revoke execute on function public.create_guest_weekend_request(
  text, text, text, text, text, uuid, date, timestamptz, text
) from public, anon, authenticated;

-- approve_guest_weekend — HOD assigns a key and approves a guest request.
-- Guest analogue of approve_weekend, which cannot run because key_id is null at
-- submit. Validates the chosen key is in the HOD's department, sets it, and moves
-- the request to APPROVED. The requester mints a code on the day via
-- generate_guest_weekend_code.
create or replace function public.approve_guest_weekend(
  p_request_id uuid,
  p_hod_id     uuid,
  p_key_id     uuid,
  p_note       text default null
)
returns table(request_id uuid, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role  public.user_role;
  v_hod_dept    uuid;
  v_req         record;
  v_key_dept    uuid;
  v_decision_id uuid;
begin
  select pr.role, pr.department_id
  into   v_actor_role, v_hod_dept
  from   public.profiles pr
  where  pr.id = p_hod_id;

  if v_actor_role is distinct from 'HOD' then
    raise exception 'FORBIDDEN: only HOD can approve weekend requests'
      using errcode = 'P0002';
  end if;

  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  if v_req.guest_id is null then
    raise exception 'CONFLICT: request is not an external request'
      using errcode = 'P0006';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  select k.department_id
  into   v_key_dept
  from   public.keys k
  where  k.id = p_key_id;

  if v_key_dept is null then
    raise exception 'NOT_FOUND: key % does not exist', p_key_id
      using errcode = 'P0007';
  end if;

  if v_hod_dept is null or v_hod_dept <> v_key_dept then
    raise exception 'FORBIDDEN: key does not belong to the HOD department'
      using errcode = 'P0002';
  end if;

  insert into public.hod_decisions (
    request_id, hod_id, decision, note, signature_verified, signature_mismatch_pct
  ) values (
    p_request_id, p_hod_id, 'APPROVED', p_note, true, null
  )
  returning id into v_decision_id;

  update public.requests
  set    status          = 'APPROVED',
         key_id          = p_key_id,
         hod_decision_id = v_decision_id
  where  id = p_request_id;

  perform public._write_audit(
    'HOD_APPROVED',
    p_hod_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'decision_id', v_decision_id,
      'key_id',      p_key_id,
      'note',        p_note,
      'external',    true
    )
  );

  return query select p_request_id, v_decision_id;
end;
$$;

revoke execute on function public.approve_guest_weekend(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.approve_guest_weekend(uuid, uuid, uuid, text)
  to authenticated;

-- generate_guest_weekend_code — guest mints a short-lived code on the day.
-- Token-keyed analogue of generate_weekend_code.
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
    coalesce(v_guest_name, 'External requester') || ' (external)',
    jsonb_build_object('type', 'WEEKEND', 'external', true)
  );

  return query select v_req.id, v_code, v_expires_at;
end;
$$;

revoke execute on function public.generate_guest_weekend_code(uuid)
  from public, anon, authenticated;

-- expire_guest_request — auto-close a genuinely-expired guest collection code.
-- Token-keyed analogue of expire_request. Idempotent.
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
    coalesce(v_guest_name, 'External requester') || ' (external)',
    jsonb_build_object('external', true)
  );

  return query select v_req.id, 'EXPIRED'::text;
end;
$$;

revoke execute on function public.expire_guest_request(uuid)
  from public, anon, authenticated;
