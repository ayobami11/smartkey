-- ---------------------------------------------------------------------------
-- 01 — Authorisation slots: max 3 collectors per key
--
-- Covers:
--   * the `authorisations_max_three` BEFORE INSERT trigger
--     (public.check_authorisation_limit)
--   * public.nominate_collector(p_key_id, p_requester_id)
--   * public.remove_collector(p_key_id, p_requester_id)
--
-- The 3-collector limit is a business rule the product depends on
-- (docs/GLOSSARY.md "Authorisation slot"). It is enforced in two independent
-- places — a pre-flight count inside the RPC, and a row trigger that catches a
-- direct INSERT — and both are asserted here.
--
-- `nominate_collector` reads the actor from auth.uid(), so the tests set
-- `request.jwt.claims` rather than switching Postgres roles. The RPC is
-- SECURITY DEFINER, so it still runs with owner privileges; this file is about
-- the RPC's own gate and the trigger, not about RLS.
--
-- Everything runs inside one transaction and is rolled back at the end, so the
-- file is independent of the other test files and re-runnable.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-000000000001', 'pgtap.slots.dean@example.test'),
  ('11111111-1111-4111-8111-000000000021', 'pgtap.slots.r1@example.test'),
  ('11111111-1111-4111-8111-000000000022', 'pgtap.slots.r2@example.test'),
  ('11111111-1111-4111-8111-000000000023', 'pgtap.slots.r3@example.test'),
  ('11111111-1111-4111-8111-000000000024', 'pgtap.slots.r4@example.test'),
  ('11111111-1111-4111-8111-000000000025', 'pgtap.slots.r5@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('11111111-1111-4111-8111-000000000010', 'pgTAP Faculty of Slots', 'pgTAP Faculty of Slots', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('11111111-1111-4111-8111-000000000001', 'DEAN', 'pgTAP Dean Slots', 'pgtap.slots.dean@example.test', '11111111-1111-4111-8111-000000000010', 'ACTIVE'),
  ('11111111-1111-4111-8111-000000000021', 'REQUESTER', 'pgTAP Requester One',   'pgtap.slots.r1@example.test', '11111111-1111-4111-8111-000000000010', 'ACTIVE'),
  ('11111111-1111-4111-8111-000000000022', 'REQUESTER', 'pgTAP Requester Two',   'pgtap.slots.r2@example.test', '11111111-1111-4111-8111-000000000010', 'ACTIVE'),
  ('11111111-1111-4111-8111-000000000023', 'REQUESTER', 'pgTAP Requester Three', 'pgtap.slots.r3@example.test', '11111111-1111-4111-8111-000000000010', 'ACTIVE'),
  ('11111111-1111-4111-8111-000000000024', 'REQUESTER', 'pgTAP Requester Four',  'pgtap.slots.r4@example.test', '11111111-1111-4111-8111-000000000010', 'ACTIVE'),
  -- Deliberately not ACTIVE: nominate_collector must refuse this one.
  ('11111111-1111-4111-8111-000000000025', 'REQUESTER', 'pgTAP Requester Five',  'pgtap.slots.r5@example.test', '11111111-1111-4111-8111-000000000010', 'DEACTIVATED');

update public.units
set    hod_id = '11111111-1111-4111-8111-000000000001'
where  id = '11111111-1111-4111-8111-000000000010';

insert into public.keys (id, code, zone, room_name, unit_id, status) values
  ('11111111-1111-4111-8111-000000000030', 'PGT-101', 'NEW_SENATE', 'pgTAP Slots Room', '11111111-1111-4111-8111-000000000010', 'AVAILABLE');

-- Act as the faculty Dean for every nominate/remove call below.
do $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',  '11111111-1111-4111-8111-000000000001',
      'role', 'authenticated'
    )::text,
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The trigger is actually attached
-- ---------------------------------------------------------------------------

select has_trigger(
  'public', 'authorisations', 'authorisations_max_three',
  'authorisations carries the max-3 BEFORE INSERT trigger'
);

-- ---------------------------------------------------------------------------
-- Three nominations fill the three slots
-- ---------------------------------------------------------------------------

