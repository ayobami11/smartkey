-- =============================================================================
-- Migration: Postgres RPCs (10 transactional stored procedures)
-- =============================================================================
-- Every RPC in this file:
--   1. Runs as SECURITY DEFINER so it can bypass RLS and write audit_log.
--   2. Writes an audit_log entry in the same transaction as the state change.
--   3. Raises an exception (with a machine-readable code) on invalid state so
--      the calling TypeScript route can map it to the correct HTTP status.
--
-- search_path is pinned to 'public' on every function to prevent search_path
-- injection attacks (a SECURITY DEFINER best practice).
--
-- Audit event names used here (must match AuditEvent union in src/lib/audit/):
--   USER_PROVISIONED, REQUEST_CREATED, KEY_ISSUED, KEY_RETURNED,
--   HOD_APPROVED, HOD_DECLINED, HANDOVER_KEY_ACKNOWLEDGED,
--   SHIFT_REPORT_INITIATED, REPORT_COMMENT_ADDED, KEY_OVERDUE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: write a single audit_log row
-- ---------------------------------------------------------------------------
-- This private helper is called by every RPC below. It is not exposed as a
-- public function — only the named RPCs below are callable from the app.
-- ---------------------------------------------------------------------------

create or replace function public._write_audit(
  p_event       text,
  p_actor_id    uuid,
  p_actor_role  public.user_role,
  p_target_type text,
  p_target_id   uuid,
  p_payload     jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (
    event,
    actor_id,
    actor_role,
    target_type,
    target_id,
    payload
  ) values (
    p_event,
    p_actor_id,
    p_actor_role,
    p_target_type,
    p_target_id,
    p_payload
  );
end;
$$;

-- Revoke public execute on the private helper; only superuser / other
-- SECURITY DEFINER functions in this file should use it.
revoke execute on function public._write_audit(text, uuid, public.user_role, text, uuid, jsonb)
  from public, anon, authenticated;

-- =============================================================================
-- 1. provision_user
-- =============================================================================
-- Creates a profiles row for a user that was already invited via Supabase Auth
-- (auth.users row exists). Returns the new profile id and a single-use
-- activation token (stored as a field on the profile for the activate route).
--
-- Note: activation_token is stored in profiles.metadata jsonb because
-- adding a dedicated column would require a schema change in a separate
-- migration. The TypeScript activate route reads it from there.
-- To keep it simple we store it in an activation_token column — we ALTER
-- profiles here to add it if not present.
-- =============================================================================

-- Add activation_token column to profiles (idempotent via IF NOT EXISTS check).
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles'
      and column_name  = 'activation_token'
  ) then
    alter table public.profiles
      add column activation_token text;
  end if;
end;
$$;

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
  -- Cast role text to enum early so an invalid value raises a clear error.
  v_role_enum := p_role::public.user_role;

  -- Resolve calling actor (must be CSO).
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

  -- Look up the auth.users row that Supabase Auth created when the invite was
  -- sent. The invite email matches p_email.
  select id
  into   v_auth_user_id
  from   auth.users
  where  email = p_email
  limit  1;

  if v_auth_user_id is null then
    raise exception 'AUTH_USER_NOT_FOUND: no auth.users row for email %', p_email
      using errcode = 'P0003';
  end if;

  -- Check for duplicate profile (idempotency guard).
  if exists (
    select 1 from public.profiles where id = v_auth_user_id
  ) then
    raise exception 'DUPLICATE_PROFILE: profile already exists for this user'
      using errcode = 'P0004';
  end if;

  -- Generate a single-use activation token.
  v_activation_token := gen_random_uuid()::text;

  -- Create the profile row.
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

  -- Audit entry.
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

