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

### guest_requesters

An external (non-registered) person who may collect a key for a single weekend. Guests are never a `profiles`/`auth.users` row (that would require an auth user and break the `invited_by` chain-of-trust); they are modelled as their own entity. RLS: CSO reads all. HOD reads guests whose request is routed to their department (`requested_department_id` or key's `department_id`). VERIFIER reads guests where a `CODE_ISSUED` or `KEY_ISSUED` request exists (operational need only).

- `id` UUID PK
- `full_name` text
- `email` text
- `phone` text nullable
- `id_document_type` text (ID document the guest declares at submit; the verifier checks the physical ID at the desk)
- `id_document_number` text
- `created_at` timestamptz

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
- `requester_id` UUID FK profiles nullable (null for external/guest requests)
- `key_id` UUID FK keys nullable (null until the HOD assigns a key on a guest approval)
- `guest_id` UUID FK guest_requesters nullable (set for external requests; null for registered-user requests)
- `requested_department_id` UUID FK departments nullable (department a guest requests access within; drives HOD routing while `key_id` is null; null for registered-user requests)
- `access_token` uuid nullable (unguessable token a guest uses to reach their session-less status/code page; present only for guest requests)
- `letter_url` text nullable (path in the `weekend-letters` bucket to the HOD authorisation letter a guest uploaded at submit)
- `requested_room` text nullable (free-text room/area a guest states they need access to; shown to the HOD before key assignment; null for registered-user requests)
- `type` enum: 'WEEKDAY' | 'WEEKEND'
- `requested_for` date (weekday: today; weekend: future Sat/Sun)
- `status` enum: 'PENDING_HOD' (weekend only) | 'APPROVED' (weekend only — HOD approved, awaiting on-the-day code) | 'CODE_ISSUED' | 'KEY_ISSUED' | 'KEY_RETURNED' | 'EXPIRED' | 'CANCELLED' | 'DECLINED'
- `code` text (6-digit collection code, only present in CODE_ISSUED state)
- `code_expires_at` timestamptz
- `return_code` text (6-digit return code; set by `request_return` while KEY_ISSUED, cleared on return)
- `return_code_expires_at` timestamptz (15 minutes from generation)
- `reminder_sent_at` timestamptz nullable (when the morning-of weekend collection-code reminder email was sent; stamped by `POST /api/cron/weekend-reminders` so a cron retry never double-emails)
- `return_deadline` timestamptz
- `risk_tier` enum: 'LOW' | 'MEDIUM' | 'HIGH' (computed at request time)
- `risk_factors` jsonb (array of {rule, description, weight})
- `hod_decision_id` UUID FK hod_decisions (weekend only)
- `issued_by` UUID FK profiles (verifier; nullable until issued)
- `issued_at` timestamptz nullable
- `returned_at` timestamptz nullable
- `created_at` timestamptz
- Constraint `requests_one_requester_kind`: exactly one of `requester_id` / `guest_id` is set (`num_nonnulls(requester_id, guest_id) = 1`)
- Constraint `requests_key_required_after_pending`: `key_id` may only be null while `status = 'PENDING_HOD'` (`key_id is not null or status = 'PENDING_HOD'`)

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
- `actor_id` UUID FK profiles nullable (null for guest-initiated events — guests have no profile)
- `actor_role` enum nullable (denormalised for query performance; null for guest-initiated events)
- `actor_name` text nullable (denormalised at write time; snapshot of the actor's name; guest-initiated events carry the plain guest name with null `actor_id`/`actor_role` — the `external` boolean in `payload` is the discriminator, not the name)
- `actor_department` text nullable (denormalised at write time; null for non-departmental roles e.g. CSO/Verifier)
- `target_type` text
- `target_id` UUID
- `payload` jsonb (validated by zod schema in TS before write)
- `occurred_at` timestamptz
- IMMUTABLE — RLS denies UPDATE and DELETE for all roles including service.

## RPCs (Postgres functions)

These wrap multi-table mutations in transactions and enforce business rules.

- `create_request(key_id, return_time, type, weekend_date)` — creates request + audit entry. WEEKDAY returns a code immediately (CODE_ISSUED); WEEKEND creates a PENDING_HOD request with no code.
- `generate_weekend_code(request_id, requester_id)` — requester-initiated. On the requested weekend date only, mints a short-lived 6-digit code (10-min expiry) for an APPROVED weekend request → CODE_ISSUED. Audit `CODE_ISSUED`. Raises TOO_EARLY before the date.
- `expire_request(request_id, requester_id)` — requester-initiated (fired automatically by the UI when a code lapses). Flips a genuinely-expired CODE_ISSUED request → EXPIRED, clears the code, audit `REQUEST_EXPIRED`. Idempotent (no-op if already moved on).
- `expire_lapsed_codes()` — batch cleanup, cron-only (execute revoked from `public`/`anon`/`authenticated`). Expires any CODE_ISSUED request (weekday or weekend, registered or guest) whose `code_expires_at < now()` → EXPIRED, clears the code, writes a `REQUEST_EXPIRED` audit entry per row (guest-aware). Server-side backstop to the UI-fired `expire_request`: a closed browser tab no longer strands an unclaimed code, so the key frees up for another requester. Scheduled every 5 minutes via `pg_cron`. Idempotent.
- `expire_stale_weekend_requests()` — batch cleanup, cron-only (execute revoked from `public`/`anon`/`authenticated`). Expires WEEKEND requests whose `requested_for < current_date` and status is `PENDING_HOD` / `APPROVED` / `CODE_ISSUED` → EXPIRED, clears the code, writes a `REQUEST_EXPIRED` audit entry per row (guest-aware via `_write_audit_guest`). Without this, a weekend request whose date passes before a code is minted has no lifecycle terminus and permanently blocks re-requesting its key (`generate_weekend_code` raises TOO_EARLY once the date is past; `create_request` treats any non-terminal status as active). Scheduled daily at 00:15 UTC via `pg_cron` calling the function directly. Idempotent.
- `issue_key(request_id, verifier_id)` — flips request status, sets issued_at, audit entry.
- `request_return(request_id, requester_id)` — requester-initiated; generates a 6-digit return code (15-min expiry) for their own KEY_ISSUED request, audit entry (`RETURN_CODE_GENERATED`). Status stays KEY_ISSUED.
- `return_key(request_id, verifier_id, code?, returner_id?, override_reason?)` — flips request status to KEY_RETURNED, sets returned_at, clears the return code. Requires either `code` (verified → `KEY_RETURNED`) or `override_reason` (unverified → `KEY_RETURNED_UNVERIFIED` + a `SUSPICIOUS_ACTIVITY` incident when an open shift exists).
- `approve_weekend(request_id, hod_id, note?)` — runs signature verification, creates hod_decisions row, moves request to APPROVED (no code is issued here — the requester mints one on the day via `generate_weekend_code`), audit entry.
- `decline_weekend(request_id, hod_id, note?)` — creates hod_decisions row, audit entry.
- `acknowledge_shift_handover(outgoing_shift_id, key_ids, bulk)` — creates handover row, audit entry per key.
- `generate_shift_report(shift_id)` — server-side; calls Gemini, inserts shift_reports row, audit entry.
- `add_report_comment(report_id, text)` — inserts immutable comment, audit entry.
- `provision_user(name, email, role, department_id?)` — creates profile, generates activation token, queues email, audit entry.

### External (guest) weekend RPCs

Guest analogues of the registered-user weekend flow. All are `SECURITY DEFINER`, key on an unguessable `access_token` instead of `auth.uid()` (guests have no session), and have execute revoked from `anon`/`public` — they are called only from server-side routes via the service-role admin client. `issue_key` is reused unchanged for the desk collection step.

- `_write_audit_guest(event, target_type, target_id, actor_name, payload)` — audit chokepoint for actions with no profile actor. Mirrors `_write_audit` but records `actor_id`/`actor_role` null and the plain guest `actor_name` (e.g. `'Jane Doe'`); callers set `payload->>'external' = true` as the discriminator.
- `create_guest_weekend_request(full_name, email, phone, id_type, id_number, department_id, weekend_date, return_deadline, letter_url, requested_room)` — inserts a `guest_requesters` row + a WEEKEND request (`PENDING_HOD`, no code, `access_token` minted), audit `REQUEST_CREATED`. Returns `{request_id, access_token}`.
- `approve_guest_weekend(request_id, hod_id, key_id, note?)` — validates the chosen key is in the HOD's department, sets `key_id`, creates the `hod_decisions` row, moves the request → APPROVED, audit `HOD_APPROVED`. Granted to `authenticated`. (No signature verification — the HOD reviews the uploaded letter manually.)
- `generate_guest_weekend_code(access_token)` — on `requested_for = current_date` only, mints a 10-min code → CODE_ISSUED, audit `CODE_ISSUED`. Raises TOO_EARLY before the date.
- `expire_guest_request(access_token)` — flips a genuinely-expired CODE_ISSUED request → EXPIRED, clears the code, audit `REQUEST_EXPIRED`. Idempotent.

## Migrations workflow

1. Create migration: `supabase migration new <name>`.
2. Write SQL.
3. Update RLS policies if any new table or column.
4. Update generated TS types: `pnpm db:types`.
5. Apply locally: `pnpm db:migrate`.
6. Update `docs/DATABASE.md` and `docs/CHANGELOG.md`.
