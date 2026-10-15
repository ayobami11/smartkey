-- ---------------------------------------------------------------------------
-- 17 — Grant and actor hardening (20261015090000_grant_hardening.sql)
--
--   * create_request, approve_weekend, decline_weekend, approve_guest_weekend
--     are service-only; a user session is refused at the grant.
--   * Cron-only functions are not executable by anon or authenticated.
--   * dismiss_expired_request, issue_key, return_key, request_return,
--     generate_weekend_code, expire_request (and create_request) refuse an
--     actor parameter that is not the session user; issue_key / return_key
--     also require a VERIFIER.
--   * request_return / generate_weekend_code / expire_request no longer let a
--     requester act on a guest request (requester_id IS NULL).
--   * The write policies that skipped an audited RPC are gone.
--
-- The caller is set through request.jwt.claims. Session-refused checks switch
-- to the authenticated role inside DO blocks and stash the outcome in a GUC,
-- then assert after `reset role` (see 03 for why).
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(46);

insert into auth.users (id, email) values
  ('17171717-1717-4171-8171-000000000001', 'pgtap.g17.cso@example.test'),
  ('17171717-1717-4171-8171-000000000002', 'pgtap.g17.dean@example.test'),
  ('17171717-1717-4171-8171-000000000003', 'pgtap.g17.verifier@example.test'),
  ('17171717-1717-4171-8171-000000000004', 'pgtap.g17.r1@example.test'),
  ('17171717-1717-4171-8171-000000000005', 'pgtap.g17.r2@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('17171717-1717-4171-8171-000000000010', 'pgTAP G17 Faculty', 'pgTAP G17 Faculty', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('17171717-1717-4171-8171-000000000001', 'CSO',       'pgTAP G17 CSO',      'pgtap.g17.cso@example.test',      null,                                    'ACTIVE'),
  ('17171717-1717-4171-8171-000000000002', 'DEAN',      'pgTAP G17 Dean',     'pgtap.g17.dean@example.test',     '17171717-1717-4171-8171-000000000010', 'ACTIVE'),
  ('17171717-1717-4171-8171-000000000003', 'VERIFIER',  'pgTAP G17 Verifier', 'pgtap.g17.verifier@example.test', null,                                    'ACTIVE'),
  ('17171717-1717-4171-8171-000000000004', 'REQUESTER', 'pgTAP G17 Req One',  'pgtap.g17.r1@example.test',       '17171717-1717-4171-8171-000000000010', 'ACTIVE'),
  ('17171717-1717-4171-8171-000000000005', 'REQUESTER', 'pgTAP G17 Req Two',  'pgtap.g17.r2@example.test',       '17171717-1717-4171-8171-000000000010', 'ACTIVE');

update public.units set hod_id = '17171717-1717-4171-8171-000000000002'
where id = '17171717-1717-4171-8171-000000000010';

insert into public.keys (id, code, zone, room_name, unit_id, status) values
  ('17171717-1717-4171-8171-000000000020', 'PGG-1701', 'NEW_SENATE', 'pgTAP G17 Room A', '17171717-1717-4171-8171-000000000010', 'AVAILABLE'),
  ('17171717-1717-4171-8171-000000000021', 'PGG-1702', 'NEW_SENATE', 'pgTAP G17 Room B', '17171717-1717-4171-8171-000000000010', 'ISSUED'),
  ('17171717-1717-4171-8171-000000000022', 'PGG-1703', 'NEW_SENATE', 'pgTAP G17 Room C', '17171717-1717-4171-8171-000000000010', 'AVAILABLE');

insert into public.authorisations (key_id, profile_id, authorised_by) values
  ('17171717-1717-4171-8171-000000000020', '17171717-1717-4171-8171-000000000004', '17171717-1717-4171-8171-000000000002');

insert into public.guest_requesters (id, full_name, email, id_document_type, id_document_number) values
  ('17171717-1717-4171-8171-000000000030', 'pgTAP G17 Guest', 'pgtap.g17.guest@example.test', 'National ID', 'PGG-ID-1701');

-- Guest requests: one holding key ...21, one approved for today and one with a
-- lapsed code on key ...22. None has a requester_id.
insert into public.requests
  (id, guest_id, requested_unit_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline, access_token)
values
  ('17171717-1717-4171-8171-000000000040', '17171717-1717-4171-8171-000000000030', '17171717-1717-4171-8171-000000000010', '17171717-1717-4171-8171-000000000021', 'WEEKEND', current_date, 'KEY_ISSUED',  null,     null,                           now() + interval '1 day', '17171717-aaaa-4aaa-8aaa-000000000001'),
  ('17171717-1717-4171-8171-000000000041', '17171717-1717-4171-8171-000000000030', '17171717-1717-4171-8171-000000000010', '17171717-1717-4171-8171-000000000022', 'WEEKEND', current_date, 'APPROVED',    null,     null,                           now() + interval '1 day', '17171717-aaaa-4aaa-8aaa-000000000002'),
  ('17171717-1717-4171-8171-000000000042', '17171717-1717-4171-8171-000000000030', '17171717-1717-4171-8171-000000000010', '17171717-1717-4171-8171-000000000022', 'WEEKEND', current_date + 2, 'CODE_ISSUED', '171717', now() - interval '1 minute', now() + interval '2 days', '17171717-aaaa-4aaa-8aaa-000000000003');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated',
    'public.create_request(uuid, uuid, text, timestamptz, date, public.risk_tier, jsonb, text, text)', 'EXECUTE'),
  'a user session cannot execute create_request'
);