select is(
  (select slot_number from public.nominate_collector(
     '11111111-1111-4111-8111-000000000030',
     '11111111-1111-4111-8111-000000000021')),
  1,
  'first nomination fills slot 1'
);

select is(
  (select slot_number from public.nominate_collector(
     '11111111-1111-4111-8111-000000000030',
     '11111111-1111-4111-8111-000000000022')),
  2,
  'second nomination fills slot 2'
);

select is(
  (select slot_number from public.nominate_collector(
     '11111111-1111-4111-8111-000000000030',
     '11111111-1111-4111-8111-000000000023')),
  3,
  'third nomination fills slot 3'
);

select is(
  (select count(*)::int from public.authorisations
   where key_id = '11111111-1111-4111-8111-000000000030'),
  3,
  'exactly three authorisations exist for the key'
);

-- ---------------------------------------------------------------------------
-- The fourth is refused — by the RPC, and by the trigger if the RPC is bypassed
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.nominate_collector(
       '11111111-1111-4111-8111-000000000030',
       '11111111-1111-4111-8111-000000000024') $$,
  'P0009',
  'CONFLICT: three authorisation slots are already filled',
  'nominate_collector refuses a fourth collector'
);

select throws_ok(
  $$ select * from public.nominate_collector(
       '11111111-1111-4111-8111-000000000030',
       '11111111-1111-4111-8111-000000000021') $$,
  'P0009',
  'CONFLICT: requester is already authorised for this key',
  'nominate_collector refuses a duplicate collector'
);

-- Bypass the RPC entirely: the row trigger is the last line of defence.
select throws_ok(
  $$ insert into public.authorisations (key_id, profile_id, authorised_by)
     values ('11111111-1111-4111-8111-000000000030',
             '11111111-1111-4111-8111-000000000024',
             '11111111-1111-4111-8111-000000000001') $$,
  '23514',
  'the max-3 trigger rejects a direct fourth INSERT that bypasses the RPC'
);

-- ---------------------------------------------------------------------------
-- remove_collector frees a slot
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.remove_collector(
       '11111111-1111-4111-8111-000000000030',
       '11111111-1111-4111-8111-000000000023') $$,
  'remove_collector removes an existing authorisation'
);

select is(
  (select count(*)::int from public.authorisations
   where key_id = '11111111-1111-4111-8111-000000000030'),
  2,
  'removing a collector leaves two authorisations'
);

select is(
  (select slot_number from public.nominate_collector(
     '11111111-1111-4111-8111-000000000030',
     '11111111-1111-4111-8111-000000000024')),
  3,
  'the freed slot can be filled by a new collector'
);

select throws_ok(
  $$ select public.remove_collector(
       '11111111-1111-4111-8111-000000000030',
       '11111111-1111-4111-8111-000000000023') $$,
  'P0003',
  'NOT_FOUND: authorisation does not exist',
  'remove_collector rejects a collector who holds no slot'
);

-- ---------------------------------------------------------------------------
-- Guard rails around who may be nominated, and for what
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.nominate_collector(
       '11111111-1111-4111-8111-000000000030',
       '11111111-1111-4111-8111-000000000025') $$,
  'P0004',
  'REQUESTER_INACTIVE: user is not an active requester',
  'nominate_collector refuses a non-ACTIVE requester'
);

select throws_ok(
  $$ select * from public.nominate_collector(
       '11111111-1111-4111-8111-0000000000ff',
       '11111111-1111-4111-8111-000000000021') $$,
  'P0003',
  'NOT_FOUND: key does not exist',
  'nominate_collector refuses an unknown key'
);

-- ---------------------------------------------------------------------------
-- Every successful mutation left an audit entry
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.audit_log
   where event = 'COLLECTOR_NOMINATED'
     and target_type = 'authorisation'
     and target_id = '11111111-1111-4111-8111-000000000030'),
  4,
  'four successful nominations wrote four COLLECTOR_NOMINATED entries'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'COLLECTOR_REMOVED'
     and target_type = 'authorisation'
     and target_id = '11111111-1111-4111-8111-000000000030'),
  1,
  'the successful removal wrote one COLLECTOR_REMOVED entry'
);

select * from finish();

rollback;
