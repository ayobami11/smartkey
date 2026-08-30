-- ---------------------------------------------------------------------------
-- 06 — The external (guest) weekend request lifecycle
--
-- Covers the guest analogues of the registered-user weekend flow, none of
-- which had any DB-level coverage before this file:
--   * public.create_guest_weekend_request
--   * public.approve_guest_weekend
--   * public.generate_guest_weekend_code
--   * public.expire_guest_request
--   * public.request_return_guest
--
-- Guests have no auth.users/profiles row and no session — they are identified
-- throughout by the unguessable access_token minted at submission. None of
-- these RPCs read auth.uid(); the actor for approve_guest_weekend is the
-- p_hod_id parameter, same convention as approve_weekend in
-- 04_authoriser_gate_test.sql.
--
-- approve_guest_weekend also gets the cross-faculty authoriser-gate coverage
-- 04_authoriser_gate_test.sql gives the registered-request RPCs: the RPC must
-- independently verify the assigned key's unit matches requests.
-- requested_unit_id, not just that the acting Dean/CSO owns the key. That
-- check was missing until 20260830103000_fix_approve_guest_weekend_unit_check.sql
-- (same day as this file) -- see that migration for why it mattered even
-- though the current UI's RLS-scoped read happens to mask it.
--
-- Everything runs inside one transaction and is rolled back at the end.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(40);

-- ---------------------------------------------------------------------------
-- Fixtures: two Dean-authorised faculties and one CSO-authorised
-- Administration group, one key each, and a handful of guest requests in
-- different states.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('66666666-6666-4666-8666-000000000001', 'pgtap.guest.deana@example.test'),
  ('66666666-6666-4666-8666-000000000002', 'pgtap.guest.deanb@example.test'),
  ('66666666-6666-4666-8666-000000000003', 'pgtap.guest.cso@example.test'),
  ('66666666-6666-4666-8666-000000000004', 'pgtap.guest.requester@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('66666666-6666-4666-8666-000000000010', 'pgTAP Guest Faculty Alpha',  'pgTAP Guest Faculty Alpha',  'DEAN'),
  ('66666666-6666-4666-8666-000000000011', 'pgTAP Guest Faculty Beta',   'pgTAP Guest Faculty Beta',   'DEAN'),
  ('66666666-6666-4666-8666-000000000012', 'pgTAP Guest Administration', 'pgTAP Guest Administration', 'CSO');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('66666666-6666-4666-8666-000000000001', 'DEAN',      'pgTAP Guest Dean Alpha',  'pgtap.guest.deana@example.test',     '66666666-6666-4666-8666-000000000010', 'ACTIVE'),
  ('66666666-6666-4666-8666-000000000002', 'DEAN',      'pgTAP Guest Dean Beta',   'pgtap.guest.deanb@example.test',     '66666666-6666-4666-8666-000000000011', 'ACTIVE'),
  ('66666666-6666-4666-8666-000000000003', 'CSO',       'pgTAP Guest CSO',         'pgtap.guest.cso@example.test',       null,                                    'ACTIVE'),
  ('66666666-6666-4666-8666-000000000004', 'REQUESTER', 'pgTAP Guest Registered',  'pgtap.guest.requester@example.test', '66666666-6666-4666-8666-000000000010', 'ACTIVE');

update public.units set hod_id = '66666666-6666-4666-8666-000000000001' where id = '66666666-6666-4666-8666-000000000010';
update public.units set hod_id = '66666666-6666-4666-8666-000000000002' where id = '66666666-6666-4666-8666-000000000011';

insert into public.keys (id, code, zone, room_name, unit_id, status) values
  ('66666666-6666-4666-8666-000000000020', 'PGT-601', 'NEW_SENATE', 'pgTAP Guest Alpha Office', '66666666-6666-4666-8666-000000000010', 'AVAILABLE'),
  ('66666666-6666-4666-8666-000000000021', 'PGT-602', 'NEW_SENATE', 'pgTAP Guest Beta Office',  '66666666-6666-4666-8666-000000000011', 'AVAILABLE'),
  ('66666666-6666-4666-8666-000000000022', 'PGT-603', 'OLD_SENATE', 'pgTAP Guest Registry',     '66666666-6666-4666-8666-000000000012', 'AVAILABLE');

insert into public.guest_requesters (id, full_name, email, id_document_type, id_document_number) values
  ('66666666-6666-4666-8666-000000000030', 'pgTAP Guest One',   'pgtap.guest.g1@example.test', 'National ID', 'PGT-ID-601'),
  ('66666666-6666-4666-8666-000000000031', 'pgTAP Guest Two',   'pgtap.guest.g2@example.test', 'Passport',    'PGT-ID-602'),
  ('66666666-6666-4666-8666-000000000032', 'pgTAP Guest Three', 'pgtap.guest.g3@example.test', 'National ID', 'PGT-ID-603'),
  ('66666666-6666-4666-8666-000000000033', 'pgTAP Guest Four',  'pgtap.guest.g4@example.test', 'National ID', 'PGT-ID-604'),
  ('66666666-6666-4666-8666-000000000034', 'pgTAP Guest Five',  'pgtap.guest.g5@example.test', 'National ID', 'PGT-ID-605');

-- ---------------------------------------------------------------------------
-- create_guest_weekend_request
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.create_guest_weekend_request(
       'pgTAP No Unit', 'pgtap.guest.nounit@example.test', null, 'National ID', 'PGT-ID-999',
       '66666666-6666-4666-8666-0000000000ff', current_date + 2, now() + interval '2 days',
       null, 'Some office') $$,
  'P0007',
  'NOT_FOUND: unit 66666666-6666-4666-8666-0000000000ff does not exist',
  'create_guest_weekend_request refuses an unknown unit'
);

