-- One key, one holder: stop two people both holding the same physical key.
--
-- Two guards each looked sufficient alone and together left a hole:
--
--   create_request's duplicate check is scoped `r.requester_id = v_requester_id`
--   (20260812090000_operational_config.sql), so it only stops YOU re-requesting
--   a key you already hold. A second person is waved through and gets a code.
--
--   issue_key loaded and locked the REQUEST row and validated its status and
--   code expiry, but never consulted the key. It flipped the request to
--   KEY_ISSUED and set keys.status = 'ISSUED' whether or not the key was
--   already out with someone else.
--
-- So A collects NS-304, B requests the same key, gets a valid code, walks to
-- the desk, and the desk hands over a key that isn't on the hook. The only
-- backstop was the verifier noticing.
--
-- Enforcing here (in the RPC, SECURITY DEFINER) plus the index below is the
-- only placement that cannot be bypassed: the collect route calls this RPC,
-- and RLS on requests does not compare one request against another.
--
-- Deliberately NOT enforced in create_request: a WEEKEND request is submitted
-- days ahead for a future date, so an "is this key out right now?" test there
-- would refuse legitimate weekend bookings. The physical key is the real
-- constraint, so collection time is where it binds.
--
-- Note on keys.key_count: that column is the number of keys hanging on the one
-- bunch this record represents (docs/BACKEND.md "Number of keys in the bunch
-- issued"), NOT a count of interchangeable copies. One row is one bunch handed
-- over as a unit, so the guard is a strict "at most one live holder" rather
-- than a capacity check against key_count. Production has key_count = 12 on
-- FENG-005 and 2 on ADM-VC; under a capacity reading a strict guard would
-- wrongly block 11 legitimate collections, which is why this is spelled out.
--
-- Checked before writing: no key in production has ever had two overlapping
-- issued->returned windows, so there is nothing to repair and the index below
-- builds cleanly.

-- 1. The structural invariant.
--
-- This is what actually makes the rule unbypassable, in the spirit of the
-- max-3-collectors constraint (docs/BACKEND.md 4.5 -- enforced at the engine
-- level so no bug or race can get round it). It also closes a race the
-- procedural check alone cannot: two concurrent issue_key calls for DIFFERENT
-- requests on one key would both pass an `exists` test, because each call's
-- `for update` locks only its own request row.
--
-- key_id is nullable (a guest request has none until the Dean assigns one) but
-- requests_key_required_after_pending already forbids a null key_id in
-- KEY_ISSUED, and null values do not conflict in a unique index regardless.

create unique index if not exists requests_one_live_issue_per_key
  on public.requests (key_id)
  where status = 'KEY_ISSUED';

-- 2. issue_key, with the guard.
--
-- Body is unchanged from 20260525133712_rpcs.sql apart from the block marked
-- below. The guard is placed LAST, after the state and expiry checks, so the
-- existing error precedence (P0007 -> P0006 -> P0008) is preserved and the new
-- error fires only for an otherwise-valid collection.

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

  -- NEW: the key must not already be out with someone else.
  --
  -- Locking the key row serialises concurrent collections for the same key;
  -- the `for update` above locks only THIS request's row. Lock order is
  -- requests -> keys, matching return_key, so the two cannot deadlock.
  --
  -- The message must contain no second ': '. src/app/api/requests/collect
  -- maps CONFLICT to 409 and passes the text through as msg.split(': ')[1] --
  -- the one branch that surfaces RPC text to the UI -- so this sentence is
  -- verifier-facing copy and a second colon would truncate it mid-clause.
  perform 1 from public.keys where id = v_req.key_id for update;

  if exists (
    select 1
    from   public.requests r
    where  r.key_id = v_req.key_id
      and  r.id     <> p_request_id
      and  r.status  = 'KEY_ISSUED'
  ) then
    raise exception 'CONFLICT: this key is already issued and has not been returned'
      using errcode = 'P0006';
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

-- 3. Re-assert grants.
--
-- CREATE OR REPLACE on an unchanged signature should retain the ACL, but this
-- project has been bitten by the opposite before -- see docs/DATABASE.md
-- "Security and performance hardening (2026-08-30)", where a CREATE OR REPLACE
-- reacquired the default PUBLIC execute grant and 20260830102558 had to revoke
-- it. REVOKE ... FROM anon alone does not undo a PUBLIC grant, since anon
-- inherits through PUBLIC.

revoke execute on function public.issue_key(uuid, uuid) from public, anon;
grant  execute on function public.issue_key(uuid, uuid) to authenticated;
