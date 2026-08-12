-- Operational settings: real backend for the CSO "Operational" tab

create table public.zone_hours (
  zone           public.zone primary key,
  weekday_open   time    not null default '06:00',
  weekday_close  time    not null default '22:00',
  weekend_closed boolean not null default true,
  weekend_open   time,
  weekend_close  time,
  updated_at     timestamptz not null default now()
);

alter table public.zone_hours enable row level security;

create policy zone_hours_select_all
  on public.zone_hours
  for select
  to anon, authenticated
  using (true);

insert into public.zone_hours (zone, weekday_open, weekday_close, weekend_closed, weekend_open, weekend_close) values
  ('NEW_SENATE', '06:00', '22:00', true, '08:00', '18:00'),
  ('OLD_SENATE', '06:00', '22:00', true, '08:00', '18:00');

-- Singleton row: fixed PK + a CHECK that the PK equal that fixed value,
-- same trick as risk_tier_config but a different fixed UUID.
create table public.operational_config (
  id                   uuid primary key default '00000000-0000-0000-0000-000000000002'
                       check (id = '00000000-0000-0000-0000-000000000002'),
  return_deadline_time time not null default '17:00',
  code_expiry_minutes  int  not null default 10
                       check (code_expiry_minutes between 5 and 60),
  updated_at           timestamptz not null default now()
);

alter table public.operational_config enable row level security;

create policy operational_config_select_all
  on public.operational_config
  for select
  to anon, authenticated
  using (true);

insert into public.operational_config (id, return_deadline_time, code_expiry_minutes) values
  ('00000000-0000-0000-0000-000000000002', '17:00', 10);

