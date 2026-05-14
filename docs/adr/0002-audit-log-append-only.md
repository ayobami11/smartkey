# ADR 0002 — Audit log is append-only

**Status**: accepted, 2026-05

## Context

The whole purpose of SmartKey is replacing an unaccountable paper trail with a queryable, immutable digital one. If audit log entries can be edited or deleted, the system is no better than the logbook it replaces.

## Decision

The `audit_log` table is append-only at the database level:

- INSERT via RPC only (so entries are validated and atomic with the operation they audit).
- UPDATE policy: deny for all roles, including service.
- DELETE policy: deny for all roles, including service.
- No application code path performs UPDATE or DELETE on `audit_log`.

Migrations that touch `audit_log` policies require explicit code review and a CHANGELOG entry.

Where the system needs to "amend" an audit-relevant record (e.g., a CSO comment on a generated report, an incident resolution, an anomaly resolution), the amendment is a **new audit entry** that references the original. The original is never modified.

## Consequences

- Stronger evidentiary value; the audit log is genuinely immutable from the application's perspective.
- More verbose audit history (e.g., a single incident may have OPEN → ESCALATED → RESOLVED as three separate entries).
- Operations like "fix a typo in an audit entry" are not supported. If a payload was wrong at write time, it stays wrong; a corrective new entry can be written explaining the error.
- The CSO's reports area uses comments-as-additions, not edits, with a UI that explains this clearly.
