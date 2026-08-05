-- Migration: Add requested_room to guest weekend requests

alter table public.requests
  add column requested_room text;

-- Drop the old guest request RPC signature to prevent overload conflict.
drop function if exists public.create_guest_weekend_request(
  text, text, text, text, text, uuid, date, timestamptz, text
);

-- Recreate the guest request RPC with requested_room support.
create or replace function public.create_guest_weekend_request(
  p_full_name        text,
  p_email            text,
  p_phone            text,
  p_id_type          text,
  p_id_number        text,
  p_department_id    uuid,
  p_weekend_date     date,
  p_return_deadline  timestamptz,
  p_letter_url       text,
  p_requested_room   text
)
returns table(request_id uuid, access_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id     uuid;
  v_request_id   uuid;
  v_access_token uuid;
begin
  if not exists (
    select 1 from public.departments d where d.id = p_department_id
  ) then
    raise exception 'NOT_FOUND: department % does not exist', p_department_id
      using errcode = 'P0007';
  end if;

  insert into public.guest_requesters (
    full_name, email, phone, id_document_type, id_document_number
  ) values (
    p_full_name, p_email, p_phone, p_id_type, p_id_number
  )
  returning id into v_guest_id;

  v_access_token := gen_random_uuid();

  insert into public.requests (
    requester_id,
    guest_id,
    key_id,
    requested_department_id,
    type,
    requested_for,
    status,
    code,
    code_expires_at,
    return_deadline,
    access_token,
    letter_url,
    risk_tier,
    requested_room
  ) values (
    null,
    v_guest_id,
    null,
    p_department_id,
    'WEEKEND',
    p_weekend_date,
    'PENDING_HOD',
    null,
    null,
    p_return_deadline,
    v_access_token,
    p_letter_url,
    'LOW',
    p_requested_room
  )
  returning id into v_request_id;

  perform public._write_audit_guest(
    'REQUEST_CREATED',
    'request',
    v_request_id,
    p_full_name || ' (external)',
    jsonb_build_object(
      'type',            'WEEKEND',
      'status',          'PENDING_HOD',
      'department_id',   p_department_id,
      'requested_for',   p_weekend_date,
      'return_deadline', p_return_deadline,
      'requested_room',  p_requested_room,
      'external',        true
    )
  );

  return query select v_request_id, v_access_token;
end;
$$;

revoke execute on function public.create_guest_weekend_request(
  text, text, text, text, text, uuid, date, timestamptz, text, text
) from public, anon, authenticated;