select ok(
  not has_function_privilege('anon',
    'public.create_request(uuid, uuid, text, timestamptz, date, public.risk_tier, jsonb, text, text)', 'EXECUTE'),
  'anon cannot execute create_request'
);

select ok(
  has_function_privilege('service_role',
    'public.create_request(uuid, uuid, text, timestamptz, date, public.risk_tier, jsonb, text, text)', 'EXECUTE'),
  'service_role can execute create_request'
);

select is(
  (select count(*)::int from pg_proc
   where proname = 'create_request' and pronamespace = 'public'::regnamespace),
  1,
  'the old create_request signature is dropped, not left as an overload'
);

select ok(
  not has_function_privilege('authenticated',
    'public.approve_weekend(uuid, uuid, text, boolean, numeric, boolean)', 'EXECUTE'),
  'a user session cannot execute approve_weekend'
);

select ok(
  not has_function_privilege('authenticated',
    'public.decline_weekend(uuid, uuid, text, boolean)', 'EXECUTE'),
  'a user session cannot execute decline_weekend'
);

select ok(
  not has_function_privilege('authenticated',
    'public.approve_guest_weekend(uuid, uuid, uuid, text)', 'EXECUTE'),
  'a user session cannot execute approve_guest_weekend'
);

select ok(
  has_function_privilege('service_role',
    'public.approve_weekend(uuid, uuid, text, boolean, numeric, boolean)', 'EXECUTE')
  and has_function_privilege('service_role',
    'public.decline_weekend(uuid, uuid, text, boolean)', 'EXECUTE')
  and has_function_privilege('service_role',
    'public.approve_guest_weekend(uuid, uuid, uuid, text)', 'EXECUTE'),
  'service_role can execute the three weekend decision RPCs'
);

select ok(
  not has_function_privilege('authenticated', 'public.mark_key_overdue()', 'EXECUTE'),
  'a user session cannot execute mark_key_overdue'
);

select ok(
  not has_function_privilege('anon', 'public.mark_key_overdue()', 'EXECUTE'),
  'anon cannot execute mark_key_overdue'
);

select ok(
  has_function_privilege('service_role', 'public.mark_key_overdue()', 'EXECUTE'),
  'service_role can execute mark_key_overdue'
);

select ok(
  not has_function_privilege('authenticated', 'public.expire_lapsed_codes()', 'EXECUTE'),
  'a user session cannot execute expire_lapsed_codes'
);