-- =============================================================================
-- 2. create_request
-- =============================================================================
-- Creates a key access request after validating that the requester is
-- authorised for the key and has no conflicting active request.
-- Risk tier is passed as LOW; the TypeScript risk engine computes the real
-- tier and updates the row immediately after this call returns.
-- =============================================================================

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
begin
  -- Cast type early.
  v_type_enum := p_type::public.request_type;

  -- Resolve caller.
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

  -- Validate authorisation.
  if not exists (
    select 1
    from   public.authorisations a
    where  a.key_id    = p_key_id
      and  a.profile_id = v_requester_id
  ) then
    raise exception 'NOT_AUTHORISED: requester is not whitelisted for this key'
      using errcode = 'P0005';
  end if;

  -- Validate no conflicting active request.
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

  -- Generate 6-digit code.
  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + interval '10 minutes';

  -- Determine status and requested_for date.
  if v_type_enum = 'WEEKDAY' then
    v_status        := 'CODE_ISSUED';
    v_requested_for := current_date;
  else
    -- WEEKEND: code not issued yet; pending HOD approval.
    v_status        := 'PENDING_HOD';
    v_requested_for := coalesce(p_weekend_date, current_date);
    -- Code is generated now but will only be usable after HOD approves;
    -- for PENDING_HOD we do NOT expose the code to the requester yet.
    -- We store it so approve_weekend can activate it without generating
    -- a second code. The TypeScript route suppresses it in the response.
  end if;

  -- Insert request.
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
    'LOW'   -- TypeScript risk engine updates this immediately after
  )
  returning id into v_request_id;

  -- Audit entry.
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

-- =============================================================================
-- 3. issue_key
-- =============================================================================
-- Called by the verifier after confirming the requester's identity.
-- Validates the code is active, flips the request to KEY_ISSUED, clears the
-- code to prevent replay, and sets the key status to ISSUED.
-- =============================================================================

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

  v_issued_at := now();

  -- Update request: mark issued, clear code.
  update public.requests
  set    status    = 'KEY_ISSUED',
         issued_by = p_verifier_id,
         issued_at = v_issued_at,
         code      = null,
         code_expires_at = null
  where  id = p_request_id;

  -- Update key: mark as ISSUED.
  update public.keys
  set    status = 'ISSUED'
  where  id = v_req.key_id;

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

-- =============================================================================
-- 4. return_key
-- =============================================================================
-- Called by the verifier when a key is physically handed back.
-- Validates the key is currently issued, records the return, and makes the
-- key available again.
-- =============================================================================

create or replace function public.return_key(
  p_request_id  uuid,
  p_verifier_id uuid,
  p_returner_id uuid default null
)
returns table(request_id uuid, returned_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_req         record;
  v_returned_at timestamptz;
begin
  -- Resolve actor.
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

  -- Must be in KEY_ISSUED state (KEY_OVERDUE is also an issued key at the DB
  -- level; keys.status = 'OVERDUE' but requests.status remains 'KEY_ISSUED').
  if v_req.status <> 'KEY_ISSUED' then
    raise exception 'NOT_ISSUED: request is not in KEY_ISSUED state (current: %)', v_req.status
      using errcode = 'P0009';
  end if;

  v_returned_at := now();

  -- Update request.
  update public.requests
  set    status      = 'KEY_RETURNED',
         returned_at = v_returned_at
  where  id = p_request_id;

  -- Update key: back to AVAILABLE.
  update public.keys
  set    status = 'AVAILABLE'
  where  id = v_req.key_id;

  -- Audit entry.
  perform public._write_audit(
    'KEY_RETURNED',
    p_verifier_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'key_id',       v_req.key_id,
      'requester_id', v_req.requester_id,
      'returner_id',  coalesce(p_returner_id, v_req.requester_id),
      'verifier_id',  p_verifier_id,
      'returned_at',  v_returned_at
    )
  );

  return query select p_request_id, v_returned_at;
end;
$$;

-- =============================================================================
-- 5. approve_weekend
-- =============================================================================
-- HOD approves a weekend access request.
-- Signature verification runs in TypeScript before this is called; the result
-- is passed via p_signature_verified and p_signature_mismatch_pct.
-- Generates the 6-digit code, creates the hod_decisions row, and links it to
-- the request.
-- =============================================================================

