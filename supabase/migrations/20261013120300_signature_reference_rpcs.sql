-- A Dean's reference replacement becomes atomic.
--
-- POST /api/profile/signature verifies the new upload against the current
-- reference in TypeScript (Sharp + Pixelmatch), then either replaced the
-- reference or recorded a held upload — each as a service-role write followed
-- by a separate audit write whose failure was swallowed. A SIGNATURE_MISMATCH
-- hold could therefore exist with no audit entry, and a reference could
-- change with no SIGNATURE_REFERENCE_UPDATED.
--
-- These two RPCs are SERVICE-ONLY. The verification happens in the route and
-- must not be skippable: if a Dean session could call set_signature_reference
-- directly, it could swap its own reference past the check — the very hole
-- the profiles column guard (20261013095000) closed. So there is no session
-- actor; the route passes the authenticated Dean's id.
--
-- Both take the reference URL the upload was compared against and refuse
-- (CONFLICT) if the live reference has changed since — e.g. the CSO approved
-- a pending upload, or a second upload landed, while this one was verifying.

create or replace function public.set_signature_reference(
  p_profile_id       uuid,
  p_type             text,
  p_new_url          text,
  p_compared_ref_url text default null
)
returns table(new_url text, cleared_pending boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile         record;
  v_current         text;
  v_cleared_pending boolean;
begin
  if p_type is null or p_type not in ('signature', 'stamp') then
    raise exception 'VALIDATION: type must be signature or stamp'
      using errcode = 'P0004';
  end if;

  if p_new_url is null or btrim(p_new_url) = '' then
    raise exception 'VALIDATION: new_url is required'
      using errcode = 'P0004';
  end if;

  select pr.id, pr.role, pr.signature_ref_url, pr.stamp_ref_url
  into   v_profile
  from   public.profiles pr
  where  pr.id = p_profile_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: profile % does not exist', p_profile_id
      using errcode = 'P0007';
  end if;

  if v_profile.role is distinct from 'DEAN' then
    raise exception 'FORBIDDEN: only a Dean has a signature reference'
      using errcode = 'P0002';
  end if;

  v_current := case when p_type = 'signature'
                    then v_profile.signature_ref_url
                    else v_profile.stamp_ref_url end;

  if v_current is distinct from p_compared_ref_url then
    raise exception 'CONFLICT: the reference changed while the upload was being verified'
      using errcode = 'P0006';
  end if;

  update public.profiles pr
  set    signature_ref_url = case when p_type = 'signature' then p_new_url else pr.signature_ref_url end,
         stamp_ref_url     = case when p_type = 'stamp'     then p_new_url else pr.stamp_ref_url end
  where  pr.id = p_profile_id;

  -- A held upload was compared against the reference just replaced, so it no
  -- longer means anything; leaving it would let the CSO approve a stale image
  -- over the new one.
  delete from public.pending_signature_references ps
  where  ps.profile_id = p_profile_id and ps.type = p_type;
  v_cleared_pending := found;

  perform public._write_audit(
    'SIGNATURE_REFERENCE_UPDATED', p_profile_id, 'DEAN', 'profile', p_profile_id,
    jsonb_build_object(
      'type',              p_type,
      'new_url',           p_new_url,
      'replaced_existing', v_current is not null,
      'cleared_pending',   v_cleared_pending
    )
  );

  return query select p_new_url, v_cleared_pending;
end;
$$;

revoke execute on function public.set_signature_reference(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_signature_reference(uuid, text, text, text)
  to service_role;

create or replace function public.hold_signature_reference(
  p_profile_id       uuid,
  p_type             text,
  p_pending_url      text,
  p_compared_ref_url text,
  p_mismatch_pct     numeric,
  p_threshold_pct    numeric
)
returns table(held_pending_url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_current text;
begin
  if p_type is null or p_type not in ('signature', 'stamp') then
    raise exception 'VALIDATION: type must be signature or stamp'
      using errcode = 'P0004';
  end if;

  if p_pending_url is null or btrim(p_pending_url) = '' then
    raise exception 'VALIDATION: pending_url is required'
      using errcode = 'P0004';
  end if;

  -- A hold is only ever the result of comparing against an existing
  -- reference; with none on file the upload is simply accepted.
  if p_compared_ref_url is null then
    raise exception 'VALIDATION: a hold needs the reference it was compared against'
      using errcode = 'P0004';
  end if;

  if p_mismatch_pct is null or p_threshold_pct is null then
    raise exception 'VALIDATION: mismatch_pct and threshold_pct are required'
      using errcode = 'P0004';
  end if;

  select pr.id, pr.role, pr.signature_ref_url, pr.stamp_ref_url
  into   v_profile
  from   public.profiles pr
  where  pr.id = p_profile_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: profile % does not exist', p_profile_id
      using errcode = 'P0007';
  end if;

  if v_profile.role is distinct from 'DEAN' then
    raise exception 'FORBIDDEN: only a Dean has a signature reference'
      using errcode = 'P0002';
  end if;

  v_current := case when p_type = 'signature'
                    then v_profile.signature_ref_url
                    else v_profile.stamp_ref_url end;

  if v_current is distinct from p_compared_ref_url then
    raise exception 'CONFLICT: the reference changed while the upload was being verified'
      using errcode = 'P0006';
  end if;

  -- One pending upload per (profile, type): a newer held upload replaces an
  -- unresolved older one, as the route's upsert always did.
  insert into public.pending_signature_references as ps (
    profile_id, type, pending_url, current_ref_url, mismatch_pct, threshold_pct, submitted_at
  ) values (
    p_profile_id, p_type, p_pending_url, v_current, p_mismatch_pct, p_threshold_pct, now()
  )
  on conflict (profile_id, type) do update
  set pending_url     = excluded.pending_url,
      current_ref_url = excluded.current_ref_url,
      mismatch_pct    = excluded.mismatch_pct,
      threshold_pct   = excluded.threshold_pct,
      submitted_at    = excluded.submitted_at;

  perform public._write_audit(
    'SIGNATURE_MISMATCH', p_profile_id, 'DEAN', 'profile', p_profile_id,
    jsonb_build_object(
      'context',         'reference_replacement',
      'type',            p_type,
      'current_ref_url', v_current,
      'pending_url',     p_pending_url,
      'mismatch_pct',    p_mismatch_pct,
      'threshold_pct',   p_threshold_pct
    )
  );

  return query select p_pending_url;
end;
$$;

revoke execute on function public.hold_signature_reference(uuid, text, text, text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.hold_signature_reference(uuid, text, text, text, numeric, numeric)
  to service_role;