select ok(
  not has_function_privilege('authenticated', 'public.expire_stale_weekend_requests()', 'EXECUTE'),
  'a user session cannot execute expire_stale_weekend_requests'
);

select ok(
  not has_function_privilege('authenticated', 'public.schedule_pending_shift_report()', 'EXECUTE'),
  'a user session cannot execute schedule_pending_shift_report'
);

select ok(
  not has_function_privilege('authenticated', 'public.get_digest_stats(uuid, timestamptz)', 'EXECUTE'),
  'a user session cannot execute get_digest_stats'
);

select ok(
  not has_function_privilege('authenticated', 'public._assert_session_actor(uuid)', 'EXECUTE'),
  'a user session cannot execute _assert_session_actor'
);

select ok(
  has_function_privilege('authenticated', 'public.dismiss_expired_request(uuid, uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.issue_key(uuid, uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.return_key(uuid, uuid, text, uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.request_return(uuid, uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.generate_weekend_code(uuid, uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.expire_request(uuid, uuid)', 'EXECUTE'),
  'the session-called RPCs stay executable by authenticated'
);

select ok(
  not has_function_privilege('anon', 'public.issue_key(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.dismiss_expired_request(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.expire_request(uuid, uuid)', 'EXECUTE'),
  'anon cannot execute the session-called RPCs'
);

-- ---------------------------------------------------------------------------
-- A user session is refused at the grant for a service-only RPC
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '17171717-1717-4171-8171-000000000004', 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

do $$
begin
  begin
    perform * from public.create_request(
      '17171717-1717-4171-8171-000000000004',
      '17171717-1717-4171-8171-000000000020', 'WEEKDAY', now() + interval '1 day',
      p_risk_tier := 'LOW');
    perform set_config('pgtap.g17_create', 'OK', true);
  exception when others then
    perform set_config('pgtap.g17_create', 'ERR:' || SQLSTATE, true);
  end;

  begin
    perform public.mark_key_overdue();
    perform set_config('pgtap.g17_overdue', 'OK', true);
  exception when others then
    perform set_config('pgtap.g17_overdue', 'ERR:' || SQLSTATE, true);
  end;

  -- Direct insert that used to pass requests_insert_requester.
  begin
    insert into public.requests
      (requester_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline, risk_tier)
    values
      ('17171717-1717-4171-8171-000000000004', '17171717-1717-4171-8171-000000000020', 'WEEKDAY',
       current_date, 'CODE_ISSUED', '000000', now() + interval '10 minutes', now() + interval '1 day', 'LOW');
    perform set_config('pgtap.g17_req_insert', 'OK', true);
  exception when others then
    perform set_config('pgtap.g17_req_insert', 'ERR:' || SQLSTATE, true);
  end;
end;
$$;

reset role;

select is(
  current_setting('pgtap.g17_create'),
  'ERR:42501',
  'a requester session calling create_request directly is refused'
);

select is(
  current_setting('pgtap.g17_overdue'),
  'ERR:42501',
  'a requester session calling mark_key_overdue is refused'
);

