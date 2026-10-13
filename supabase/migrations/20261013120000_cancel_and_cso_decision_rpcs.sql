-- Requester cancel and CSO intervention become atomic RPCs.
--
-- POST /api/requests/cancel and POST /api/requests/cso-decision used to
-- update `requests` with the service-role client and then write their audit
-- entry in a second, separate call whose failure was swallowed — so a state
-- change could commit with no audit entry, against the audit-log rule.
--
-- cso-decision also had a live bug: DECLINED ran
-- `update ... where status = 'CODE_ISSUED'` and never checked the row count.
-- The CSO queue lists KEY_ISSUED requests too (with Decline buttons), so
-- declining one updated nothing, still wrote REQUEST_DECLINED_CSO, and
-- returned CANCELLED. Its `note` was accepted and dropped.
--
-- Both RPCs take the actor from auth.uid(), never a parameter.

create or replace function public.cancel_request(p_request_id uuid)
returns table(request_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_role public.user_role;
  v_req        record;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;
  if v_actor_role is distinct from 'REQUESTER' then
    raise exception 'FORBIDDEN: only a REQUESTER can cancel a request'
      using errcode = 'P0002';
  end if;

  -- Another requester's request is reported as not found, exactly as the
  -- RLS-scoped lookup the route used to do: its existence is not disclosed.
  select r.id, r.status, r.key_id
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
    and  r.requester_id = v_actor_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  -- Any pre-collection state: a weekday code (CODE_ISSUED), or a weekend
  -- request awaiting or holding approval (PENDING_HOD, APPROVED).
  if v_req.status not in ('CODE_ISSUED', 'PENDING_HOD', 'APPROVED') then
    raise exception 'CONFLICT: request cannot be cancelled (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  update public.requests r
  set    status          = 'CANCELLED',
         code            = null,
         code_expires_at = null
  where  r.id = p_request_id;

  perform public._write_audit(
    'REQUEST_CANCELLED', v_actor_id, v_actor_role, 'request', p_request_id,
    jsonb_build_object(
      'key_id',          v_req.key_id,
      'previous_status', v_req.status::text
    )
  );

  return query select p_request_id, 'CANCELLED'::text;
end;
$$;

revoke execute on function public.cancel_request(uuid) from public, anon;
grant execute on function public.cancel_request(uuid) to authenticated;

create or replace function public.cso_decide_request(
  p_request_id uuid,
  p_decision   text,
  p_note       text default null
)
returns table(request_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_role public.user_role;
  v_req        record;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select pr.role into v_actor_role from public.profiles pr where pr.id = v_actor_id;
  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can review a request'
      using errcode = 'P0002';
  end if;

  if p_decision is null or p_decision not in ('APPROVED', 'DECLINED') then
    raise exception 'INVALID_DECISION: decision must be APPROVED or DECLINED'
      using errcode = 'P0004';
  end if;

  select r.id, r.status, r.key_id
  into   v_req
  from   public.requests r
  where  r.id = p_request_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  if p_decision = 'DECLINED' then
    -- Only a code that has not been collected can be withdrawn. A key that is
    -- already out is a desk matter (return / incident), not a cancellation.
    if v_req.status <> 'CODE_ISSUED' then
      raise exception 'CONFLICT: only a request with an uncollected code can be declined (current: %)', v_req.status
        using errcode = 'P0006';
    end if;

    update public.requests r
    set    status          = 'CANCELLED',
           code            = null,
           code_expires_at = null
    where  r.id = p_request_id;

    perform public._write_audit(
      'REQUEST_DECLINED_CSO', v_actor_id, v_actor_role, 'request', p_request_id,
      jsonb_build_object(
        'decision',        p_decision,
        'note',            p_note,
        'key_id',          v_req.key_id,
        'previous_status', v_req.status::text
      )
    );

    return query select p_request_id, 'CANCELLED'::text;
    return;
  end if;

  -- APPROVED: an acknowledgement that the CSO reviewed it and lets it stand.
  -- No state change; the response carries the request's real status.
  if v_req.status not in ('CODE_ISSUED', 'KEY_ISSUED') then
    raise exception 'CONFLICT: request is no longer under review (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  perform public._write_audit(
    'REQUEST_APPROVED_CSO', v_actor_id, v_actor_role, 'request', p_request_id,
    jsonb_build_object(
      'decision', p_decision,
      'note',     p_note,
      'key_id',   v_req.key_id,
      'status',   v_req.status::text
    )
  );

  return query select p_request_id, v_req.status::text;
end;
$$;

revoke execute on function public.cso_decide_request(uuid, text, text) from public, anon;
grant execute on function public.cso_decide_request(uuid, text, text) to authenticated;
