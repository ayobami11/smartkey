# Database tests (pgTAP)

Automated coverage for the Postgres RPCs and RLS policies that enforce SmartKey's
business rules. Until these existed, every rule below was enforced only by SQL that
nothing verified — and two of the five critical findings in the 2026-08-04 backend
review were failures of exactly these rules.

## What is covered

| File                                 | Covers                                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `01_authorisation_slots_test.sql`    | Max 3 collectors per key: the `authorisations_max_three` trigger, `nominate_collector`, `remove_collector`, and the audit entries they write. |
| `02_weekend_expiry_test.sql`         | `expire_stale_weekend_requests()` and the `requests_key_required_after_pending` CHECK constraint — including the batch-abort outage.          |
| `03_audit_log_immutability_test.sql` | `audit_log` UPDATE/DELETE/INSERT denied for `anon` and `authenticated`, and CSO-only read.                                                    |
| `04_authoriser_gate_test.sql`        | The Dean-vs-CSO authoriser gate on `nominate_collector`, `remove_collector`, `approve_weekend`, `decline_weekend`, `dismiss_expired_request`. |

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
re-run per file — harmless, but slightly wasteful. Once the migration history is
reconciled (item 1 of `docs/REVIEW_ACTIONS_BACKEND.md`), the better home for it is a
migration:

```sql
create extension if not exists pgtap with schema extensions;
```

and the per-file line can then be dropped.

### If the local stack will not seed

`supabase/seed.sql` is stale: it still inserts into `public.departments` with a
`department_id` column, both of which were renamed to `units` / `unit_id` by
`20260627111159_rename_departments_to_units.sql`. `supabase db reset` will fail on it.
These tests do not depend on seed data — they build their own fixtures — so you can run
them against a database seeded however you like, or with seeding disabled
(`[db.seed] enabled = false` in `supabase/config.toml`).

## Not wired into CI

`bun run test:db` is deliberately **not** referenced by any workflow in
`.github/workflows/` yet. CI wiring is being handled separately; do not add it here.

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
  `request.jwt.claims` rather than switching Postgres roles. `approve_weekend`,
  `decline_weekend` and `dismiss_expired_request` take the actor as a parameter
  instead — see the note at the top of `04_authoriser_gate_test.sql`.
- Never call a pgTAP assertion function while `SET ROLE` is in effect. pgTAP writes its
  bookkeeping to session temp tables owned by `postgres`, and a switched role cannot
  write to them. Do the role-switched work inside a `DO` block, stash the outcome in a
  transaction-local GUC with `set_config(…, true)`, `reset role`, then assert. See
  `03_audit_log_immutability_test.sql`.
