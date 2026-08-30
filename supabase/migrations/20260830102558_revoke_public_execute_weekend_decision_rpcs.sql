-- The prior migration's `REVOKE EXECUTE ... FROM anon` didn't actually close the
-- anon-executable gap on approve_weekend/decline_weekend: CREATE OR REPLACE FUNCTION
-- in 20260701120000_cso_signature_override.sql implicitly granted EXECUTE to the
-- PUBLIC pseudo-role (Postgres's default for new function objects), and anon
-- inherits access through PUBLIC regardless of a role-specific REVOKE. Only an
-- explicit `REVOKE ... FROM PUBLIC` removes that. authenticated keeps access via
-- its own explicit GRANT from the same migration.
REVOKE EXECUTE ON FUNCTION public.approve_weekend(uuid, uuid, text, boolean, numeric, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_weekend(uuid, uuid, text, boolean) FROM PUBLIC;