create temp table t_c1 as
select * from public.create_guest_weekend_request(
  'pgTAP New Guest', 'pgtap.guest.new@example.test', '08000000000', 'National ID', 'PGT-ID-700',
  '66666666-6666-4666-8666-000000000010', current_date + 2, now() + interval '2 days',
  'https://example.test/letter.png', 'Dean''s Office, Ground Floor');

select isnt((select access_token from t_c1), null, 'create_guest_weekend_request mints an access_token');

select is(
  (select status::text from public.requests where id = (select request_id from t_c1)),
  'PENDING_HOD',
  'a new guest weekend request starts PENDING_HOD'
);

select is(
  (select risk_tier::text from public.requests where id = (select request_id from t_c1)),
  'LOW',
  'a guest weekend request is always created at LOW risk (no rule engine runs here)'
);

select is(
  (select key_id from public.requests where id = (select request_id from t_c1)),
  null,
  'a new guest weekend request has no key assigned yet'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'REQUEST_CREATED' and target_type = 'request'
     and target_id = (select request_id from t_c1)
     and actor_id is null
     and payload->>'external' = 'true'),
  1,
  'create_guest_weekend_request wrote one guest-attributed REQUEST_CREATED entry'
);

-- ---------------------------------------------------------------------------
-- approve_guest_weekend
-- ---------------------------------------------------------------------------

insert into public.requests
  (id, requester_id, guest_id, requested_unit_id, key_id, type, requested_for, status, return_deadline)
