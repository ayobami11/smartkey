-- Diagnostic only — makes NO changes. Read-only.
--
-- The publication check after adding `authorisations` returned:
--   authorisations, incidents, keys, requests, shifts
--
-- Two things there disagree with supabase/migrations/:
--
--   1. `audit_log` is MISSING, but 20260701120000_cso_signature_override.sql
--      contains a guarded block that adds it. That block was present in the
--      file from its very first commit (11fdc76) and never edited afterwards,
--      so "the file changed after it was applied" is ruled out.
--
--   2. `incidents` and `shifts` are PRESENT, but no migration adds either and
--      nothing in src/ subscribes to them — so they were published out of band.
--
-- Query 1 is the decisive one. It tells us whether that migration ran at all.


-- 1. Did 20260701120000_cso_signature_override.sql actually run? --------------
-- That migration replaced approve_weekend/decline_weekend with versions taking
-- a `p_cso_override` argument. If the parameter is present the migration ran;
-- if absent, it never reached this database.
--
--   p_cso_override present  -> migration RAN; audit_log was published and then
--                              later removed out of band (or never took).
--   p_cso_override absent   -> migration NEVER RAN. The CSO signature-override
--                              feature is not live either, which is a much
--                              bigger problem than the realtime gap.

select p.proname                                as function_name,
       pg_get_function_arguments(p.oid)         as arguments,
       (pg_get_function_arguments(p.oid) like '%cso_override%') as has_cso_override
from   pg_proc p
join   pg_namespace n on n.oid = p.pronamespace
where  n.nspname = 'public'
and    p.proname in ('approve_weekend', 'decline_weekend')
order  by p.proname;


-- 2. What does Supabase think it has applied? --------------------------------
-- Look for 20260701120000 in this list. Also worth noting whether the two
-- realtime migrations from 20260613 are present.

select version
from   supabase_migrations.schema_migrations
where  version >= '20260613000000'
order  by version;


-- 3. Current publication membership, with replica identity -------------------
-- 'f' = FULL, 'd' = default. requests/keys should be 'f' (their subscribers
-- read row fields); append-only INSERT-driven tables are fine on 'd'.

select t.tablename,
       c.relreplident as replica_identity
from   pg_publication_tables t
join   pg_class c on c.relname = t.tablename
join   pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
where  t.pubname = 'supabase_realtime'
and    t.schemaname = 'public'
order  by t.tablename;
