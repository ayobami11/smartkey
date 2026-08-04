-- Backfilled from supabase_migrations.schema_migrations on 2026-08-04.
-- This migration was applied directly to the remote project (via the Supabase
-- dashboard or MCP) and was never committed. Recovered verbatim so that a fresh
-- replay of supabase/migrations/ reproduces production. Do not edit.
--
-- Missed by the first backfill pass earlier the same day, which matched local
-- files to remote rows by name and never enumerated the remote-only remainder.
--
-- What this file is for. 20260627111159_rename_departments_to_units.sql renames
-- departments -> units and department_id -> unit_id. The version of
-- nominate_collector_active_check that ACTUALLY RAN against production still
-- referenced the old names, which is why this hotfix was applied an hour later.
--
-- The local copy of 20260627111250_nominate_collector_active_check.sql was
-- subsequently corrected in place to use unit_id, so replaying the local directory
-- would already produce a working function without this file. It is committed for
-- history fidelity, not as a functional rescue: it records what production actually
-- executed, and re-running it is a no-op (create or replace, same final definition).

-- Fix nominate_collector to use renamed columns (department_id -> unit_id, departments -> units).
-- The previous migration (20260627111250) still referenced the old names, causing runtime
-- "column does not exist" errors when CSO or Dean adds a collector.

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

  select role, unit_id
  into   v_actor_role, v_dept_id
  from   public.profiles
  where  id = v_actor_id;

  select k.unit_id, d.authoriser
  into   v_key_dept_id, v_authoriser
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

  -- Requester must be an active REQUESTER profile.
  if not exists (
    select 1 from public.profiles
    where  id = p_requester_id
      and  role = 'REQUESTER'
      and  status = 'ACTIVE'
  ) then
    raise exception 'REQUESTER_INACTIVE: user is not an active requester' using errcode = 'P0004';
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