select is(
  current_setting('pgtap.g17_req_insert'),
  'ERR:42501',
  'a requester session cannot insert a request directly — create_request only'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '17171717-1717-4171-8171-000000000002', 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

do $$
begin
  begin
    perform * from public.approve_weekend(
      '17171717-1717-4171-8171-0000000000ff', '17171717-1717-4171-8171-000000000002');
    perform set_config('pgtap.g17_approve', 'OK', true);
  exception when others then
    perform set_config('pgtap.g17_approve', 'ERR:' || SQLSTATE, true);
  end;

  -- Direct insert that used to pass authorisations_insert_hod_dept.
  begin
    insert into public.authorisations (key_id, profile_id, authorised_by)
    values ('17171717-1717-4171-8171-000000000020', '17171717-1717-4171-8171-000000000005',
            '17171717-1717-4171-8171-000000000002');
    perform set_config('pgtap.g17_auth_insert', 'OK', true);
  exception when others then
    perform set_config('pgtap.g17_auth_insert', 'ERR:' || SQLSTATE, true);
  end;
end;
$$;

reset role;

select is(
  current_setting('pgtap.g17_approve'),
  'ERR:42501',
  'a Dean session calling approve_weekend directly is refused'
);

select is(
  current_setting('pgtap.g17_auth_insert'),
  'ERR:42501',
  'a Dean session cannot insert an authorisation directly — nominate_collector only'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '17171717-1717-4171-8171-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

-- With keys_update_cso gone there is no UPDATE policy, so RLS matches no rows.
-- (Or, if the table privilege is also gone, the UPDATE errors outright.)
do $$
declare
  v_rows int;
begin
  update public.keys set status = 'RETIRED'
  where id = '17171717-1717-4171-8171-000000000020';
  get diagnostics v_rows = row_count;
  perform set_config('pgtap.g17_key_update', v_rows::text, true);
exception when others then
  perform set_config('pgtap.g17_key_update', 'ERR:' || SQLSTATE, true);
end;
$$;

reset role;

select ok(
  current_setting('pgtap.g17_key_update') in ('0', 'ERR:42501'),
  'a CSO session cannot update a key directly'
);

select is(
  (select status::text from public.keys where id = '17171717-1717-4171-8171-000000000020'),
  'AVAILABLE',
  'the key is unchanged after the refused update'
);

-- ---------------------------------------------------------------------------
-- Actor mismatch: the named actor is not the session user
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '17171717-1717-4171-8171-000000000004', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.create_request(
       '17171717-1717-4171-8171-000000000005',
       '17171717-1717-4171-8171-000000000020', 'WEEKDAY', now() + interval '1 day') $$,
  'P0002', 'FORBIDDEN: actor does not match the session',
  'create_request refuses a requester that is not the session user'
);

select throws_ok(
  $$ select * from public.dismiss_expired_request(
       '17171717-1717-4171-8171-000000000041', '17171717-1717-4171-8171-000000000002') $$,
  'P0002', 'FORBIDDEN: actor does not match the session',
  'dismiss_expired_request refuses an actor that is not the session user'
);

select throws_ok(
  $$ select * from public.issue_key(
       '17171717-1717-4171-8171-000000000042', '17171717-1717-4171-8171-000000000003') $$,
  'P0002', 'FORBIDDEN: actor does not match the session',
  'issue_key refuses a verifier that is not the session user'
);

select throws_ok(
  $$ select * from public.return_key(
       '17171717-1717-4171-8171-000000000040', '17171717-1717-4171-8171-000000000003',
       null, null, 'pgTAP override') $$,
  'P0002', 'FORBIDDEN: actor does not match the session',
  'return_key refuses a verifier that is not the session user'
);

select throws_ok(
  $$ select * from public.request_return(
       '17171717-1717-4171-8171-000000000040', '17171717-1717-4171-8171-000000000005') $$,
  'P0002', 'FORBIDDEN: actor does not match the session',
  'request_return refuses a requester that is not the session user'
);

select throws_ok(
  $$ select * from public.generate_weekend_code(
       '17171717-1717-4171-8171-000000000041', '17171717-1717-4171-8171-000000000005') $$,
  'P0002', 'FORBIDDEN: actor does not match the session',
  'generate_weekend_code refuses a requester that is not the session user'
);

select throws_ok(
  $$ select * from public.expire_request(
       '17171717-1717-4171-8171-000000000042', '17171717-1717-4171-8171-000000000005') $$,
  'P0002', 'FORBIDDEN: actor does not match the session',
  'expire_request refuses a requester that is not the session user'
);

-- ---------------------------------------------------------------------------
-- issue_key / return_key need a VERIFIER, even naming themselves
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.issue_key(
       '17171717-1717-4171-8171-000000000042', '17171717-1717-4171-8171-000000000004') $$,
  'P0002', 'FORBIDDEN: only a VERIFIER can issue keys',
  'a requester cannot issue a key, even as themselves'
);

