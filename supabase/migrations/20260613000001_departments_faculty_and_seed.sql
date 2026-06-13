-- Migration: add faculty column to departments and seed Engineering + Management Sciences data
-- Adds a faculty grouping label used in the CSO provision-user dropdown.

-- 1. Add faculty column
alter table public.departments
  add column if not exists faculty text not null default '';

-- 2. Back-fill existing seed rows
update public.departments
set faculty = 'Faculty of Engineering'
where name in ('Computer Science', 'Electrical Engineering');

-- 3. Engineering departments
insert into public.departments (id, name, faculty)
values
  ('10000000-0000-4000-8000-000000000003', 'Civil & Environmental Engineering',    'Faculty of Engineering'),
  ('10000000-0000-4000-8000-000000000004', 'Computer Engineering',                 'Faculty of Engineering'),
  ('10000000-0000-4000-8000-000000000005', 'Mechanical Engineering',               'Faculty of Engineering'),
  ('10000000-0000-4000-8000-000000000006', 'Chemical Engineering',                 'Faculty of Engineering'),
  ('10000000-0000-4000-8000-000000000007', 'Metallurgical & Materials Engineering', 'Faculty of Engineering'),
  ('10000000-0000-4000-8000-000000000008', 'Systems Engineering',                  'Faculty of Engineering'),
  ('10000000-0000-4000-8000-000000000009', 'Surveying & Geoinformatics',           'Faculty of Engineering')
on conflict (name) do update set faculty = excluded.faculty;

-- 4. Management Sciences departments
insert into public.departments (id, name, faculty)
values
  ('10000000-0000-4000-8000-000000000010', 'Actuarial Science & Insurance',               'Faculty of Management Sciences'),
  ('10000000-0000-4000-8000-000000000011', 'Business Administration',                     'Faculty of Management Sciences'),
  ('10000000-0000-4000-8000-000000000012', 'Finance',                                     'Faculty of Management Sciences'),
  ('10000000-0000-4000-8000-000000000013', 'Industrial Relations & Personnel Management', 'Faculty of Management Sciences'),
  ('10000000-0000-4000-8000-000000000014', 'Marketing',                                   'Faculty of Management Sciences')
on conflict (name) do update set faculty = excluded.faculty;

-- 5. Keys — Engineering departments (New Senate zone)
insert into public.keys (id, code, zone, room_name, department_id, status)
values
  -- Civil & Environmental Engineering
  ('20000000-0000-4000-8000-000000000011', 'NC-101', 'NEW_SENATE', 'Civil Engineering Lab',             '10000000-0000-4000-8000-000000000003', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000012', 'NC-102', 'NEW_SENATE', 'Civil Engineering HOD Office',      '10000000-0000-4000-8000-000000000003', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000013', 'NC-103', 'NEW_SENATE', 'Civil Engineering Drawing Room',    '10000000-0000-4000-8000-000000000003', 'AVAILABLE'),
  -- Computer Engineering
  ('20000000-0000-4000-8000-000000000014', 'NCE-101', 'NEW_SENATE', 'Computer Engineering Lab 1',       '10000000-0000-4000-8000-000000000004', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000015', 'NCE-102', 'NEW_SENATE', 'Computer Engineering HOD Office',  '10000000-0000-4000-8000-000000000004', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000016', 'NCE-103', 'NEW_SENATE', 'Computer Engineering Server Room', '10000000-0000-4000-8000-000000000004', 'AVAILABLE'),
  -- Mechanical Engineering
  ('20000000-0000-4000-8000-000000000017', 'NM-101', 'NEW_SENATE', 'Mechanical Engineering Workshop',   '10000000-0000-4000-8000-000000000005', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000018', 'NM-102', 'NEW_SENATE', 'Mechanical Engineering Lab',        '10000000-0000-4000-8000-000000000005', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000019', 'NM-103', 'NEW_SENATE', 'Mechanical Engineering HOD Office', '10000000-0000-4000-8000-000000000005', 'AVAILABLE'),
  -- Chemical Engineering
  ('20000000-0000-4000-8000-000000000020', 'NCH-101', 'NEW_SENATE', 'Chemical Engineering Lab',         '10000000-0000-4000-8000-000000000006', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000021', 'NCH-102', 'NEW_SENATE', 'Chemical Engineering HOD Office',  '10000000-0000-4000-8000-000000000006', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000022', 'NCH-103', 'NEW_SENATE', 'Chemical Engineering Store',       '10000000-0000-4000-8000-000000000006', 'AVAILABLE'),
  -- Metallurgical & Materials Engineering
  ('20000000-0000-4000-8000-000000000023', 'NMT-101', 'NEW_SENATE', 'Metallurgy Lab',                   '10000000-0000-4000-8000-000000000007', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000024', 'NMT-102', 'NEW_SENATE', 'Materials Testing Room',           '10000000-0000-4000-8000-000000000007', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000025', 'NMT-103', 'NEW_SENATE', 'Metallurgy HOD Office',            '10000000-0000-4000-8000-000000000007', 'AVAILABLE'),
  -- Systems Engineering
  ('20000000-0000-4000-8000-000000000026', 'NSY-101', 'NEW_SENATE', 'Systems Engineering Lab',          '10000000-0000-4000-8000-000000000008', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000027', 'NSY-102', 'NEW_SENATE', 'Systems Engineering HOD Office',   '10000000-0000-4000-8000-000000000008', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000028', 'NSY-103', 'NEW_SENATE', 'Control Systems Room',             '10000000-0000-4000-8000-000000000008', 'AVAILABLE'),
  -- Surveying & Geoinformatics
  ('20000000-0000-4000-8000-000000000029', 'NSG-101', 'NEW_SENATE', 'Surveying Lab',                    '10000000-0000-4000-8000-000000000009', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000030', 'NSG-102', 'NEW_SENATE', 'GIS Room',                         '10000000-0000-4000-8000-000000000009', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000031', 'NSG-103', 'NEW_SENATE', 'Surveying HOD Office',             '10000000-0000-4000-8000-000000000009', 'AVAILABLE')
