-- Migration: rename 'departments' table to 'units' and all related column names.
--
-- 'department' in a university context means a sub-faculty unit (e.g. Computer
-- Science within Engineering). The key-owning rows in this table are faculties
-- and the Administration group -- not departments -- so the old name was a source
-- of confusion. 'unit' is the neutral term that covers both faculties and the
-- Administration group without implying either.
--
-- Schema changes:
--   departments               -> units
--   profiles.department_id    -> profiles.unit_id
--   keys.department_id        -> keys.unit_id
--   requests.requested_department_id -> requests.requested_unit_id
--
-- FK constraints renamed to match new column names (PostgREST uses them for
-- embedding syntax -- old names would leave misleading breadcrumbs).
--
-- Helper function renamed and body updated; RLS policies need no change because
-- Postgres stores them as parse trees using OIDs/attnums, both of which survive
-- renames intact.
--
-- All PLpgSQL function bodies that reference the old names are recreated.

-- 1. Rename table.
alter table public.departments rename to units;

-- 2. Rename columns.
alter table public.profiles rename column department_id to unit_id;
alter table public.keys     rename column department_id to unit_id;
alter table public.requests rename column requested_department_id to requested_unit_id;

-- 3. Rename FK constraints (keeps PostgREST embedding names consistent).
alter table public.profiles rename constraint profiles_department_id_fkey to profiles_unit_id_fkey;
alter table public.keys     rename constraint keys_department_id_fkey     to keys_unit_id_fkey;
alter table public.requests rename constraint requests_requested_department_id_fkey
                                            to requests_requested_unit_id_fkey;
alter table public.units    rename constraint departments_hod_id_fkey     to units_hod_id_fkey;

-- 4. Rename + update helper function.
--    Renaming keeps the OID so all existing RLS policies continue to work.
--    Recreating updates the body to read the renamed column.
alter function public.user_department_id() rename to user_unit_id;

create or replace function public.user_unit_id()
returns uuid
language sql security definer stable
as $$
  select unit_id from public.profiles where id = auth.uid();
$$;

-- Keep a backwards-compatible alias so any caller still using the old name works
-- during the window between this migration and the frontend deploy.
create or replace function public.user_department_id()
returns uuid
language sql security definer stable
as $$
  select public.user_unit_id();
$$;
grant execute on function public.user_department_id() to authenticated;

-- 5. Recreate _write_audit (joins departments table by name).
create or replace function public._write_audit(
  p_event       text,
  p_actor_id    uuid,
  p_actor_role  public.user_role,
  p_target_type text,
  p_target_id   uuid,
  p_payload     jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name       text;
  v_actor_department text;
begin
  select p.full_name, d.name
    into v_actor_name, v_actor_department
    from public.profiles p
    left join public.units d on d.id = p.unit_id
   where p.id = p_actor_id;

  insert into public.audit_log (
    event, actor_id, actor_role, actor_name, actor_department,
    target_type, target_id, payload
  ) values (
    p_event, p_actor_id, p_actor_role, v_actor_name, v_actor_department,
    p_target_type, p_target_id, p_payload
  );
end;
$$;

-- 6. Recreate provision_user (references department_id column and departments table).
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
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;

  if v_actor_role is null or v_actor_role <> 'CSO' then
    raise exception 'FORBIDDEN: only CSO can provision users' using errcode = 'P0002';
  end if;

  select id into v_auth_user_id from auth.users where email = p_email limit 1;

  if v_auth_user_id is null then
    raise exception 'AUTH_USER_NOT_FOUND: no auth.users row for email %', p_email
      using errcode = 'P0003';
  end if;

  if exists (select 1 from public.profiles where id = v_auth_user_id) then
    raise exception 'DUPLICATE_PROFILE: profile already exists for this user'
      using errcode = 'P0004';
  end if;

  v_activation_token := gen_random_uuid()::text;

  insert into public.profiles (
    id, role, full_name, institutional_email, unit_id, status, activation_token
  ) values (
    v_auth_user_id, v_role_enum, p_full_name, p_email,
    p_department_id, 'PENDING_ACTIVATION', v_activation_token
  )
  returning id into v_profile_id;

  if v_role_enum = 'DEAN' and p_department_id is not null then
    update public.units set hod_id = v_profile_id where id = p_department_id;
  end if;

  perform public._write_audit(
    'USER_PROVISIONED', v_actor_id, v_actor_role, 'profile', v_profile_id,
    jsonb_build_object('email', p_email, 'role', p_role, 'department_id', p_department_id)
  );

  return query select v_profile_id, v_activation_token;
end;
$$;

-- 7. Recreate nominate_collector (authoriser-aware; references departments + unit_id).
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

  select role, unit_id into v_actor_role, v_dept_id
  from   public.profiles where id = v_actor_id;

  select k.unit_id, d.authoriser into v_key_dept_id, v_authoriser
  from   public.keys k
  join   public.units d on d.id = k.unit_id
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

  select count(*) into v_slot_count from public.authorisations where key_id = p_key_id;

  if v_slot_count >= 3 then
    raise exception 'CONFLICT: three authorisation slots are already filled' using errcode = 'P0009';
  end if;

  if exists (
    select 1 from public.authorisations where key_id = p_key_id and profile_id = p_requester_id
  ) then
    raise exception 'CONFLICT: requester is already authorised for this key' using errcode = 'P0009';
  end if;

  insert into public.authorisations (key_id, profile_id, authorised_by)
  values (p_key_id, p_requester_id, v_actor_id);

  perform public._write_audit(
    'COLLECTOR_NOMINATED', v_actor_id, v_actor_role, 'authorisation', p_key_id,
    jsonb_build_object('requester_id', p_requester_id, 'key_id', p_key_id)
  );

  select count(*) into v_slot_count from public.authorisations where key_id = p_key_id;
  return query select v_slot_count;
end;
$$;

-- 8. Recreate remove_collector (authoriser-aware).
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

  select role, unit_id into v_actor_role, v_dept_id
  from   public.profiles where id = v_actor_id;

  select k.unit_id, d.authoriser into v_key_dept_id, v_authoriser
  from   public.keys k
  join   public.units d on d.id = k.unit_id
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

  delete from public.authorisations where key_id = p_key_id and profile_id = p_requester_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'NOT_FOUND: authorisation does not exist' using errcode = 'P0003';
  end if;

  perform public._write_audit(
    'COLLECTOR_REMOVED', v_actor_id, v_actor_role, 'authorisation', p_key_id,
    jsonb_build_object('requester_id', p_requester_id, 'key_id', p_key_id)
  );
end;
$$;

-- 9. Recreate approve_weekend (authoriser-aware; references departments + unit_id).
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

  select pr.role, pr.unit_id into v_actor_role, v_actor_dept
  from   public.profiles pr where pr.id = p_hod_id;

  select r.* into v_req from public.requests r where r.id = p_request_id for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id using errcode = 'P0007';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  select k.unit_id, d.authoriser into v_key_dept, v_authoriser
  from   public.keys k
  join   public.units d on d.id = k.unit_id
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
    request_id, hod_id, decision, note, signature_verified, signature_mismatch_pct
  ) values (
    p_request_id, p_hod_id, 'APPROVED', p_note, p_signature_verified, p_signature_mismatch_pct
  )
  returning id into v_decision_id;

  update public.requests
  set    status = 'APPROVED', hod_decision_id = v_decision_id, code = null, code_expires_at = null
  where  id = p_request_id;

  perform public._write_audit(
    'HOD_APPROVED', p_hod_id, v_actor_role, 'request', p_request_id,
    jsonb_build_object(
      'decision_id', v_decision_id,
      'signature_verified', p_signature_verified,
      'signature_mismatch_pct', p_signature_mismatch_pct,
      'note', p_note
    )
  );

  return query select p_request_id, null::text, v_decision_id;