select throws_ok(
  $$ select * from public.return_key(
       '17171717-1717-4171-8171-000000000040', '17171717-1717-4171-8171-000000000004',
       null, null, 'pgTAP override') $$,
  'P0002', 'FORBIDDEN: only a VERIFIER can return keys',
  'a requester cannot return a key, even as themselves'
);

-- ---------------------------------------------------------------------------
-- A requester cannot act on a guest request (requester_id IS NULL)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.generate_weekend_code(
       '17171717-1717-4171-8171-000000000041', '17171717-1717-4171-8171-000000000004') $$,
  'P0010', 'FORBIDDEN: not your request',
  'a requester cannot mint the collection code of a guest request'
);

select throws_ok(
  $$ select * from public.request_return(
       '17171717-1717-4171-8171-000000000040', '17171717-1717-4171-8171-000000000004') $$,
  'P0010', 'FORBIDDEN: request does not belong to the caller',
  'a requester cannot mint the return code of a guest request'
);

select throws_ok(
  $$ select * from public.expire_request(
       '17171717-1717-4171-8171-000000000042', '17171717-1717-4171-8171-000000000004') $$,
  'P0010', 'FORBIDDEN: not your request',
  'a requester cannot expire a guest request'
);

select is(
  (select status::text from public.requests where id = '17171717-1717-4171-8171-000000000041'),
  'APPROVED',
  'the guest request is untouched'
);

-- ---------------------------------------------------------------------------
-- anon claims are refused; service_role and a matching session pass
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.issue_key(
       '17171717-1717-4171-8171-000000000042', '17171717-1717-4171-8171-000000000003') $$,
  'P0001', 'NOT_AUTHENTICATED',
  'an anon caller naming a verifier is refused'
);

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
end;
$$;

create temp table t_g17 as
select * from public.create_request(
  p_requester_id    := '17171717-1717-4171-8171-000000000004',
  p_key_id          := '17171717-1717-4171-8171-000000000020',
  p_type            := 'WEEKDAY',
  p_return_deadline := now() + interval '1 day',
  p_risk_tier       := 'HIGH');

select is(
  (select status from t_g17),
  'CODE_ISSUED',
  'service_role creates a request for the requester it names'
);

select is(
  (select requester_id::text || ' ' || risk_tier::text from public.requests
   where id = (select request_id from t_g17)),
  '17171717-1717-4171-8171-000000000004 HIGH',
  'the request belongs to the named requester and keeps the route''s risk tier'
);

select is(
  (select actor_id::text from public.audit_log
   where event = 'REQUEST_CREATED' and target_id = (select request_id from t_g17)),
  '17171717-1717-4171-8171-000000000004',
  'REQUEST_CREATED is attributed to the named requester'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '17171717-1717-4171-8171-000000000003', 'role', 'authenticated')::text, true);
end;
$$;

select lives_ok(
  format($$ select * from public.issue_key(%L, '17171717-1717-4171-8171-000000000003') $$,
         (select request_id from t_g17)),
  'a verifier naming themselves can issue the key'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '17171717-1717-4171-8171-000000000004', 'role', 'authenticated')::text, true);
end;
$$;

-- expire_request's idempotent branch now falls through to its single final
-- return query rather than returning mid-function.
select is(
  (select status from public.expire_request(
     (select request_id from t_g17), '17171717-1717-4171-8171-000000000004')),
  'KEY_ISSUED',
  'expire_request on a request that moved on reports its current status'
);

-- ---------------------------------------------------------------------------
-- Dropped policies
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and policyname in (
       'keys_update_cso',
       'departments_insert_cso', 'departments_update_cso', 'departments_delete_cso',
       'authorisations_insert_hod_dept', 'authorisations_delete_hod_dept',
       'requests_insert_requester')),
  0,
  'the write policies that skipped an audited RPC are gone'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and tablename in ('keys', 'units', 'authorisations', 'requests')
     and cmd <> 'SELECT'),
  0,
  'keys, units, authorisations and requests have no write policy left'
);

select * from finish();

rollback;