on conflict (code) do nothing;

-- 6. Keys — Management Sciences departments (Old Senate zone)
insert into public.keys (id, code, zone, room_name, department_id, status)
values
  -- Actuarial Science & Insurance
  ('20000000-0000-4000-8000-000000000032', 'OAS-101', 'OLD_SENATE', 'Actuarial Science Lab',             '10000000-0000-4000-8000-000000000010', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000033', 'OAS-102', 'OLD_SENATE', 'Actuarial Science HOD Office',      '10000000-0000-4000-8000-000000000010', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000034', 'OAS-103', 'OLD_SENATE', 'Insurance Seminar Room',            '10000000-0000-4000-8000-000000000010', 'AVAILABLE'),
  -- Business Administration
  ('20000000-0000-4000-8000-000000000035', 'OBA-101', 'OLD_SENATE', 'Business Admin Lecture Room',       '10000000-0000-4000-8000-000000000011', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000036', 'OBA-102', 'OLD_SENATE', 'Business Admin HOD Office',         '10000000-0000-4000-8000-000000000011', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000037', 'OBA-103', 'OLD_SENATE', 'Business Admin Conference Room',    '10000000-0000-4000-8000-000000000011', 'AVAILABLE'),
  -- Finance
  ('20000000-0000-4000-8000-000000000038', 'OFN-101', 'OLD_SENATE', 'Finance Lab',                       '10000000-0000-4000-8000-000000000012', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000039', 'OFN-102', 'OLD_SENATE', 'Finance HOD Office',                '10000000-0000-4000-8000-000000000012', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000040', 'OFN-103', 'OLD_SENATE', 'Finance Research Room',             '10000000-0000-4000-8000-000000000012', 'AVAILABLE'),
  -- Industrial Relations & Personnel Management
  ('20000000-0000-4000-8000-000000000041', 'OIR-101', 'OLD_SENATE', 'Industrial Relations Seminar Room', '10000000-0000-4000-8000-000000000013', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000042', 'OIR-102', 'OLD_SENATE', 'Industrial Relations HOD Office',   '10000000-0000-4000-8000-000000000013', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000043', 'OIR-103', 'OLD_SENATE', 'Personnel Management Lab',          '10000000-0000-4000-8000-000000000013', 'AVAILABLE'),
  -- Marketing
  ('20000000-0000-4000-8000-000000000044', 'OMK-101', 'OLD_SENATE', 'Marketing Lab',                     '10000000-0000-4000-8000-000000000014', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000045', 'OMK-102', 'OLD_SENATE', 'Marketing HOD Office',              '10000000-0000-4000-8000-000000000014', 'AVAILABLE'),
  ('20000000-0000-4000-8000-000000000046', 'OMK-103', 'OLD_SENATE', 'Marketing Research Room',           '10000000-0000-4000-8000-000000000014', 'AVAILABLE')
on conflict (code) do nothing;