values
  -- Live, routed to Alpha, no key yet: the happy-path target.
  ('66666666-6666-4666-8666-000000000040', null, '66666666-6666-4666-8666-000000000030', '66666666-6666-4666-8666-000000000010', null, 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days'),
  -- Same shape, held for the cross-faculty rejection test.
  ('66666666-6666-4666-8666-000000000041', null, '66666666-6666-4666-8666-000000000031', '66666666-6666-4666-8666-000000000010', null, 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days'),
  -- Registered (non-guest) request, for the CONFLICT-not-external check.
  ('66666666-6666-4666-8666-000000000042', '66666666-6666-4666-8666-000000000004', null, null, '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days'),
  -- Already decided.
  ('66666666-6666-4666-8666-000000000043', null, '66666666-6666-4666-8666-000000000032', '66666666-6666-4666-8666-000000000010', '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date + 2, 'APPROVED', now() + interval '2 days'),
  -- Requested date already passed.
  ('66666666-6666-4666-8666-000000000044', null, '66666666-6666-4666-8666-000000000033', '66666666-6666-4666-8666-000000000010', null, 'WEEKEND', current_date - 2, 'PENDING_HOD', now() - interval '2 days'),
  -- Routed to Administration, for the CSO happy-path.
  ('66666666-6666-4666-8666-000000000045', null, '66666666-6666-4666-8666-000000000034', '66666666-6666-4666-8666-000000000012', null, 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days');

select throws_ok(
  $$ select * from public.approve_guest_weekend(
       '66666666-6666-4666-8666-0000000000fe', '66666666-6666-4666-8666-000000000001',
       '66666666-6666-4666-8666-000000000020') $$,
  'P0007',
  'NOT_FOUND: request 66666666-6666-4666-8666-0000000000fe does not exist',
  'approve_guest_weekend refuses an unknown request'
);

select throws_ok(
  $$ select * from public.approve_guest_weekend(
       '66666666-6666-4666-8666-000000000042', '66666666-6666-4666-8666-000000000001',
       '66666666-6666-4666-8666-000000000020') $$,
  'P0006',
  'CONFLICT: request is not an external request',
  'approve_guest_weekend refuses a registered (non-guest) request'
);

select throws_ok(
  $$ select * from public.approve_guest_weekend(
       '66666666-6666-4666-8666-000000000043', '66666666-6666-4666-8666-000000000001',
       '66666666-6666-4666-8666-000000000020') $$,
  'P0006',
  'CONFLICT: request is not in PENDING_HOD state (current: APPROVED)',
  'approve_guest_weekend refuses a request already decided'
);

select throws_ok(
  $$ select * from public.approve_guest_weekend(
       '66666666-6666-4666-8666-000000000044', '66666666-6666-4666-8666-000000000001',
       '66666666-6666-4666-8666-000000000020') $$,
  'P0006',
  'CONFLICT: the requested weekend date has already passed',
  'approve_guest_weekend refuses a request whose date has passed'
);

select throws_ok(
  $$ select * from public.approve_guest_weekend(
       '66666666-6666-4666-8666-000000000040', '66666666-6666-4666-8666-000000000001',
       '66666666-6666-4666-8666-0000000000fd') $$,
  'P0007',
  'NOT_FOUND: key 66666666-6666-4666-8666-0000000000fd does not exist',
  'approve_guest_weekend refuses an unknown key'
);

-- The fix under test: Dean Beta owns the Beta key, so the old check ("does
-- the actor's unit match the key's unit") would have passed -- but the
-- request was routed to Alpha, not Beta.
select throws_ok(
  $$ select * from public.approve_guest_weekend(
       '66666666-6666-4666-8666-000000000041', '66666666-6666-4666-8666-000000000002',
       '66666666-6666-4666-8666-000000000021') $$,
  'P0002',
  'FORBIDDEN: assigned key does not belong to the unit this guest request was routed to',
  'a Dean cannot approve a guest request routed to a different faculty by assigning their own faculty''s key'
);

select throws_ok(
  $$ select * from public.approve_guest_weekend(
       '66666666-6666-4666-8666-000000000041', '66666666-6666-4666-8666-000000000003',
       '66666666-6666-4666-8666-000000000020') $$,
  'P0002',
  'FORBIDDEN: key does not belong to the Dean department',
  'the CSO cannot approve a Dean-authorised guest request in the Dean''s place'
);

select lives_ok(
  $$ select * from public.approve_guest_weekend(
       '66666666-6666-4666-8666-000000000040', '66666666-6666-4666-8666-000000000001',
       '66666666-6666-4666-8666-000000000020') $$,
  'the routed faculty''s own Dean can approve the guest request, assigning their key'
);

select is(
  (select status::text from public.requests where id = '66666666-6666-4666-8666-000000000040'),
  'APPROVED',
  'the approved guest request moves to APPROVED'
);

select is(
  (select key_id from public.requests where id = '66666666-6666-4666-8666-000000000040'),
  '66666666-6666-4666-8666-000000000020',
  'the approved guest request has the Dean-assigned key'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'HOD_APPROVED' and target_type = 'request'
     and target_id = '66666666-6666-4666-8666-000000000040'
     and payload->>'external' = 'true'
     and (payload->>'key_id')::uuid = '66666666-6666-4666-8666-000000000020'),
  1,
  'the approval wrote one guest-flagged HOD_APPROVED entry recording the assigned key'
);

select lives_ok(
  $$ select * from public.approve_guest_weekend(
       '66666666-6666-4666-8666-000000000045', '66666666-6666-4666-8666-000000000003',
       '66666666-6666-4666-8666-000000000022') $$,
  'the CSO can approve an Administration-routed guest request'
);

select is(
  (select status::text from public.requests where id = '66666666-6666-4666-8666-000000000045'),
  'APPROVED',
  'the CSO-approved Administration guest request moves to APPROVED'
);

-- ---------------------------------------------------------------------------
-- generate_guest_weekend_code
-- ---------------------------------------------------------------------------

insert into public.requests
  (id, guest_id, requested_unit_id, key_id, type, requested_for, status, return_deadline, access_token)
values
  ('66666666-6666-4666-8666-000000000050', '66666666-6666-4666-8666-000000000030', '66666666-6666-4666-8666-000000000010', '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date,     'APPROVED',    now() + interval '1 day',  '66666666-aaaa-4aaa-8aaa-000000000001'),
  ('66666666-6666-4666-8666-000000000051', '66666666-6666-4666-8666-000000000031', '66666666-6666-4666-8666-000000000010', '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date + 3, 'APPROVED',    now() + interval '3 days', '66666666-aaaa-4aaa-8aaa-000000000002'),
  ('66666666-6666-4666-8666-000000000052', '66666666-6666-4666-8666-000000000032', '66666666-6666-4666-8666-000000000010', null,                                    'WEEKEND', current_date,     'PENDING_HOD', now() + interval '1 day',  '66666666-aaaa-4aaa-8aaa-000000000003');

select throws_ok(
  $$ select * from public.generate_guest_weekend_code('66666666-aaaa-4aaa-8aaa-0000000000ff') $$,
  'P0007',
  'NOT_FOUND: request does not exist',
  'generate_guest_weekend_code refuses an unknown access_token'
);

select throws_ok(
  $$ select * from public.generate_guest_weekend_code('66666666-aaaa-4aaa-8aaa-000000000003') $$,
  'P0006',
  'CONFLICT: request is not in APPROVED state (current: PENDING_HOD)',
  'generate_guest_weekend_code refuses a request that is not yet APPROVED'
);

select throws_ok(
  $$ select * from public.generate_guest_weekend_code('66666666-aaaa-4aaa-8aaa-000000000002') $$,
  'P0014',
  'TOO_EARLY: a collection code can only be generated on the requested date',
  'generate_guest_weekend_code refuses to mint a code before the requested date'
);

create temp table t_g1 as
select * from public.generate_guest_weekend_code('66666666-aaaa-4aaa-8aaa-000000000001');

select matches((select code from t_g1), '^[0-9]{6}$', 'generate_guest_weekend_code mints a 6-digit code');

select ok(
  (select code_expires_at from t_g1) between now() + interval '9 minutes' and now() + interval '11 minutes',
  'the guest code expiry follows operational_config.code_expiry_minutes (default 10)'
);

select is(
  (select status::text from public.requests where id = '66666666-6666-4666-8666-000000000050'),
  'CODE_ISSUED',
  'generating the code moves the guest request to CODE_ISSUED'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'CODE_ISSUED' and target_type = 'request'
     and target_id = '66666666-6666-4666-8666-000000000050'
     and actor_id is null),
  1,
  'generate_guest_weekend_code wrote one guest-attributed CODE_ISSUED entry'
);

-- ---------------------------------------------------------------------------
-- expire_guest_request
-- ---------------------------------------------------------------------------

insert into public.requests
  (id, guest_id, requested_unit_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline, access_token)
values
  -- Genuinely expired, date not today: terminalises to EXPIRED.
  ('66666666-6666-4666-8666-000000000060', '66666666-6666-4666-8666-000000000030', '66666666-6666-4666-8666-000000000010', '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date + 2, 'CODE_ISSUED', '111111', now() - interval '1 minute', now() + interval '2 days', '66666666-bbbb-4bbb-8bbb-000000000001'),
  -- Genuinely expired, date is today: rolls back to APPROVED instead.
  ('66666666-6666-4666-8666-000000000061', '66666666-6666-4666-8666-000000000031', '66666666-6666-4666-8666-000000000010', '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date,     'CODE_ISSUED', '222222', now() - interval '1 minute', now() + interval '1 day',  '66666666-bbbb-4bbb-8bbb-000000000002'),
  -- Not yet expired.
  ('66666666-6666-4666-8666-000000000062', '66666666-6666-4666-8666-000000000032', '66666666-6666-4666-8666-000000000010', '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date + 2, 'CODE_ISSUED', '333333', now() + interval '5 minutes', now() + interval '2 days', '66666666-bbbb-4bbb-8bbb-000000000003'),
  -- Not CODE_ISSUED at all: idempotent no-op.
  ('66666666-6666-4666-8666-000000000063', '66666666-6666-4666-8666-000000000033', '66666666-6666-4666-8666-000000000010', '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date + 2, 'APPROVED',    null,     null,                              now() + interval '2 days', '66666666-bbbb-4bbb-8bbb-000000000004');

select throws_ok(
  $$ select * from public.expire_guest_request('66666666-bbbb-4bbb-8bbb-0000000000ff') $$,
  'P0007',
  'NOT_FOUND: request does not exist',
  'expire_guest_request refuses an unknown access_token'
);

select throws_ok(
  $$ select * from public.expire_guest_request('66666666-bbbb-4bbb-8bbb-000000000003') $$,
  'P0015',
  'NOT_EXPIRED: the code has not expired yet',
  'expire_guest_request refuses a code that has not expired yet'
);

select is(
  (select status from public.expire_guest_request('66666666-bbbb-4bbb-8bbb-000000000004')),
  'APPROVED',
  'expire_guest_request on a non-CODE_ISSUED request is an idempotent no-op'
);

select is(
  (select count(*)::int from public.audit_log
   where target_type = 'request' and target_id = '66666666-6666-4666-8666-000000000063'),
  0,
  'the idempotent no-op wrote no audit entry'
);

select is(
  (select status from public.expire_guest_request('66666666-bbbb-4bbb-8bbb-000000000001')),
  'EXPIRED',
  'a genuinely-expired guest code (not requested-today) terminalises to EXPIRED'
);

select is(
  (select code from public.requests where id = '66666666-6666-4666-8666-000000000060'),
  null,
  'the terminalised request has its code cleared'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'REQUEST_EXPIRED' and target_type = 'request'
     and target_id = '66666666-6666-4666-8666-000000000060'),
  1,
  'the terminalised request wrote one REQUEST_EXPIRED entry'
);

select is(
  (select status from public.expire_guest_request('66666666-bbbb-4bbb-8bbb-000000000002')),
  'APPROVED',
  'a genuinely-expired guest code requested for today rolls back to APPROVED instead'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'CODE_EXPIRED' and target_type = 'request'
     and target_id = '66666666-6666-4666-8666-000000000061'),
  1,
  'the same-day rollback wrote a CODE_EXPIRED entry, not REQUEST_EXPIRED'
);

-- ---------------------------------------------------------------------------
-- request_return_guest
-- ---------------------------------------------------------------------------

insert into public.requests
  (id, guest_id, requested_unit_id, key_id, type, requested_for, status, return_deadline, access_token)
values
  ('66666666-6666-4666-8666-000000000070', '66666666-6666-4666-8666-000000000030', '66666666-6666-4666-8666-000000000010', '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date, 'KEY_ISSUED',  now() + interval '1 day', '66666666-cccc-4ccc-8ccc-000000000001'),
  ('66666666-6666-4666-8666-000000000071', '66666666-6666-4666-8666-000000000031', '66666666-6666-4666-8666-000000000010', '66666666-6666-4666-8666-000000000020', 'WEEKEND', current_date, 'CODE_ISSUED', now() + interval '1 day', '66666666-cccc-4ccc-8ccc-000000000002');

select throws_ok(
  $$ select * from public.request_return_guest('66666666-cccc-4ccc-8ccc-0000000000ff') $$,
  'P0007',
  'NOT_FOUND: request does not exist',
  'request_return_guest refuses an unknown access_token'
);

select throws_ok(
  $$ select * from public.request_return_guest('66666666-cccc-4ccc-8ccc-000000000002') $$,
  'P0006',
  'CONFLICT: request is not in KEY_ISSUED state (current: CODE_ISSUED)',
  'request_return_guest refuses a request that is not yet KEY_ISSUED'
);

create temp table t_r1 as
select * from public.request_return_guest('66666666-cccc-4ccc-8ccc-000000000001');

select matches((select return_code from t_r1), '^[0-9]{6}$', 'request_return_guest mints a 6-digit return code');

select ok(
  (select return_code_expires_at from t_r1) between now() + interval '14 minutes' and now() + interval '16 minutes',
  'the guest return code expires 15 minutes out'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'RETURN_CODE_GENERATED' and target_type = 'request'
     and target_id = '66666666-6666-4666-8666-000000000070'
     and actor_id is null),
  1,
  'request_return_guest wrote one guest-attributed RETURN_CODE_GENERATED entry'
);

select * from finish();

rollback;
