-- Migration: external (non-registered) weekend key requests — schema
--
-- The security desk's real-world rule is that anyone may collect a key on the
-- weekend provided they have authorisation from the Head of Department. SmartKey
-- previously only supported weekend requests from registered users (those with a
-- profiles row + auth.users account). This migration adds a guest path so an
-- external person, with no account, can submit a weekend request that an HOD
-- authorises, ultimately producing a 6-digit collection code for the desk.
--
-- Guests are modelled as their own entity (guest_requesters), never an auth user
-- or profile: profiles.id references auth.users(id), so a guest profile would
-- require an auth user and break the invited_by chain-of-trust. Because guests
-- are session-less, all guest mutations go through SECURITY DEFINER RPCs called
-- from server-side routes; the guest reaches their status/code page via an
-- unguessable access_token validated inside those RPCs.

-- guest_requesters — an external person who may collect a key for one weekend.

create table public.guest_requesters (
  id                 uuid        primary key default gen_random_uuid(),
  full_name          text        not null,
  email              text        not null,
  phone              text,
  -- Identity document the guest declares at submit; the verifier checks the
  -- physical ID at the desk (guests have no passport photo on file).
  id_document_type   text        not null,
  id_document_number text        not null,
  created_at         timestamptz not null default now()
);

alter table public.guest_requesters enable row level security;

-- CSO is the only role that reads guest_requesters directly; HOD and verifier
-- see the guest's details through the request joins via SECURITY DEFINER RPCs.
create policy guest_requesters_select_cso_all
  on public.guest_requesters
  for select
  to authenticated
  using (public.user_role() = 'CSO');

-- requests — relax requester/key NOT NULL and add the guest columns.

-- A request now belongs to EITHER a registered requester OR a guest, never both.
alter table public.requests
  alter column requester_id drop not null;

-- A guest does not pick a specific key; the HOD assigns one on approval, so
-- key_id is null while the request awaits HOD action.
alter table public.requests
  alter column key_id drop not null;

alter table public.requests
  add column guest_id uuid references public.guest_requesters(id) on delete restrict,
  -- Department the guest is requesting access within. Drives HOD routing while
  -- key_id is still null. Null for registered-user requests (their key carries
  -- the department).
  add column requested_department_id uuid references public.departments(id) on delete restrict,
  -- Unguessable token the guest uses to reach their session-less status/code
  -- page. Present only for guest requests.
  add column access_token uuid,
  -- Path in the weekend-letters Storage bucket to the HOD authorisation letter
  -- the guest uploaded at submit.
  add column letter_url text;

-- Exactly one requester kind per row.
alter table public.requests
  add constraint requests_one_requester_kind
  check (num_nonnulls(requester_id, guest_id) = 1);

-- key_id may only be null while a request still awaits HOD assignment.
alter table public.requests
  add constraint requests_key_required_after_pending
  check (key_id is not null or status = 'PENDING_HOD');

-- Fast token lookup for the guest status/code page.
create unique index idx_requests_access_token
  on public.requests(access_token)
  where access_token is not null;

-- HOD routing for unassigned guest requests.
create index idx_requests_requested_department_id
  on public.requests(requested_department_id)
  where requested_department_id is not null;

-- RLS: HOD must see guest requests for their department BEFORE a key is assigned
-- (the existing requests_select_hod_dept policy keys on keys.department_id, which
-- is null for an unassigned guest request). This branch covers that window.
create policy requests_select_hod_guest
  on public.requests
  for select
  to authenticated
  using (
    public.user_role() = 'HOD'
    and guest_id is not null
    and requested_department_id = public.user_department_id()
  );

-- audit_log — allow guest-initiated events to record a non-profile actor.
--
-- Guest actions (REQUEST_CREATED, CODE_ISSUED, REQUEST_EXPIRED) have no profile
-- and no role, so actor_id and actor_role become nullable. actor_name carries a
-- human-readable label like 'Jane Doe (external)' so the CSO audit view still
-- attributes the action. The immutability policies are unchanged.
alter table public.audit_log
  alter column actor_id drop not null,
  alter column actor_role drop not null;
