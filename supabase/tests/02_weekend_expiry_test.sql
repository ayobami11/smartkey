
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(18);


update public.requests
set    requested_for = current_date + 365
where  type = 'WEEKEND'
  and  requested_for < current_date
  and  status in ('PENDING_HOD', 'APPROVED', 'CODE_ISSUED');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('22222222-2222-4222-8222-000000000001', 'pgtap.expiry.dean@example.test'),
  ('22222222-2222-4222-8222-000000000002', 'pgtap.expiry.requester@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('22222222-2222-4222-8222-000000000010', 'pgTAP Faculty of Expiry', 'pgTAP Faculty of Expiry', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('22222222-2222-4222-8222-000000000001', 'DEAN',      'pgTAP Dean Expiry',      'pgtap.expiry.dean@example.test',      '22222222-2222-4222-8222-000000000010', 'ACTIVE'),
  ('22222222-2222-4222-8222-000000000002', 'REQUESTER', 'pgTAP Requester Expiry', 'pgtap.expiry.requester@example.test', '22222222-2222-4222-8222-000000000010', 'ACTIVE');

insert into public.keys (id, code, zone, room_name, unit_id, status) values
  ('22222222-2222-4222-8222-000000000030', 'PGT-201', 'NEW_SENATE', 'pgTAP Expiry Room', '22222222-2222-4222-8222-000000000010', 'AVAILABLE');

insert into public.guest_requesters (id, full_name, email, id_document_type, id_document_number) values
  ('22222222-2222-4222-8222-000000000040', 'pgTAP Guest Expiry', 'pgtap.expiry.guest@example.test', 'National ID', 'PGT-ID-201');

-- Constraint-probe rows. Dated in the future so the batch below ignores them —
-- these five exist purely to exercise the CHECK constraint directly.
insert into public.requests
  (id, guest_id, requested_unit_id, key_id, type, requested_for, status, return_deadline)
values
  ('22222222-2222-4222-8222-000000000060', '22222222-2222-4222-8222-000000000040', '22222222-2222-4222-8222-000000000010', null, 'WEEKEND', current_date + 10, 'PENDING_HOD', now() + interval '10 days'),
  ('22222222-2222-4222-8222-000000000061', '22222222-2222-4222-8222-000000000040', '22222222-2222-4222-8222-000000000010', null, 'WEEKEND', current_date + 10, 'PENDING_HOD', now() + interval '10 days'),
  ('22222222-2222-4222-8222-000000000062', '22222222-2222-4222-8222-000000000040', '22222222-2222-4222-8222-000000000010', null, 'WEEKEND', current_date + 10, 'PENDING_HOD', now() + interval '10 days'),
  ('22222222-2222-4222-8222-000000000063', '22222222-2222-4222-8222-000000000040', '22222222-2222-4222-8222-000000000010', null, 'WEEKEND', current_date + 10, 'PENDING_HOD', now() + interval '10 days'),
  ('22222222-2222-4222-8222-000000000064', '22222222-2222-4222-8222-000000000040', '22222222-2222-4222-8222-000000000010', null, 'WEEKEND', current_date + 10, 'PENDING_HOD', now() + interval '10 days');


select lives_ok(
  $$ update public.requests set status = 'EXPIRED'
     where id = '22222222-2222-4222-8222-000000000060' $$,
  'a guest request with a NULL key_id may move PENDING_HOD -> EXPIRED'
);

select lives_ok(
  $$ update public.requests set status = 'CANCELLED'
     where id = '22222222-2222-4222-8222-000000000061' $$,
  'a guest request with a NULL key_id may move PENDING_HOD -> CANCELLED'
);

select lives_ok(
  $$ update public.requests set status = 'DECLINED'
     where id = '22222222-2222-4222-8222-000000000062' $$,
  'a guest request with a NULL key_id may move PENDING_HOD -> DECLINED'
);

select throws_ok(
  $$ update public.requests set status = 'APPROVED'
     where id = '22222222-2222-4222-8222-000000000063' $$,
  '23514',
  'new row for relation "requests" violates check constraint "requests_key_required_after_pending"',
  'a request may not reach APPROVED without a key assigned'
);

select throws_ok(
  $$ update public.requests set status = 'CODE_ISSUED'
     where id = '22222222-2222-4222-8222-000000000064' $$,
  '23514',
  'new row for relation "requests" violates check constraint "requests_key_required_after_pending"',
  'a request may not reach CODE_ISSUED without a key assigned'
);


insert into public.requests
  (id, requester_id, guest_id, requested_unit_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline)
values
  ('22222222-2222-4222-8222-000000000050', null, '22222222-2222-4222-8222-000000000040', '22222222-2222-4222-8222-000000000010', null,                                   'WEEKEND', current_date - 3, 'PENDING_HOD', null,     null,                        now() - interval '3 days'),
  ('22222222-2222-4222-8222-000000000051', '22222222-2222-4222-8222-000000000002', null, null, '22222222-2222-4222-8222-000000000030', 'WEEKEND', current_date - 2, 'APPROVED',    null,     null,                        now() - interval '2 days'),
  ('22222222-2222-4222-8222-000000000052', '22222222-2222-4222-8222-000000000002', null, null, '22222222-2222-4222-8222-000000000030', 'WEEKEND', current_date - 1, 'CODE_ISSUED', '654321', now() - interval '1 hour',   now() - interval '1 day'),
  ('22222222-2222-4222-8222-000000000053', '22222222-2222-4222-8222-000000000002', null, null, '22222222-2222-4222-8222-000000000030', 'WEEKEND', current_date + 3, 'PENDING_HOD', null,     null,                        now() + interval '3 days'),
  ('22222222-2222-4222-8222-000000000054', '22222222-2222-4222-8222-000000000002', null, null, '22222222-2222-4222-8222-000000000030', 'WEEKDAY', current_date - 1, 'CODE_ISSUED', '111222', now() - interval '1 hour',   now() - interval '1 day');

select is(
  (select expired_count from public.expire_stale_weekend_requests()),
  3,
  'the batch expires all three stale weekend requests'
);

select is(
  (select status::text from public.requests where id = '22222222-2222-4222-8222-000000000050'),
  'EXPIRED',
  'the never-approved guest request (NULL key_id) expires cleanly'
);

select is(
  (select status::text from public.requests where id = '22222222-2222-4222-8222-000000000051'),
  'EXPIRED',
  'an APPROVED weekend request later in the same batch still expires'
);

select is(
  (select status::text from public.requests where id = '22222222-2222-4222-8222-000000000052'),
  'EXPIRED',
  'a CODE_ISSUED weekend request later in the same batch still expires'
);

select is(
  (select code from public.requests where id = '22222222-2222-4222-8222-000000000052'),
  null::text,
  'expiry clears the collection code'
);

select is(
  (select code_expires_at from public.requests where id = '22222222-2222-4222-8222-000000000052'),
  null::timestamptz,
  'expiry clears the code expiry timestamp'
);

select is(
  (select status::text from public.requests where id = '22222222-2222-4222-8222-000000000053'),
  'PENDING_HOD',
  'a weekend request whose date has not passed is left alone'
);

select is(
  (select status::text from public.requests where id = '22222222-2222-4222-8222-000000000054'),
  'CODE_ISSUED',
  'a stale WEEKDAY request is out of scope for this function'
);


select is(
  (select count(*)::int from public.audit_log
   where event = 'REQUEST_EXPIRED'
     and target_type = 'request'
     and payload->>'reason' = 'weekend_date_passed'
     and target_id in (
       '22222222-2222-4222-8222-000000000050',
       '22222222-2222-4222-8222-000000000051',
       '22222222-2222-4222-8222-000000000052')),
  3,
  'each expired request wrote one REQUEST_EXPIRED audit entry'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'REQUEST_EXPIRED'
     and target_id = '22222222-2222-4222-8222-000000000050'
     and actor_id is null
     and actor_role is null
     and actor_name = 'pgTAP Guest Expiry'
     and payload->>'external' = 'true'),
  1,
  'the guest expiry is audited through the guest writer (null actor, external flag)'
);

select is(
  (select actor_id from public.audit_log
   where event = 'REQUEST_EXPIRED'
     and target_id = '22222222-2222-4222-8222-000000000051'),
  '22222222-2222-4222-8222-000000000002'::uuid,
  'a registered requester expiry is audited against the requester profile'
);


select is(
  (select expired_count from public.expire_stale_weekend_requests()),
  0,
  'a second sweep finds nothing left to expire'
);

select is(
  (select count(*)::int from public.requests
   where id in (
     '22222222-2222-4222-8222-000000000050',
     '22222222-2222-4222-8222-000000000051',
     '22222222-2222-4222-8222-000000000052')
     and status = 'EXPIRED'),
  3,
  'the second sweep leaves the already-expired rows untouched'
);

select * from finish();

rollback;
