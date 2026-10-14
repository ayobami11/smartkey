-- Admin actions that changed state without an audit entry.
--
-- Found while moving the admin routes onto route() (batch 4):
--
--   * POST /api/admin/users reinstated a DEACTIVATED user (and re-invited a
--     PENDING_ACTIVATION one) by updating the profile through the
--     service-role client. No audit entry, and the profile write was not
--     tied to anything.
--   * POST /api/admin/users/[id]/resend-invite re-sent an invite with no
--     audit entry.
--   * POST /api/admin/keys inserted the key row under the keys RLS policy
--     with no audit entry.
--   * The incidents_insert_cso_verifier and keys_insert_cso policies still
--     let a CSO (or, for incidents, a verifier) insert straight into the
--     table from a user session, skipping the audit entry. The app writes
--     both tables only through RPCs now (log_incident / mark_key_lost since
--     20261013130000, create_key below), so the policies go.
--
-- Each RPC is SECURITY DEFINER, CSO-only, takes the actor from auth.uid(),
-- and writes its state change and its audit entry in one transaction.
--
-- The GoTrue side of a reinstatement (lifting the auth ban) cannot share the
-- transaction; src/lib/admin/reinstate-user.ts orders it around
-- reinstate_user. Sending an invite email cannot either: the routes generate
-- the link, then call the RPC, then send.

-- ---------------------------------------------------------------------------
-- reinstate_user — DEACTIVATED → PENDING_ACTIVATION, USER_REINSTATED
-- ---------------------------------------------------------------------------

create or replace function public.reinstate_user(
  p_profile_id uuid,
  p_full_name  text default null,
  p_unit_id    uuid default null
)
returns table(profile_id uuid, status text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id     uuid := auth.uid();
  v_actor_role   public.user_role;
  v_target       record;
  v_full_name    text;
  v_next_unit    uuid;
  v_departmental boolean;
  v_changes      jsonb := '{}'::jsonb;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;
  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can reinstate users'
      using errcode = 'P0002';
  end if;

  select pr.id, pr.role, pr.status, pr.full_name, pr.unit_id
  into   v_target
  from   public.profiles pr
  where  pr.id = p_profile_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: profile % does not exist', p_profile_id
      using errcode = 'P0007';
  end if;

  if v_target.status <> 'DEACTIVATED' then
    raise exception 'CONFLICT: user is not deactivated'
      using errcode = 'P0006';
  end if;

  -- A blank or absent name keeps the stored one.
  v_full_name := coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), v_target.full_name);

  -- A unit only applies to departmental roles (same rule as
  -- update_user_profile); the stored role decides, not the caller's form.
  v_departmental := v_target.role in ('DEAN', 'REQUESTER');
  v_next_unit    := v_target.unit_id;
  if v_departmental then
    v_next_unit := coalesce(p_unit_id, v_target.unit_id);
    if v_next_unit is null then
      raise exception 'VALIDATION: unit is required for this role'
        using errcode = 'P0004';
    end if;

    -- Locking the unit serialises this with any other Dean moving in, so the
    -- one-active-Dean check cannot be passed twice at once.
    perform 1 from public.units u where u.id = v_next_unit for update;
    if not found then
      raise exception 'VALIDATION: unit not found'
        using errcode = 'P0004';
    end if;
  end if;

  if v_target.role = 'DEAN' and exists (
    select 1
    from   public.profiles pr
    where  pr.role = 'DEAN'
      and  pr.unit_id = v_next_unit
      and  pr.id <> p_profile_id
      and  pr.status = 'ACTIVE'
  ) then
    raise exception 'CONFLICT: that unit already has an active Dean'
      using errcode = 'P0006';
  end if;

  update public.profiles pr
  set    status    = 'PENDING_ACTIVATION',
         full_name = v_full_name,
         unit_id   = v_next_unit
  where  pr.id = p_profile_id;

  -- deactivate_user cleared units.hod_id; point the unit back at its Dean,
  -- as provision_user does for a newly provisioned one.
  if v_target.role = 'DEAN' then
    update public.units u set hod_id = null
    where  u.hod_id = p_profile_id and u.id <> v_next_unit;
    update public.units u set hod_id = p_profile_id where u.id = v_next_unit;
  end if;

  if v_target.full_name is distinct from v_full_name then
    v_changes := v_changes || jsonb_build_object(
      'full_name', jsonb_build_object('from', v_target.full_name, 'to', v_full_name));
  end if;
  if v_target.unit_id is distinct from v_next_unit then
    v_changes := v_changes || jsonb_build_object(
      'unit_id', jsonb_build_object('from', v_target.unit_id, 'to', v_next_unit));
  end if;

  perform public._write_audit(
    'USER_REINSTATED', v_actor_id, v_actor_role, 'profile', p_profile_id,
    jsonb_build_object(
      'reinstated_by',   v_actor_id,
      'previous_status', v_target.status::text,
      'status',          'PENDING_ACTIVATION',
      'changes',         v_changes
    )
  );

  return query select p_profile_id, 'PENDING_ACTIVATION'::text, v_target.role::text;
end;
$$;

