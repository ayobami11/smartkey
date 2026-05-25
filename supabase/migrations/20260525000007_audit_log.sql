-- =============================================================================
-- Migration: audit_log
-- =============================================================================
-- The audit log is the evidentiary backbone of SmartKey. Every operationally
-- significant event — key issued, key returned, request created, user
-- provisioned, shift acknowledged, report generated, incident logged — writes
-- an immutable row here in the same transaction as the state change.
--
-- IMMUTABLE GUARANTEE:
--   RLS will deny UPDATE and DELETE for ALL roles, including the Supabase
--   service role. This is enforced in Issue #11 (RLS migration). The table
--   itself has no application-level UPDATE/DELETE paths — writes go exclusively
--   through the audit writer in src/lib/audit/ which calls the write RPC.
--
-- actor_role is denormalised (copied from profiles.role at write time) so that
-- audit queries remain fast even after a user's role changes or the profile is
-- deactivated. It is the role at the time of the event, not the current role.
--
-- payload is a jsonb object whose schema is validated by the Zod schemas in
-- src/lib/audit/ before the write RPC is called. Never assume the payload
-- shape without reading those schemas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id          uuid              primary key default gen_random_uuid(),
  -- event name matches the AuditEvent union type in src/lib/audit/events.ts
  event       text              not null,
  actor_id    uuid              not null references public.profiles(id) on delete restrict,
  -- Denormalised: role at the time of the event (not the actor's current role)
  actor_role  public.user_role  not null,
  -- What kind of entity was acted upon (e.g. 'request', 'key', 'profile')
  target_type text              not null,
  target_id   uuid              not null,
  -- Validated by Zod before write; shape varies by event — see src/lib/audit/
  payload     jsonb             not null default '{}',
  occurred_at timestamptz       not null default now()

  -- IMMUTABLE: RLS denies UPDATE and DELETE for all roles including service role.
  -- See Issue #11 for the enforcement policies.
  -- There is intentionally no updated_at column on this table.
);

alter table public.audit_log enable row level security;

-- Index: actor history (CSO investigation: "what did this user do?")
create index idx_audit_log_actor_id on public.audit_log(actor_id);
-- Index: target history (CSO investigation: "what happened to this key/request?")
create index idx_audit_log_target on public.audit_log(target_type, target_id);
-- Index: event type filter (CSO audit log page filter bar)
create index idx_audit_log_event on public.audit_log(event);
-- Index: chronological display — most audit queries are time-bounded
create index idx_audit_log_occurred_at on public.audit_log(occurred_at desc);
-- Index: actor role filter (e.g. show only VERIFIER actions)
create index idx_audit_log_actor_role on public.audit_log(actor_role);
