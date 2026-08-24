
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(35);

insert into auth.users (id, email) values
  ('55555555-5555-4555-8555-000000000001', 'pgtap.week.dean@example.test'),
  ('55555555-5555-4555-8555-000000000002', 'pgtap.week.verifier@example.test'),
  ('55555555-5555-4555-8555-000000000003', 'pgtap.week.r1@example.test'),
  ('55555555-5555-4555-8555-000000000004', 'pgtap.week.r2@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('55555555-5555-4555-8555-000000000010', 'pgTAP Faculty of Lifecycle', 'pgTAP Faculty of Lifecycle', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('55555555-5555-4555-8555-000000000001', 'DEAN',      'pgTAP Dean Lifecycle',      'pgtap.week.dean@example.test',     '55555555-5555-4555-8555-000000000010', 'ACTIVE'),
  ('55555555-5555-4555-8555-000000000002', 'VERIFIER',  'pgTAP Verifier Lifecycle',  'pgtap.week.verifier@example.test', null,                                    'ACTIVE'),
  ('55555555-5555-4555-8555-000000000003', 'REQUESTER', 'pgTAP Requester One',       'pgtap.week.r1@example.test',       '55555555-5555-4555-8555-000000000010', 'ACTIVE'),
  ('55555555-5555-4555-8555-000000000004', 'REQUESTER', 'pgTAP Requester Two',       'pgtap.week.r2@example.test',       '55555555-5555-4555-8555-000000000010', 'ACTIVE');

update public.units
set    hod_id = '55555555-5555-4555-8555-000000000001'
where  id = '55555555-5555-4555-8555-000000000010';

insert into public.keys (id, code, zone, room_name, unit_id, status) values
  ('55555555-5555-4555-8555-000000000020', 'PGT-501', 'NEW_SENATE', 'pgTAP Lifecycle Room A', '55555555-5555-4555-8555-000000000010', 'AVAILABLE'),
  ('55555555-5555-4555-8555-000000000021', 'PGT-502', 'NEW_SENATE', 'pgTAP Lifecycle Room B', '55555555-5555-4555-8555-000000000010', 'AVAILABLE'),
  ('55555555-5555-4555-8555-000000000022', 'PGT-503', 'NEW_SENATE', 'pgTAP Lifecycle Room C', '55555555-5555-4555-8555-000000000010', 'ISSUED'),
  ('55555555-5555-4555-8555-000000000023', 'PGT-504', 'NEW_SENATE', 'pgTAP Lifecycle Room D', '55555555-5555-4555-8555-000000000010', 'ISSUED'),
  ('55555555-5555-4555-8555-000000000024', 'PGT-505', 'NEW_SENATE', 'pgTAP Lifecycle Room E', '55555555-5555-4555-8555-000000000010', 'ISSUED'),
  ('55555555-5555-4555-8555-000000000025', 'PGT-506', 'NEW_SENATE', 'pgTAP Lifecycle Room F', '55555555-5555-4555-8555-000000000010', 'ISSUED'),
  ('55555555-5555-4555-8555-000000000026', 'PGT-507', 'NEW_SENATE', 'pgTAP Lifecycle Room G', '55555555-5555-4555-8555-000000000010', 'ISSUED'),
  ('55555555-5555-4555-8555-00000000002a', 'PGT-511', 'NEW_SENATE', 'pgTAP Lifecycle Room H', '55555555-5555-4555-8555-000000000010', 'ISSUED'),
  ('55555555-5555-4555-8555-000000000027', 'PGT-508', 'NEW_SENATE', 'pgTAP Lifecycle Room I', '55555555-5555-4555-8555-000000000010', 'ISSUED'),
  ('55555555-5555-4555-8555-000000000028', 'PGT-509', 'NEW_SENATE', 'pgTAP Lifecycle Room J', '55555555-5555-4555-8555-000000000010', 'AVAILABLE'),
  ('55555555-5555-4555-8555-000000000029', 'PGT-510', 'NEW_SENATE', 'pgTAP Lifecycle Room K', '55555555-5555-4555-8555-000000000010', 'ISSUED');

insert into public.authorisations (key_id, profile_id, authorised_by) values
  ('55555555-5555-4555-8555-000000000020', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000001'),
  ('55555555-5555-4555-8555-000000000021', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000001');

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '55555555-5555-4555-8555-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.create_request(
       '55555555-5555-4555-8555-000000000020', 'WEEKDAY', now() + interval '1 day', null) $$,
  'P0002',
  'FORBIDDEN: only REQUESTER role can create requests',
  'a non-REQUESTER caller cannot create a request'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '55555555-5555-4555-8555-000000000004', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.create_request(
       '55555555-5555-4555-8555-000000000020', 'WEEKDAY', now() + interval '1 day', null) $$,
  'P0005',
  'NOT_AUTHORISED: requester is not whitelisted for this key',
  'an un-whitelisted requester cannot create a request for this key'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '55555555-5555-4555-8555-000000000003', 'role', 'authenticated')::text, true);
