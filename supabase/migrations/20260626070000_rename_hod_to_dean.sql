-- Migration: rename user_role 'HOD' → 'DEAN'
--
-- Renames the HOD enum value to DEAN and recreates every plpgsql function whose
-- body text referenced the 'HOD' literal. Identifiers hod_decisions, hod_id,
-- HOD_APPROVED, HOD_DECLINED are left as-is (internal, non-user-facing).

-- 1. Rename the enum value.
alter type public.user_role rename value 'HOD' to 'DEAN';

-- 2. Recreate nominate_collector (was: 'HOD' role check).
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
  v_actor_id      uuid;
  v_actor_role    public.user_role;
  v_dept_id       uuid;
  v_key_dept_id   uuid;
  v_slot_count    int;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select role, department_id
  into   v_actor_role, v_dept_id
  from   public.profiles
  where  id = v_actor_id;

  if v_actor_role is null or v_actor_role <> 'DEAN' then
    raise exception 'FORBIDDEN: only the Dean can nominate collectors' using errcode = 'P0002';
  end if;

  select department_id
  into   v_key_dept_id
  from   public.keys
  where  id = p_key_id;

  if v_key_dept_id is null or v_key_dept_id <> v_dept_id then
    raise exception 'FORBIDDEN: key does not belong to your department' using errcode = 'P0002';
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

-- 3. Recreate remove_collector.
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

  if v_actor_role is null or v_actor_role <> 'DEAN' then
    raise exception 'FORBIDDEN: only the Dean can remove collectors' using errcode = 'P0002';
  end if;

  select department_id
  into   v_key_dept_id
  from   public.keys
  where  id = p_key_id;

  if v_key_dept_id is null or v_key_dept_id <> v_dept_id then
    raise exception 'FORBIDDEN: key does not belong to your department' using errcode = 'P0002';
  end if;

  delete from public.authorisations
  where  key_id    = p_key_id
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

-- 4. Recreate approve_guest_weekend (guest_weekend_requests_rpcs.sql line 175).
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

  if v_actor_role is distinct from 'DEAN' then
    raise exception 'FORBIDDEN: only the Dean can approve weekend requests'
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

  select department_id
  into   v_key_dept
  from   public.keys
  where  id = p_key_id;

  if v_key_dept is null or v_key_dept <> v_hod_dept then
    raise exception 'FORBIDDEN: key does not belong to the Dean department'
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

-- 5. Recreate provision_user (role check 'HOD' → 'DEAN').
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

-- 6. Recreate RLS policies that contained the 'HOD' literal.

-- profiles: HOD sees own dept profiles
drop policy if exists profiles_select_hod_dept on public.profiles;
create policy profiles_select_dean_dept on public.profiles
  for select using (
    public.user_role() = 'DEAN'
    and department_id = (
      select department_id from public.profiles where id = auth.uid()
    )
  );

-- authorisations: HOD insert/delete
drop policy if exists authorisations_insert_hod_dept on public.authorisations;
create policy authorisations_insert_dean_dept on public.authorisations
  for insert with check (
    public.user_role() = 'DEAN'
    and (select department_id from public.profiles where id = auth.uid()) = (
      select department_id from public.keys where id = key_id
    )
  );

drop policy if exists authorisations_delete_hod_dept on public.authorisations;
create policy authorisations_delete_dean_dept on public.authorisations
  for delete using (
    public.user_role() = 'DEAN'
    and (select department_id from public.profiles where id = auth.uid()) = (
      select department_id from public.keys where id = key_id
    )
  );

-- requests: HOD sees dept requests
drop policy if exists requests_select_hod_dept on public.requests;
create policy requests_select_dean_dept on public.requests
  for select using (
    public.user_role() = 'DEAN'
    and key_id in (
      select id from public.keys
      where department_id = (
        select department_id from public.profiles where id = auth.uid()
      )
    )
  );

-- hod_decisions: HOD sees own decisions
drop policy if exists hod_decisions_select_hod_dept on public.hod_decisions;
create policy hod_decisions_select_dean on public.hod_decisions
  for select using (
    public.user_role() = 'DEAN'
    and hod_id = auth.uid()
  );

-- guest_requesters: HOD can see guests for their dept (from 20260616115021)
drop policy if exists guest_requesters_select_hod on public.guest_requesters;
create policy guest_requesters_select_dean on public.guest_requesters
  for select using (
    exists (
      select 1
      from   public.requests r
      join   public.profiles hod on hod.id = auth.uid()
      where  r.guest_id       = guest_requesters.id
        and  r.requested_department_id = hod.department_id
        and  hod.role = 'DEAN'
    )
  );

-- guest_weekend_requests schema policy (20260615000001 line 93)
drop policy if exists weekend_requests_select_hod on public.requests;
create policy weekend_requests_select_dean on public.requests
  for select using (
    type = 'WEEKEND'
    and public.user_role() = 'DEAN'
    and key_id in (
      select id from public.keys
      where department_id = (
        select department_id from public.profiles where id = auth.uid()
      )
    )
  );

-- weekend_letters bucket policy (20260612000001 line 33)
-- This is a storage policy — recreate if the policy name is known.
-- The original used: AND role IN ('HOD', 'CSO')
-- Storage policies are managed via Supabase dashboard or separate migration;
-- the role check in plpgsql functions above covers the functional gate.
