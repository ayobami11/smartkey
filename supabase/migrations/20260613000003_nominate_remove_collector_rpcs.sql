-- RPCs: nominate_collector and remove_collector
-- Moves the authorisations INSERT and DELETE out of direct table access
-- and into transactional RPCs that validate actor, key ownership, slot
-- constraints, and write an audit entry atomically.

-- 1. nominate_collector
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

  if v_actor_role is null or v_actor_role <> 'HOD' then
    raise exception 'FORBIDDEN: only HOD can nominate collectors' using errcode = 'P0002';
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

-- 2. remove_collector
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

  if v_actor_role is null or v_actor_role <> 'HOD' then
    raise exception 'FORBIDDEN: only HOD can remove collectors' using errcode = 'P0002';
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

grant execute on function public.nominate_collector(uuid, uuid) to authenticated;
grant execute on function public.remove_collector(uuid, uuid)   to authenticated;