end;
$$;

create temp table t_a3 as
select * from public.create_request(
  '55555555-5555-4555-8555-000000000020', 'WEEKDAY', now() + interval '1 day', null);

select is(
  (select status from t_a3), 'CODE_ISSUED',
  'a WEEKDAY request is issued a code immediately'
);

select matches(
  (select code from t_a3), '^[0-9]{6}$',
  'the minted code is 6 digits'
);

select ok(
  (select code_expires_at from t_a3)
    between now() + interval '9 minutes' and now() + interval '11 minutes',
  'the code expiry follows operational_config.code_expiry_minutes (default 10)'
);

select throws_ok(
  $$ select * from public.create_request(
       '55555555-5555-4555-8555-000000000020', 'WEEKDAY', now() + interval '1 day', null) $$,
  'P0006',
  'CONFLICT: an active request already exists for this key',
  'a second active request for the same requester/key is refused'
);

update public.requests
set    status = 'KEY_RETURNED'
where  id = (select request_id from t_a3);

create temp table t_a5 as
select * from public.create_request(
  '55555555-5555-4555-8555-000000000020', 'WEEKDAY', now() + interval '1 day', null);

select is(
  (select status from t_a5), 'CODE_ISSUED',
  'a new request is allowed once the prior one is terminal'
);

select is(
  (select count(*)::int from public.requests
   where requester_id = '55555555-5555-4555-8555-000000000003'
     and key_id        = '55555555-5555-4555-8555-000000000020'),
  2,
  'two requests now exist for this requester/key pair'
);

create temp table t_a6 as
select * from public.create_request(
  '55555555-5555-4555-8555-000000000021', 'WEEKEND', now() + interval '2 days', current_date + 2);

select is((select status from t_a6), 'PENDING_HOD', 'a WEEKEND request starts PENDING_HOD');
select is((select code from t_a6), null, 'a WEEKEND request mints no code yet');

select is(
  (select count(*)::int from public.audit_log
   where event = 'REQUEST_CREATED'
     and target_type = 'request'
     and actor_id = '55555555-5555-4555-8555-000000000003'),
  3,
  'three successful create_request calls wrote three REQUEST_CREATED entries'
);

insert into public.requests
  (id, requester_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline)
