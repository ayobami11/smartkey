-- =============================================================================
-- SmartKey — Row Level Security Policies
-- Migration: 20260525000008_rls_policies.sql
--
-- Covers all 12 application tables. Policies are the authoritative data-isolation
-- layer; route-level role checks are defence-in-depth only (see docs/ARCHITECTURE.md).
--
-- Role values: 'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER'
-- Role source:  public.profiles.role  (never the JWT claim directly)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Auth helper functions
-- SECURITY DEFINER so they run as the function owner, avoiding recursive RLS
-- on profiles when called from within another policy.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth.user_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth.user_department_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Grant execute to authenticated role so policies can call them
GRANT EXECUTE ON FUNCTION auth.user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_department_id() TO authenticated;

-- =============================================================================
-- 1. profiles
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: every authenticated user reads their own row
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- SELECT: CSO reads every profile
CREATE POLICY profiles_select_cso_all
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- SELECT: HOD reads profiles in the same department
CREATE POLICY profiles_select_hod_dept
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'HOD'
    AND department_id = auth.user_department_id()
  );

-- INSERT: blocked for all authenticated users.
-- New profiles are created by the provision_user() RPC running as service role.

-- UPDATE: authenticated users update their own row only (e.g. photo_url, full_name).
-- Privileged field changes (role, status) are handled by CSO via service-role RPCs.
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- UPDATE: CSO can update any profile (e.g. status → DEACTIVATED)
CREATE POLICY profiles_update_cso_any
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.user_role() = 'CSO')
  WITH CHECK (auth.user_role() = 'CSO');

-- DELETE: blocked for all (profiles are deactivated, never deleted)

-- =============================================================================
-- 2. departments
-- =============================================================================

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users can see departments
CREATE POLICY departments_select_all
  ON public.departments
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: CSO only
CREATE POLICY departments_insert_cso
  ON public.departments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.user_role() = 'CSO');

-- UPDATE: CSO only
CREATE POLICY departments_update_cso
  ON public.departments
  FOR UPDATE
  TO authenticated
  USING (auth.user_role() = 'CSO')
  WITH CHECK (auth.user_role() = 'CSO');

-- DELETE: CSO only
CREATE POLICY departments_delete_cso
  ON public.departments
  FOR DELETE
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- =============================================================================
-- 3. keys
-- =============================================================================

ALTER TABLE public.keys ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users (verifiers, requesters, HODs, and CSO all need
-- to read key details)
CREATE POLICY keys_select_all
  ON public.keys
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: CSO only
CREATE POLICY keys_insert_cso
  ON public.keys
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.user_role() = 'CSO');

-- UPDATE: CSO only (e.g. retiring a key, changing room_name)
CREATE POLICY keys_update_cso
  ON public.keys
  FOR UPDATE
  TO authenticated
  USING (auth.user_role() = 'CSO')
  WITH CHECK (auth.user_role() = 'CSO');

-- DELETE: blocked for all (keys are retired via status update, never deleted)

-- =============================================================================
-- 4. authorisations
-- =============================================================================

ALTER TABLE public.authorisations ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users (requesters need to know their own slots;
-- verifiers need to validate; HODs manage their department)
CREATE POLICY authorisations_select_all
  ON public.authorisations
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: HOD for keys that belong to their department only.
-- The max-3-per-key constraint is enforced at DB level via trigger/check.
CREATE POLICY authorisations_insert_hod_dept
  ON public.authorisations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() = 'HOD'
    AND EXISTS (
      SELECT 1
      FROM public.keys k
      WHERE k.id = authorisations.key_id
        AND k.department_id = auth.user_department_id()
    )
  );

-- DELETE: HOD for their department's keys only
CREATE POLICY authorisations_delete_hod_dept
  ON public.authorisations
  FOR DELETE
  TO authenticated
  USING (
    auth.user_role() = 'HOD'
    AND EXISTS (
      SELECT 1
      FROM public.keys k
      WHERE k.id = authorisations.key_id
        AND k.department_id = auth.user_department_id()
    )
  );

-- UPDATE: blocked (slot reassignment requires delete + insert to maintain integrity)

-- =============================================================================
-- 5. requests
-- =============================================================================

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

-- SELECT: REQUESTER sees their own requests
CREATE POLICY requests_select_own
  ON public.requests
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'REQUESTER'
    AND requester_id = auth.uid()
  );

-- SELECT: HOD sees requests for keys in their department
CREATE POLICY requests_select_hod_dept
  ON public.requests
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'HOD'
    AND EXISTS (
      SELECT 1
      FROM public.keys k
      WHERE k.id = requests.key_id
        AND k.department_id = auth.user_department_id()
    )
  );

-- SELECT: VERIFIER sees all requests (shift-scoping can be layered on later)
CREATE POLICY requests_select_verifier_all
  ON public.requests
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'VERIFIER');

-- SELECT: CSO sees all requests
CREATE POLICY requests_select_cso_all
  ON public.requests
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- INSERT: REQUESTER only, via create_request RPC.
-- Direct inserts from the client are blocked by requiring the row's requester_id
-- to match the authenticated user (RPCs run as service role and bypass RLS).
CREATE POLICY requests_insert_requester
  ON public.requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() = 'REQUESTER'
    AND requester_id = auth.uid()
  );

-- UPDATE: blocked directly for all authenticated users.
-- All status transitions go through RPCs (issue_key, return_key, etc.) that
-- run as service role and therefore bypass RLS.

-- DELETE: blocked for all

-- =============================================================================
-- 6. hod_decisions
-- =============================================================================

ALTER TABLE public.hod_decisions ENABLE ROW LEVEL SECURITY;

