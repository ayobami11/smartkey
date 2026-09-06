-- keys.key_count is capacity, not bunch size.
--

create or replace function public.request_occupies_key(
  p_status          public.request_status,
  p_code_expires_at timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_status = 'KEY_ISSUED'
      or (p_status = 'CODE_ISSUED' and coalesce(p_code_expires_at > now(), true));
$$;


create or replace function public.check_key_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_count int;
  v_occupied  int;
begin
  -- Not occupying: nothing to check. Covers PENDING_HOD/APPROVED (weekend
  -- bookings), every terminal state, and guest rows with no key assigned yet.
  if new.key_id is null
     or not public.request_occupies_key(new.status, new.code_expires_at) then
    return new;
  end if;

  
  if tg_op = 'UPDATE'
     and old.key_id is not distinct from new.key_id
     and public.request_occupies_key(old.status, old.code_expires_at) then
    return new;
  end if;


  select k.key_count
  into   v_key_count
  from   public.keys k
  where  k.id = new.key_id
  for update;

  if not found then
    -- No such key. Let the foreign key produce the error, not this trigger.
    return new;
  end if;

  select count(*)
  into   v_occupied
  from   public.requests r
  where  r.key_id = new.key_id
    and  r.id    <> new.id
    and  public.request_occupies_key(r.status, r.code_expires_at);

  if v_occupied >= v_key_count then
    raise exception
      'NO_KEYS_AVAILABLE: every key on this bunch is currently out or reserved (% of %)',
      v_occupied, v_key_count
      using errcode = 'P0016';
  end if;

  return new;
end;
$$;

drop trigger if exists requests_key_capacity on public.requests;

create trigger requests_key_capacity
  before insert or update on public.requests
  for each row execute function public.check_key_capacity();



drop index if exists public.requests_one_live_issue_per_key;

create index if not exists idx_requests_occupying_key
  on public.requests (key_id)
  where status in ('CODE_ISSUED', 'KEY_ISSUED');

-- Supports the per-request idempotence lookup in mark_key_overdue() below.
create index if not exists idx_audit_log_key_overdue_request
  on public.audit_log ((payload->>'request_id'))
  where event = 'KEY_OVERDUE';



create or replace function public.issue_key(
  p_request_id uuid,
  p_verifier_id uuid
)
returns table(request_id uuid, issued_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_req         record;
  v_issued_at   timestamptz;
  v_key_count   int;
  v_issued_out  int;
begin
  -- Resolve caller (must be VERIFIER or service role).
  v_actor_id := coalesce(auth.uid(), p_verifier_id);

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  -- Load the request.
  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;   -- lock the row to prevent concurrent issue

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  -- Validate state: must be CODE_ISSUED and code must not have expired.
  if v_req.status <> 'CODE_ISSUED' then
    raise exception 'CONFLICT: request is not in CODE_ISSUED state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  if v_req.code_expires_at <= now() then
    raise exception 'EXPIRED_CODE: the 6-digit code has expired'
      using errcode = 'P0008';
  end if;

  select k.key_count
  into   v_key_count
  from   public.keys k
  where  k.id = v_req.key_id
  for update;

  select count(*)
  into   v_issued_out
  from   public.requests r
  where  r.key_id = v_req.key_id
    and  r.id     <> p_request_id
    and  r.status  = 'KEY_ISSUED';

  if v_issued_out >= coalesce(v_key_count, 1) then
    if coalesce(v_key_count, 1) = 1 then
      raise exception 'CONFLICT: this key is already issued and has not been returned'
        using errcode = 'P0006';
    else
      raise exception 'CONFLICT: all % keys on this bunch are out and none has been returned', v_key_count
        using errcode = 'P0006';
    end if;
  end if;

  v_issued_at := now();

  -- Update request: mark issued, clear code.
  update public.requests
  set    status    = 'KEY_ISSUED',
         issued_by = p_verifier_id,
         issued_at = v_issued_at,
         code      = null,
         code_expires_at = null
  where  id = p_request_id;

 
  if v_issued_out + 1 >= coalesce(v_key_count, 1) then
    update public.keys
    set    status = 'ISSUED'
    where  id = v_req.key_id;
  end if;

  -- Audit entry.
  perform public._write_audit(
    'KEY_ISSUED',
    p_verifier_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'key_id',       v_req.key_id,
      'requester_id', v_req.requester_id,
      'verifier_id',  p_verifier_id,
      'issued_at',    v_issued_at
    )
  );

  return query select p_request_id, v_issued_at;
end;
$$;

revoke execute on function public.issue_key(uuid, uuid) from public, anon;
grant  execute on function public.issue_key(uuid, uuid) to authenticated;


create or replace function public.return_key(
  p_request_id      uuid,
  p_verifier_id     uuid,
  p_code            text default null,
  p_returner_id     uuid default null,
  p_override_reason text default null
)
returns table(request_id uuid, returned_at timestamptz, verified boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id       uuid;
  v_actor_role     public.user_role;
  v_req            record;
  v_returned_at    timestamptz;
  v_verified       boolean;
  v_shift_id       uuid;
  v_key_count      int;
  v_still_out      int;
  v_still_overdue  int;
begin
  v_actor_id := coalesce(auth.uid(), p_verifier_id);

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  -- Load and lock the request row.
  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  -- Must be in KEY_ISSUED state (KEY_OVERDUE is an issued key at the DB level;
  -- keys.status = 'OVERDUE' but requests.status remains 'KEY_ISSUED').
  if v_req.status <> 'KEY_ISSUED' then
    raise exception 'NOT_ISSUED: request is not in KEY_ISSUED state (current: %)', v_req.status
      using errcode = 'P0009';
  end if;

  -- Determine the verification path.
  if p_code is not null and length(p_code) > 0 then
    if v_req.return_code is null or v_req.return_code <> p_code then
      raise exception 'BAD_RETURN_CODE: the return code does not match'
        using errcode = 'P0011';
    end if;
    if v_req.return_code_expires_at is null or v_req.return_code_expires_at <= now() then
      raise exception 'EXPIRED_RETURN_CODE: the return code has expired'
        using errcode = 'P0012';
    end if;
    v_verified := true;
  elsif p_override_reason is not null and length(trim(p_override_reason)) > 0 then
    v_verified := false;
  else
    raise exception 'NO_VERIFICATION: a return code or an override reason is required'
      using errcode = 'P0013';
  end if;

  v_returned_at := now();

  -- Update request: mark returned, clear any return code.
  update public.requests
  set    status                 = 'KEY_RETURNED',
         returned_at            = v_returned_at,
         return_code            = null,
         return_code_expires_at = null
  where  id = p_request_id;

  -- NEW: recompute the bunch's status from whoever is still holding a key.
  -- Lock order requests -> keys, matching issue_key.
  select k.key_count
  into   v_key_count
  from   public.keys k
  where  k.id = v_req.key_id
  for update;

  select count(*),
         count(*) filter (where r.return_deadline is not null and r.return_deadline < now())
  into   v_still_out, v_still_overdue
  from   public.requests r
  where  r.key_id = v_req.key_id
    and  r.id    <> p_request_id
    and  r.status = 'KEY_ISSUED';

  -- The cast is required: a bare CASE yields text, and keys.status is
  -- public.key_status.
  update public.keys
  set    status = (case
                     when v_still_overdue > 0                     then 'OVERDUE'
                     when v_still_out >= coalesce(v_key_count, 1) then 'ISSUED'
                     else 'AVAILABLE'
                   end)::public.key_status
  where  id = v_req.key_id;

  -- Audit entry. Verified and unverified returns are distinct events so the
  -- CSO can filter for code-free returns in the audit log.
  perform public._write_audit(
    case when v_verified then 'KEY_RETURNED' else 'KEY_RETURNED_UNVERIFIED' end,
    p_verifier_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'key_id',          v_req.key_id,
      'requester_id',    v_req.requester_id,
      'returner_id',     coalesce(p_returner_id, v_req.requester_id),
      'verifier_id',     p_verifier_id,
      'returned_at',     v_returned_at,
      'verified',        v_verified,
      'override_reason', p_override_reason
    )
  );

  -- Unverified returns are surfaced to the CSO as an incident when an open
  -- shift can be resolved. Incident bookkeeping never blocks the return.
  if not v_verified then
    select s.id
    into   v_shift_id
    from   public.shifts s
    where  s.ended_at is null
    order  by s.started_at desc
    limit  1;

    if v_shift_id is not null then
      insert into public.incidents (
        shift_id, logged_by, type, severity, description,
        related_key_id, related_person_id, status, occurred_at
      ) values (
        v_shift_id,
        p_verifier_id,
        'SUSPICIOUS_ACTIVITY',
        'MEDIUM',
        'Key returned without requester verification. Reason: '
          || coalesce(p_override_reason, 'not given'),
        v_req.key_id,
        v_req.requester_id,
        'OPEN',
        v_returned_at
      );
    end if;
  end if;

  return query select p_request_id, v_returned_at, v_verified;
end;
$$;

revoke execute on function public.return_key(uuid, uuid, text, uuid, text) from public, anon;
grant  execute on function public.return_key(uuid, uuid, text, uuid, text) to authenticated;


create or replace function public.mark_key_overdue()
returns table(updated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec      record;
  v_count    int := 0;
  v_actor_id uuid;
begin
  -- Identify a CSO to attribute the system action to in the audit log.
  select id
  into   v_actor_id
  from   public.profiles
  where  role = 'CSO'
    and  status = 'ACTIVE'
  order  by created_at
  limit  1;

  for v_rec in
    select
      r.id   as request_id,
      r.key_id,
      r.requester_id
    from   public.requests r
    where  r.status          = 'KEY_ISSUED'
      and  r.return_deadline < now()
      and  not exists (
             select 1
             from   public.audit_log a
             where  a.event = 'KEY_OVERDUE'
               and  a.payload->>'request_id' = r.id::text
           )
  loop
    -- Mark the physical key as OVERDUE (request status stays KEY_ISSUED).
    update public.keys
    set    status = 'OVERDUE'
    where  id = v_rec.key_id;

    -- Audit entry (only if a CSO actor was found).
    if v_actor_id is not null then
      perform public._write_audit(
        'KEY_OVERDUE',
        v_actor_id,
        'CSO'::public.user_role,
        'key',
        v_rec.key_id,
        jsonb_build_object(
          'request_id',   v_rec.request_id,
          'requester_id', v_rec.requester_id
        )
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return query select v_count;
end;
$$;


revoke execute on function public.mark_key_overdue() from public, anon;
grant  execute on function public.mark_key_overdue() to authenticated;

-- Grants for the new helpers. The trigger function is never called directly.

revoke execute on function public.check_key_capacity() from public, anon;
revoke execute on function public.request_occupies_key(public.request_status, timestamptz)
  from public, anon;
grant  execute on function public.request_occupies_key(public.request_status, timestamptz)
  to authenticated;
