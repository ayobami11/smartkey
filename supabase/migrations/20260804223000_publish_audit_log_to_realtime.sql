-- Publish audit_log to Realtime so the CSO signature-mismatch alert actually fires.
--
-- Until now `audit_log` was absent from the `supabase_realtime` publication, so both
-- CSO dashboard surfaces that subscribe to it were silently dead: the approval was
-- correctly held and the SIGNATURE_MISMATCH audit entry correctly written, but the
-- dashboard never learned and the CSO was never alerted. A held approval nobody is
-- told about is indistinguishable from a lost one.
--
-- NOTE: 20260701120000_cso_signature_override.sql already contains an
-- `alter publication supabase_realtime add table public.audit_log`, wrapped in a
-- guard that evidently no-opped — the table was verifiably not published afterwards.
-- This migration is written to be safe whether or not that one took effect.
--
-- ORDERING: the frontend must ship first. `events-chart.tsx` invalidates on every
-- audit insert; before it was debounced (same change set as this migration),
-- publishing this table would have made the CSO dashboard refetch its whole
-- aggregate once per audit row. Do not apply this ahead of the deploy.
--
-- Replica identity is deliberately left at the default. Both subscribers listen for
-- INSERT only, and INSERT payloads carry the full new row regardless; `replica
-- identity full` is only needed to get old-row data on UPDATE/DELETE, and audit_log
-- permits neither.

do $$
begin
  if not exists (
    select 1
    from   pg_publication_tables
    where  pubname    = 'supabase_realtime'
      and  schemaname = 'public'
      and  tablename  = 'audit_log'
  ) then
    alter publication supabase_realtime add table public.audit_log;
  end if;
end
$$;
