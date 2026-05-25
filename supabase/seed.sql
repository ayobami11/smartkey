-- =============================================================================
-- SmartKey — Development Seed Data
-- =============================================================================
-- This seed populates local development with two departments and 10 sample
-- keys (5 per zone) so every role's dashboard renders real data immediately.
--
-- CSO PROFILE NOTE:
--   The CSO profile cannot be seeded here because it requires a corresponding
--   row in auth.users (managed by Supabase Auth). To create the CSO account
--   for local development, use one of:
--     a) Supabase Dashboard → Authentication → Users → "Add user"
--        Then run the INSERT into public.profiles below manually.
--     b) supabase auth admin: `supabase auth admin create-user --email cso@unilag.edu.ng`
--        Then run the INSERT into public.profiles below manually.
--   The UUID from auth.users must match the profiles.id FK.
--
-- HOD PROFILES NOTE:
--   Same constraint applies. Provision HOD auth accounts first, then update
--   the hod_id column on departments after the profiles exist.
--
-- This file is applied by: npm run db:migrate (which calls supabase db reset
-- in local dev, applying all migrations and then this seed file).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------
-- hod_id is left NULL; it is updated once HOD accounts are provisioned through
-- the application's CSO user-management flow.

insert into public.departments (id, name)
values
  ('11111111-0000-0000-0000-000000000001', 'Computer Science'),
  ('11111111-0000-0000-0000-000000000002', 'Electrical Engineering')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Keys — New Senate zone (NS-101 through NS-105)
-- ---------------------------------------------------------------------------

insert into public.keys (id, code, zone, room_name, department_id, status)
values
  (
    '22222222-0000-0000-0000-000000000001',
    'NS-101',
    'NEW_SENATE',
    'Computer Science Lab 1',
    '11111111-0000-0000-0000-000000000001',
    'AVAILABLE'
  ),
  (
    '22222222-0000-0000-0000-000000000002',
    'NS-102',
    'NEW_SENATE',
    'Computer Science Lab 2',
    '11111111-0000-0000-0000-000000000001',
    'AVAILABLE'
  ),
  (
    '22222222-0000-0000-0000-000000000003',
    'NS-103',
    'NEW_SENATE',
    'Computer Science HOD Office',
    '11111111-0000-0000-0000-000000000001',
    'AVAILABLE'
  ),
  (
    '22222222-0000-0000-0000-000000000004',
    'NS-104',
    'NEW_SENATE',
    'Computer Science Server Room',
    '11111111-0000-0000-0000-000000000001',
    'AVAILABLE'
  ),
  (
    '22222222-0000-0000-0000-000000000005',
    'NS-105',
    'NEW_SENATE',
    'Computer Science Conference Room',
    '11111111-0000-0000-0000-000000000001',
    'AVAILABLE'
  )
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Keys — Old Senate zone (OE-201 through OE-205)
-- ---------------------------------------------------------------------------

insert into public.keys (id, code, zone, room_name, department_id, status)
values
  (
    '22222222-0000-0000-0000-000000000006',
    'OE-201',
    'OLD_SENATE',
    'Electrical Engineering Lab 1',
    '11111111-0000-0000-0000-000000000002',
    'AVAILABLE'
  ),
  (
    '22222222-0000-0000-0000-000000000007',
    'OE-202',
    'OLD_SENATE',
    'Electrical Engineering Lab 2',
    '11111111-0000-0000-0000-000000000002',
    'AVAILABLE'
  ),
  (
    '22222222-0000-0000-0000-000000000008',
    'OE-203',
    'OLD_SENATE',
    'Electrical Engineering HOD Office',
    '11111111-0000-0000-0000-000000000002',
    'AVAILABLE'
  ),
  (
    '22222222-0000-0000-0000-000000000009',
    'OE-204',
    'OLD_SENATE',
    'Electrical Engineering Workshop',
    '11111111-0000-0000-0000-000000000002',
    'AVAILABLE'
  ),
  (
    '22222222-0000-0000-0000-000000000010',
    'OE-205',
    'OLD_SENATE',
    'Electrical Engineering Store',
    '11111111-0000-0000-0000-000000000002',
    'AVAILABLE'
  )
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- To create a CSO profile manually after provisioning the auth user:
-- ---------------------------------------------------------------------------
--
-- insert into public.profiles (id, role, full_name, institutional_email, status)
-- values (
--   '<uuid-from-auth.users>',
--   'CSO',
--   'Chief Security Officer',
--   'cso@unilag.edu.ng',
--   'ACTIVE'
-- );
