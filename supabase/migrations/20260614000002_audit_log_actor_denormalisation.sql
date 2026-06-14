-- Migration: denormalise actor name + department onto audit_log
--
-- The audit log is the CSO's primary investigative surface and is read far more
-- often than it is written (paginated, counted, filtered on every page change).
-- It already denormalises actor_role for query performance; this extends that
-- pattern to the actor's name and department so the read path needs no joins.
--
-- Capturing these at write time is also semantically correct for an immutable
-- journal: each entry records who the actor was AT THE TIME of the event. A
-- later rename, department move, or deactivation must not rewrite history, which
-- a live join would do.

alter table public.audit_log
  add column if not exists actor_name text,
  add column if not exists actor_department text;

-- Populate both columns inside the single write chokepoint every RPC uses.
-- One by-primary-key lookup per write (writes are rare); zero joins per read.
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
declare
  v_actor_name       text;
  v_actor_department text;
begin
  -- left join so system/unknown actors never block the audit write
  select p.full_name, d.name
    into v_actor_name, v_actor_department
    from public.profiles p
    left join public.departments d on d.id = p.department_id
   where p.id = p_actor_id;

  insert into public.audit_log (
    event,
    actor_id,
    actor_role,
    actor_name,
    actor_department,
    target_type,
    target_id,
    payload
  ) values (
    p_event,
    p_actor_id,
    p_actor_role,
    v_actor_name,
    v_actor_department,
    p_target_type,
    p_target_id,
    p_payload
  );
end;
$$;

revoke execute on function public._write_audit(text, uuid, public.user_role, text, uuid, jsonb)
  from public, anon, authenticated;

-- One-time backfill of existing rows. Runs as the migration superuser, which
-- bypasses the audit_log immutability policies (those bind the app roles).
update public.audit_log a
   set actor_name = p.full_name,
       actor_department = d.name
  from public.profiles p
  left join public.departments d on d.id = p.department_id
 where a.actor_id = p.id
   and a.actor_name is null;
