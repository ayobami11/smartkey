-- SmartKey — auto-release unclaimed keys when a collection code lapses
--
-- A request in CODE_ISSUED holds a 10-minute collection code (weekday: minted at
-- submit; weekend: minted on the requested day). If the requester never presents
-- it, expiry was previously only fired by the open browser tab via
-- POST /api/requests/expire — so closing the tab left the request stranded in
-- CODE_ISSUED, and create_request's per-requester conflict check kept that
-- requester blocked from re-requesting the key. This server-side backstop expires
-- any genuinely-lapsed code (registered or guest, weekday or weekend) so the key
-- becomes available for another request promptly. The UI-fired expiry stays as
-- the immediate path for the active user; this is the safety net for everyone else.

create or replace function public.expire_lapsed_codes()
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
    select r.id, r.requester_id, r.guest_id
    from   public.requests r
    where  r.status          = 'CODE_ISSUED'
      and  r.code_expires_at is not null
      and  r.code_expires_at  < now()
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
        jsonb_build_object('reason', 'code_lapsed')
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
        jsonb_build_object('reason', 'code_lapsed', 'external', true)
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return query select v_count;
end;
$$;

revoke execute on function public.expire_lapsed_codes()
  from public, anon, authenticated;

-- Every 10 minutes: a backstop so an unclaimed key frees up even when the
-- requester's tab is closed (the UI fires expiry immediately for the active
-- user). Matches the 10-minute code lifetime.
select cron.schedule(
  'expire-lapsed-codes',
  '*/10 * * * *',
  $$ select public.expire_lapsed_codes(); $$
);
