-- ---------------------------------------------------------------------------
-- 04 — The authoriser gate (Dean vs CSO)
--
-- Covers the actor check on:
--   * public.nominate_collector / public.remove_collector
--   * public.approve_weekend / public.decline_weekend
--   * public.dismiss_expired_request
--
-- The rule (docs/DATABASE.md, `units.authoriser`): a faculty's keys are
-- authorised by that faculty's Dean; the 'Administration' group has no Dean and
-- its keys are authorised by the CSO. Crossing either way must be refused —
-- a Dean acting on another faculty's key, a Dean acting on an Administration
-- key, or the CSO acting in a Dean's place on a faculty key.
--
-- The one sanctioned crossing is `cso_override`, and only for a faculty request
-- that is already held on a recorded SIGNATURE_MISMATCH. That is asserted both
-- ways: refused without the audit entry on record, permitted with it.
--
-- NOTE on how the actor is determined, because it differs per RPC and the tests
-- reflect it rather than paper over it:
--   * nominate_collector / remove_collector read the actor from auth.uid(), so
--     those tests set `request.jwt.claims`.
--   * approve_weekend / decline_weekend / dismiss_expired_request take the
--     actor as a *parameter* (p_hod_id / p_actor_id) and look the role up from
--     it. approve_weekend/decline_weekend compute
--     `coalesce(auth.uid(), p_hod_id)` but then never use it — the gate is
--     entirely parameter-driven. The route handlers are what bind that
--     parameter to the verified session; the database does not re-derive it.
--
-- Everything runs inside one transaction and is rolled back at the end.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures: two faculties (Dean-authorised) and one Administration group
-- (CSO-authorised).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('44444444-4444-4444-8444-000000000001', 'pgtap.gate.deana@example.test'),
  ('44444444-4444-4444-8444-000000000002', 'pgtap.gate.deanb@example.test'),
  ('44444444-4444-4444-8444-000000000003', 'pgtap.gate.cso@example.test'),
  ('44444444-4444-4444-8444-000000000004', 'pgtap.gate.requester@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('44444444-4444-4444-8444-000000000010', 'pgTAP Faculty Alpha',  'pgTAP Faculty Alpha',  'DEAN'),
  ('44444444-4444-4444-8444-000000000011', 'pgTAP Faculty Beta',   'pgTAP Faculty Beta',   'DEAN'),
  ('44444444-4444-4444-8444-000000000012', 'pgTAP Administration', 'pgTAP Administration', 'CSO');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status) values
  ('44444444-4444-4444-8444-000000000001', 'DEAN',      'pgTAP Dean Alpha',     'pgtap.gate.deana@example.test',     '44444444-4444-4444-8444-000000000010', 'ACTIVE'),
  ('44444444-4444-4444-8444-000000000002', 'DEAN',      'pgTAP Dean Beta',      'pgtap.gate.deanb@example.test',     '44444444-4444-4444-8444-000000000011', 'ACTIVE'),
  ('44444444-4444-4444-8444-000000000003', 'CSO',       'pgTAP CSO Gate',       'pgtap.gate.cso@example.test',       null,                                   'ACTIVE'),
  ('44444444-4444-4444-8444-000000000004', 'REQUESTER', 'pgTAP Requester Gate', 'pgtap.gate.requester@example.test', '44444444-4444-4444-8444-000000000010', 'ACTIVE');

update public.units set hod_id = '44444444-4444-4444-8444-000000000001' where id = '44444444-4444-4444-8444-000000000010';
update public.units set hod_id = '44444444-4444-4444-8444-000000000002' where id = '44444444-4444-4444-8444-000000000011';

insert into public.keys (id, code, zone, room_name, unit_id, status) values
  ('44444444-4444-4444-8444-000000000020', 'PGT-401', 'NEW_SENATE', 'pgTAP Alpha Office', '44444444-4444-4444-8444-000000000010', 'AVAILABLE'),
  ('44444444-4444-4444-8444-000000000021', 'PGT-402', 'NEW_SENATE', 'pgTAP Beta Office',  '44444444-4444-4444-8444-000000000011', 'AVAILABLE'),
  ('44444444-4444-4444-8444-000000000022', 'PGT-403', 'OLD_SENATE', 'pgTAP Registry',     '44444444-4444-4444-8444-000000000012', 'AVAILABLE');

insert into public.guest_requesters (id, full_name, email, id_document_type, id_document_number) values
  ('44444444-4444-4444-8444-000000000040', 'pgTAP Guest Alpha', 'pgtap.gate.guest1@example.test', 'National ID', 'PGT-ID-401'),
  ('44444444-4444-4444-8444-000000000041', 'pgTAP Guest Admin', 'pgtap.gate.guest2@example.test', 'Passport',    'PGT-ID-402');

insert into public.requests
  (id, requester_id, guest_id, requested_unit_id, key_id, type, requested_for, status, return_deadline)
