-- Publish audit_log to Realtime so the CSO signature-mismatch alert actually fires.
--

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
