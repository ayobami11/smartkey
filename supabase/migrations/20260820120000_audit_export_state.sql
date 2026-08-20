create table public.audit_export_state (
  id uuid primary key default '00000000-0000-0000-0000-000000000003',
  last_exported_through timestamptz not null default '2000-01-01T00:00:00Z',
  last_run_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint audit_export_state_singleton check (id = '00000000-0000-0000-0000-000000000003')
);

insert into public.audit_export_state (id) values ('00000000-0000-0000-0000-000000000003');

alter table public.audit_export_state enable row level security;

