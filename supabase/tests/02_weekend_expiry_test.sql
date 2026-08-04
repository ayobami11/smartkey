-- ---------------------------------------------------------------------------
-- 02 — Weekend expiry: terminal-state transitions
--
-- Covers:
--   * the `requests_key_required_after_pending` CHECK constraint
--   * public.expire_stale_weekend_requests()
--
-- This is the rule that caused a live outage (docs/DATABASE.md, migration
-- 20260802223014_widen_requests_key_required_for_terminal_states.sql).
--
-- The failure mode, in full, because it is the thing these tests exist to stop
-- happening again:
--
--   A guest weekend request that is never approved has a NULL key_id — no Dean
--   ever assigned a key. The CHECK constraint originally only tolerated a NULL
--   key_id while the status was PENDING_HOD, so moving such a row to EXPIRED
--   violated the constraint. expire_stale_weekend_requests() loops over every
--   stale row inside a single transaction, so that one un-expirable row raised,
--   the whole batch rolled back, and *no* stale weekend request expired at all —
--   from the first lapsed guest request onwards. The Dean and CSO pending queues
--   filled with dead rows indefinitely.
--
-- So the batch test below deliberately puts the poison row *first* (it has the
-- oldest requested_for) and asserts that the other rows in the same batch still
-- expire. A test that only checked "a guest request can reach EXPIRED" would
-- miss the batch-abort half of the bug.
--
-- Everything runs inside one transaction and is rolled back at the end.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(18);

-- ---------------------------------------------------------------------------
-- expire_stale_weekend_requests() operates on the whole table, and its return
-- value is a global count. Park any pre-existing stale weekend rows out of
-- scope first (rolled back with everything else) so the count is deterministic
-- regardless of what seed or dev data the local database happens to hold.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- The CHECK constraint: a NULL key_id is tolerated in exactly the four terminal
-- states a guest request can reach before a Dean ever assigns a key.
-- ---------------------------------------------------------------------------

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
  'a request may not reach APPROVED without a key assigned'
);

select throws_ok(
  $$ update public.requests set status = 'CODE_ISSUED'
     where id = '22222222-2222-4222-8222-000000000064' $$,
  '23514',
  'a request may not reach CODE_ISSUED without a key assigned'
);

-- ---------------------------------------------------------------------------
-- The batch. Row 0050 is the poison row from the outage: a guest request,
-- never approved, NULL key_id, PENDING_HOD, and the oldest date in the batch
-- so the loop reaches it first.
-- ---------------------------------------------------------------------------

insert into public.requests
  (id, requester_id, guest_id, requested_unit_id, key_id, type, requested_for, status, code, code_expires_at, return_deadline)
values
  ('22222222-2222-4222-8222-000000000050', null, '22222222-2222-4222-8222-000000000040', '22222222-2222-4222-8222-000000000010', null,                                   'WEEKEND', current_date - 3, 'PENDING_HOD', null,     null,                        now() - interval '3 days'),
  ('22222222-2222-4222-8222-000000000051', '22222222-2222-4222-8222-000000000002', null, null, '22222222-2222-4222-8222-000000000030', 'WEEKEND', current_date - 2, 'APPROVED',    null,     null,                        now() - interval '2 days'),
  ('22222222-2222-4222-8222-000000000052', '22222222-2222-4222-8222-000000000002', null, null, '22222222-2222-4222-8222-000000000030', 'WEEKEND', current_date - 1, 'CODE_ISSUED', '654321', now() - interval '1 hour',   now() - interval '1 day'),
  -- Controls: a live weekend request and a stale *weekday* request. Neither is
  -- in scope for this function.
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

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Idempotency — the nightly sweep must be safe to re-run
-- ---------------------------------------------------------------------------

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