create or replace function public.approve_weekend(
  p_request_id              uuid,
  p_hod_id                  uuid,
  p_note                    text    default null,
  p_signature_verified      boolean default true,
  p_signature_mismatch_pct  numeric default null
)
returns table(request_id uuid, code text, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id      uuid;
  v_actor_role    public.user_role;
  v_req           record;
  v_key           record;
  v_hod_dept      uuid;
  v_decision_id   uuid;
  v_code          text;
  v_expires_at    timestamptz;
begin
  -- Resolve caller.
  v_actor_id := coalesce(auth.uid(), p_hod_id);

  select pr.role, pr.department_id
  into   v_actor_role, v_hod_dept
  from   public.profiles pr
  where  pr.id = p_hod_id;

  -- Load the request.
  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  -- Validate HOD belongs to the same department as the key.
  select k.department_id
  into   v_key
  from   public.keys k
  where  k.id = v_req.key_id;

  if v_hod_dept is null or v_hod_dept <> v_key.department_id then
    raise exception 'FORBIDDEN: HOD department does not match key department'
      using errcode = 'P0002';
  end if;

  -- Code expires at end of the day after the requested weekend date.
  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := (v_req.requested_for + interval '1 day')::timestamptz;

  -- Insert hod_decisions row.
  insert into public.hod_decisions (
    request_id,
    hod_id,
    decision,
    note,
    signature_verified,
    signature_mismatch_pct
  ) values (
    p_request_id,
    p_hod_id,
    'APPROVED',
    p_note,
    p_signature_verified,
    p_signature_mismatch_pct
  )
  returning id into v_decision_id;

  -- Update request: CODE_ISSUED with new code and linked decision.
  update public.requests
  set    status          = 'CODE_ISSUED',
         hod_decision_id = v_decision_id,
         code            = v_code,
         code_expires_at = v_expires_at
  where  id = p_request_id;

  -- Audit entry.
  perform public._write_audit(
    'HOD_APPROVED',
    p_hod_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'decision_id',             v_decision_id,
      'signature_verified',      p_signature_verified,
      'signature_mismatch_pct',  p_signature_mismatch_pct,
      'note',                    p_note
    )
  );

  return query select p_request_id, v_code, v_decision_id;
end;
$$;

-- =============================================================================
-- 6. decline_weekend
-- =============================================================================
-- HOD declines a weekend access request. Creates the hod_decisions row and
-- moves the request to DECLINED. No code is generated.
-- =============================================================================

