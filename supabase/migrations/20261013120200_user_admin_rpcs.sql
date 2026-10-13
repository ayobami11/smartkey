-- CSO user edits and deactivation become atomic RPCs.
--
-- PATCH /api/admin/users/[id] updated the profile, then synced units.hod_id
-- in two more statements ("non-fatal" on failure), then wrote USER_UPDATED in
-- a fourth call whose failure was swallowed. Its one-Dean-per-unit check was
-- a read followed by a write, so two concurrent moves could both pass it.
-- PATCH /api/admin/users/[id]/revoke had the same shape for DEACTIVATED.
--
-- Both are now one transaction each. The actor comes from auth.uid(), and
-- both are CSO-only. The auth ban that actually locks a revoked user out
-- lives in GoTrue, outside Postgres, so the route orders it around
-- deactivate_user (ban first, lift it if the RPC fails) — see
-- src/lib/admin/revoke-user.ts.

create or replace function public.update_user_profile(
  p_profile_id uuid,
  p_full_name  text,
  p_unit_id    uuid default null
)
returns table(profile_id uuid, full_name text, unit_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id     uuid := auth.uid();
  v_actor_role   public.user_role;
  v_target       record;
  v_full_name    text := btrim(coalesce(p_full_name, ''));
  v_departmental boolean;
  v_next_unit    uuid;
  v_unit_changed boolean := false;
  v_changes      jsonb := '{}'::jsonb;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;
  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can edit users'
      using errcode = 'P0002';
  end if;

  if v_full_name = '' then
    raise exception 'VALIDATION: full_name is required'
      using errcode = 'P0004';
  end if;

  select pr.id, pr.role, pr.full_name, pr.unit_id
  into   v_target
  from   public.profiles pr
  where  pr.id = p_profile_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: profile % does not exist', p_profile_id
      using errcode = 'P0007';
  end if;

  -- A unit only applies to departmental roles; for VERIFIER/CSO a supplied
  -- unit is ignored, as the route always did.
  v_departmental := v_target.role in ('DEAN', 'REQUESTER');
  v_next_unit    := v_target.unit_id;

  if v_departmental then
    if p_unit_id is null then
      raise exception 'VALIDATION: unit is required for this role'
        using errcode = 'P0004';
    end if;
    v_next_unit    := p_unit_id;
    v_unit_changed := v_next_unit is distinct from v_target.unit_id;
  end if;

  if v_unit_changed then
    -- Locking the destination unit serialises concurrent moves into it, so
    -- the one-Dean check below cannot be passed by two transactions at once.
    perform 1 from public.units u where u.id = v_next_unit for update;
    if not found then
      raise exception 'VALIDATION: unit not found'
        using errcode = 'P0004';
    end if;

    if v_target.role = 'DEAN' and exists (
      select 1
      from   public.profiles pr
      where  pr.role = 'DEAN'
        and  pr.unit_id = v_next_unit
        and  pr.id <> p_profile_id
        and  pr.status <> 'DEACTIVATED'
    ) then
      raise exception 'CONFLICT: that unit already has a Dean'
        using errcode = 'P0006';
    end if;
  end if;

  update public.profiles pr
  set    full_name = v_full_name,
         unit_id   = v_next_unit
  where  pr.id = p_profile_id;

  -- Keep the units.hod_id reverse link in step when a Dean moves.
  if v_unit_changed and v_target.role = 'DEAN' then
    update public.units u set hod_id = null where u.hod_id = p_profile_id;
    update public.units u set hod_id = p_profile_id where u.id = v_next_unit;
  end if;

  -- Record only what actually changed.
  if v_target.full_name is distinct from v_full_name then
    v_changes := v_changes || jsonb_build_object(
      'full_name', jsonb_build_object('from', v_target.full_name, 'to', v_full_name));
  end if;
  if v_unit_changed then
    v_changes := v_changes || jsonb_build_object(
      'unit_id', jsonb_build_object('from', v_target.unit_id, 'to', v_next_unit));
  end if;

  perform public._write_audit(
    'USER_UPDATED', v_actor_id, v_actor_role, 'profile', p_profile_id,
    jsonb_build_object('updated_by', v_actor_id, 'changes', v_changes)
  );

  return query select p_profile_id, v_full_name, v_next_unit;
end;
$$;

revoke execute on function public.update_user_profile(uuid, text, uuid) from public, anon;
grant execute on function public.update_user_profile(uuid, text, uuid) to authenticated;

create or replace function public.deactivate_user(p_profile_id uuid)
returns table(profile_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_role public.user_role;
  v_target     record;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;
  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can deactivate users'
      using errcode = 'P0002';
  end if;

  select pr.id, pr.status
  into   v_target
  from   public.profiles pr
  where  pr.id = p_profile_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: profile % does not exist', p_profile_id
      using errcode = 'P0007';
  end if;

  if v_target.status = 'DEACTIVATED' then
    raise exception 'CONFLICT: user is already deactivated'
      using errcode = 'P0006';
  end if;

  update public.profiles pr set status = 'DEACTIVATED' where pr.id = p_profile_id;

  -- A deactivated Dean must not stay the unit's resolved Dean.
  update public.units u set hod_id = null where u.hod_id = p_profile_id;

  perform public._write_audit(
    'USER_DEACTIVATED', v_actor_id, v_actor_role, 'profile', p_profile_id,
    jsonb_build_object(
      'deactivated_by',  v_actor_id,
      'previous_status', v_target.status::text
    )
  );

  return query select p_profile_id, 'DEACTIVATED'::text;
end;
$$;

revoke execute on function public.deactivate_user(uuid) from public, anon;
grant execute on function public.deactivate_user(uuid) to authenticated;
