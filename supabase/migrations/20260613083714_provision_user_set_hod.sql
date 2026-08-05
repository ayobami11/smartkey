-- Fix: provisioning an HOD never linked them back to their department, so
-- departments.hod_id stayed null and the key inventory showed "—" for the HOD.
-- provision_user now sets departments.hod_id when the provisioned role is HOD,
-- and we backfill departments that already have an HOD profile but no link.

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
    id,
    role,
    full_name,
    institutional_email,
    department_id,
    status,
    activation_token
  ) values (
    v_auth_user_id,
    v_role_enum,
    p_full_name,
    p_email,
    p_department_id,
    'PENDING_ACTIVATION',
    v_activation_token
  )
  returning id into v_profile_id;

  -- Link the HOD to their department so the department (and its keys) resolve
  -- the HOD name. Provisioning is the assignment; this also covers HOD changes.
  if v_role_enum = 'HOD' and p_department_id is not null then
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

-- Backfill: link departments that already have an HOD profile but no hod_id.
-- Picks the most recently provisioned HOD if more than one exists.
update public.departments d
set    hod_id = sub.id
from (
  select distinct on (department_id) id, department_id
  from   public.profiles
  where  role = 'HOD' and department_id is not null
  order  by department_id, created_at desc
) sub
where d.id = sub.department_id
  and d.hod_id is null;
