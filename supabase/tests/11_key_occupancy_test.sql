-- Key occupancy: the two predicates (request_occupies_key, request_is_overdue),
-- get_key_occupancy()'s per-key counts, zone filter and role gate, and
-- get_digest_stats.overdue_count counting holders rather than key records
-- (20261013110000_key_occupancy_rpc.sql).
--
-- The two truth tables are mirrored, label for label, in
-- src/tests/keys/occupancy.test.ts. TypeScript re-implements these predicates
-- for code that already holds request rows in memory; if a row here changes,
-- change the matching row there.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Truth table: request_occupies_key(status, code_expires_at)
-- ---------------------------------------------------------------------------

select is(public.request_occupies_key('KEY_ISSUED', null), true,
  'occupies: KEY_ISSUED occupies');
select is(public.request_occupies_key('KEY_ISSUED', now() - interval '1 hour'), true,
  'occupies: KEY_ISSUED occupies even with a lapsed code expiry');
select is(public.request_occupies_key('CODE_ISSUED', now() + interval '10 minutes'), true,
  'occupies: live CODE_ISSUED occupies');
select is(public.request_occupies_key('CODE_ISSUED', now() - interval '1 minute'), false,
  'occupies: lapsed CODE_ISSUED does not occupy');
select is(public.request_occupies_key('CODE_ISSUED', null), true,
  'occupies: CODE_ISSUED with no expiry occupies');
select is(public.request_occupies_key('PENDING_HOD', null), false,
  'occupies: PENDING_HOD does not occupy');
select is(public.request_occupies_key('APPROVED', null), false,
  'occupies: APPROVED does not occupy');
select is(public.request_occupies_key('KEY_RETURNED', null), false,
  'occupies: KEY_RETURNED does not occupy');

-- ---------------------------------------------------------------------------
-- Truth table: request_is_overdue(status, return_deadline)
-- ---------------------------------------------------------------------------

select is(public.request_is_overdue('KEY_ISSUED', now() - interval '1 hour'), true,
  'overdue: KEY_ISSUED past its deadline is overdue');
select is(public.request_is_overdue('KEY_ISSUED', now() + interval '1 hour'), false,
  'overdue: KEY_ISSUED before its deadline is not overdue');
select is(public.request_is_overdue('KEY_ISSUED', null), false,
  'overdue: KEY_ISSUED with no deadline is not overdue');
select is(public.request_is_overdue('CODE_ISSUED', now() - interval '1 hour'), false,
  'overdue: CODE_ISSUED past its deadline is not overdue');
