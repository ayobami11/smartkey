-- approve_guest_weekend checked that the acting Dean/CSO owns the assigned key's
-- unit, but never checked that the assigned key's unit matches
-- requests.requested_unit_id -- the unit the guest actually requested access
-- within. At the RPC layer (the authoritative boundary for a SECURITY DEFINER
-- function, since it bypasses RLS) this let a Dean approve a guest request
-- routed to a different faculty by assigning a key from their own faculty
-- instead. Not reachable through the current UI (POST /api/requests/hod-decision
-- does an RLS-scoped SELECT before calling the RPC, and requests_select blocks
-- a Dean from seeing another faculty's guest request), but the RPC should not
-- rely on that as its only enforcement -- same reasoning as
-- supabase/tests/04_authoriser_gate_test.sql's authoriser-gate coverage for the
-- registered-request RPCs.
create or replace function public.approve_guest_weekend(p_request_id uuid, p_hod_id uuid, p_key_id uuid, p_note text default null::text)
 returns table(request_id uuid, decision_id uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor_role  public.user_role;
  v_actor_dept  uuid;
  v_req         record;
  v_key_dept    uuid;
  v_authoriser  public.department_authoriser;
  v_decision_id uuid;
begin
  select pr.role, pr.unit_id into v_actor_role, v_actor_dept
  from   public.profiles pr where pr.id = p_hod_id;

  select r.* into v_req from public.requests r where r.id = p_request_id for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id using errcode = 'P0007';
  end if;

  if v_req.guest_id is null then
    raise exception 'CONFLICT: request is not an external request' using errcode = 'P0006';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  if v_req.requested_for < current_date then
    raise exception 'CONFLICT: the requested weekend date has already passed'
      using errcode = 'P0006';
  end if;

  select k.unit_id, d.authoriser into v_key_dept, v_authoriser
  from   public.keys k
  join   public.units d on d.id = k.unit_id
  where  k.id = p_key_id;

  if v_key_dept is null then
    raise exception 'NOT_FOUND: key % does not exist', p_key_id using errcode = 'P0007';
  end if;

  if v_req.requested_unit_id is distinct from v_key_dept then
    raise exception 'FORBIDDEN: assigned key does not belong to the unit this guest request was routed to'
      using errcode = 'P0002';
  end if;

  if v_authoriser = 'CSO' then
    if v_actor_role is distinct from 'CSO' then
      raise exception 'FORBIDDEN: only the CSO can approve administrative requests'
        using errcode = 'P0002';
    end if;
  else
    if v_actor_role is distinct from 'DEAN' or v_actor_dept is distinct from v_key_dept then
      raise exception 'FORBIDDEN: key does not belong to the Dean department'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public.hod_decisions (
    request_id, hod_id, decision, note, signature_verified, signature_mismatch_pct
  ) values (p_request_id, p_hod_id, 'APPROVED', p_note, true, null)
  returning id into v_decision_id;

  update public.requests
  set    status = 'APPROVED', key_id = p_key_id, hod_decision_id = v_decision_id
  where  id = p_request_id;

  perform public._write_audit(
    'HOD_APPROVED', p_hod_id, v_actor_role, 'request', p_request_id,
    jsonb_build_object(
      'decision_id', v_decision_id, 'key_id', p_key_id, 'note', p_note, 'external', true
    )
  );

  return query select p_request_id, v_decision_id;
end;
$function$;
