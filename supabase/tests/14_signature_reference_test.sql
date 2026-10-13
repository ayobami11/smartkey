-- ---------------------------------------------------------------------------
-- 14 — set_signature_reference and hold_signature_reference
--
-- POST /api/profile/signature verifies a Dean's replacement upload in
-- TypeScript and then either replaces the reference or holds the upload for
-- the CSO. These two RPCs make each outcome atomic with its audit entry.
--
-- They are SERVICE-ONLY: the verification is what makes them safe, so a Dean
-- session must not be able to call set_signature_reference and swap its own
-- reference past the check. The grant assertions come first for that reason.
-- They take the reference the upload was compared against and refuse
-- (CONFLICT) if it changed in the meantime.
-- ---------------------------------------------------------------------------

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

select plan(19);

insert into auth.users (id, email) values
  ('14141414-1414-4141-8141-000000000001', 'pgtap.sig.dean@example.test'),
  ('14141414-1414-4141-8141-000000000002', 'pgtap.sig.requester@example.test');

insert into public.units (id, name, faculty, authoriser) values
  ('14141414-1414-4141-8141-000000000010', 'pgTAP Signature Faculty', 'pgTAP Signature Faculty', 'DEAN');

insert into public.profiles (id, role, full_name, institutional_email, unit_id, status, signature_ref_url, stamp_ref_url) values
  ('14141414-1414-4141-8141-000000000001', 'DEAN',      'pgTAP Signature Dean',      'pgtap.sig.dean@example.test',      '14141414-1414-4141-8141-000000000010', 'ACTIVE',
   'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-old.png', null),
  ('14141414-1414-4141-8141-000000000002', 'REQUESTER', 'pgTAP Signature Requester', 'pgtap.sig.requester@example.test', '14141414-1414-4141-8141-000000000010', 'ACTIVE',
   null, null);

-- ---------------------------------------------------------------------------
-- Grants: service role only
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'public.set_signature_reference(uuid, text, text, text)', 'EXECUTE'),
  'a user session cannot set a signature reference directly'
);

select ok(
  not has_function_privilege('authenticated', 'public.hold_signature_reference(uuid, text, text, text, numeric, numeric)', 'EXECUTE'),
  'a user session cannot record a held reference directly'
);

select ok(
  not has_function_privilege('anon', 'public.set_signature_reference(uuid, text, text, text)', 'EXECUTE'),
  'anon cannot set a signature reference'
);

select ok(
  has_function_privilege('service_role', 'public.set_signature_reference(uuid, text, text, text)', 'EXECUTE'),
  'the service role (the API route) can set a signature reference'
);

-- ---------------------------------------------------------------------------
-- Validation and guards
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.set_signature_reference(
       '14141414-1414-4141-8141-000000000001', 'initials', 'https://x.test/new.png') $$,
  'P0004',
  'VALIDATION: type must be signature or stamp',
  'an unknown reference type is refused'
);

select throws_ok(
  $$ select * from public.set_signature_reference(
       '14141414-1414-4141-8141-000000000002', 'signature', 'https://x.test/new.png') $$,
  'P0002',
  'FORBIDDEN: only a Dean has a signature reference',
  'a non-Dean profile cannot be given a reference'
);

select throws_ok(
  $$ select * from public.set_signature_reference(
       '14141414-1414-4141-8141-000000000001', 'signature', 'https://x.test/new.png',
       'https://x.test/some-other-reference.png') $$,
  'P0006',
  'CONFLICT: the reference changed while the upload was being verified',
  'a replacement verified against a stale reference is refused'
);

select throws_ok(
  $$ select * from public.hold_signature_reference(
       '14141414-1414-4141-8141-000000000001', 'stamp', 'https://x.test/pending.png', null, 70, 55) $$,
  'P0004',
  'VALIDATION: a hold needs the reference it was compared against',
  'a hold without a compared reference is refused'
);

-- ---------------------------------------------------------------------------
-- Hold, then replace
-- ---------------------------------------------------------------------------

create temp table t_h1 as
select * from public.hold_signature_reference(
  '14141414-1414-4141-8141-000000000001', 'signature',
  'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-a.png',
  'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-old.png',
  70, 55);

select is(
  (select held_pending_url from t_h1),
  'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-a.png',
  'hold_signature_reference answers the held upload'
);

select is(
  (select count(*)::int from public.pending_signature_references
   where profile_id = '14141414-1414-4141-8141-000000000001' and type = 'signature' and mismatch_pct = 70),
  1,
  'the held upload is recorded for the CSO'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'SIGNATURE_MISMATCH'
     and target_id = '14141414-1414-4141-8141-000000000001'
     and payload->>'context' = 'reference_replacement'
     and payload->>'pending_url' like '%/signature-a.png'),
  1,
  'the hold and its SIGNATURE_MISMATCH entry commit together'
);

select lives_ok(
  $$ select * from public.hold_signature_reference(
       '14141414-1414-4141-8141-000000000001', 'signature',
       'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-b.png',
       'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-old.png',
       80, 55) $$,
  'a second held upload replaces the first'
);

create temp table t_s1 as
select * from public.set_signature_reference(
  '14141414-1414-4141-8141-000000000001', 'signature',
  'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-new.png',
  'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-old.png');

select is(
  (select cleared_pending from t_s1), true,
  'a passing replacement reports that it cleared the stale held upload'
);

select is(
  (select signature_ref_url from public.profiles where id = '14141414-1414-4141-8141-000000000001'),
  'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-new.png',
  'the reference is replaced'
);

select is(
  (select count(*)::int from public.pending_signature_references
   where profile_id = '14141414-1414-4141-8141-000000000001' and type = 'signature'),
  0,
  'the held upload compared against the old reference is gone'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'SIGNATURE_REFERENCE_UPDATED'
     and target_id = '14141414-1414-4141-8141-000000000001'
     and payload->>'type' = 'signature'
     and (payload->>'replaced_existing')::boolean),
  1,
  'the replacement and its SIGNATURE_REFERENCE_UPDATED entry commit together'
);

select throws_ok(
  $$ select * from public.hold_signature_reference(
       '14141414-1414-4141-8141-000000000001', 'signature',
       'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-c.png',
       'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/signature-old.png',
       90, 55) $$,
  'P0006',
  'CONFLICT: the reference changed while the upload was being verified',
  'an upload verified against the replaced reference cannot be held'
);

-- First stamp: nothing on file, so the compared reference is null.
select is(
  (select new_url from public.set_signature_reference(
     '14141414-1414-4141-8141-000000000001', 'stamp',
     'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/stamp-a.png')),
  'https://x.test/storage/v1/object/public/hod-signatures/14141414-1414-4141-8141-000000000001/stamp-a.png',
  'a first stamp reference is set when none was on file'
);

select is(
  (select count(*)::int from public.audit_log
   where event = 'SIGNATURE_REFERENCE_UPDATED'
     and target_id = '14141414-1414-4141-8141-000000000001'
     and payload->>'type' = 'stamp'
     and not (payload->>'replaced_existing')::boolean),
  1,
  'a first reference is audited as not replacing one'
);

select * from finish();
rollback;