select is(public.request_is_overdue('KEY_RETURNED', now() - interval '1 hour'), false,
  'overdue: KEY_RETURNED past its deadline is not overdue');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('77777777-7777-4777-8777-000000000001', 'pgtap.occ.cso@example.test'),
  ('77777777-7777-4777-8777-000000000002', 'pgtap.occ.verifier@example.test'),
  ('77777777-7777-4777-8777-000000000003', 'pgtap.occ.dean@example.test'),
  ('77777777-7777-4777-8777-000000000004', 'pgtap.occ.r1@example.test'),
  ('77777777-7777-4777-8777-000000000005', 'pgtap.occ.r2@example.test'),
  ('77777777-7777-4777-8777-000000000006', 'pgtap.occ.r3@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('77777777-7777-4777-8777-000000000010', 'pgTAP Faculty of Occupancy', 'pgTAP Faculty of Occupancy', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('77777777-7777-4777-8777-000000000001', 'CSO',       'pgTAP CSO Occupancy',      'pgtap.occ.cso@example.test',      null,                                    'ACTIVE'),
  ('77777777-7777-4777-8777-000000000002', 'VERIFIER',  'pgTAP Verifier Occupancy', 'pgtap.occ.verifier@example.test', null,                                    'ACTIVE'),
  ('77777777-7777-4777-8777-000000000003', 'DEAN',      'pgTAP Dean Occupancy',     'pgtap.occ.dean@example.test',     '77777777-7777-4777-8777-000000000010', 'ACTIVE'),
  ('77777777-7777-4777-8777-000000000004', 'REQUESTER', 'pgTAP Occupant One',       'pgtap.occ.r1@example.test',       '77777777-7777-4777-8777-000000000010', 'ACTIVE'),
  ('77777777-7777-4777-8777-000000000005', 'REQUESTER', 'pgTAP Occupant Two',       'pgtap.occ.r2@example.test',       '77777777-7777-4777-8777-000000000010', 'ACTIVE'),
  ('77777777-7777-4777-8777-000000000006', 'REQUESTER', 'pgTAP Occupant Three',     'pgtap.occ.r3@example.test',       '77777777-7777-4777-8777-000000000010', 'ACTIVE');

-- K1: four copies, every one held or reserved, two holders late. keys.status
--     still says ISSUED because the hourly cron has not run.
-- K2: one copy, nobody holding it, but a stale keys.status = 'OVERDUE'. The
--     old digest counted this record; the new one must not.
-- K3: retired, with a holder still recorded — retired wins, nothing available.
-- K4: twelve copies, one out.
insert into public.keys (id, code, zone, room_name, unit_id, status, key_count) values
  ('77777777-7777-4777-8777-000000000020', 'PGT-701', 'NEW_SENATE', 'pgTAP Occupancy Room A', '77777777-7777-4777-8777-000000000010', 'ISSUED',    4),
  ('77777777-7777-4777-8777-000000000021', 'PGT-702', 'NEW_SENATE', 'pgTAP Occupancy Room B', '77777777-7777-4777-8777-000000000010', 'OVERDUE',   1),
  ('77777777-7777-4777-8777-000000000022', 'PGT-703', 'OLD_SENATE', 'pgTAP Occupancy Room C', '77777777-7777-4777-8777-000000000010', 'RETIRED',   2),
  ('77777777-7777-4777-8777-000000000023', 'PGT-704', 'OLD_SENATE', 'pgTAP Occupancy Room D', '77777777-7777-4777-8777-000000000010', 'AVAILABLE', 12);

insert into public.requests
  (id, requester_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline)
values
  -- K1: two overdue holders, one on-time holder, one live reservation ...
  ('77777777-7777-4777-8777-000000000040', '77777777-7777-4777-8777-000000000004', '77777777-7777-4777-8777-000000000020', 'WEEKDAY', current_date,     'KEY_ISSUED',   null,     null,                          now() - interval '2 hours'),
  ('77777777-7777-4777-8777-000000000041', '77777777-7777-4777-8777-000000000005', '77777777-7777-4777-8777-000000000020', 'WEEKDAY', current_date,     'KEY_ISSUED',   null,     null,                          now() - interval '1 hour'),
  ('77777777-7777-4777-8777-000000000042', '77777777-7777-4777-8777-000000000006', '77777777-7777-4777-8777-000000000020', 'WEEKDAY', current_date,     'KEY_ISSUED',   null,     null,                          now() + interval '4 hours'),
  ('77777777-7777-4777-8777-000000000043', '77777777-7777-4777-8777-000000000004', '77777777-7777-4777-8777-000000000020', 'WEEKDAY', current_date,     'CODE_ISSUED',  '700001', now() + interval '5 minutes',  now() + interval '1 day'),
  -- ... and three rows that must not count: a lapsed code, a future weekend
  -- approval, and a returned key whose deadline has passed.
  ('77777777-7777-4777-8777-000000000044', '77777777-7777-4777-8777-000000000005', '77777777-7777-4777-8777-000000000020', 'WEEKDAY', current_date,     'CODE_ISSUED',  '700002', now() - interval '1 minute',   now() + interval '1 day'),
  ('77777777-7777-4777-8777-000000000045', '77777777-7777-4777-8777-000000000006', '77777777-7777-4777-8777-000000000020', 'WEEKEND', current_date + 7, 'APPROVED',     null,     null,                          now() + interval '8 days'),
  ('77777777-7777-4777-8777-000000000046', '77777777-7777-4777-8777-000000000004', '77777777-7777-4777-8777-000000000020', 'WEEKDAY', current_date,     'KEY_RETURNED', null,     null,                          now() - interval '3 hours'),
  -- K3 and K4: one on-time holder each.
  ('77777777-7777-4777-8777-000000000047', '77777777-7777-4777-8777-000000000005', '77777777-7777-4777-8777-000000000022', 'WEEKDAY', current_date,     'KEY_ISSUED',   null,     null,                          now() + interval '4 hours'),
  ('77777777-7777-4777-8777-000000000048', '77777777-7777-4777-8777-000000000006', '77777777-7777-4777-8777-000000000023', 'WEEKDAY', current_date,     'KEY_ISSUED',   null,     null,                          now() + interval '4 hours');

-- ---------------------------------------------------------------------------
-- get_key_occupancy(): per-key counts, as the CSO
-- Row text is (issued, overdue, reserved, occupied, available, retired).
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '77777777-7777-4777-8777-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

select is(
  (select row(issued, overdue, reserved, occupied, available, retired)::text
   from public.get_key_occupancy() where key_id = '77777777-7777-4777-8777-000000000020'),
  '(3,2,1,4,0,f)',
  'K1: three held (two overdue) plus one live code fill all four copies; the lapsed code, weekend approval and returned key do not count'
);

select is(
  (select row(issued, overdue, reserved, occupied, available, retired)::text
   from public.get_key_occupancy() where key_id = '77777777-7777-4777-8777-000000000021'),
  '(0,0,0,0,1,f)',
  'K2: a stale keys.status = OVERDUE with no holder is still available'
);

select is(
  (select row(issued, overdue, reserved, occupied, available, retired)::text
   from public.get_key_occupancy() where key_id = '77777777-7777-4777-8777-000000000022'),
  '(1,0,0,1,0,t)',
  'K3: a retired key has nothing available, whatever its holders'
);

select is(
  (select row(issued, overdue, reserved, occupied, available, retired)::text
   from public.get_key_occupancy() where key_id = '77777777-7777-4777-8777-000000000023'),
  '(1,0,0,1,11,f)',
  'K4: a twelve-copy room with one out has eleven available'
);

-- ---------------------------------------------------------------------------
-- Zone filter
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.get_key_occupancy('OLD_SENATE')
   where key_id in ('77777777-7777-4777-8777-000000000020', '77777777-7777-4777-8777-000000000021',
                    '77777777-7777-4777-8777-000000000022', '77777777-7777-4777-8777-000000000023')),
  2,
  'p_zone = OLD_SENATE returns the two Old Senate fixtures'
);