revoke execute on function public.reinstate_user(uuid, text, uuid) from public, anon;
grant execute on function public.reinstate_user(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- record_invite_resent — PENDING_ACTIVATION only, USER_INVITE_RESENT
--
-- Does not send anything: the route generates the link, calls this, then
-- emails. It also applies a name/unit correction when the re-invite came from
-- the provisioning form (POST /api/admin/users), so that change is audited
-- with the re-invite instead of written separately.
-- ---------------------------------------------------------------------------

create or replace function public.record_invite_resent(
  p_profile_id uuid,
  p_full_name  text default null,
  p_unit_id    uuid default null
)
returns table(profile_id uuid, status text, role text, institutional_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id     uuid := auth.uid();
  v_actor_role   public.user_role;
  v_target       record;
  v_full_name    text;
  v_next_unit    uuid;
  v_unit_changed boolean := false;
  v_changes      jsonb := '{}'::jsonb;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;
  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can re-send an invite'
      using errcode = 'P0002';
  end if;

  select pr.id, pr.role, pr.status, pr.full_name, pr.unit_id, pr.institutional_email
  into   v_target
  from   public.profiles pr
  where  pr.id = p_profile_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: profile % does not exist', p_profile_id
      using errcode = 'P0007';
  end if;

  if v_target.status = 'ACTIVE' then
    raise exception 'CONFLICT: user is already active'
      using errcode = 'P0006';
  end if;
  if v_target.status = 'DEACTIVATED' then
    raise exception 'CONFLICT: user is deactivated'
      using errcode = 'P0006';
  end if;

  v_full_name := coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), v_target.full_name);

  v_next_unit := v_target.unit_id;
  if v_target.role in ('DEAN', 'REQUESTER') and p_unit_id is not null then
    v_next_unit    := p_unit_id;
    v_unit_changed := v_next_unit is distinct from v_target.unit_id;
  end if;

  if v_unit_changed then
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
        and  pr.status = 'ACTIVE'
    ) then
      raise exception 'CONFLICT: that unit already has an active Dean'
        using errcode = 'P0006';
    end if;
  end if;

  if v_target.full_name is distinct from v_full_name or v_unit_changed then
    update public.profiles pr
    set    full_name = v_full_name,
           unit_id   = v_next_unit
    where  pr.id = p_profile_id;
  end if;

  if v_unit_changed and v_target.role = 'DEAN' then
    update public.units u set hod_id = null where u.hod_id = p_profile_id;
    update public.units u set hod_id = p_profile_id where u.id = v_next_unit;
  end if;

  if v_target.full_name is distinct from v_full_name then
    v_changes := v_changes || jsonb_build_object(
      'full_name', jsonb_build_object('from', v_target.full_name, 'to', v_full_name));
  end if;
  if v_unit_changed then
    v_changes := v_changes || jsonb_build_object(
      'unit_id', jsonb_build_object('from', v_target.unit_id, 'to', v_next_unit));
  end if;

  perform public._write_audit(
    'USER_INVITE_RESENT', v_actor_id, v_actor_role, 'profile', p_profile_id,
    jsonb_build_object(
      'resent_by',           v_actor_id,
      'institutional_email', v_target.institutional_email,
      'changes',             v_changes
    )
  );

  return query
    select p_profile_id, v_target.status::text, v_target.role::text,
           v_target.institutional_email::text;
end;
$$;

revoke execute on function public.record_invite_resent(uuid, text, uuid) from public, anon;
grant execute on function public.record_invite_resent(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_key — CSO only, KEY_CREATED
-- ---------------------------------------------------------------------------

create or replace function public.create_key(
  p_code      text,
  p_zone      public.zone,
  p_room_name text,
  p_unit_id   uuid,
  p_key_count int default 1
)
returns table(key_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_role public.user_role;
  v_code       text := btrim(coalesce(p_code, ''));
  v_room_name  text := btrim(coalesce(p_room_name, ''));
  v_key_count  int  := coalesce(p_key_count, 1);
  v_key_id     uuid;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;
  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can create keys'
      using errcode = 'P0002';
  end if;

  if v_code !~ '^[A-Z0-9]+-[0-9]+$' then
    raise exception 'VALIDATION: code must look like NS-304'
      using errcode = 'P0004';
  end if;
  if p_zone is null or v_room_name = '' then
    raise exception 'VALIDATION: zone and room_name are required'
      using errcode = 'P0004';
  end if;
  if v_key_count < 1 or v_key_count > 20 then
    raise exception 'VALIDATION: key_count must be between 1 and 20'
      using errcode = 'P0004';
  end if;

  perform 1 from public.units u where u.id = p_unit_id;
  if not found then
    raise exception 'VALIDATION: unit not found'
      using errcode = 'P0004';
  end if;

  begin
    insert into public.keys (code, zone, room_name, unit_id, key_count, status)
    values (v_code, p_zone, v_room_name, p_unit_id, v_key_count, 'AVAILABLE')
    returning id into v_key_id;
  exception when unique_violation then
    raise exception 'CONFLICT: key code % is already in use', v_code
      using errcode = 'P0006';
  end;

  perform public._write_audit(
    'KEY_CREATED', v_actor_id, v_actor_role, 'key', v_key_id,
    jsonb_build_object(
      'key_id',    v_key_id,
      'code',      v_code,
      'zone',      p_zone::text,
      'room_name', v_room_name,
      'unit_id',   p_unit_id,
      'key_count', v_key_count
    )
  );

  return query select v_key_id;
end;
$$;

revoke execute on function public.create_key(text, public.zone, text, uuid, int) from public, anon;
grant execute on function public.create_key(text, public.zone, text, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Direct inserts that skipped the audit entry
-- ---------------------------------------------------------------------------

drop policy if exists incidents_insert_cso_verifier on public.incidents;
drop policy if exists keys_insert_cso on public.keys;
