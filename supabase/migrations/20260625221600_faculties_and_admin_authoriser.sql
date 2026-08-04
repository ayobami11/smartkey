-- Backfilled from supabase_migrations.schema_migrations on 2026-08-04.
-- This migration was applied directly to the remote project (via the Supabase
-- dashboard or MCP) and was never committed. Recovered verbatim so that a fresh
-- replay of supabase/migrations/ reproduces production. Do not edit.

-- Migration: remodel keys around faculties + a CSO-authorised Administration group
create type public.department_authoriser as enum ('DEAN', 'CSO');

alter table public.departments
  add column authoriser public.department_authoriser not null default 'DEAN';

alter table public.keys
  add column key_count int not null default 1 check (key_count >= 1);

delete from public.requests;
delete from public.keys;
delete from public.departments;

insert into public.departments (id, name, faculty, authoriser)
values
  ('10000000-0000-4000-8000-000000000001', 'Faculty of Engineering',             'Faculty of Engineering',             'DEAN'),
  ('10000000-0000-4000-8000-000000000002', 'Faculty of Management Sciences',     'Faculty of Management Sciences',     'DEAN'),
  ('10000000-0000-4000-8000-000000000003', 'Faculty of Science',                 'Faculty of Science',                 'DEAN'),
  ('10000000-0000-4000-8000-000000000004', 'Faculty of Environmental Sciences',  'Faculty of Environmental Sciences',  'DEAN'),
  ('10000000-0000-4000-8000-0000000000a0', 'Administration',                     'Administration',                     'CSO');

insert into public.keys (code, zone, room_name, department_id, status, key_count)
values
  ('FENG-DEAN', 'OLD_SENATE', 'Engineering Dean''s Office',             '10000000-0000-4000-8000-000000000001', 'AVAILABLE', 1),
  ('FENG-PORT', 'OLD_SENATE', 'Engineering Porter''s Lodge',            '10000000-0000-4000-8000-000000000001', 'AVAILABLE', 1),
  ('FMGT-DEAN', 'OLD_SENATE', 'Management Sciences Dean''s Office',     '10000000-0000-4000-8000-000000000002', 'AVAILABLE', 1),
  ('FMGT-PORT', 'OLD_SENATE', 'Management Sciences Porter''s Lodge',    '10000000-0000-4000-8000-000000000002', 'AVAILABLE', 1),
  ('FSCI-DEAN', 'OLD_SENATE', 'Science Dean''s Office',                 '10000000-0000-4000-8000-000000000003', 'AVAILABLE', 1),
  ('FSCI-PORT', 'OLD_SENATE', 'Science Porter''s Lodge',                '10000000-0000-4000-8000-000000000003', 'AVAILABLE', 1),
  ('FENV-DEAN', 'OLD_SENATE', 'Environmental Sciences Dean''s Office',  '10000000-0000-4000-8000-000000000004', 'AVAILABLE', 1),
  ('FENV-PORT', 'OLD_SENATE', 'Environmental Sciences Porter''s Lodge', '10000000-0000-4000-8000-000000000004', 'AVAILABLE', 1);

insert into public.keys (code, zone, room_name, department_id, status, key_count)
values
  ('ADM-BUR',    'NEW_SENATE', 'Bursary',                            '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-VC',     'NEW_SENATE', 'Vice-Chancellor''s Office',          '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 2),
  ('ADM-DVCMS',  'NEW_SENATE', 'DVC (Management Services) Office',    '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-DVCAC',  'NEW_SENATE', 'DVC (Academics) Office',             '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-DVCDS',  'NEW_SENATE', 'DVC (Development & Services) Office', '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-REG',    'NEW_SENATE', 'Registrar''s Office',                '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-COUN',   'NEW_SENATE', 'Council Office',                     '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-APLAN',  'NEW_SENATE', 'Academic Planning',                  '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-REC',    'NEW_SENATE', 'Records Office',                     '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-LEGAL',  'NEW_SENATE', 'Legal Unit',                         '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-AAFF',   'NEW_SENATE', 'Academic Affairs',                   '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-NET',    'NEW_SENATE', 'Internet Room',                      '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-COMM',   'NEW_SENATE', 'Communication Unit',                 '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-PROC',   'NEW_SENATE', 'Procurement Unit',                   '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-SEC',    'NEW_SENATE', 'Security',                           '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1);

insert into public.keys (code, zone, room_name, department_id, status, key_count)
values
  ('ADM-CONF', 'OLD_SENATE', 'Confucius Institute', '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-BOOK', 'OLD_SENATE', 'Bookshop',            '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1),
  ('ADM-LIB',  'OLD_SENATE', 'Library',             '10000000-0000-4000-8000-0000000000a0', 'AVAILABLE', 1);