select ok(
  not exists (select 1 from public.get_key_occupancy('OLD_SENATE') where zone <> 'OLD_SENATE'),
  'p_zone = OLD_SENATE returns no other zone'
);

-- ---------------------------------------------------------------------------
-- Role gate
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select * from public.get_key_occupancy() $$,
  'the CSO can read key occupancy'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '77777777-7777-4777-8777-000000000002', 'role', 'authenticated')::text, true);
end;
$$;

select lives_ok(
  $$ select * from public.get_key_occupancy() $$,
  'a VERIFIER can read key occupancy'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '77777777-7777-4777-8777-000000000004', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.get_key_occupancy() $$,
  'P0002',
  'FORBIDDEN: only CSO or VERIFIER can read key occupancy',
  'a REQUESTER cannot read key occupancy'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '77777777-7777-4777-8777-000000000003', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.get_key_occupancy() $$,
  'P0002',
  'FORBIDDEN: only CSO or VERIFIER can read key occupancy',
  'a DEAN cannot read key occupancy'
);

do $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select throws_ok(
  $$ select * from public.get_key_occupancy() $$,
  'P0001',
  'NOT_AUTHENTICATED',
  'a caller with no session cannot read key occupancy'
);

select ok(
  not has_function_privilege('anon', 'public.get_key_occupancy(public.zone)', 'execute'),
  'anon has no execute on get_key_occupancy'
);

select ok(
  not has_function_privilege('anon', 'public.request_is_overdue(public.request_status, timestamptz)', 'execute'),
  'anon has no execute on request_is_overdue'
);

-- ---------------------------------------------------------------------------
-- get_digest_stats: overdue_count counts overdue holders, not key records
-- (run as the test's superuser — the function is service-role only)
-- ---------------------------------------------------------------------------

select is(
  (select overdue_count from public.get_digest_stats('77777777-7777-4777-8777-000000000010')),
  2,
  'digest overdue_count counts the two late holders on K1, not the stale OVERDUE record on K2'
);

select * from finish();

rollback;
