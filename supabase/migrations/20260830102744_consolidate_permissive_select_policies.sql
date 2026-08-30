-- Perf advisor: multiple permissive SELECT policies on the same table force
-- Postgres to evaluate each one per query. Consolidate into a single OR'd policy
-- per table. Predicates are copied verbatim from the policies being replaced
-- (guest_requesters_select_hod already carries the auth.uid() initplan fix from
-- the prior migration) -- no access-control logic changes, only policy count.

DROP POLICY guest_requesters_select_cso_all ON public.guest_requesters;
DROP POLICY guest_requesters_select_hod ON public.guest_requesters;
DROP POLICY guest_requesters_select_verifier ON public.guest_requesters;

CREATE POLICY guest_requesters_select ON public.guest_requesters
FOR SELECT
USING (
  (user_role() = 'CSO'::text)
  OR EXISTS (
    SELECT 1
    FROM requests r
    JOIN profiles hod ON hod.id = (select auth.uid())
    WHERE r.guest_id = guest_requesters.id
      AND hod.role = 'DEAN'::user_role
      AND hod.unit_id IS NOT NULL
      AND (
        r.requested_unit_id = hod.unit_id
        OR EXISTS (SELECT 1 FROM keys k WHERE k.id = r.key_id AND k.unit_id = hod.unit_id)
      )
  )
  OR (
    (user_role() = 'VERIFIER'::text)
    AND EXISTS (
      SELECT 1 FROM requests r
      WHERE r.guest_id = guest_requesters.id
        AND r.status = ANY (ARRAY['CODE_ISSUED'::request_status, 'KEY_ISSUED'::request_status])
    )
  )
);

DROP POLICY requests_select ON public.requests;
DROP POLICY requests_select_hod_guest ON public.requests;

CREATE POLICY requests_select ON public.requests
FOR SELECT
USING (
  ((user_role() = 'REQUESTER'::text) AND (requester_id = (select auth.uid())))
  OR ((user_role() = 'DEAN'::text) AND EXISTS (SELECT 1 FROM keys k WHERE k.id = requests.key_id AND k.unit_id = user_unit_id()))
  OR (user_role() = 'VERIFIER'::text)
  OR (user_role() = 'CSO'::text)
  OR ((user_role() = 'DEAN'::text) AND (guest_id IS NOT NULL) AND (requested_unit_id = user_unit_id()))
);