create or replace function public.update_operational_config(
  p_zone_hours           jsonb,
  p_return_deadline_time time,
  p_code_expiry_minutes  int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id     uuid;
  v_actor_role   public.user_role;
  v_zone         jsonb;
  v_singleton_id constant uuid := '00000000-0000-0000-0000-000000000002';
  v_weekend_closed boolean;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select role into v_actor_role
  from public.profiles
  where id = v_actor_id;

  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can update operational configuration'
      using errcode = 'P0002';
  end if;

  if p_return_deadline_time is null then
    raise exception 'INVALID_CONFIG: return_deadline_time is required'
      using errcode = 'P0004';
  end if;

  if p_code_expiry_minutes < 5 or p_code_expiry_minutes > 60 then
    raise exception 'INVALID_CONFIG: code_expiry_minutes must be between 5 and 60'
      using errcode = 'P0004';
  end if;

  if p_zone_hours is null or jsonb_array_length(p_zone_hours) <> 2 then
    raise exception 'INVALID_ZONE_HOURS: exactly 2 zone entries are required'
      using errcode = 'P0004';
  end if;

  for v_zone in select * from jsonb_array_elements(p_zone_hours)
  loop
    v_weekend_closed := (v_zone->>'weekend_closed')::boolean;

    if (v_zone->>'weekday_open')::time >= (v_zone->>'weekday_close')::time then
      raise exception 'INVALID_ZONE_HOURS: weekday_open must be before weekday_close for %', v_zone->>'zone'
        using errcode = 'P0004';
    end if;

    if not v_weekend_closed then
      if v_zone->>'weekend_open' is null or v_zone->>'weekend_close' is null then
        raise exception 'INVALID_ZONE_HOURS: weekend_open/weekend_close required when weekend_closed is false for %', v_zone->>'zone'
          using errcode = 'P0004';
      end if;
      if (v_zone->>'weekend_open')::time >= (v_zone->>'weekend_close')::time then
        raise exception 'INVALID_ZONE_HOURS: weekend_open must be before weekend_close for %', v_zone->>'zone'
          using errcode = 'P0004';
      end if;
    end if;

    update public.zone_hours
       set weekday_open   = (v_zone->>'weekday_open')::time,
           weekday_close  = (v_zone->>'weekday_close')::time,
           weekend_closed = v_weekend_closed,
           weekend_open   = (v_zone->>'weekend_open')::time,
           weekend_close  = (v_zone->>'weekend_close')::time,
           updated_at     = now()
     where zone = (v_zone->>'zone')::public.zone;

    if not found then
      raise exception 'INVALID_ZONE_HOURS: unknown zone %', v_zone->>'zone'
        using errcode = 'P0004';
    end if;
  end loop;

  update public.operational_config
     set return_deadline_time = p_return_deadline_time,
         code_expiry_minutes  = p_code_expiry_minutes,
         updated_at           = now()
   where id = v_singleton_id;

  perform public._write_audit(
    'OPERATIONAL_CONFIG_UPDATED',
    v_actor_id,
    v_actor_role,
    'operational_config',
    v_singleton_id,
    jsonb_build_object(
      'zone_hours',           p_zone_hours,
      'return_deadline_time', p_return_deadline_time,
      'code_expiry_minutes',  p_code_expiry_minutes
    )
  );
end;
$$;

revoke execute on function public.update_operational_config(jsonb, time, int)
  from public, anon;
grant execute on function public.update_operational_config(jsonb, time, int)
  to authenticated;


create or replace function public.create_request(
  p_key_id          uuid,
  p_type            text,
  p_return_deadline timestamptz,
  p_weekend_date    date default null
)
returns table(request_id uuid, code text, code_expires_at timestamptz, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id    uuid;
  v_actor_role      public.user_role;
  v_type_enum       public.request_type;
  v_request_id      uuid;
  v_code            text;
  v_expires_at      timestamptz;
  v_status          public.request_status;
  v_requested_for   date;
  v_expiry_minutes  int;
begin
  v_type_enum := p_type::public.request_type;

  v_requester_id := auth.uid();
  if v_requester_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_requester_id;

  if v_actor_role <> 'REQUESTER' then
    raise exception 'FORBIDDEN: only REQUESTER role can create requests'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from   public.authorisations a
    where  a.key_id    = p_key_id
      and  a.profile_id = v_requester_id
  ) then
    raise exception 'NOT_AUTHORISED: requester is not whitelisted for this key'
      using errcode = 'P0005';
  end if;

  if exists (
    select 1
    from   public.requests r
    where  r.requester_id = v_requester_id
      and  r.key_id       = p_key_id
      and  r.status not in (
             'KEY_RETURNED', 'EXPIRED', 'CANCELLED', 'DECLINED'
           )
  ) then
    raise exception 'CONFLICT: an active request already exists for this key'
      using errcode = 'P0006';
  end if;

  select code_expiry_minutes into v_expiry_minutes
  from   public.operational_config
  where  id = '00000000-0000-0000-0000-000000000002';

  -- Determine status, code, and requested_for date.
  if v_type_enum = 'WEEKDAY' then
    v_status        := 'CODE_ISSUED';
    v_requested_for := current_date;
    v_code          := lpad(floor(random() * 1000000)::int::text, 6, '0');
    v_expires_at    := now() + (coalesce(v_expiry_minutes, 10) || ' minutes')::interval;
  else
    -- WEEKEND: no code now. The requester generates a short-lived code on the
    -- requested day via generate_weekend_code, after the HOD approves.
    v_status        := 'PENDING_HOD';
    v_requested_for := coalesce(p_weekend_date, current_date);
    v_code          := null;
    v_expires_at    := null;
  end if;

  insert into public.requests (
    requester_id,
    key_id,
    type,
    requested_for,
    status,
    code,
    code_expires_at,
    return_deadline,
    risk_tier
  ) values (
    v_requester_id,
    p_key_id,
    v_type_enum,
    v_requested_for,
    v_status,
    v_code,
    v_expires_at,
    p_return_deadline,
    'LOW'
  )
  returning id into v_request_id;

  perform public._write_audit(
    'REQUEST_CREATED',
    v_requester_id,
    v_actor_role,
    'request',
    v_request_id,
    jsonb_build_object(
      'key_id',          p_key_id,
      'type',            p_type,
      'status',          v_status::text,
      'return_deadline', p_return_deadline
    )
  );

  return query
    select v_request_id,
           v_code,
           v_expires_at,
           v_status::text;
end;
$$;

create or replace function public.generate_weekend_code(
  p_request_id   uuid,
  p_requester_id uuid
)
returns table(request_id uuid, code text, code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id       uuid;
  v_actor_role     public.user_role;
  v_req            record;
  v_code           text;
  v_expires_at     timestamptz;
  v_expiry_minutes int;
begin
  v_actor_id := coalesce(auth.uid(), p_requester_id);

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  if v_req.requester_id <> v_actor_id then
    raise exception 'FORBIDDEN: not your request'
      using errcode = 'P0010';
  end if;

  if v_req.status <> 'APPROVED' then
    raise exception 'CONFLICT: request is not in APPROVED state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  if v_req.requested_for <> current_date then
    raise exception 'TOO_EARLY: a collection code can only be generated on the requested date'
      using errcode = 'P0014';
  end if;

  select code_expiry_minutes into v_expiry_minutes
  from   public.operational_config
  where  id = '00000000-0000-0000-0000-000000000002';

  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + (coalesce(v_expiry_minutes, 10) || ' minutes')::interval;

  update public.requests
  set    status          = 'CODE_ISSUED',
         code            = v_code,
         code_expires_at = v_expires_at
  where  id = p_request_id;

  perform public._write_audit(
    'CODE_ISSUED',
    v_actor_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object('type', 'WEEKEND')
  );

  return query select p_request_id, v_code, v_expires_at;
end;
$$;

create or replace function public.generate_guest_weekend_code(
  p_access_token uuid
)
returns table(request_id uuid, code text, code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req            record;
  v_guest_name     text;
  v_code           text;
  v_expires_at     timestamptz;
  v_expiry_minutes int;
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

  select code_expiry_minutes into v_expiry_minutes
  from   public.operational_config
  where  id = '00000000-0000-0000-0000-000000000002';

  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + (coalesce(v_expiry_minutes, 10) || ' minutes')::interval;

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
