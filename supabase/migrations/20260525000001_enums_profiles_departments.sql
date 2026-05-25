-- =============================================================================
-- Migration: enums, profiles, departments
-- =============================================================================
-- Creates all custom enum types used across the schema, then the two
-- foundational tables — departments and profiles — which have a circular
-- foreign-key dependency that is resolved by:
--   1. Creating departments WITHOUT hod_id.
--   2. Creating profiles (FK → departments, FK → auth.users).
--   3. ALTER departments ADD COLUMN hod_id (FK → profiles).
-- Also installs an updated_at trigger on profiles.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('CSO', 'HOD', 'VERIFIER', 'REQUESTER');

create type public.user_status as enum (
  'PENDING_ACTIVATION',
  'ACTIVE',
  'DEACTIVATED'
);

create type public.zone as enum ('NEW_SENATE', 'OLD_SENATE');

create type public.key_status as enum (
  'AVAILABLE',
  'ISSUED',
  'OVERDUE',
  'RETIRED'
);

create type public.request_type as enum ('WEEKDAY', 'WEEKEND');

create type public.request_status as enum (
  'PENDING_HOD',
  'CODE_ISSUED',
  'KEY_ISSUED',
  'KEY_RETURNED',
  'EXPIRED',
  'CANCELLED',
  'DECLINED'
);

create type public.risk_tier as enum ('LOW', 'MEDIUM', 'HIGH');

create type public.hod_decision as enum ('APPROVED', 'DECLINED');

create type public.incident_type as enum (
  'MISSING_KEY',
  'SUSPICIOUS_ACTIVITY',
  'EQUIPMENT_FAULT',
  'PROCEDURAL',
  'OTHER'
);

create type public.incident_severity as enum ('LOW', 'MEDIUM', 'HIGH');

create type public.incident_status as enum ('OPEN', 'RESOLVED', 'ESCALATED');

-- ---------------------------------------------------------------------------
-- departments (hod_id added after profiles is created)
-- ---------------------------------------------------------------------------

create table public.departments (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table public.departments enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  role                public.user_role    not null,
  full_name           text                not null,
  institutional_email text                not null unique,
  department_id       uuid                references public.departments(id) on delete set null,
  photo_url           text,
  -- HOD-only fields for signature verification (Supabase Storage URLs)
  signature_ref_url   text,
  stamp_ref_url       text,
  status              public.user_status  not null default 'PENDING_ACTIVATION',
  created_at          timestamptz         not null default now(),
  updated_at          timestamptz         not null default now()
);

alter table public.profiles enable row level security;

-- Index: role-based queries are very common across RLS policies and API routes
create index idx_profiles_role on public.profiles(role);
-- Index: department lookups (HOD sees all dept members)
create index idx_profiles_department_id on public.profiles(department_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for profiles
-- ---------------------------------------------------------------------------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- ALTER departments: add hod_id (FK → profiles, circular dep resolved)
-- ---------------------------------------------------------------------------

alter table public.departments
  add column hod_id uuid references public.profiles(id) on delete set null;

-- Index: quickly find which department a HOD belongs to
create index idx_departments_hod_id on public.departments(hod_id);
