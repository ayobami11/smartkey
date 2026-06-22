-- SmartKey — run scheduled jobs directly in SQL instead of via edge functions
--
-- The overdue-key-check and daily-shift-summary jobs (20260612000002) were
-- scheduled to http_post to their edge functions using
-- current_setting('app.supabase_url') / ('app.edge_function_key'). But
-- ALTER DATABASE ... SET is not permitted for custom parameters on managed
-- Supabase, so those settings were never set, the URL resolved to NULL, and the
-- jobs silently never fired since launch.
--
-- Both jobs are pure database work, so pg_cron runs the SQL directly — no HTTP,
-- no secret, no dependency on the edge functions being deployed or reachable.
-- The edge functions remain deployed and can still be invoked manually; they are
-- simply no longer the cron entry point.

-- SQL equivalent of the daily-shift-summary edge function: insert a pending
-- placeholder report for the latest shift that has none. The actual Gemini
-- generation still happens when the CSO opens the report (POST /api/reports/generate).
create or replace function public.schedule_pending_shift_report()
returns table(report_id uuid, shift_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_id  uuid;
  v_report_id uuid;
  v_cso_id    uuid;
begin
  select s.id into v_shift_id
  from   public.shifts s
  where  not exists (
           select 1 from public.shift_reports r where r.shift_id = s.id
         )
  order by s.started_at desc
  limit 1;

  if v_shift_id is null then
    return; -- no unreported shift
  end if;

  begin
    insert into public.shift_reports (shift_id, markdown, timeline, metadata)
    values (
      v_shift_id,
      'PENDING_GENERATION',
      '[]'::jsonb,
      jsonb_build_object('scheduled_by', 'pg_cron', 'scheduled_at', now())
    )
    returning id into v_report_id;
  exception when unique_violation then
    return; -- a report already exists for this shift
  end;

  select p.id into v_cso_id
  from   public.profiles p
  where  p.role = 'CSO' and p.status = 'ACTIVE'
  order by p.created_at
  limit 1;

  if v_cso_id is not null then
    perform public._write_audit(
      'SHIFT_REPORT_SCHEDULED',
      v_cso_id,
      'CSO',
      'shift',
      v_shift_id,
      jsonb_build_object('report_id', v_report_id, 'scheduled_by', 'pg_cron')
    );
  end if;

  return query select v_report_id, v_shift_id;
end;
$$;

revoke execute on function public.schedule_pending_shift_report()
  from public, anon, authenticated;

-- Repoint both jobs to call the SQL directly (same names replace the old defs).
select cron.schedule(
  'overdue-key-check',
  '0 * * * *',
  $$ select public.mark_key_overdue(); $$
);

select cron.schedule(
  'daily-shift-summary',
  '0 18 * * *',
  $$ select public.schedule_pending_shift_report(); $$
);
