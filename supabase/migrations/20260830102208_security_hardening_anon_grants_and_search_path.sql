-- Fix live security-advisor findings around anon execute grants and search_path.
--
-- 1. approve_weekend/decline_weekend were recreated with a new signature
--    (p_cso_override added) in 20260701120000_cso_signature_override.sql via
--    CREATE OR REPLACE FUNCTION, which allocates a new function object and so
--    reacquires Postgres's default PUBLIC execute grant -- silently undoing the
--    blanket `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon` applied
--    in 20260610111721. Re-running the blanket revoke closes this for these two
--    and for any other function recreated the same way since.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 2. user_department_id() was reintroduced in 20260627111159_rename_departments_to_units.sql
--    as a temporary backwards-compat alias for the renamed user_unit_id(), explicitly
--    scoped to "the window between this migration and the frontend deploy". That window
--    closed long ago -- grep confirms no application code references it (only the
--    generated src/types/database.ts type, which regenerates on the next `bun run
--    db:types`) -- so drop it outright rather than just tightening its grants.
DROP FUNCTION IF EXISTS public.user_department_id();

-- 3. user_unit_id() is SECURITY DEFINER with no search_path pinned, making it a
--    theoretical search_path-hijack target. Pin it, matching approve_weekend/
--    decline_weekend which already have search_path=public set.
ALTER FUNCTION public.user_unit_id() SET search_path = public;
