-- Add authorisations table to the supabase_realtime publication.
--
-- The Dean dashboard's collectors table (src/app/dean/dashboard/_components/
-- collectors-table.tsx) subscribes to `authorisations` via useRealtime and
-- invalidates its query on INSERT / UPDATE / DELETE, so a collector added or
-- removed elsewhere should appear without a refresh. But the table was never
-- added to the publication, so Postgres emitted nothing for it: the channel
-- joined and reported SUBSCRIBED, and no event ever arrived. A silent no-op —
-- the widget simply went stale until the page was reloaded.
--
-- REPLICA IDENTITY is deliberately left at the default rather than set to FULL.
-- The subscriber ignores the payload entirely (every handler just calls
-- queryClient.invalidateQueries), so the PK-only old_record that the default
-- sends on DELETE is sufficient, and FULL would add WAL overhead for data
-- nothing reads. Contrast `requests` and `keys`, whose subscribers do read row
-- fields and therefore do need FULL.
--
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member, so
-- guard it: only add when it is not already published.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'authorisations'
  ) then
    alter publication supabase_realtime add table public.authorisations;
  end if;
end
$$;
