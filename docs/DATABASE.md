# Database schema

Authoritative schema lives in `supabase/migrations/`. This document is a human-readable summary; update it on every migration.

## Tables

### profiles

- `id` UUID PK (= auth.users.id)
- `role` enum: 'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER'
- `full_name` text
- `institutional_email` text unique
- `department_id` UUID FK (HODs and Requesters only)
- `photo_url` text nullable
- `signature_ref_url` text nullable (HODs only; Supabase Storage URL)
- `stamp_ref_url` text nullable (HODs only)
- `status` enum: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DEACTIVATED'
- `created_at` timestamptz
- `updated_at` timestamptz

### departments

- `id` UUID PK
- `name` text unique
- `hod_id` UUID FK profiles (nullable, set when HOD assigned)

### keys

- `id` UUID PK
- `code` text unique (e.g., 'NS-304')
- `zone` enum: 'NEW_SENATE' | 'OLD_SENATE'
- `room_name` text
- `department_id` UUID FK departments
- `status` enum: 'AVAILABLE' | 'ISSUED' | 'OVERDUE' | 'RETIRED'
- `retired_at` timestamptz nullable

### authorisations

- Composite PK (key_id, profile_id)
- `key_id` UUID FK keys
- `profile_id` UUID FK profiles (must be REQUESTER role)
- `authorised_by` UUID FK profiles (must be HOD role)
- `authorised_at` timestamptz
- Constraint: max 3 authorisations per key (enforced via trigger)

### requests

- `id` UUID PK
- `requester_id` UUID FK profiles
- `key_id` UUID FK keys
- `type` enum: 'WEEKDAY' | 'WEEKEND'
- `requested_for` date (weekday: today; weekend: future Sat/Sun)
- `status` enum: 'PENDING_HOD' (weekend only) | 'CODE_ISSUED' | 'KEY_ISSUED' | 'KEY_RETURNED' | 'EXPIRED' | 'CANCELLED' | 'DECLINED'
- `code` text (6-digit, only present in CODE_ISSUED state)
- `code_expires_at` timestamptz
- `return_deadline` timestamptz
- `risk_tier` enum: 'LOW' | 'MEDIUM' | 'HIGH' (computed at request time)
- `risk_factors` jsonb (array of {rule, description, weight})
- `hod_decision_id` UUID FK hod_decisions (weekend only)
- `issued_by` UUID FK profiles (verifier; nullable until issued)
- `issued_at` timestamptz nullable
- `returned_at` timestamptz nullable
- `created_at` timestamptz

### hod_decisions (weekend approvals)

- `id` UUID PK
- `request_id` UUID FK requests
- `hod_id` UUID FK profiles
- `decision` enum: 'APPROVED' | 'DECLINED'
- `note` text nullable
- `signature_verified` boolean (true if verification passed)
- `signature_mismatch_pct` numeric nullable
- `decided_at` timestamptz

### shifts

- `id` UUID PK
- `shift_number` int (1, 2, or 3)
- `started_at` timestamptz
- `ended_at` timestamptz nullable
- `primary_officer_id` UUID FK profiles
- `secondary_officer_id` UUID FK profiles nullable

### shift_handovers

- `id` UUID PK
- `outgoing_shift_id` UUID FK shifts
- `incoming_shift_id` UUID FK shifts
- `incoming_officer_id` UUID FK profiles
- `acknowledged_keys` jsonb (array of key_ids acknowledged)
- `bulk_acknowledged` boolean
- `acknowledged_at` timestamptz

### shift_reports

- `id` UUID PK
- `shift_id` UUID FK shifts unique
- `markdown` text (Gemini output)
- `timeline` jsonb (structured event timeline)
- `metadata` jsonb
- `generated_at` timestamptz
- IMMUTABLE after insert (RLS denies UPDATE)

### shift_report_comments

- `id` UUID PK
- `report_id` UUID FK shift_reports
- `author_id` UUID FK profiles (CSO only)
- `text` text
- `created_at` timestamptz
- IMMUTABLE after insert

### incidents

- `id` UUID PK
- `reference` text unique (e.g., 'INC-2026-0042')
- `shift_id` UUID FK shifts
- `logged_by` UUID FK profiles
- `type` enum: 'MISSING_KEY' | 'SUSPICIOUS_ACTIVITY' | 'EQUIPMENT_FAULT' | 'PROCEDURAL' | 'OTHER'
- `severity` enum: 'LOW' | 'MEDIUM' | 'HIGH'
- `description` text
- `related_key_id` UUID FK keys nullable
- `related_person_id` UUID FK profiles nullable
- `photo_url` text nullable
- `status` enum: 'OPEN' | 'RESOLVED' | 'ESCALATED'
- `occurred_at` timestamptz
- `logged_at` timestamptz

### audit_log

- `id` UUID PK
- `event` text (matches `AuditEvent` union in TS)
- `actor_id` UUID FK profiles
- `actor_role` enum (denormalised for query performance)
- `target_type` text
- `target_id` UUID
- `payload` jsonb (validated by zod schema in TS before write)
- `occurred_at` timestamptz
- IMMUTABLE — RLS denies UPDATE and DELETE for all roles including service.

## RPCs (Postgres functions)

These wrap multi-table mutations in transactions and enforce business rules.

- `create_request(key_id, return_time, type, weekend_date)` — creates request + audit entry; returns code.
- `issue_key(request_id, verifier_id)` — flips request status, sets issued_at, audit entry.
- `return_key(request_id, verifier_id, returner_id?)` — flips request status, sets returned_at, audit entry.
- `approve_weekend(request_id, hod_id, note?)` — runs signature verification, creates hod_decisions row, generates code, audit entry.
- `decline_weekend(request_id, hod_id, note?)` — creates hod_decisions row, audit entry.
- `acknowledge_shift_handover(outgoing_shift_id, key_ids, bulk)` — creates handover row, audit entry per key.
- `generate_shift_report(shift_id)` — server-side; calls Gemini, inserts shift_reports row, audit entry.
- `add_report_comment(report_id, text)` — inserts immutable comment, audit entry.
- `provision_user(name, email, role, department_id?)` — creates profile, generates activation token, queues email, audit entry.

## Migrations workflow

1. Create migration: `supabase migration new <name>`.
2. Write SQL.
3. Update RLS policies if any new table or column.
4. Update generated TS types: `pnpm db:types`.
5. Apply locally: `pnpm db:migrate`.
6. Update `docs/DATABASE.md` and `docs/CHANGELOG.md`.
