-- Marking a key lost and logging an incident become audited, atomic RPCs.
--
-- POST /api/keys/mark-lost retired the key and inserted a MISSING_KEY/HIGH
-- incident as two separate writes — an incident-insert failure left a retired
-- key with no incident — and wrote no audit entry at all. POST /api/incidents
-- inserted the incident through the service-role client with no audit entry.
-- Both are consequential actions, so the state change and its audit entry now
-- commit together here.
--
-- Both RPCs take the actor from auth.uid(), never a parameter.

-- ---------------------------------------------------------------------------
-- mark_key_lost — CSO only
-- ---------------------------------------------------------------------------

create or replace function public.mark_key_lost(
  p_key_id uuid,
  p_note   text
)
returns table(key_id uuid, incident_id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id      uuid := auth.uid();
  v_actor_role    public.user_role;
  v_key           record;
  v_now           timestamptz := now();
  v_shift_id      uuid;
  v_open_requests int;
  v_incident_id   uuid;
  v_reference     text;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;
  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can mark a key lost'
      using errcode = 'P0002';
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'VALIDATION: a note is required'
      using errcode = 'P0004';
  end if;

  select k.id, k.code, k.status
  into   v_key
  from   public.keys k
  where  k.id = p_key_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: key % does not exist', p_key_id
      using errcode = 'P0007';
  end if;

  if v_key.status = 'RETIRED' then
    raise exception 'CONFLICT: key is already retired'
      using errcode = 'P0006';
  end if;

  -- Retiring is not refused while someone holds a copy (the route never
  -- checked), but the count goes on the audit entry so the CSO can see it.
  select count(*)::int
  into   v_open_requests
  from   public.requests r
  where  r.key_id = p_key_id
    and  public.request_occupies_key(r.status, r.code_expires_at);

  -- Same resolution as log_incident: the most recently started open shift.
  select s.id
  into   v_shift_id
  from   public.shifts s
  where  s.ended_at is null
  order  by s.started_at desc
  limit  1;

  update public.keys k
  set    status     = 'RETIRED',
         retired_at = v_now
  where  k.id = p_key_id;

  -- `reference` is left to its column default (incident_reference_seq).
  insert into public.incidents (
    shift_id, logged_by, type, severity, description,
    related_key_id, status, occurred_at
  ) values (
    v_shift_id, v_actor_id, 'MISSING_KEY', 'HIGH', p_note,
    p_key_id, 'OPEN', v_now
  )
  returning id, incidents.reference into v_incident_id, v_reference;

  perform public._write_audit(
    'KEY_MARKED_LOST', v_actor_id, v_actor_role, 'key', p_key_id,
    jsonb_build_object(
      'key_id',             p_key_id,
      'key_code',           v_key.code,
      'previous_status',    v_key.status::text,
      'incident_id',        v_incident_id,
      'incident_reference', v_reference,
      'note',               p_note,
      'open_requests',      v_open_requests
    )
  );

  return query select p_key_id, v_incident_id, v_reference;
end;
$$;

revoke execute on function public.mark_key_lost(uuid, text) from public, anon;
grant execute on function public.mark_key_lost(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- log_incident — CSO or VERIFIER
-- ---------------------------------------------------------------------------

create or replace function public.log_incident(
  p_type              public.incident_type,
  p_severity          public.incident_severity,
  p_description       text,
  p_occurred_at       timestamptz,
  p_related_key_id    uuid default null,
  p_related_person_id uuid default null
)
returns table(incident_id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid := auth.uid();
  v_actor_role  public.user_role;
  v_shift_id    uuid;
  v_incident_id uuid;
  v_reference   text;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;
  if v_actor_role is null or v_actor_role not in ('CSO', 'VERIFIER') then
    raise exception 'FORBIDDEN: only the CSO or a verifier can log an incident'
      using errcode = 'P0002';
  end if;

  if p_type is null or p_severity is null or p_occurred_at is null
     or p_description is null or length(trim(p_description)) = 0 then
    raise exception 'VALIDATION: type, severity, description and occurred_at are required'
      using errcode = 'P0004';
  end if;

  select s.id
  into   v_shift_id
  from   public.shifts s
  where  s.ended_at is null
  order  by s.started_at desc
  limit  1;

  -- `reference` is left to its column default (incident_reference_seq).
  insert into public.incidents (
    shift_id, logged_by, type, severity, description,
    related_key_id, related_person_id, status, occurred_at
  ) values (
    v_shift_id, v_actor_id, p_type, p_severity, p_description,
    p_related_key_id, p_related_person_id, 'OPEN', p_occurred_at
  )
  returning id, incidents.reference into v_incident_id, v_reference;

  perform public._write_audit(
    'INCIDENT_LOGGED', v_actor_id, v_actor_role, 'incident', v_incident_id,
    jsonb_build_object(
      'incident_id',       v_incident_id,
      'reference',         v_reference,
      'type',              p_type::text,
      'severity',          p_severity::text,
      'related_key_id',    p_related_key_id,
      'related_person_id', p_related_person_id
    )
  );

  return query select v_incident_id, v_reference;
end;
$$;

revoke execute on function public.log_incident(
  public.incident_type, public.incident_severity, text, timestamptz, uuid, uuid
) from public, anon;
grant execute on function public.log_incident(
  public.incident_type, public.incident_severity, text, timestamptz, uuid, uuid
) to authenticated;
