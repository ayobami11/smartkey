# Database tests (pgTAP)

Automated coverage for the Postgres RPCs and RLS policies that enforce SmartKey's
business rules. Until these existed, every rule below was enforced only by SQL that
nothing verified — and two of the five critical findings in the 2026-08-04 backend
review were failures of exactly these rules.

## What is covered

| File                                  | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01_authorisation_slots_test.sql`     | Max 3 collectors per key: the `authorisations_max_three` trigger, `nominate_collector`, `remove_collector`, and the audit entries they write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `02_weekend_expiry_test.sql`          | `expire_stale_weekend_requests()` and the `requests_key_required_after_pending` CHECK constraint — including the batch-abort outage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `03_audit_log_immutability_test.sql`  | `audit_log` UPDATE/DELETE/INSERT denied for `anon` and `authenticated`, and CSO-only read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `04_authoriser_gate_test.sql`         | The Dean-vs-CSO authoriser gate on `nominate_collector`, `remove_collector`, `approve_weekend`, `decline_weekend`, `dismiss_expired_request`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `05_weekday_lifecycle_test.sql`       | The weekday collect/return loop: `create_request` (including the risk tier, factors and weekend letter/stamp written by its own INSERT, and the letter-ownership check), `issue_key` (including the one-live-holder-per-key guard, both that it fires and that it does not over-block a key whose other requests are terminal), `return_key` (both the verified and override-reason paths), `request_return`.                                                                                                                                                                                                                                                       |
| `06_guest_weekend_lifecycle_test.sql` | The external (guest) weekend flow: `create_guest_weekend_request`, `approve_guest_weekend` (including the Dean-vs-CSO authoriser gate and the cross-faculty key-assignment check), `generate_guest_weekend_code`, `expire_guest_request` (including the same-day rollback branch), `request_return_guest`.                                                                                                                                                                                                                                                                                                                                                          |
| `07_profiles_column_guard_test.sql`   | `protect_profile_columns`: from a user session only `full_name` changes; `role`, `status`, `unit_id`, `signature_ref_url`, `institutional_email` and `photo_url` are refused (own row, and other rows for a CSO session); non-session writes still work; `anon` has no UPDATE grant.                                                                                                                                                                                                                                                                                                                                                                                |
| `11_key_occupancy_test.sql`           | Key occupancy (`20261013110000_key_occupancy_rpc.sql`): truth tables for `request_occupies_key` and `request_is_overdue` (mirrored label for label in `src/tests/keys/occupancy.test.ts`), `get_key_occupancy()` per-key copy counts (multi-copy, live vs lapsed codes, retired, stale `keys.status`), its zone filter and CSO/VERIFIER role gate, no `anon` execute, and `get_digest_stats.overdue_count` counting overdue holders rather than key records.                                                                                                                                                                                                        |
| `12_cancel_and_cso_decision_test.sql` | `cancel_request` (own pre-collection requests only; another requester's is `NOT_FOUND`) and `cso_decide_request` (a decline on a `KEY_ISSUED` request is refused and writes no audit entry; notes are recorded), plus their grants.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `13_user_admin_test.sql`              | `update_user_profile` (unit required or ignored by role, one active Dean per unit, `units.hod_id` sync, changed-fields-only audit) and `deactivate_user`, both CSO-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `14_signature_reference_test.sql`     | `set_signature_reference` / `hold_signature_reference`: service-only grants, the stale-reference `CONFLICT`, hold-then-replace clearing the stale pending row, and their audit entries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `15_audited_incidents_test.sql`       | `mark_key_lost` (CSO-only; retirement, `MISSING_KEY` incident and `KEY_MARKED_LOST` with `open_requests` in one transaction; `NOT_FOUND`, already-retired `CONFLICT`, blank note) and `log_incident` (CSO or VERIFIER; incident on the open shift plus one `INCIDENT_LOGGED`), and their grants.                                                                                                                                                                                                                                                                                                                                                                    |
| `16_admin_audit_gaps_test.sql`        | `reinstate_user` (CSO-only; `DEACTIVATED` → `PENDING_ACTIVATION`, name/unit correction, one-active-Dean `CONFLICT`, `units.hod_id` restored, one `USER_REINSTATED`), `record_invite_resent` (`PENDING_ACTIVATION` only, optional correction, one `USER_INVITE_RESENT`), `create_key` (validation, duplicate-code `CONFLICT`, one `KEY_CREATED`), their grants, and the dropped `incidents` / `keys` INSERT policies (a CSO session's direct insert is refused).                                                                                                                                                                                                     |
| `17_grant_hardening_test.sql`         | `20261015090000_grant_hardening.sql`: service-only `create_request` / `approve_weekend` / `decline_weekend` / `approve_guest_weekend` (grants, and a user session refused with `42501`), cron-only functions not executable by `anon`/`authenticated`, the session-actor check on `create_request`, `dismiss_expired_request`, `issue_key`, `return_key`, `request_return`, `generate_weekend_code`, `expire_request` (mismatch refused, `anon` refused, `service_role` names the actor), the `VERIFIER` requirement on `issue_key`/`return_key`, the guest-request ownership fix, and the dropped write policies on `keys`, `units`, `authorisations`, `requests`. |

Still uncovered: registered-user weekend gaps (`generate_weekend_code`,
`expire_request` — the non-guest analogues of what `06` now covers for guests),
admin/config RPCs (`update_risk_config`, `update_operational_config`,
`provision_user`, `resolve_pending_signature_reference`), shift/report RPCs
(`acknowledge_shift_handover`, `generate_shift_report`, `add_report_comment`),
and the remaining batch/cron RPCs' behaviour (`mark_key_overdue`,
`schedule_pending_shift_report`, `expire_lapsed_codes` — `17` checks only their grants; `get_digest_stats` only has its `overdue_count` covered, by `11`).
This list itself drifted before `06` was written — it omitted
`generate_weekend_code`, `expire_request`, and `resolve_pending_signature_reference`
entirely; cross-check against `docs/DATABASE.md`'s RPC list, not just this file,
before assuming it's exhaustive.

Each file is self-contained: it creates its own fixtures inside a single transaction
and rolls back at the end, so the files are independent of each other, independent of
whatever seed data the database holds, and re-runnable without cleanup.

## Running them

```bash
bun run test:db     # supabase test db
```

This needs a **local** Supabase stack, which needs Docker:

```bash
supabase start      # boots Postgres on :54322 and the rest of the stack
bun run test:db
```

`supabase test db` runs every `*.sql` file in this directory through `pg_prove`
against the local database, as the `postgres` superuser.

Never point these at the hosted project. They insert into `auth.users`, `profiles`,
`keys` and `requests`; the rollback is reliable, but the risk is not worth taking.

### pgTAP

Every file opens with:

```sql
create extension if not exists pgtap with schema extensions;
```

so the suite bootstraps itself on a database where pgTAP has not been enabled. That
statement is inside the test transaction, so it is rolled back with everything else and
re-run per file — harmless, but slightly wasteful. The better home for it is a
migration:

```sql
create extension if not exists pgtap with schema extensions;
```

and the per-file line can then be dropped.

These tests do not depend on seed data — they build their own fixtures — so they run
against a database seeded however you like, or with seeding disabled
(`[db.seed] enabled = false` in `supabase/config.toml`).

## Wired into CI

`.github/workflows/ci.yml` runs `supabase start` then `bun run test:db` on every
push/PR to `main`, between the unit-test step and the build step.

## Conventions for new test files

- One file per business rule area, numbered so the reading order is deliberate.
- Wrap everything in `begin; … rollback;` and declare an accurate `plan(n)`.
- Fixture UUIDs are prefixed per file (`1111…`, `2222…`, …) so a fixture leak between
  files is obvious rather than mysterious.
- Where an RPC raises a named exception, assert on the SQLSTATE **and** the message —
  `throws_ok(sql, 'P0002', 'FORBIDDEN: …', 'description')`. Asserting only that
  "something threw" would have passed against several of the bugs these tests exist to
  catch.
- `nominate_collector` and `remove_collector` read their actor from `auth.uid()`; set
  `request.jwt.claims` rather than switching Postgres roles. RPCs that take the actor
  as a parameter (`create_request`, `issue_key`, `return_key`, `request_return`,
  `dismiss_expired_request`, …) check it against the session through
  `_assert_session_actor`: either set claims whose `sub` is that actor, or set
  `request.jwt.claims` to `'{}'` (a trusted caller with no session, like pg_cron) — see
  `04` and `17`. Service-only RPCs still run as `postgres` in these tests; check their
  grants with `has_function_privilege` and refuse a user session under `set local role`.
- Never call a pgTAP assertion function while `SET ROLE` is in effect. pgTAP writes its
  bookkeeping to session temp tables owned by `postgres`, and a switched role cannot
  write to them. Do the role-switched work inside a `DO` block, stash the outcome in a
  transaction-local GUC with `set_config(…, true)`, `reset role`, then assert. See
  `03_audit_log_immutability_test.sql`.
