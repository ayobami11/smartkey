-- Migration: rename user_role 'HOD' -> 'DEAN'
--
-- Renames the HOD enum value to DEAN and recreates every plpgsql function whose
-- body text embeds the 'HOD' literal (function bodies are stored as text and
-- re-parsed at runtime, so the old label would fail to resolve).
--
-- RLS policies are NOT recreated here: policy expressions are stored as parsed
-- node trees that reference the enum value by oid, and ALTER TYPE ... RENAME
-- VALUE keeps that oid, so every policy keeps working and reconstructs against
-- the new 'DEAN' label automatically. Their internal policy names still read
-- "hod" -- left as-is, the same class of historical identifier as hod_decisions,
-- hod_id and the HOD_APPROVED / HOD_DECLINED audit event strings.
--
-- The six functions below are recreated from their live, authoriser-aware
-- definitions (faculty keys -> Dean of that department; Administration keys ->
-- CSO), with only the 'HOD' role literal swapped to 'DEAN'.

-- 1. Rename the enum value.
alter type public.user_role rename value 'HOD' to 'DEAN';

-- 2. nominate_collector (authoriser-aware).
create or replace function public.nominate_collector(
  p_key_id       uuid,
  p_requester_id uuid
)
returns table(slot_number int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_dept_id     uuid;
  v_key_dept_id uuid;
  v_authoriser  public.department_authoriser;
  v_slot_count  int;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select role, department_id
  into   v_actor_role, v_dept_id
  from   public.profiles
  where  id = v_actor_id;

  select k.department_id, d.authoriser
  into   v_key_dept_id, v_authoriser
  from   public.keys k
  join   public.departments d on d.id = k.department_id
  where  k.id = p_key_id;

  if v_key_dept_id is null then
    raise exception 'NOT_FOUND: key does not exist' using errcode = 'P0003';
  end if;

  if v_authoriser = 'CSO' then
    if v_actor_role is distinct from 'CSO' then
      raise exception 'FORBIDDEN: only the CSO can authorise collectors for administrative keys'
        using errcode = 'P0002';
    end if;
  else
    if v_actor_role is distinct from 'DEAN' or v_dept_id is distinct from v_key_dept_id then
      raise exception 'FORBIDDEN: key does not belong to your department' using errcode = 'P0002';
    end if;
  end if;

  select count(*)
  into   v_slot_count
  from   public.authorisations
  where  key_id = p_key_id;

  if v_slot_count >= 3 then
    raise exception 'CONFLICT: three authorisation slots are already filled' using errcode = 'P0009';
  end if;

  if exists (
    select 1 from public.authorisations
    where  key_id = p_key_id and profile_id = p_requester_id
  ) then
    raise exception 'CONFLICT: requester is already authorised for this key' using errcode = 'P0009';
  end if;

  insert into public.authorisations (key_id, profile_id, authorised_by)
  values (p_key_id, p_requester_id, v_actor_id);

  perform public._write_audit(
    'COLLECTOR_NOMINATED',
    v_actor_id,
    v_actor_role,
    'authorisation',
    p_key_id,
    jsonb_build_object('requester_id', p_requester_id, 'key_id', p_key_id)
  );

  select count(*)
  into   v_slot_count
  from   public.authorisations
  where  key_id = p_key_id;

  return query select v_slot_count;
end;
$$;

-- 3. remove_collector (authoriser-aware).
create or replace function public.remove_collector(
  p_key_id       uuid,
  p_requester_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_dept_id     uuid;
  v_key_dept_id uuid;
  v_authoriser  public.department_authoriser;
  v_deleted     int;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select role, department_id
  into   v_actor_role, v_dept_id
  from   public.profiles
  where  id = v_actor_id;

  select k.department_id, d.authoriser
  into   v_key_dept_id, v_authoriser
  from   public.keys k
  join   public.departments d on d.id = k.department_id
  where  k.id = p_key_id;

  if v_key_dept_id is null then
    raise exception 'NOT_FOUND: key does not exist' using errcode = 'P0003';
  end if;

  if v_authoriser = 'CSO' then
    if v_actor_role is distinct from 'CSO' then
      raise exception 'FORBIDDEN: only the CSO can remove collectors for administrative keys'
        using errcode = 'P0002';
    end if;
  else
    if v_actor_role is distinct from 'DEAN' or v_dept_id is distinct from v_key_dept_id then
      raise exception 'FORBIDDEN: key does not belong to your department' using errcode = 'P0002';
    end if;
  end if;

  delete from public.authorisations
  where  key_id     = p_key_id
  and    profile_id = p_requester_id;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'NOT_FOUND: authorisation does not exist' using errcode = 'P0003';
  end if;

  perform public._write_audit(
    'COLLECTOR_REMOVED',
    v_actor_id,
    v_actor_role,
    'authorisation',
    p_key_id,
    jsonb_build_object('requester_id', p_requester_id, 'key_id', p_key_id)
  );
end;
$$;

-- 4. approve_weekend (authoriser-aware; CSO path skips signature verification).
create or replace function public.approve_weekend(
  p_request_id             uuid,
  p_hod_id                 uuid,
  p_note                   text default null,
  p_signature_verified     boolean default true,
  p_signature_mismatch_pct numeric default null
)
returns table(request_id uuid, code text, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_req         record;
  v_key_dept    uuid;
  v_authoriser  public.department_authoriser;
  v_actor_dept  uuid;
  v_decision_id uuid;
begin
  v_actor_id := coalesce(auth.uid(), p_hod_id);

  select pr.role, pr.department_id
  into   v_actor_role, v_actor_dept
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

  select k.department_id, d.authoriser
  into   v_key_dept, v_authoriser
  from   public.keys k
  join   public.departments d on d.id = k.department_id
  where  k.id = v_req.key_id;

  if v_authoriser = 'CSO' then
    if v_actor_role is distinct from 'CSO' then
      raise exception 'FORBIDDEN: only the CSO can approve administrative requests'
        using errcode = 'P0002';
    end if;
  else
    if v_actor_role is distinct from 'DEAN' or v_actor_dept is distinct from v_key_dept then
      raise exception 'FORBIDDEN: Dean department does not match key department'
        using errcode = 'P0002';
    end if;
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

-- 5. decline_weekend (authoriser-aware; effective dept = key's, else guest's requested dept).
create or replace function public.decline_weekend(
  p_request_id uuid,
  p_hod_id     uuid,
  p_note       text default null
)
returns table(request_id uuid, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_actor_dept  uuid;
  v_req         record;
  v_dept_id     uuid;
  v_authoriser  public.department_authoriser;
  v_decision_id uuid;
begin
  v_actor_id := coalesce(auth.uid(), p_hod_id);

  select pr.role, pr.department_id
  into   v_actor_role, v_actor_dept
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

  v_dept_id := coalesce(
    (select k.department_id from public.keys k where k.id = v_req.key_id),
    v_req.requested_department_id
  );

  select d.authoriser
  into   v_authoriser
  from   public.departments d
  where  d.id = v_dept_id;

  if v_authoriser = 'CSO' then
    if v_actor_role is distinct from 'CSO' then
      raise exception 'FORBIDDEN: only the CSO can decline administrative requests'
        using errcode = 'P0002';
    end if;
  else
    if v_actor_role is distinct from 'DEAN' or v_actor_dept is distinct from v_dept_id then
      raise exception 'FORBIDDEN: request does not belong to your department'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public.hod_decisions (
    request_id,
    hod_id,
    decision,
    note,
    signature_verified
  ) values (
    p_request_id,
    p_hod_id,
    'DECLINED',
    p_note,
    false
  )
  returning id into v_decision_id;

  update public.requests
  set    status          = 'DECLINED',
         hod_decision_id = v_decision_id
  where  id = p_request_id;

  perform public._write_audit(
    'HOD_DECLINED',
    p_hod_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'decision_id', v_decision_id,
      'note',        p_note
    )
  );

  return query select p_request_id, v_decision_id;
end;
$$;

-- 6. approve_guest_weekend (authoriser-aware; no signature verification).
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
  v_actor_dept  uuid;
  v_req         record;
  v_key_dept    uuid;
  v_authoriser  public.department_authoriser;
  v_decision_id uuid;
begin
  select pr.role, pr.department_id
  into   v_actor_role, v_actor_dept
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

  if v_req.guest_id is null then
    raise exception 'CONFLICT: request is not an external request'
      using errcode = 'P0006';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  select k.department_id, d.authoriser
  into   v_key_dept, v_authoriser
  from   public.keys k
  join   public.departments d on d.id = k.department_id
  where  k.id = p_key_id;

  if v_key_dept is null then
    raise exception 'NOT_FOUND: key % does not exist', p_key_id
      using errcode = 'P0007';
  end if;

  if v_authoriser = 'CSO' then
    if v_actor_role is distinct from 'CSO' then
      raise exception 'FORBIDDEN: only the CSO can approve administrative requests'
        using errcode = 'P0002';
    end if;
  else
    if v_actor_role is distinct from 'DEAN' or v_actor_dept is distinct from v_key_dept then
      raise exception 'FORBIDDEN: key does not belong to the Dean department'
        using errcode = 'P0002';
    end if;
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

-- 7. provision_user (Dean department link).
create or replace function public.provision_user(
  p_full_name     text,
  p_email         text,
  p_role          text,
  p_department_id uuid default null
)
returns table(profile_id uuid, activation_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id        uuid;
  v_activation_token  text;
  v_actor_id          uuid;
  v_actor_role        public.user_role;
  v_role_enum         public.user_role;
  v_auth_user_id      uuid;
begin
  v_role_enum := p_role::public.user_role;

  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  if v_actor_role is null or v_actor_role <> 'CSO' then
    raise exception 'FORBIDDEN: only CSO can provision users'
      using errcode = 'P0002';
  end if;

  select id
  into   v_auth_user_id
  from   auth.users
  where  email = p_email
  limit  1;

  if v_auth_user_id is null then
    raise exception 'AUTH_USER_NOT_FOUND: no auth.users row for email %', p_email
      using errcode = 'P0003';
  end if;

  if exists (
    select 1 from public.profiles where id = v_auth_user_id
  ) then
    raise exception 'DUPLICATE_PROFILE: profile already exists for this user'
      using errcode = 'P0004';
  end if;

  v_activation_token := gen_random_uuid()::text;

  insert into public.profiles (
    id, role, full_name, institutional_email, department_id, status, activation_token
  ) values (
    v_auth_user_id, v_role_enum, p_full_name, p_email,
    p_department_id, 'PENDING_ACTIVATION', v_activation_token
  )
  returning id into v_profile_id;

  -- Link the Dean to their department.
  if v_role_enum = 'DEAN' and p_department_id is not null then
    update public.departments
    set    hod_id = v_profile_id
    where  id = p_department_id;
  end if;

  perform public._write_audit(
    'USER_PROVISIONED',
    v_actor_id,
    v_actor_role,
    'profile',
    v_profile_id,
    jsonb_build_object(
      'email',         p_email,
      'role',          p_role,
      'department_id', p_department_id
    )
  );

  return query select v_profile_id, v_activation_token;
end;
$$;
