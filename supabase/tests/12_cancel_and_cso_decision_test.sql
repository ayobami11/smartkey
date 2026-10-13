-- ---------------------------------------------------------------------------
-- 12 — cancel_request and cso_decide_request
--
-- Both used to be a service-role UPDATE followed by a separate audit write
-- whose failure was swallowed. cso-decision also declined KEY_ISSUED requests
-- "successfully": its UPDATE matched no row (it filtered on CODE_ISSUED), yet
-- it still wrote REQUEST_DECLINED_CSO and answered CANCELLED. The decline
-- assertions on ...0051 below pin that fix.
--
-- Both RPCs read the actor from auth.uid(), so the caller is set through
-- request.jwt.claims rather than a parameter (same as 05).
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(26);

insert into auth.users (id, email) values
  ('12121212-1212-4121-8121-000000000001', 'pgtap.cancel.r1@example.test'),
  ('12121212-1212-4121-8121-000000000002', 'pgtap.cancel.r2@example.test'),
  ('12121212-1212-4121-8121-000000000003', 'pgtap.cancel.cso@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('12121212-1212-4121-8121-000000000010', 'pgTAP Faculty of Cancellation', 'pgTAP Faculty of Cancellation', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('12121212-1212-4121-8121-000000000001', 'REQUESTER', 'pgTAP Cancel One', 'pgtap.cancel.r1@example.test',  '12121212-1212-4121-8121-000000000010', 'ACTIVE'),
  ('12121212-1212-4121-8121-000000000002', 'REQUESTER', 'pgTAP Cancel Two', 'pgtap.cancel.r2@example.test',  '12121212-1212-4121-8121-000000000010', 'ACTIVE'),
  ('12121212-1212-4121-8121-000000000003', 'CSO',       'pgTAP Cancel CSO', 'pgtap.cancel.cso@example.test', null,                                    'ACTIVE');

insert into public.keys (id, code, zone, room_name, unit_id, status) values
  ('12121212-1212-4121-8121-000000000020', 'PGC-1201', 'NEW_SENATE', 'pgTAP Cancel Room A', '12121212-1212-4121-8121-000000000010', 'AVAILABLE'),
  ('12121212-1212-4121-8121-000000000021', 'PGC-1202', 'NEW_SENATE', 'pgTAP Cancel Room B', '12121212-1212-4121-8121-000000000010', 'AVAILABLE'),
  ('12121212-1212-4121-8121-000000000022', 'PGC-1203', 'NEW_SENATE', 'pgTAP Cancel Room C', '12121212-1212-4121-8121-000000000010', 'ISSUED'),
  ('12121212-1212-4121-8121-000000000023', 'PGC-1204', 'NEW_SENATE', 'pgTAP Cancel Room D', '12121212-1212-4121-8121-000000000010', 'AVAILABLE'),
  ('12121212-1212-4121-8121-000000000024', 'PGC-1205', 'NEW_SENATE', 'pgTAP Cancel Room E', '12121212-1212-4121-8121-000000000010', 'AVAILABLE'),
  ('12121212-1212-4121-8121-000000000025', 'PGC-1206', 'NEW_SENATE', 'pgTAP Cancel Room F', '12121212-1212-4121-8121-000000000010', 'ISSUED'),
  ('12121212-1212-4121-8121-000000000026', 'PGC-1207', 'NEW_SENATE', 'pgTAP Cancel Room G', '12121212-1212-4121-8121-000000000010', 'ISSUED'),
  ('12121212-1212-4121-8121-000000000027', 'PGC-1208', 'NEW_SENATE', 'pgTAP Cancel Room H', '12121212-1212-4121-8121-000000000010', 'AVAILABLE');

insert into public.requests
  (id, requester_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline)
values
  ('12121212-1212-4121-8121-000000000040', '12121212-1212-4121-8121-000000000001', '12121212-1212-4121-8121-000000000020', 'WEEKDAY', current_date,     'CODE_ISSUED',  '121212', now() + interval '5 minutes', now() + interval '1 day'),
  ('12121212-1212-4121-8121-000000000041', '12121212-1212-4121-8121-000000000001', '12121212-1212-4121-8121-000000000021', 'WEEKEND', current_date + 3, 'PENDING_HOD',  null,     null,                         now() + interval '3 days'),
  ('12121212-1212-4121-8121-000000000042', '12121212-1212-4121-8121-000000000001', '12121212-1212-4121-8121-000000000022', 'WEEKDAY', current_date,     'KEY_ISSUED',   null,     null,                         now() + interval '1 day'),
  ('12121212-1212-4121-8121-000000000043', '12121212-1212-4121-8121-000000000002', '12121212-1212-4121-8121-000000000023', 'WEEKDAY', current_date,     'CODE_ISSUED',  '343434', now() + interval '5 minutes', now() + interval '1 day'),
  ('12121212-1212-4121-8121-000000000050', '12121212-1212-4121-8121-000000000002', '12121212-1212-4121-8121-000000000024', 'WEEKDAY', current_date,     'CODE_ISSUED',  '505050', now() + interval '5 minutes', now() + interval '1 day'),
  ('12121212-1212-4121-8121-000000000051', '12121212-1212-4121-8121-000000000002', '12121212-1212-4121-8121-000000000025', 'WEEKDAY', current_date,     'KEY_ISSUED',   null,     null,                         now() + interval '1 day'),
  ('12121212-1212-4121-8121-000000000052', '12121212-1212-4121-8121-000000000002', '12121212-1212-4121-8121-000000000026', 'WEEKDAY', current_date,     'KEY_ISSUED',   null,     null,                         now() + interval '1 day'),
  ('12121212-1212-4121-8121-000000000053', '12121212-1212-4121-8121-000000000002', '12121212-1212-4121-8121-000000000027', 'WEEKDAY', current_date,     'KEY_RETURNED', null,     null,                         now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- cancel_request
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

select throws_ok(
  $$ select * from public.cancel_request('12121212-1212-4121-8121-000000000040') $$,
  'P0001',
  'NOT_AUTHENTICATED',
  'cancel_request refuses a call with no session'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '12121212-1212-4121-8121-000000000003', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.cancel_request('12121212-1212-4121-8121-000000000040') $$,
  'P0002',
  'FORBIDDEN: only a REQUESTER can cancel a request',
  'cancel_request refuses a non-requester'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '12121212-1212-4121-8121-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

create temp table t_c1 as
select * from public.cancel_request('12121212-1212-4121-8121-000000000040');

select is((select status from t_c1), 'CANCELLED', 'cancel_request answers CANCELLED');

select is(
  (select status::text from public.requests where id = '12121212-1212-4121-8121-000000000040'),
  'CANCELLED',
  'a CODE_ISSUED request is cancelled'
);

select is(
  (select code from public.requests where id = '12121212-1212-4121-8121-000000000040'),
  null,
  'cancelling clears the collection code'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'REQUEST_CANCELLED'
     and target_id = '12121212-1212-4121-8121-000000000040'
     and payload->>'previous_status' = 'CODE_ISSUED'
     and payload->>'key_id' = '12121212-1212-4121-8121-000000000020'),
  1,
  'the cancellation and its REQUEST_CANCELLED entry commit together'
);

select is(
  (select status from public.cancel_request('12121212-1212-4121-8121-000000000041')),
  'CANCELLED',
  'a PENDING_HOD weekend request can be cancelled'
);

select throws_ok(
  $$ select * from public.cancel_request('12121212-1212-4121-8121-000000000042') $$,
  'P0006',
  'CONFLICT: request cannot be cancelled (current: KEY_ISSUED)',
  'a collected key cannot be cancelled'
);

select throws_ok(
  $$ select * from public.cancel_request('12121212-1212-4121-8121-000000000043') $$,
  'P0007',
  'NOT_FOUND: request 12121212-1212-4121-8121-000000000043 does not exist',
  'another requester''s request is reported as not found'
);

select is(
  (select status::text from public.requests where id = '12121212-1212-4121-8121-000000000043'),
  'CODE_ISSUED',
  'the other requester''s request is untouched'
);

-- ---------------------------------------------------------------------------
-- cso_decide_request
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.cso_decide_request('12121212-1212-4121-8121-000000000050', 'DECLINED') $$,
  'P0002',
  'FORBIDDEN: only the CSO can review a request',
  'cso_decide_request refuses a non-CSO'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '12121212-1212-4121-8121-000000000003', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.cso_decide_request('12121212-1212-4121-8121-000000000050', 'MAYBE') $$,
  'P0004',
  'INVALID_DECISION: decision must be APPROVED or DECLINED',
  'cso_decide_request refuses an unknown decision'
);

create temp table t_d1 as
select * from public.cso_decide_request(
  '12121212-1212-4121-8121-000000000050', 'DECLINED', 'Not on the roster');

select is((select status from t_d1), 'CANCELLED', 'a CSO decline answers CANCELLED');

select is(
  (select status::text from public.requests where id = '12121212-1212-4121-8121-000000000050'),
  'CANCELLED',
  'a CSO decline cancels an uncollected code'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'REQUEST_DECLINED_CSO'
     and target_id = '12121212-1212-4121-8121-000000000050'
     and payload->>'note' = 'Not on the roster'),
  1,
  'the decline is audited with the CSO''s note (previously dropped)'
);