end;
$$;

-- 10. Recreate decline_weekend (references departments + unit_id + requested_unit_id).
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

  select pr.role, pr.unit_id into v_actor_role, v_actor_dept
  from   public.profiles pr where pr.id = p_hod_id;

  select r.* into v_req from public.requests r where r.id = p_request_id for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id using errcode = 'P0007';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  v_dept_id := coalesce(
    (select k.unit_id from public.keys k where k.id = v_req.key_id),
    v_req.requested_unit_id
  );

  select d.authoriser into v_authoriser from public.units d where d.id = v_dept_id;

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
    request_id, hod_id, decision, note, signature_verified
  ) values (p_request_id, p_hod_id, 'DECLINED', p_note, false)
  returning id into v_decision_id;

  update public.requests
  set    status = 'DECLINED', hod_decision_id = v_decision_id
  where  id = p_request_id;

  perform public._write_audit(
    'HOD_DECLINED', p_hod_id, v_actor_role, 'request', p_request_id,
    jsonb_build_object('decision_id', v_decision_id, 'note', p_note)
  );

  return query select p_request_id, v_decision_id;
end;
$$;

-- 11. Recreate approve_guest_weekend (references departments + unit_id).
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
  select pr.role, pr.unit_id into v_actor_role, v_actor_dept
  from   public.profiles pr where pr.id = p_hod_id;

  select r.* into v_req from public.requests r where r.id = p_request_id for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id using errcode = 'P0007';
  end if;

  if v_req.guest_id is null then
    raise exception 'CONFLICT: request is not an external request' using errcode = 'P0006';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  select k.unit_id, d.authoriser into v_key_dept, v_authoriser
  from   public.keys k
  join   public.units d on d.id = k.unit_id
  where  k.id = p_key_id;

  if v_key_dept is null then
    raise exception 'NOT_FOUND: key % does not exist', p_key_id using errcode = 'P0007';
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
  ) values (p_request_id, p_hod_id, 'APPROVED', p_note, true, null)
  returning id into v_decision_id;

  update public.requests
  set    status = 'APPROVED', key_id = p_key_id, hod_decision_id = v_decision_id
  where  id = p_request_id;

  perform public._write_audit(
    'HOD_APPROVED', p_hod_id, v_actor_role, 'request', p_request_id,
    jsonb_build_object(
      'decision_id', v_decision_id, 'key_id', p_key_id, 'note', p_note, 'external', true
    )
  );

  return query select p_request_id, v_decision_id;
end;
$$;

-- 12. Recreate create_guest_weekend_request (references departments + requested_department_id).
drop function if exists public.create_guest_weekend_request(
  text, text, text, text, text, uuid, date, timestamptz, text, text
);

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
begin
  if not exists (select 1 from public.units d where d.id = p_department_id) then
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
    risk_tier, requested_room
  ) values (
    null, v_guest_id, null, p_department_id, 'WEEKEND', p_weekend_date,
    'PENDING_HOD', null, null, p_return_deadline, v_access_token, p_letter_url,
    'LOW', p_requested_room
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
