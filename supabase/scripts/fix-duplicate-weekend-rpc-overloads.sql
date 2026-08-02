-- URGENT: drop the stale approve_weekend / decline_weekend overloads.
--
-- Run this in the Supabase SQL editor. Do NOT use `supabase db push` — see the
-- warning at the bottom of this file.
--
--
-- THE PROBLEM
--
-- Both an old and a new signature of each function currently exist live:
--
--   approve_weekend(uuid, uuid, text, boolean, numeric)                  <- stale
--   approve_weekend(uuid, uuid, text, boolean, numeric, boolean)         <- current
--   decline_weekend(uuid, uuid, text)                                    <- stale
--   decline_weekend(uuid, uuid, text, boolean)                           <- current
--
-- The stale ones came from 20260627111159 (units rename). The `drop function
-- if exists` statements that should have removed them live in
-- 20260701120000_cso_signature_override.sql, which never ran on this database.
-- 20260705120000 then created the current signatures alongside the stale ones.
--
-- src/app/api/requests/hod-decision/route.ts calls approve_weekend with exactly
-- five named params (no p_cso_override) at lines 348 and 382 — the Dean's
-- normal approval paths. With two candidates matching, one of two things
-- happens, both wrong:
--
--   a) PostgREST cannot disambiguate -> PGRST203, the approval fails outright.
--   b) PostgREST picks the exact 5-param match -> the approval succeeds but
--      silently runs the STALE function, which lacks the past-date guard added
--      by 20260705120000. This is the quieter, nastier outcome: Deans can
--      approve weekend requests for dates that have already passed.
--
-- Dropping the stale overloads resolves both. Afterwards the five-param call
-- matches the current function uniquely, with p_cso_override defaulting to
-- false — which is the intended behaviour for a Dean approval.


-- 1. Confirm what exists BEFORE ----------------------------------------------
-- Expect 4 rows (2 per function). After the fix, expect 2.

select p.proname as function_name,
       pg_get_function_arguments(p.oid) as arguments
from   pg_proc p
join   pg_namespace n on n.oid = p.pronamespace
where  n.nspname = 'public'
and    p.proname in ('approve_weekend', 'decline_weekend')
order  by p.proname, pg_get_function_arguments(p.oid);


-- 2. Drop the stale overloads ------------------------------------------------
-- Signatures are fully qualified so only the stale ones are targeted. The
-- current 6-arg / 4-arg versions are untouched.

drop function if exists public.approve_weekend(uuid, uuid, text, boolean, numeric);
drop function if exists public.decline_weekend(uuid, uuid, text);


-- 3. Verify ------------------------------------------------------------------
-- Expect exactly 2 rows, both containing p_cso_override.

select p.proname as function_name,
       pg_get_function_arguments(p.oid) as arguments,
       (pg_get_function_arguments(p.oid) like '%cso_override%') as is_current_version
from   pg_proc p
join   pg_namespace n on n.oid = p.pronamespace
where  n.nspname = 'public'
and    p.proname in ('approve_weekend', 'decline_weekend')
order  by p.proname;


-- 4. Sanity-check the guard is present in the surviving function -------------
-- Should return true. If false, the surviving approve_weekend is not the
-- 20260705120000 version and this needs a closer look before Deans use it.

select position('requested_for' in pg_get_functiondef(p.oid)) > 0 as has_past_date_guard
from   pg_proc p
join   pg_namespace n on n.oid = p.pronamespace
where  n.nspname = 'public'
and    p.proname = 'approve_weekend';