select throws_ok(
  $$ select * from public.cso_decide_request('12121212-1212-4121-8121-000000000051', 'DECLINED') $$,
  'P0006',
  'CONFLICT: only a request with an uncollected code can be declined (current: KEY_ISSUED)',
  'declining a key that is already out is refused, not reported as a success'
);

select is(
  (select status::text from public.requests where id = '12121212-1212-4121-8121-000000000051'),
  'KEY_ISSUED',
  'the issued request is unchanged'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'REQUEST_DECLINED_CSO'
     and target_id = '12121212-1212-4121-8121-000000000051'),
  0,
  'no REQUEST_DECLINED_CSO entry is written for a decline that did nothing'
);

select is(
  (select status from public.cso_decide_request(
     '12121212-1212-4121-8121-000000000052', 'APPROVED', 'Checked')),
  'KEY_ISSUED',
  'an APPROVED review answers the request''s real status'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'REQUEST_APPROVED_CSO'
     and target_id = '12121212-1212-4121-8121-000000000052'
     and payload->>'note' = 'Checked'),
  1,
  'the approval is audited with the note'
);

select is(
  (select status::text from public.requests where id = '12121212-1212-4121-8121-000000000052'),
  'KEY_ISSUED',
  'an APPROVED review changes nothing'
);

select throws_ok(
  $$ select * from public.cso_decide_request('12121212-1212-4121-8121-000000000053', 'APPROVED') $$,
  'P0006',
  'CONFLICT: request is no longer under review (current: KEY_RETURNED)',
  'a request that has left the review queue cannot be approved'
);

select throws_ok(
  $$ select * from public.cso_decide_request('12121212-1212-4121-8121-0000000000ff', 'APPROVED') $$,
  'P0007',
  'NOT_FOUND: request 12121212-1212-4121-8121-0000000000ff does not exist',
  'cso_decide_request refuses an unknown request'
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.cancel_request(uuid)', 'EXECUTE'),
  'anon cannot execute cancel_request'
);

select ok(
  not has_function_privilege('anon', 'public.cso_decide_request(uuid, text, text)', 'EXECUTE'),
  'anon cannot execute cso_decide_request'
);

select ok(
  has_function_privilege('authenticated', 'public.cso_decide_request(uuid, text, text)', 'EXECUTE'),
  'authenticated can execute cso_decide_request (the route calls it with the CSO''s session)'
);

select * from finish();
rollback;