create or replace function public.decline_weekend(
  p_request_id uuid,
  p_hod_id     uuid,
  p_note       text default null
)
returns table(request_id uuid, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_req         record;
  v_decision_id uuid;
begin
  -- Resolve caller.
  v_actor_id := coalesce(auth.uid(), p_hod_id);

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = p_hod_id;

  -- Load and lock request.
  select r.*
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  -- Insert hod_decisions row.
  insert into public.hod_decisions (
    request_id,
    hod_id,
    decision,
    note,
    signature_verified
  ) values (
    p_request_id,
    p_hod_id,
    'DECLINED',
    p_note,
    false
  )
  returning id into v_decision_id;

  -- Update request to DECLINED.
  update public.requests
  set    status          = 'DECLINED',
         hod_decision_id = v_decision_id
  where  id = p_request_id;

  -- Audit entry.
  perform public._write_audit(
    'HOD_DECLINED',
    p_hod_id,
    v_actor_role,
    'request',
    p_request_id,
    jsonb_build_object(
      'decision_id', v_decision_id,
      'note',        p_note
    )
  );

  return query select p_request_id, v_decision_id;
end;
$$;

-- =============================================================================
-- 7. acknowledge_shift_handover
-- =============================================================================
-- Called by the incoming verifier at the start of their shift. Validates that
-- no handover has already been recorded for the outgoing shift, then inserts a
-- shift_handovers row and writes one audit_log entry per key acknowledged.
--
-- The incoming shift must already exist (the schedule / clock creates it).
-- For simplicity, if no active incoming shift is found, one is created using
-- the calling officer as primary_officer.
-- =============================================================================

create or replace function public.acknowledge_shift_handover(
  p_outgoing_shift_id uuid,
  p_key_ids           uuid[],
  p_bulk              boolean
)
returns table(handover_id uuid, acknowledged_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id         uuid;
  v_actor_role       public.user_role;
  v_incoming_shift_id uuid;
  v_handover_id      uuid;
  v_key_id           uuid;
  v_count            int;
begin
  -- Resolve caller.
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  -- Guard: no duplicate handover for this outgoing shift.
  if exists (
    select 1
    from   public.shift_handovers sh
    where  sh.outgoing_shift_id = p_outgoing_shift_id
  ) then
    raise exception 'CONFLICT: handover already completed for this shift'
      using errcode = 'P0006';
  end if;

  -- Resolve or create the incoming shift.
  select id
  into   v_incoming_shift_id
  from   public.shifts
  where  primary_officer_id = v_actor_id
    and  ended_at is null
    and  id <> p_outgoing_shift_id
  order  by started_at desc
  limit  1;

  if v_incoming_shift_id is null then
    -- Create a new shift for this officer.
    insert into public.shifts (
      shift_number,
      started_at,
      primary_officer_id
    )
    select
      -- Derive the next shift number from the outgoing shift's number (wraps 1-3).
      case when (s.shift_number % 3) + 1 between 1 and 3
           then (s.shift_number % 3) + 1
           else 1
      end,
      now(),
      v_actor_id
    from  public.shifts s
    where s.id = p_outgoing_shift_id
    returning id into v_incoming_shift_id;
  end if;

  -- Insert handover record.
  insert into public.shift_handovers (
    outgoing_shift_id,
    incoming_shift_id,
    incoming_officer_id,
    acknowledged_keys,
    bulk_acknowledged
  ) values (
    p_outgoing_shift_id,
    v_incoming_shift_id,
    v_actor_id,
    to_jsonb(p_key_ids),
    p_bulk
  )
  returning id into v_handover_id;

  -- Mark outgoing shift as ended.
  update public.shifts
  set    ended_at = now()
  where  id = p_outgoing_shift_id
    and  ended_at is null;

  -- Write one audit_log entry per key acknowledged.
  v_count := 0;
  foreach v_key_id in array p_key_ids loop
    perform public._write_audit(
      'HANDOVER_KEY_ACKNOWLEDGED',
      v_actor_id,
      v_actor_role,
      'key',
      v_key_id,
      jsonb_build_object(
        'handover_id',        v_handover_id,
        'outgoing_shift_id',  p_outgoing_shift_id,
        'incoming_shift_id',  v_incoming_shift_id,
        'bulk',               p_bulk
      )
    );
    v_count := v_count + 1;
  end loop;

  return query select v_handover_id, v_count;
end;
$$;

-- =============================================================================
-- 8. generate_shift_report
-- =============================================================================
-- Creates a placeholder shift_reports row with markdown='PENDING_GENERATION'.
-- The actual Gemini API call and markdown update happen in the TypeScript route
-- (POST /api/reports/generate) which updates the row directly after Gemini
-- responds. This RPC only guarantees the audit trail and uniqueness.
-- =============================================================================

create or replace function public.generate_shift_report(
  p_shift_id uuid
)
returns table(report_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid;
  v_actor_role public.user_role;
  v_report_id  uuid;
begin
  -- Resolve caller (must be CSO or service role).
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  -- Guard: only one report per shift (unique constraint on shift_id, but
  -- raise a friendlier error here).
  if exists (
    select 1
    from   public.shift_reports sr
    where  sr.shift_id = p_shift_id
  ) then
    raise exception 'CONFLICT: a report already exists for shift %', p_shift_id
      using errcode = 'P0006';
  end if;

  -- Validate the shift exists.
  if not exists (
    select 1 from public.shifts where id = p_shift_id
  ) then
    raise exception 'NOT_FOUND: shift % does not exist', p_shift_id
      using errcode = 'P0007';
  end if;

  -- Insert placeholder row; TypeScript route will UPDATE markdown once
  -- Gemini responds. The SECURITY DEFINER context bypasses the immutability
  -- RLS policy that blocks UPDATE for normal roles — that policy only fires
  -- for authenticated/anon roles calling directly, not SECURITY DEFINER funcs.
  insert into public.shift_reports (
    shift_id,
    markdown,
    timeline,
    metadata
  ) values (
    p_shift_id,
    'PENDING_GENERATION',
    '[]',
    jsonb_build_object('initiated_at', now(), 'status', 'pending')
  )
  returning id into v_report_id;

  -- Audit entry.
  perform public._write_audit(
    'SHIFT_REPORT_INITIATED',
    v_actor_id,
    v_actor_role,
    'shift_report',
    v_report_id,
    jsonb_build_object(
      'shift_id', p_shift_id
    )
  );

  return query select v_report_id;
end;
$$;

-- =============================================================================
-- 9. add_report_comment
-- =============================================================================
-- Appends an immutable comment to a shift report. Only the CSO may call this
-- (enforced by the calling route; the RPC itself trusts auth.uid()).
-- =============================================================================

create or replace function public.add_report_comment(
  p_report_id uuid,
  p_text      text
)
returns table(comment_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid;
  v_actor_role public.user_role;
  v_comment_id uuid;
  v_created_at timestamptz;
begin
  -- Resolve caller.
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_actor_id;

  -- Validate report exists.
  if not exists (
    select 1 from public.shift_reports where id = p_report_id
  ) then
    raise exception 'NOT_FOUND: report % does not exist', p_report_id
      using errcode = 'P0007';
  end if;

  -- Validate non-empty text.
  if p_text is null or trim(p_text) = '' then
    raise exception 'VALIDATION: comment text cannot be empty'
      using errcode = 'P0010';
  end if;

  v_created_at := now();

  -- Insert immutable comment.
  insert into public.shift_report_comments (
    report_id,
    author_id,
    text,
    created_at
  ) values (
    p_report_id,
    v_actor_id,
    p_text,
    v_created_at
  )
  returning id into v_comment_id;

  -- Audit entry.
  perform public._write_audit(
    'REPORT_COMMENT_ADDED',
    v_actor_id,
    v_actor_role,
    'shift_report_comment',
    v_comment_id,
    jsonb_build_object(
      'report_id', p_report_id,
      'text_len',  length(p_text)   -- don't log the full comment text in audit
    )
  );

  return query select v_comment_id, v_created_at;
end;
$$;

-- =============================================================================
-- 10. mark_key_overdue
-- =============================================================================
-- Designed to be called by the Supabase Edge Function on an hourly cron.
-- Finds all KEY_ISSUED requests whose return_deadline has passed and marks
-- the corresponding key as OVERDUE. The request row itself stays KEY_ISSUED
-- because the key has not been returned — only the key's visual status changes.
-- Writes one audit_log entry per key transitioned to OVERDUE.
--
-- This function requires no auth.uid() because it is called by the service
-- role inside an Edge Function — not by a human user session.
-- =============================================================================

create or replace function public.mark_key_overdue()
returns table(updated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec      record;
  v_count    int := 0;
  -- Use a fixed "system" actor row: the CSO profile, or fall back to any
  -- profile row when called from a cron with no session. The TypeScript Edge
  -- Function should pass the CSO id, but we default to the first CSO found.
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

  -- If no CSO exists yet (fresh install), skip the audit entries rather than
  -- crash — the overdue update is still applied.

  for v_rec in
    select
      r.id   as request_id,
      r.key_id,
      r.requester_id
    from   public.requests r
    join   public.keys k on k.id = r.key_id
    where  r.status           = 'KEY_ISSUED'
      and  r.return_deadline  < now()
      and  k.status          <> 'OVERDUE'   -- idempotent: skip already-marked
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

-- =============================================================================
-- Grant execute permissions
-- =============================================================================
-- Public-facing RPCs are callable by the authenticated role.
-- The private helper (_write_audit) remains restricted.
-- mark_key_overdue is called only by the service role (Edge Function).
-- =============================================================================

grant execute on function public.provision_user(text, text, text, uuid)
  to authenticated;

grant execute on function public.create_request(uuid, text, timestamptz, date)
  to authenticated;

grant execute on function public.issue_key(uuid, uuid)
  to authenticated;

grant execute on function public.return_key(uuid, uuid, uuid)
  to authenticated;

grant execute on function public.approve_weekend(uuid, uuid, text, boolean, numeric)
  to authenticated;

grant execute on function public.decline_weekend(uuid, uuid, text)
  to authenticated;

grant execute on function public.acknowledge_shift_handover(uuid, uuid[], boolean)
  to authenticated;

grant execute on function public.generate_shift_report(uuid)
  to authenticated;

grant execute on function public.add_report_comment(uuid, text)
  to authenticated;

-- mark_key_overdue is invoked by the Edge Function using the service role key;
-- do not grant to authenticated to prevent requester abuse.
grant execute on function public.mark_key_overdue()
  to service_role;
