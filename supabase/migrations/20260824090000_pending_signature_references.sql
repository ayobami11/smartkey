-- CSO override for held signature/stamp reference-replacement mismatches

create table public.pending_signature_references (
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  type            text not null check (type in ('signature', 'stamp')),
  pending_url     text not null,
  current_ref_url text,
  mismatch_pct    numeric not null,
  threshold_pct   numeric not null,
  submitted_at    timestamptz not null default now(),
  primary key (profile_id, type)
);

alter table public.pending_signature_references enable row level security;

-- SELECT: CSO only, same shape as audit_log_select_cso.
create policy pending_signature_references_select_cso
  on public.pending_signature_references
  for select
  to authenticated
  using (public.user_role() = 'CSO');

-- No INSERT/UPDATE/DELETE policy for any role. The route writes the pending
-- row via the service-role admin client (bypasses RLS); resolving it goes
-- through the RPC below (SECURITY DEFINER).

create or replace function public.resolve_pending_signature_reference(
  p_profile_id uuid,
  p_type       text,
  p_decision   text,
  p_note       text default null
)
returns table(status text, new_url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_role public.user_role;
  v_pending    record;
begin
  if v_actor_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select role into v_actor_role from public.profiles where id = v_actor_id;
  if v_actor_role is distinct from 'CSO' then
    raise exception 'FORBIDDEN: only the CSO can resolve a held signature reference'
      using errcode = 'P0002';
  end if;

  if p_type not in ('signature', 'stamp') then
    raise exception 'INVALID_DECISION: type must be signature or stamp'
      using errcode = 'P0004';
  end if;

  if p_decision not in ('APPROVED', 'DECLINED') then
    raise exception 'INVALID_DECISION: decision must be APPROVED or DECLINED'
      using errcode = 'P0004';
  end if;

  select * into v_pending from public.pending_signature_references
    where profile_id = p_profile_id and type = p_type;

  if not found then
    raise exception 'NOT_FOUND: no pending reference for this profile/type'
      using errcode = 'P0007';
  end if;

  delete from public.pending_signature_references
    where profile_id = p_profile_id and type = p_type;

  if p_decision = 'APPROVED' then
    update public.profiles
       set signature_ref_url = case when p_type = 'signature' then v_pending.pending_url else signature_ref_url end,
           stamp_ref_url     = case when p_type = 'stamp'     then v_pending.pending_url else stamp_ref_url end
     where id = p_profile_id;

    perform public._write_audit(
      'SIGNATURE_REFERENCE_UPDATED', v_actor_id, v_actor_role,
      'profile', p_profile_id,
      jsonb_build_object(
        'type', p_type,
        'new_url', v_pending.pending_url,
        'replaced_existing', true,
        'resolved_by_cso', true,
        'mismatch_pct', v_pending.mismatch_pct,
        'note', p_note
      )
    );

    return query select 'APPROVED'::text, v_pending.pending_url;
  else
    perform public._write_audit(
      'SIGNATURE_REFERENCE_DECLINED', v_actor_id, v_actor_role,
      'profile', p_profile_id,
      jsonb_build_object(
        'type', p_type,
        'pending_url', v_pending.pending_url,
        'note', p_note
      )
    );

    return query select 'DECLINED'::text, null::text;
  end if;
end;
$$;

revoke execute on function public.resolve_pending_signature_reference(uuid, text, text, text)
  from public, anon;
grant execute on function public.resolve_pending_signature_reference(uuid, text, text, text)
  to authenticated;
