-- Migration: requester-verified key return (return OTP)
-- Adds a return-side verification code so a key cannot be marked returned
-- without the requester proving presence at the desk. Mirrors the collection
-- code flow:
--   1. Requester taps "Return key" -> request_return() generates a 6-digit
--      return_code (15-minute expiry) shown on their dashboard.
--   2. Requester reads the code to the verifier, who enters it; return_key()
--      validates it before completing the return.
-- A verifier override path exists for when the requester genuinely cannot
-- produce a code (lost phone, colleague returning on their behalf): the return
-- still completes, but it is recorded as a distinct KEY_RETURNED_UNVERIFIED
-- audit event and raised as a CSO incident when an open shift can be resolved.

-- Columns: return-side code, separate from the collection code so each column
-- has one unambiguous meaning.

alter table public.requests
  add column if not exists return_code            text,
  add column if not exists return_code_expires_at timestamptz;

-- 1. request_return
-- Requester-initiated. Generates the return code for one of their own keys
-- that is currently issued. Status stays KEY_ISSUED.

create or replace function public.request_return(
  p_request_id   uuid,
  p_requester_id uuid
)
returns table(request_id uuid, return_code text, return_code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid;
  v_actor_role public.user_role;
  v_req        record;
  v_code       text;
  v_expires_at timestamptz;
begin
  v_actor_id := coalesce(auth.uid(), p_requester_id);

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

  -- May only generate a return code for one's own request.
  if v_req.requester_id <> v_actor_id then
    raise exception 'FORBIDDEN: request does not belong to the caller'
      using errcode = 'P0010';
  end if;

  -- The key must currently be issued.
  if v_req.status <> 'KEY_ISSUED' then
    raise exception 'NOT_ISSUED: request is not in KEY_ISSUED state (current: %)', v_req.status
      using errcode = 'P0009';
  end if;

  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + interval '15 minutes';

  update public.requests
  set    return_code            = v_code,
         return_code_expires_at = v_expires_at
  where  id = p_request_id;

  perform public._write_audit(
    'RETURN_CODE_GENERATED',
    v_actor_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'key_id',     v_req.key_id,
      'expires_at', v_expires_at
    )
  );

  return query select p_request_id, v_code, v_expires_at;
end;
$$;

-- 2. return_key (replaces the 3-arg version)
-- Verifier completes the return. Requires either the requester's return code
-- (verified path) or an override reason (unverified path).

drop function if exists public.return_key(uuid, uuid, uuid);

create or replace function public.return_key(
  p_request_id     uuid,
  p_verifier_id    uuid,
  p_code           text default null,
  p_returner_id    uuid default null,
  p_override_reason text default null
)
returns table(request_id uuid, returned_at timestamptz, verified boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_req         record;
  v_returned_at timestamptz;
  v_verified    boolean;
  v_shift_id    uuid;
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

  -- Update key: back to AVAILABLE.
  update public.keys
  set    status = 'AVAILABLE'
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

-- Grants: restrict to authenticated (CREATE grants EXECUTE to PUBLIC by
-- default, and Supabase also grants to anon).

revoke execute on function public.request_return(uuid, uuid) from public, anon;
grant execute on function public.request_return(uuid, uuid) to authenticated;

revoke execute on function public.return_key(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.return_key(uuid, uuid, text, uuid, text) to authenticated;