values
  ('55555555-5555-4555-8555-000000000040', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000022', 'WEEKDAY', current_date, 'CODE_ISSUED', '111111', now() + interval '5 minutes', now() + interval '1 day'),
  ('55555555-5555-4555-8555-000000000041', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000022', 'WEEKDAY', current_date, 'CODE_ISSUED', '222222', now() - interval '1 minute',  now() + interval '1 day'),
  ('55555555-5555-4555-8555-000000000042', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000022', 'WEEKDAY', current_date, 'KEY_ISSUED',  null,     null,                              now() + interval '1 day');

select public.issue_key(
  '55555555-5555-4555-8555-000000000040', '55555555-5555-4555-8555-000000000002');

select is(
  (select status from public.requests where id = '55555555-5555-4555-8555-000000000040'),
  'KEY_ISSUED',
  'issue_key moves the request to KEY_ISSUED'
);

select is(
  (select code from public.requests where id = '55555555-5555-4555-8555-000000000040'),
  null,
  'issue_key clears the collection code'
);

select is(
  (select status from public.keys where id = '55555555-5555-4555-8555-000000000022'),
  'ISSUED',
  'issue_key marks the key ISSUED'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'KEY_ISSUED' and target_type = 'request'
     and target_id = '55555555-5555-4555-8555-000000000040'),
  1,
  'issue_key wrote one KEY_ISSUED audit entry'
);

select throws_ok(
  $$ select * from public.issue_key(
       '55555555-5555-4555-8555-0000000000ff', '55555555-5555-4555-8555-000000000002') $$,
  'P0007',
  'NOT_FOUND: request 55555555-5555-4555-8555-0000000000ff does not exist',
  'issue_key refuses an unknown request'
);

select throws_ok(
  $$ select * from public.issue_key(
       '55555555-5555-4555-8555-000000000042', '55555555-5555-4555-8555-000000000002') $$,
  'P0006',
  'CONFLICT: request is not in CODE_ISSUED state (current: KEY_ISSUED)',
  'issue_key refuses a request that is not CODE_ISSUED'
);

select throws_ok(
  $$ select * from public.issue_key(
       '55555555-5555-4555-8555-000000000041', '55555555-5555-4555-8555-000000000002') $$,
  'P0008',
  'EXPIRED_CODE: the 6-digit code has expired',
  'issue_key refuses an expired code'
);

insert into public.requests
  (id, requester_id, key_id, type, requested_for, status, return_code, return_code_expires_at, return_deadline)
values
  ('55555555-5555-4555-8555-000000000050', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000023', 'WEEKDAY', current_date, 'KEY_ISSUED', '333333', now() + interval '15 minutes', now() + interval '1 day'),
  ('55555555-5555-4555-8555-000000000051', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000024', 'WEEKDAY', current_date, 'KEY_ISSUED', '444444', now() - interval '1 minute',   now() + interval '1 day'),
  ('55555555-5555-4555-8555-000000000052', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000025', 'WEEKDAY', current_date, 'KEY_ISSUED', null,     null,                              now() + interval '1 day'),
  ('55555555-5555-4555-8555-000000000053', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000026', 'WEEKDAY', current_date, 'KEY_ISSUED', null,     null,                              now() + interval '1 day'),
  ('55555555-5555-4555-8555-00000000005a', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-00000000002a', 'WEEKDAY', current_date, 'KEY_ISSUED', null,     null,                              now() + interval '1 day');

select is(
  (select verified from public.return_key(
     '55555555-5555-4555-8555-000000000050', '55555555-5555-4555-8555-000000000002', '333333')),
  true,
  'return_key with a matching code returns verified = true'
);

select is(
  (select status from public.keys where id = '55555555-5555-4555-8555-000000000023'),
  'AVAILABLE',
  'a verified return frees the key'
);

select throws_ok(
  $$ select * from public.return_key(
       '55555555-5555-4555-8555-000000000050', '55555555-5555-4555-8555-000000000002', '333333') $$,
  'P0009',
  'NOT_ISSUED: request is not in KEY_ISSUED state (current: KEY_RETURNED)',
  'return_key refuses a request that is not KEY_ISSUED'
);

select throws_ok(
  $$ select * from public.return_key(
       '55555555-5555-4555-8555-000000000051', '55555555-5555-4555-8555-000000000002', '000000') $$,
  'P0011',
  'BAD_RETURN_CODE: the return code does not match',
  'return_key refuses a mismatched code'
);

select throws_ok(
  $$ select * from public.return_key(
       '55555555-5555-4555-8555-000000000051', '55555555-5555-4555-8555-000000000002', '444444') $$,
  'P0012',
  'EXPIRED_RETURN_CODE: the return code has expired',
  'return_key refuses a code past its expiry'
);

select is(
  (select verified from public.return_key(
     '55555555-5555-4555-8555-000000000052', '55555555-5555-4555-8555-000000000002',
     null, null, 'Requester forgot to bring back the key; verbal confirmation only')),
  false,
  'an override return with no open shift still succeeds, unverified'
);

select is(
  (select count(*)::int from public.incidents
   where related_key_id = '55555555-5555-4555-8555-000000000025'),
  0,
  'no incident is raised when there is no open shift to attribute it to'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'KEY_RETURNED_UNVERIFIED' and target_type = 'request'
     and target_id = '55555555-5555-4555-8555-000000000052'),
  1,
  'the unverified return wrote a KEY_RETURNED_UNVERIFIED entry (not KEY_RETURNED)'
);

insert into public.shifts (id, shift_number, started_at, ended_at, primary_officer_id) values
  ('55555555-5555-4555-8555-000000000060', 1, now() - interval '1 hour', null, '55555555-5555-4555-8555-000000000002');

select is(
  (select verified from public.return_key(
     '55555555-5555-4555-8555-000000000053', '55555555-5555-4555-8555-000000000002',
     null, null, 'Lost the printed code, identity confirmed by ID card')),
  false,
  'an override return with an open shift still succeeds, unverified'
);

select is(
  (select count(*)::int from public.incidents
   where shift_id = '55555555-5555-4555-8555-000000000060'
     and related_key_id = '55555555-5555-4555-8555-000000000026'
     and type = 'SUSPICIOUS_ACTIVITY'
     and severity = 'MEDIUM'
     and status = 'OPEN'),
  1,
  'an override return with an open shift raises one SUSPICIOUS_ACTIVITY incident'
);

select throws_ok(
  $$ select * from public.return_key(
       '55555555-5555-4555-8555-00000000005a', '55555555-5555-4555-8555-000000000002') $$,
  'P0013',
  'NO_VERIFICATION: a return code or an override reason is required',
  'return_key refuses a call with neither a code nor an override reason'
);

insert into public.requests
  (id, requester_id, key_id, type, requested_for, status, return_deadline)
values
  ('55555555-5555-4555-8555-000000000070', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000027', 'WEEKDAY', current_date, 'KEY_ISSUED',  now() + interval '1 day'),
  ('55555555-5555-4555-8555-000000000071', '55555555-5555-4555-8555-000000000003', '55555555-5555-4555-8555-000000000028', 'WEEKDAY', current_date, 'CODE_ISSUED', now() + interval '1 day'),
  ('55555555-5555-4555-8555-000000000072', '55555555-5555-4555-8555-000000000004', '55555555-5555-4555-8555-000000000029', 'WEEKDAY', current_date, 'KEY_ISSUED',  now() + interval '1 day');

create temp table t_d1 as
select * from public.request_return(
  '55555555-5555-4555-8555-000000000070', '55555555-5555-4555-8555-000000000003');

select matches(
  (select return_code from t_d1), '^[0-9]{6}$',
  'request_return mints a 6-digit return code'
);

select ok(
  (select return_code_expires_at from t_d1)
    between now() + interval '14 minutes' and now() + interval '16 minutes',
  'the return code expires 15 minutes out'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'RETURN_CODE_GENERATED' and target_type = 'request'
     and target_id = '55555555-5555-4555-8555-000000000070'),
  1,
  'request_return wrote one RETURN_CODE_GENERATED entry'
);

select throws_ok(
  $$ select * from public.request_return(
       '55555555-5555-4555-8555-000000000071', '55555555-5555-4555-8555-000000000003') $$,
  'P0009',
  'NOT_ISSUED: request is not in KEY_ISSUED state (current: CODE_ISSUED)',
  'request_return refuses a request that is not yet KEY_ISSUED'
);

select throws_ok(
  $$ select * from public.request_return(
       '55555555-5555-4555-8555-000000000072', '55555555-5555-4555-8555-000000000003') $$,
  'P0010',
  'FORBIDDEN: request does not belong to the caller',
  'request_return refuses a request that belongs to someone else'
);

select throws_ok(
  $$ select * from public.request_return(
       '55555555-5555-4555-8555-0000000000fe', '55555555-5555-4555-8555-000000000003') $$,
  'P0007',
  'NOT_FOUND: request 55555555-5555-4555-8555-0000000000fe does not exist',
  'request_return refuses an unknown request'
);

select * from finish();

rollback;
