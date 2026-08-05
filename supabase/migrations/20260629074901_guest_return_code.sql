-- Migration: guest return code flow
--
-- Adds request_return_guest(access_token) — the token-keyed analogue of
-- request_return(request_id, requester_id) for external (non-registered) guests.
--
-- Flow:
--   1. Guest taps "Generate return code" on their status page.
--   2. This RPC mints a 6-digit return_code (15-minute expiry) on the KEY_ISSUED
--      request, keyed by access_token (guests have no session).
--   3. Guest reads the code to the verifier, who enters it via the normal
--      return_key() RPC — no changes needed there; it validates return_code
--      regardless of whether the requester is registered or a guest.
--
-- execute is revoked from all roles including authenticated; the route calls it
-- via the service-role admin client server-side.

create or replace function public.request_return_guest(
  p_access_token uuid
)
returns table(request_id uuid, return_code text, return_code_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req        record;
  v_guest_name text;
  v_code       text;
  v_expires_at timestamptz;
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

  if v_req.status <> 'KEY_ISSUED' then
    raise exception 'CONFLICT: request is not in KEY_ISSUED state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  v_code       := lpad(floor(random() * 1000000)::int::text, 6, '0');
  v_expires_at := now() + interval '15 minutes';

  update public.requests
  set    return_code            = v_code,
         return_code_expires_at = v_expires_at
  where  id = v_req.id;

  select g.full_name into v_guest_name
  from   public.guest_requesters g
  where  g.id = v_req.guest_id;

  perform public._write_audit_guest(
    'RETURN_CODE_GENERATED',
    'request',
    v_req.id,
    coalesce(v_guest_name, 'External requester') || ' (external)',
    jsonb_build_object(
      'key_id',   v_req.key_id,
      'expires_at', v_expires_at,
      'external', true
    )
  );

  return query select v_req.id, v_code, v_expires_at;
end;
$$;

revoke execute on function public.request_return_guest(uuid)
  from public, anon, authenticated;
