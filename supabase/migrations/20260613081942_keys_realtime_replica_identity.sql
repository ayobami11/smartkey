-- Make the keys table a first-class realtime source.
-- keys.status is the single source of truth for the CSO "building pulse" zone
-- counts (ISSUED on issue, AVAILABLE on return) and for the overdue treatment
-- (OVERDUE, set by the hourly mark_key_overdue job with no accompanying request
-- change). FULL replica identity lets subscribers see the full row on UPDATE and
-- DELETE (key retired), matching the posture used for requests.
alter table public.keys replica identity full;

-- Ensure keys is in the realtime publication (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'keys'
  ) then
    alter publication supabase_realtime add table public.keys;
  end if;
end
$$;