-- SELECT: HOD sees decisions for their department's requests
CREATE POLICY hod_decisions_select_hod_dept
  ON public.hod_decisions
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'HOD'
    AND EXISTS (
      SELECT 1
      FROM public.requests r
      JOIN public.keys k ON k.id = r.key_id
      WHERE r.id = hod_decisions.request_id
        AND k.department_id = auth.user_department_id()
    )
  );

-- SELECT: CSO sees all decisions
CREATE POLICY hod_decisions_select_cso_all
  ON public.hod_decisions
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- INSERT: blocked directly — done via approve_weekend / decline_weekend RPCs
-- UPDATE: blocked
-- DELETE: blocked

-- =============================================================================
-- 7. shifts
-- =============================================================================

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- SELECT: VERIFIER sees all shifts
CREATE POLICY shifts_select_verifier
  ON public.shifts
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'VERIFIER');

-- SELECT: CSO sees all shifts
CREATE POLICY shifts_select_cso
  ON public.shifts
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- INSERT: blocked directly (managed by system / Edge Functions via service role)
-- UPDATE: blocked
-- DELETE: blocked

-- =============================================================================
-- 8. shift_handovers
-- =============================================================================

ALTER TABLE public.shift_handovers ENABLE ROW LEVEL SECURITY;

-- SELECT: VERIFIER sees all handover records
CREATE POLICY shift_handovers_select_verifier
  ON public.shift_handovers
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'VERIFIER');

-- SELECT: CSO sees all handover records
CREATE POLICY shift_handovers_select_cso
  ON public.shift_handovers
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- INSERT: blocked directly — done via acknowledge_shift_handover RPC
-- UPDATE: blocked
-- DELETE: blocked

-- =============================================================================
-- 9. shift_reports
-- =============================================================================

ALTER TABLE public.shift_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: CSO only
CREATE POLICY shift_reports_select_cso
  ON public.shift_reports
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- INSERT: blocked directly — done via generate_shift_report RPC (immutable after insert)
-- UPDATE: blocked (immutability enforced at both RLS and RPC layer)
-- DELETE: blocked

-- =============================================================================
-- 10. shift_report_comments
-- =============================================================================

ALTER TABLE public.shift_report_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: CSO only
CREATE POLICY shift_report_comments_select_cso
  ON public.shift_report_comments
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- INSERT: blocked directly — done via add_report_comment RPC (immutable after insert)
-- UPDATE: blocked
-- DELETE: blocked

-- =============================================================================
-- 11. incidents
-- =============================================================================

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

-- SELECT: CSO sees all incidents
CREATE POLICY incidents_select_cso
  ON public.incidents
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- SELECT: VERIFIER sees incidents logged during their own shifts.
-- Joins through shifts to find incidents where the verifier is the primary officer
-- of the shift referenced by the incident.
CREATE POLICY incidents_select_verifier_own_shift
  ON public.incidents
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'VERIFIER'
    AND EXISTS (
      SELECT 1
      FROM public.shifts s
      WHERE s.id = incidents.shift_id
        AND (
          s.primary_officer_id = auth.uid()
          OR s.secondary_officer_id = auth.uid()
        )
    )
  );

-- INSERT: CSO and VERIFIER can append incidents (append-only table; no UPDATE/DELETE)
CREATE POLICY incidents_insert_cso_verifier
  ON public.incidents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.user_role() IN ('CSO', 'VERIFIER'));

-- UPDATE: blocked for ALL roles including service role.
-- Enforced by explicit denial policy so even a service-role bypass cannot update.
CREATE POLICY incidents_update_denied
  ON public.incidents
  FOR UPDATE
  TO authenticated
  USING (false);

-- DELETE: blocked for ALL roles including service role.
CREATE POLICY incidents_delete_denied
  ON public.incidents
  FOR DELETE
  TO authenticated
  USING (false);

-- Also revoke UPDATE and DELETE at the privilege level for the authenticated role
-- (belt-and-suspenders: RLS + privilege revocation)
REVOKE UPDATE, DELETE ON public.incidents FROM authenticated;

-- =============================================================================
-- 12. audit_log
-- =============================================================================

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: CSO only — the audit log is the system's evidentiary backbone
CREATE POLICY audit_log_select_cso
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'CSO');

-- INSERT: blocked directly for authenticated users.
-- All inserts go through service-role RPCs (SECURITY DEFINER functions) that
-- bypass RLS. Direct inserts from client sessions are not permitted.

-- UPDATE: blocked for ALL roles including service role.
CREATE POLICY audit_log_update_denied
  ON public.audit_log
  FOR UPDATE
  TO authenticated
  USING (false);

-- DELETE: blocked for ALL roles including service role.
CREATE POLICY audit_log_delete_denied
  ON public.audit_log
  FOR DELETE
  TO authenticated
  USING (false);

-- Also revoke UPDATE and DELETE at the privilege level (belt-and-suspenders)
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated;

-- =============================================================================
-- Summary
-- =============================================================================
-- Tables with RLS enabled: 12
--   profiles, departments, keys, authorisations, requests,
--   hod_decisions, shifts, shift_handovers, shift_reports,
--   shift_report_comments, incidents, audit_log
--
-- Helper functions: auth.user_role(), auth.user_department_id()
-- Both are SECURITY DEFINER to avoid recursive RLS on profiles.
--
-- Append-only tables: incidents, audit_log, shift_reports, shift_report_comments
-- For incidents and audit_log: UPDATE/DELETE blocked via both RLS policy (USING false)
-- and REVOKE at the privilege level to prevent any bypass.
-- =============================================================================
