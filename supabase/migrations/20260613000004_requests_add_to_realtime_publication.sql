-- Add requests table to the supabase_realtime publication.
-- The REPLICA IDENTITY FULL migration assumes the table is already published,
-- but no prior migration added it. Without this, Realtime fires nothing after
-- supabase db reset or in CI.
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
      and tablename = 'requests'
  ) then
    alter publication supabase_realtime add table public.requests;
  end if;
end
$$;
