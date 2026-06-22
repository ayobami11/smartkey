-- SmartKey — expire stale weekend requests
--
-- A weekend request has no automatic lifecycle terminus once its requested date
-- passes. The requester (or guest) must mint a short-lived collection code ON the
-- requested day via generate_weekend_code / generate_guest_weekend_code. If the
-- day passes without a code being minted, the request is stranded:
--
--   * generate_weekend_code raises TOO_EARLY forever (requested_for <> current_date),
--   * the cancel route only accepts CODE_ISSUED,
--   * create_request treats any non-terminal status as an active request,
--
-- so the request — and its key — stay blocked with no user-facing escape. This
-- function closes the gap by expiring weekend requests whose requested date has
-- passed while still in a pre-collection state. It is idempotent and writes a
-- REQUEST_EXPIRED audit entry per row (guest-aware), and is scheduled daily.

create or replace function public.expire_stale_weekend_requests()
returns table(expired_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   record;
  v_role  public.user_role;
  v_name  text;
  v_count int := 0;
begin
  for v_req in
    select r.id, r.requester_id, r.guest_id, r.status
    from   public.requests r
    where  r.type          = 'WEEKEND'
      and  r.requested_for  < current_date
      and  r.status in ('PENDING_HOD', 'APPROVED', 'CODE_ISSUED')
    for update
  loop
    update public.requests
    set    status          = 'EXPIRED',
           code            = null,
           code_expires_at = null
    where  id = v_req.id;

    if v_req.requester_id is not null then
      select pr.role into v_role
      from   public.profiles pr
      where  pr.id = v_req.requester_id;

      perform public._write_audit(
        'REQUEST_EXPIRED',
        v_req.requester_id,
        v_role,
        'request',
        v_req.id,
        jsonb_build_object(
          'reason',          'weekend_date_passed',
          'previous_status', v_req.status
        )
      );
    else
      select g.full_name into v_name
      from   public.guest_requesters g
      where  g.id = v_req.guest_id;

      perform public._write_audit_guest(
        'REQUEST_EXPIRED',
        'request',
        v_req.id,
        coalesce(v_name, 'Guest'),
        jsonb_build_object(
          'reason',          'weekend_date_passed',
          'previous_status', v_req.status,
          'external',        true
        )
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return query select v_count;
end;
$$;

-- Cron-only / service-role only. Never reachable from the browser.
revoke execute on function public.expire_stale_weekend_requests()
  from public, anon, authenticated;

-- Daily at 00:15 UTC. pg_cron runs the function directly (no edge function or
-- pg_net round-trip needed for a pure-SQL job).
select cron.schedule(
  'expire-stale-weekend-requests',
  '15 0 * * *',
  $$ select public.expire_stale_weekend_requests(); $$
);