values
  -- Live faculty requests, awaiting a decision.
  ('44444444-4444-4444-8444-000000000030', '44444444-4444-4444-8444-000000000004', null, null, '44444444-4444-4444-8444-000000000020', 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days'),
  -- Live Administration request.
  ('44444444-4444-4444-8444-000000000031', '44444444-4444-4444-8444-000000000004', null, null, '44444444-4444-4444-8444-000000000022', 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days'),
  -- Faculty request held on a signature mismatch; the CSO override target.
  ('44444444-4444-4444-8444-000000000032', '44444444-4444-4444-8444-000000000004', null, null, '44444444-4444-4444-8444-000000000020', 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days'),
  -- Faculty request for the decline path.
  ('44444444-4444-4444-8444-000000000033', '44444444-4444-4444-8444-000000000004', null, null, '44444444-4444-4444-8444-000000000020', 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days'),
  -- Guest request routed to Faculty Alpha by requested_unit_id, no key yet.
  ('44444444-4444-4444-8444-000000000034', null, '44444444-4444-4444-8444-000000000040', '44444444-4444-4444-8444-000000000010', null, 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days'),
  -- Lapsed faculty request, for the dismiss path.
  ('44444444-4444-4444-8444-000000000035', '44444444-4444-4444-8444-000000000004', null, null, '44444444-4444-4444-8444-000000000020', 'WEEKEND', current_date - 2, 'PENDING_HOD', now() - interval '2 days'),
  -- Lapsed guest request routed to Administration, for the CSO dismiss path.
  ('44444444-4444-4444-8444-000000000036', null, '44444444-4444-4444-8444-000000000041', '44444444-4444-4444-8444-000000000012', null, 'WEEKEND', current_date - 2, 'PENDING_HOD', now() - interval '2 days'),
  -- Still live: must not be dismissable.
  ('44444444-4444-4444-8444-000000000037', '44444444-4444-4444-8444-000000000004', null, null, '44444444-4444-4444-8444-000000000020', 'WEEKEND', current_date + 2, 'PENDING_HOD', now() + interval '2 days');

-- The recorded mismatch that makes the CSO override legitimate for request 0032.
insert into public.audit_log (event, actor_id, actor_role, actor_name, target_type, target_id, payload) values
  ('SIGNATURE_MISMATCH', '44444444-4444-4444-8444-000000000001', 'DEAN', 'pgTAP Dean Alpha',
   'request', '44444444-4444-4444-8444-000000000032', '{"mismatch_pct": 61.2}'::jsonb);

-- ---------------------------------------------------------------------------
-- nominate_collector / remove_collector — actor comes from auth.uid()
-- ---------------------------------------------------------------------------

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-8444-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.nominate_collector(
       '44444444-4444-4444-8444-000000000021',
       '44444444-4444-4444-8444-000000000004') $$,
  'P0002',
  'FORBIDDEN: key does not belong to your department',
  'a Dean cannot nominate a collector for another faculty''s key'
);

select throws_ok(
  $$ select * from public.nominate_collector(
       '44444444-4444-4444-8444-000000000022',
       '44444444-4444-4444-8444-000000000004') $$,
  'P0002',
  'FORBIDDEN: only the CSO can authorise collectors for administrative keys',
  'a Dean cannot nominate a collector for an Administration key'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-8444-000000000003', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select * from public.nominate_collector(
       '44444444-4444-4444-8444-000000000020',
       '44444444-4444-4444-8444-000000000004') $$,
  'P0002',
  'FORBIDDEN: key does not belong to your department',
  'the CSO cannot nominate a collector for a Dean-authorised faculty key'
);

select is(
  (select slot_number from public.nominate_collector(
     '44444444-4444-4444-8444-000000000022',
     '44444444-4444-4444-8444-000000000004')),
  1,
  'the CSO can nominate a collector for an Administration key'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-8444-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

select is(
  (select slot_number from public.nominate_collector(
     '44444444-4444-4444-8444-000000000020',
     '44444444-4444-4444-8444-000000000004')),
  1,
  'a Dean can nominate a collector for their own faculty''s key'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-8444-000000000002', 'role', 'authenticated')::text, true);
end;
$$;

select throws_ok(
  $$ select public.remove_collector(
       '44444444-4444-4444-8444-000000000020',
       '44444444-4444-4444-8444-000000000004') $$,
  'P0002',
  'FORBIDDEN: key does not belong to your department',
  'a Dean cannot remove a collector from another faculty''s key'
);

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-8444-000000000001', 'role', 'authenticated')::text, true);
end;
$$;

select lives_ok(
  $$ select public.remove_collector(
       '44444444-4444-4444-8444-000000000020',
       '44444444-4444-4444-8444-000000000004') $$,
  'a Dean can remove a collector from their own faculty''s key'
);

-- ---------------------------------------------------------------------------
-- approve_weekend — actor comes from p_hod_id
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.approve_weekend(
       '44444444-4444-4444-8444-000000000030',
       '44444444-4444-4444-8444-000000000002') $$,
  'P0002',
  'FORBIDDEN: Dean department does not match key department',
  'a Dean cannot approve a weekend request for another faculty''s key'
);

select throws_ok(
  $$ select * from public.approve_weekend(
       '44444444-4444-4444-8444-000000000030',
       '44444444-4444-4444-8444-000000000003') $$,
  'P0002',
  'FORBIDDEN: Dean department does not match key department',
  'the CSO cannot approve a faculty weekend request in the Dean''s place'
);

select throws_ok(
  $$ select * from public.approve_weekend(
       '44444444-4444-4444-8444-000000000030',
       '44444444-4444-4444-8444-000000000003',
       null, true, null, true) $$,
  'P0002',
  'FORBIDDEN: no signature mismatch on record for this request',
  'cso_override is refused when no SIGNATURE_MISMATCH is on record'
);

select lives_ok(
  $$ select * from public.approve_weekend(
       '44444444-4444-4444-8444-000000000030',
       '44444444-4444-4444-8444-000000000001') $$,
  'the faculty''s own Dean can approve the weekend request'
);

select is(
  (select status::text from public.requests where id = '44444444-4444-4444-8444-000000000030'),
  'APPROVED',
  'the approved weekend request moves to APPROVED (no code is minted here)'
);

select throws_ok(
  $$ select * from public.approve_weekend(
       '44444444-4444-4444-8444-000000000031',
       '44444444-4444-4444-8444-000000000001') $$,
  'P0002',
  'FORBIDDEN: only the CSO can approve administrative requests',
  'a Dean cannot approve an Administration weekend request'
);

select lives_ok(
  $$ select * from public.approve_weekend(
       '44444444-4444-4444-8444-000000000031',
       '44444444-4444-4444-8444-000000000003') $$,
  'the CSO can approve an Administration weekend request'
);

select is(
  (select status::text from public.requests where id = '44444444-4444-4444-8444-000000000031'),
  'APPROVED',
  'the Administration weekend request moves to APPROVED'
);

select lives_ok(
  $$ select * from public.approve_weekend(
       '44444444-4444-4444-8444-000000000032',
       '44444444-4444-4444-8444-000000000003',
       null, true, null, true) $$,
  'the CSO can override a faculty approval held on a recorded signature mismatch'
);

select is(
  (select status::text from public.requests where id = '44444444-4444-4444-8444-000000000032'),
  'APPROVED',
  'the overridden request moves to APPROVED'
);

select is(
  (select payload->>'override' from public.audit_log
   where event = 'HOD_APPROVED'
     and target_id = '44444444-4444-4444-8444-000000000032'),
  'true',
  'the override is recorded in the HOD_APPROVED audit payload'
);

-- ---------------------------------------------------------------------------
-- decline_weekend — same gate, and it routes guests by requested_unit_id
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.decline_weekend(
       '44444444-4444-4444-8444-000000000033',
       '44444444-4444-4444-8444-000000000002') $$,
  'P0002',
  'FORBIDDEN: request does not belong to your department',
  'a Dean cannot decline a weekend request for another faculty''s key'
);

select lives_ok(
  $$ select * from public.decline_weekend(
       '44444444-4444-4444-8444-000000000033',
       '44444444-4444-4444-8444-000000000001') $$,
  'the faculty''s own Dean can decline the weekend request'
);

select is(
  (select status::text from public.requests where id = '44444444-4444-4444-8444-000000000033'),
  'DECLINED',
  'the declined weekend request moves to DECLINED'
);

select throws_ok(
  $$ select * from public.decline_weekend(
       '44444444-4444-4444-8444-000000000034',
       '44444444-4444-4444-8444-000000000002') $$,
  'P0002',
  'FORBIDDEN: request does not belong to your department',
  'a guest request with no key yet is still gated by requested_unit_id'
);

select lives_ok(
  $$ select * from public.decline_weekend(
       '44444444-4444-4444-8444-000000000034',
       '44444444-4444-4444-8444-000000000001') $$,
  'the Dean of the routed faculty can decline a keyless guest request'
);

select is(
  (select status::text from public.requests where id = '44444444-4444-4444-8444-000000000034'),
  'DECLINED',
  'the declined guest request reaches DECLINED with a NULL key_id'
);

-- ---------------------------------------------------------------------------
-- dismiss_expired_request — actor comes from p_actor_id
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.dismiss_expired_request(
       '44444444-4444-4444-8444-000000000035',
       '44444444-4444-4444-8444-000000000002') $$,
  'P0002',
  'FORBIDDEN: request does not belong to your faculty',
  'a Dean cannot dismiss a lapsed request from another faculty'
);

select is(
  (select status from public.dismiss_expired_request(
     '44444444-4444-4444-8444-000000000035',
     '44444444-4444-4444-8444-000000000001')),
  'EXPIRED',
  'the faculty''s own Dean can dismiss a lapsed request'
);

select is(
  (select status from public.dismiss_expired_request(
     '44444444-4444-4444-8444-000000000036',
     '44444444-4444-4444-8444-000000000003')),
  'EXPIRED',
  'the CSO can dismiss a lapsed Administration guest request'
);

select throws_ok(
  $$ select * from public.dismiss_expired_request(
       '44444444-4444-4444-8444-000000000037',
       '44444444-4444-4444-8444-000000000001') $$,
  'P0006',
  'CONFLICT: the requested date has not passed yet',
  'a live request must be approved or declined, not dismissed'
);

select * from finish();

rollback;
