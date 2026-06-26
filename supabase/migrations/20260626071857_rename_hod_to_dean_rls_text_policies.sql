-- Migration: fix RLS policies that gate on the role *text*, post HOD -> DEAN rename.
--
-- The public.user_role() helper returns text, so policies written as
-- user_role() = 'HOD'::text were NOT updated by `alter type ... rename value`
-- (that only rewrites references to the enum value by oid). After the rename
-- these compared a Dean's role ('DEAN') against the stale literal 'HOD',
-- silently locking Deans out of their department's profiles, requests, guest
-- requests, authorisations, and decisions. Recreate each against 'DEAN'.
--
-- Storage policies and any policy comparing the enum directly
-- (role = 'HOD'::user_role) needed no change -- those reconstruct against the
-- new label automatically. Policy names keep the historical "hod" token.

drop policy if exists authorisations_delete_hod_dept on public.authorisations;
create policy authorisations_delete_hod_dept on public.authorisations
  for delete to authenticated using (
    (user_role() = 'DEAN'::text) and (exists (
      select 1 from public.keys k
      where k.id = authorisations.key_id and k.department_id = user_department_id()
    ))
  );

drop policy if exists authorisations_insert_hod_dept on public.authorisations;
create policy authorisations_insert_hod_dept on public.authorisations
  for insert to authenticated with check (
    (user_role() = 'DEAN'::text) and (exists (
      select 1 from public.keys k
      where k.id = authorisations.key_id and k.department_id = user_department_id()
    ))
  );

drop policy if exists hod_decisions_select on public.hod_decisions;
create policy hod_decisions_select on public.hod_decisions
  for select to authenticated using (
    (user_role() = 'CSO'::text) or ((user_role() = 'DEAN'::text) and (exists (
      select 1 from public.requests r join public.keys k on k.id = r.key_id
      where r.id = hod_decisions.request_id and k.department_id = user_department_id()
    )))
  );

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    (id = (select auth.uid()))
    or (user_role() = 'CSO'::text)
    or ((user_role() = 'DEAN'::text) and (department_id = user_department_id()))
  );

drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests
  for select to authenticated using (
    ((user_role() = 'REQUESTER'::text) and (requester_id = (select auth.uid())))
    or ((user_role() = 'DEAN'::text) and (exists (
      select 1 from public.keys k
      where k.id = requests.key_id and k.department_id = user_department_id()
    )))
    or (user_role() = 'VERIFIER'::text)
    or (user_role() = 'CSO'::text)
  );

drop policy if exists requests_select_hod_guest on public.requests;
create policy requests_select_hod_guest on public.requests
  for select to authenticated using (
    (user_role() = 'DEAN'::text)
    and (guest_id is not null)
    and (requested_department_id = user_department_id())
  );
