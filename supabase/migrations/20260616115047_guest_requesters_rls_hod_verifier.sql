-- Migration: guest_requesters RLS — HOD and VERIFIER read access
--
-- Problem: guest_requesters previously had only a CSO-all SELECT policy.
-- HOD's pending-requests query does a PostgREST join on guest_requesters via
-- requests.guest_id; because the HOD role had no policy, RLS silently nulled
-- the join, causing "Unknown requester" in the HOD dashboard.
-- Similarly, the VERIFIER collect route queries guest_requesters after issuing a
-- key — same null result would have shown blank guest details at the desk.
--
-- Fix: add two SELECT policies scoped to what each role legitimately needs.
--   HOD   — can read the guest when a request links that guest to their dept.
--   VERIFIER — can read the guest when a request is CODE_ISSUED or KEY_ISSUED
--              (the only states where the verifier is physically handling the key).

-- HOD: read guest details for requests routed to their department.
-- Covers PENDING_HOD (via requested_department_id, key_id is null) and post-
-- approval states (via key_id → keys.department_id).
create policy guest_requesters_select_hod
  on public.guest_requesters
  for select
  to authenticated
  using (
    exists (
      select 1
      from   public.requests r
      join   public.profiles hod on hod.id = auth.uid()
      where  r.guest_id = guest_requesters.id
        and  hod.role = 'HOD'
        and  hod.department_id is not null
        and  (
               r.requested_department_id = hod.department_id
               or exists (
                 select 1
                 from   public.keys k
                 where  k.id = r.key_id
                   and  k.department_id = hod.department_id
               )
             )
    )
  );

-- VERIFIER: read guest details when an active collection or issued request
-- exists. Restricted to CODE_ISSUED / KEY_ISSUED so verifiers cannot browse
-- historical guest data outside their operational need.
create policy guest_requesters_select_verifier
  on public.guest_requesters
  for select
  to authenticated
  using (
    public.user_role() = 'VERIFIER'
    and exists (
      select 1
      from   public.requests r
      where  r.guest_id = guest_requesters.id
        and  r.status in ('CODE_ISSUED', 'KEY_ISSUED')
    )
  );
