-- Backfilled from supabase_migrations.schema_migrations on 2026-08-04.
-- This migration was applied directly to the remote project (via the Supabase
-- dashboard or MCP) and was never committed. Recovered verbatim so that a fresh
-- replay of supabase/migrations/ reproduces production. Do not edit.

-- Migration: 20260525000010_security_performance_fixes
-- Fixes all issues found by Supabase Advisor after initial schema deployment.
-- 1. SECURITY: Add SET search_path to trigger functions
-- 2. SECURITY: Revoke implicit PUBLIC execute grant from all functions
-- 3. PERFORMANCE: Use (SELECT auth.uid()) in RLS policies (one eval per query)
-- 4. PERFORMANCE: Consolidate multiple permissive SELECT policies per table
-- 5. PERFORMANCE: Add 5 missing FK covering indexes


CREATE OR REPLACE FUNCTION public.handle_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_authorisation_limit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  current_count integer;
BEGIN
  SELECT count(*)
  INTO current_count
  FROM public.authorisations
  WHERE key_id = NEW.key_id;

  IF current_count >= 3 THEN
    RAISE EXCEPTION
      'Maximum of 3 authorisations already exist for key_id %. No further collectors can be added.',
      NEW.key_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Revoke implicit PUBLIC execute from all functions ───────────────────
-- Authenticated role retains its explicit GRANTs from migration 9.
-- Anon role loses access (no unauthenticated RPC calls permitted).

REVOKE EXECUTE ON FUNCTION public.user_role()                                      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_department_id()                             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_user(text, text, text, uuid)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_request(uuid, text, timestamptz, date)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.issue_key(uuid, uuid)                            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.return_key(uuid, uuid, uuid)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_weekend(uuid, uuid, text, boolean, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_weekend(uuid, uuid, text)               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.acknowledge_shift_handover(uuid, uuid[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_shift_report(uuid)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_report_comment(uuid, text)                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_key_overdue()                               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at()                              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_authorisation_limit()                      FROM PUBLIC;

-- ── 3+4. Consolidate and fix RLS policies ─────────────────────────────────
-- Using (SELECT auth.uid()) evaluates once per query, not once per row.

-- profiles: 3 SELECT policies → 1 ──────────────────────────────────────────

DROP POLICY IF EXISTS profiles_select_own      ON public.profiles;
DROP POLICY IF EXISTS profiles_select_cso_all  ON public.profiles;
DROP POLICY IF EXISTS profiles_select_hod_dept ON public.profiles;

CREATE POLICY profiles_select
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.user_role() = 'CSO'
    OR (public.user_role() = 'HOD' AND department_id = public.user_department_id())
  );

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING    (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- requests: 4 SELECT policies → 1 ─────────────────────────────────────────

DROP POLICY IF EXISTS requests_select_own          ON public.requests;
DROP POLICY IF EXISTS requests_select_hod_dept     ON public.requests;
DROP POLICY IF EXISTS requests_select_verifier_all ON public.requests;
DROP POLICY IF EXISTS requests_select_cso_all      ON public.requests;

CREATE POLICY requests_select
  ON public.requests
  FOR SELECT
  TO authenticated
  USING (
    (public.user_role() = 'REQUESTER' AND requester_id = (SELECT auth.uid()))
    OR (
      public.user_role() = 'HOD'
      AND EXISTS (
        SELECT 1 FROM public.keys k
        WHERE k.id = requests.key_id
          AND k.department_id = public.user_department_id()
      )
    )
    OR public.user_role() = 'VERIFIER'
    OR public.user_role() = 'CSO'
  );

DROP POLICY IF EXISTS requests_insert_requester ON public.requests;
CREATE POLICY requests_insert_requester
  ON public.requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_role() = 'REQUESTER'
    AND requester_id = (SELECT auth.uid())
  );

-- hod_decisions: 2 SELECT policies → 1 ────────────────────────────────────

DROP POLICY IF EXISTS hod_decisions_select_hod_dept ON public.hod_decisions;
DROP POLICY IF EXISTS hod_decisions_select_cso_all  ON public.hod_decisions;

CREATE POLICY hod_decisions_select
  ON public.hod_decisions
  FOR SELECT
  TO authenticated
  USING (
    public.user_role() = 'CSO'
    OR (
      public.user_role() = 'HOD'
      AND EXISTS (
        SELECT 1
        FROM public.requests r
        JOIN public.keys k ON k.id = r.key_id
        WHERE r.id = hod_decisions.request_id
          AND k.department_id = public.user_department_id()
      )
    )
  );

-- incidents: 2 SELECT policies → 1 ────────────────────────────────────────

DROP POLICY IF EXISTS incidents_select_cso                ON public.incidents;
DROP POLICY IF EXISTS incidents_select_verifier_own_shift ON public.incidents;

CREATE POLICY incidents_select
  ON public.incidents
  FOR SELECT
  TO authenticated
  USING (
    public.user_role() = 'CSO'
    OR (
      public.user_role() = 'VERIFIER'
      AND EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE s.id = incidents.shift_id
          AND (
            s.primary_officer_id    = (SELECT auth.uid())
            OR s.secondary_officer_id = (SELECT auth.uid())
          )
      )
    )
  );

-- shifts: 2 SELECT policies → 1 ───────────────────────────────────────────

DROP POLICY IF EXISTS shifts_select_verifier ON public.shifts;
DROP POLICY IF EXISTS shifts_select_cso      ON public.shifts;

CREATE POLICY shifts_select
  ON public.shifts
  FOR SELECT
  TO authenticated
  USING (public.user_role() IN ('VERIFIER', 'CSO'));

-- shift_handovers: 2 SELECT policies → 1 ──────────────────────────────────

DROP POLICY IF EXISTS shift_handovers_select_verifier ON public.shift_handovers;
DROP POLICY IF EXISTS shift_handovers_select_cso      ON public.shift_handovers;

CREATE POLICY shift_handovers_select
  ON public.shift_handovers
  FOR SELECT
  TO authenticated
  USING (public.user_role() IN ('VERIFIER', 'CSO'));

-- ── 5. Add missing FK covering indexes ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_authorisations_authorised_by
  ON public.authorisations(authorised_by);

CREATE INDEX IF NOT EXISTS idx_incidents_logged_by
  ON public.incidents(logged_by);

CREATE INDEX IF NOT EXISTS idx_requests_issued_by
  ON public.requests(issued_by)
  WHERE issued_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shift_handovers_incoming_officer_id
  ON public.shift_handovers(incoming_officer_id);

CREATE INDEX IF NOT EXISTS idx_shifts_secondary_officer_id
  ON public.shifts(secondary_officer_id)
  WHERE secondary_officer_id IS NOT NULL;
