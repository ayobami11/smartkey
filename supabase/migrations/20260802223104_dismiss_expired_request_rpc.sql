-- Lets a Dean (own faculty) or the CSO clear a weekend request whose date has
-- passed out of the pending queue, rather than waiting for the nightly
-- expire_stale_weekend_requests() sweep.
--
-- This is housekeeping, not a decision on merits: the request is already
-- un-actionable (approve/decline both refuse a past date), so no hod_decisions
-- row is written. The request lands in EXPIRED — the same terminal state the
-- cron produces — so it stays visible in requester history and the CSO audit
-- log. The audit payload records who dismissed it and from which status.
--
-- The CSO may dismiss any faculty's expired request as well as Administration
-- ones; the row is dead either way and this is caretaking of a stale queue.

create or replace function public.dismiss_expired_request(
  p_request_id uuid,
  p_actor_id   uuid
)
returns table(request_id uuid, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor_role public.user_role;
  v_actor_dept uuid;
  v_req        record;
  v_dept_id    uuid;
  v_guest_name text;
begin
  select pr.role, pr.unit_id into v_actor_role, v_actor_dept
  from   public.profiles pr where pr.id = p_actor_id;

  if v_actor_role is null then
    raise exception 'FORBIDDEN: actor has no profile' using errcode = 'P0002';
  end if;

  select r.* into v_req
  from   public.requests r where r.id = p_request_id for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id
      using errcode = 'P0007';
  end if;

  if v_req.type <> 'WEEKEND' then
    raise exception 'CONFLICT: only weekend requests can be dismissed'
      using errcode = 'P0006';
  end if;

  if v_req.status not in ('PENDING_HOD', 'APPROVED', 'CODE_ISSUED') then
    raise exception 'CONFLICT: request is not dismissable (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  -- Only genuinely lapsed requests. A live one must be approved or declined.
  if v_req.requested_for >= current_date then
    raise exception 'CONFLICT: the requested date has not passed yet'
      using errcode = 'P0006';
  end if;

  v_dept_id := coalesce(
    (select k.unit_id from public.keys k where k.id = v_req.key_id),
    v_req.requested_unit_id
  );

  if v_actor_role <> 'CSO' then
    if v_actor_role is distinct from 'DEAN' or v_actor_dept is distinct from v_dept_id then
      raise exception 'FORBIDDEN: request does not belong to your faculty'
        using errcode = 'P0002';
    end if;
  end if;

  update public.requests
  set    status          = 'EXPIRED',
         code            = null,
         code_expires_at = null
  where  id = p_request_id;

  if v_req.requester_id is not null then
    perform public._write_audit(
      'REQUEST_EXPIRED', p_actor_id, v_actor_role, 'request', p_request_id,
      jsonb_build_object(
        'reason',          'dismissed_by_authoriser',
        'previous_status', v_req.status,
        'dismissed_by',    p_actor_id
      )
    );
  else
    select g.full_name into v_guest_name
    from   public.guest_requesters g where g.id = v_req.guest_id;

    -- Guest request, but the dismissal was performed by a real profile, so the
    -- normal audit writer is correct here; the guest is named in the payload.
    perform public._write_audit(
      'REQUEST_EXPIRED', p_actor_id, v_actor_role, 'request', p_request_id,
      jsonb_build_object(
        'reason',          'dismissed_by_authoriser',
        'previous_status', v_req.status,
        'dismissed_by',    p_actor_id,
        'guest_name',      coalesce(v_guest_name, 'Guest'),
        'external',        true
      )
    );
  end if;

  return query select p_request_id, 'EXPIRED'::text;
end;
$function$;

revoke execute on function public.dismiss_expired_request(uuid, uuid) from public, anon;
grant  execute on function public.dismiss_expired_request(uuid, uuid) to authenticated;
