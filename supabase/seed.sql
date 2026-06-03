insert into public.departments (id, name)
values
  ('10000000-0000-4000-8000-000000000001', 'Computer Science'),
  ('10000000-0000-4000-8000-000000000002', 'Electrical Engineering')
on conflict (name) do nothing;

insert into public.keys (id, code, zone, room_name, department_id, status)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'NS-101',
    'NEW_SENATE',
    'Computer Science Lab 1',
    '10000000-0000-4000-8000-000000000001',
    'AVAILABLE'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'NS-102',
    'NEW_SENATE',
    'Computer Science Lab 2',
    '10000000-0000-4000-8000-000000000001',
    'AVAILABLE'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'NS-103',
    'NEW_SENATE',
    'Computer Science HOD Office',
    '10000000-0000-4000-8000-000000000001',
    'AVAILABLE'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    'NS-104',
    'NEW_SENATE',
    'Computer Science Server Room',
    '10000000-0000-4000-8000-000000000001',
    'AVAILABLE'
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    'NS-105',
    'NEW_SENATE',
    'Computer Science Conference Room',
    '10000000-0000-4000-8000-000000000001',
    'AVAILABLE'
  )
on conflict (code) do nothing;

insert into public.keys (id, code, zone, room_name, department_id, status)
values
  (
    '20000000-0000-4000-8000-000000000006',
    'OE-201',
    'OLD_SENATE',
    'Electrical Engineering Lab 1',
    '10000000-0000-4000-8000-000000000002',
    'AVAILABLE'
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    'OE-202',
    'OLD_SENATE',
    'Electrical Engineering Lab 2',
    '10000000-0000-4000-8000-000000000002',
    'AVAILABLE'
  ),
  (
    '20000000-0000-4000-8000-000000000008',
    'OE-203',
    'OLD_SENATE',
    'Electrical Engineering HOD Office',
    '10000000-0000-4000-8000-000000000002',
    'AVAILABLE'
  ),
  (
    '20000000-0000-4000-8000-000000000009',
    'OE-204',
    'OLD_SENATE',
    'Electrical Engineering Workshop',
    '10000000-0000-4000-8000-000000000002',
    'AVAILABLE'
  ),
  (
    '20000000-0000-4000-8000-000000000010',
    'OE-205',
    'OLD_SENATE',
    'Electrical Engineering Store',
    '10000000-0000-4000-8000-000000000002',
    'AVAILABLE'
  )
on conflict (code) do nothing;
