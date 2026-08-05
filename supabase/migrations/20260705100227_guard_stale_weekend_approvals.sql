-- Guard approve_weekend, approve_guest_weekend, and decline_weekend against
-- acting on requests whose requested_for date has already passed.
--
-- The nightly cron (expire_stale_weekend_requests, 00:15 UTC) expires stale
-- PENDING_HOD / APPROVED requests, but there is a window before that job runs
-- where a Dean can still approve or decline a request from a prior weekend.
-- This guard closes the window at the database level so no combination of cron
-- timing or UI interaction can produce an approval for a date that has passed.

-- 1. approve_weekend
create or replace function public.approve_weekend(
  p_request_id             uuid,
  p_hod_id                 uuid,
  p_note                   text default null,
  p_signature_verified     boolean default true,
  p_signature_mismatch_pct numeric default null,
  p_cso_override           boolean default false
)
returns table(request_id uuid, code text, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_req         record;
  v_key_dept    uuid;
  v_authoriser  public.department_authoriser;
  v_actor_dept  uuid;
  v_decision_id uuid;
begin
  v_actor_id := coalesce(auth.uid(), p_hod_id);

  select pr.role, pr.unit_id into v_actor_role, v_actor_dept
  from   public.profiles pr where pr.id = p_hod_id;

  select r.* into v_req from public.requests r where r.id = p_request_id for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id using errcode = 'P0007';
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
  where  k.id = v_req.key_id;

  if v_authoriser = 'CSO' then
    if v_actor_role is distinct from 'CSO' then
      raise exception 'FORBIDDEN: only the CSO can approve administrative requests'
        using errcode = 'P0002';
    end if;
  elsif v_actor_role = 'CSO' and p_cso_override then
    if not exists (
      select 1 from public.audit_log
      where target_type = 'request' and target_id = p_request_id and event = 'SIGNATURE_MISMATCH'
    ) then
      raise exception 'FORBIDDEN: no signature mismatch on record for this request'
        using errcode = 'P0002';
    end if;
  else
    if v_actor_role is distinct from 'DEAN' or v_actor_dept is distinct from v_key_dept then
      raise exception 'FORBIDDEN: Dean department does not match key department'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public.hod_decisions (
    request_id, hod_id, decision, note, signature_verified, signature_mismatch_pct
  ) values (
    p_request_id, p_hod_id, 'APPROVED', p_note, p_signature_verified, p_signature_mismatch_pct
  )
  returning id into v_decision_id;

  update public.requests
  set    status = 'APPROVED', hod_decision_id = v_decision_id, code = null, code_expires_at = null
  where  id = p_request_id;

  perform public._write_audit(
    'HOD_APPROVED', p_hod_id, v_actor_role, 'request', p_request_id,
    jsonb_build_object(
      'decision_id', v_decision_id,
      'signature_verified', p_signature_verified,
      'signature_mismatch_pct', p_signature_mismatch_pct,
      'note', p_note,
      'override', (v_actor_role = 'CSO' and p_cso_override)
    )
  );

  return query select p_request_id, null::text, v_decision_id;
end;
$$;

-- 2. approve_guest_weekend
create or replace function public.approve_guest_weekend(
  p_request_id uuid,
  p_hod_id     uuid,
  p_key_id     uuid,
  p_note       text default null
)
returns table(request_id uuid, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- 3. decline_weekend
create or replace function public.decline_weekend(
  p_request_id   uuid,
  p_hod_id       uuid,
  p_note         text default null,
  p_cso_override boolean default false
)
returns table(request_id uuid, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_role  public.user_role;
  v_actor_dept  uuid;
  v_req         record;
  v_dept_id     uuid;
  v_authoriser  public.department_authoriser;
  v_decision_id uuid;
begin
  v_actor_id := coalesce(auth.uid(), p_hod_id);

  select pr.role, pr.unit_id into v_actor_role, v_actor_dept
  from   public.profiles pr where pr.id = p_hod_id;

  select r.* into v_req from public.requests r where r.id = p_request_id for update;

  if not found then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id using errcode = 'P0007';
  end if;

  if v_req.status <> 'PENDING_HOD' then
    raise exception 'CONFLICT: request is not in PENDING_HOD state (current: %)', v_req.status
      using errcode = 'P0006';
  end if;

  if v_req.requested_for < current_date then
    raise exception 'CONFLICT: the requested weekend date has already passed'
      using errcode = 'P0006';
  end if;

  v_dept_id := coalesce(
    (select k.unit_id from public.keys k where k.id = v_req.key_id),
    v_req.requested_unit_id
  );

  select d.authoriser into v_authoriser from public.units d where d.id = v_dept_id;

  if v_authoriser = 'CSO' then
    if v_actor_role is distinct from 'CSO' then
      raise exception 'FORBIDDEN: only the CSO can decline administrative requests'
        using errcode = 'P0002';
    end if;
  elsif v_actor_role = 'CSO' and p_cso_override then
    if not exists (
      select 1 from public.audit_log
      where target_type = 'request' and target_id = p_request_id and event = 'SIGNATURE_MISMATCH'
    ) then
      raise exception 'FORBIDDEN: no signature mismatch on record for this request'
        using errcode = 'P0002';
    end if;
  else
    if v_actor_role is distinct from 'DEAN' or v_actor_dept is distinct from v_dept_id then
      raise exception 'FORBIDDEN: request does not belong to your department'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public.hod_decisions (
    request_id, hod_id, decision, note, signature_verified
  ) values (p_request_id, p_hod_id, 'DECLINED', p_note, false)
  returning id into v_decision_id;

  update public.requests
  set    status = 'DECLINED', hod_decision_id = v_decision_id
  where  id = p_request_id;

  perform public._write_audit(
    'HOD_DECLINED', p_hod_id, v_actor_role, 'request', p_request_id,
    jsonb_build_object(
      'decision_id', v_decision_id,
      'note', p_note,
      'override', (v_actor_role = 'CSO' and p_cso_override)
    )
  );

  return query select p_request_id, v_decision_id;
end;
$$;

grant execute on function public.approve_weekend(uuid, uuid, text, boolean, numeric, boolean)
  to authenticated;

grant execute on function public.approve_guest_weekend(uuid, uuid, uuid, text)
  to authenticated;

grant execute on function public.decline_weekend(uuid, uuid, text, boolean)
  to authenticated;
