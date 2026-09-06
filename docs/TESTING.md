# Testing

## Layers

| Layer     | Tool                           | Coverage target                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit      | Vitest                         | Pure logic, especially `src/lib/ai/risk/` and `src/lib/audit/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Component | Vitest + React Testing Library | Most components in `src/components/smartkey/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| E2E       | Playwright + axe-core          | Every primary user flow per role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Database  | pgTAP (`supabase test db`)     | `supabase/tests/`: max-3-collectors trigger + `nominate_collector`/`remove_collector`, weekend expiry (`expire_stale_weekend_requests`) and the batch-abort outage, `audit_log` immutability/read-scoping, the Dean-vs-CSO authoriser gate, the weekday collect/return loop (`create_request`, `issue_key` including its capacity guard, `return_key` both paths, `request_return`), the `requests_key_capacity` trigger (concurrent holders up to `keys.key_count`, refusal beyond it, a lapsed code releasing its copy, and a future weekend approval consuming nothing), and the guest weekend flow (`create_guest_weekend_request`, `approve_guest_weekend`, `generate_guest_weekend_code`, `expire_guest_request`, `request_return_guest`). 6 files, ~27 RPCs total in `docs/DATABASE.md` — admin/config and shift/report RPCs, plus two registered-user weekend gaps (`generate_weekend_code`, `expire_request`), are not yet covered; see `supabase/tests/README.md` |

Tests live in `src/tests/<role-or-area>/*.test.tsx` (e.g. `src/tests/smartkey/risk-tier-badge.test.tsx`, `src/tests/dean/onboarding-form.test.tsx`), not co-located next to the component they cover — despite what `CLAUDE.md`'s "co-locate tests" convention says. Follow the existing `src/tests/` tree for new component tests rather than the co-located pattern.

## What every test must cover

### For a component

- Default render.
- Every variant prop.
- Keyboard interaction (if interactive).
- ARIA attributes match expected roles.
- Reduced-motion variant (if it animates).

### For a screen E2E

- Happy path completion.
- One error path.
- axe-core scan with no violations.
- Theme toggle (light → dark) preserves state.
- Tab through, every focusable element reachable.

**MFA-gated logins**: CSO, Dean, and Verifier require a real emailed OTP on
every login (`src/app/api/auth/login/route.ts`'s `MFA_ROLES`) — there is no
test-mode bypass, and there will not be one. Every spec's `beforeEach` must
sign in via `tests/e2e/utils/auth.ts`'s `loginAs(page, role)`, never a bare
email/password fill — that helper reads the OTP back out of a shared IMAP test
mailbox for the three MFA roles (REQUESTER skips MFA and needs no mailbox).
See `docs/E2E_OTP_SETUP.md` for arming that mailbox; without it, CSO/Dean/
Verifier specs time out on the OTP screen exactly as documented in
`docs/CHANGELOG.md`'s 2026-08-09 entry.

### For an audit-writing operation

- Both writes (state + audit) succeed.
- On failure, both roll back.
- Audit payload matches the zod schema.
- The event name is in the AuditEvent union.

## Commands

- `bun run test` — unit and component tests (Vitest)
- `bun run test:watch` — watch mode
- `bun run test:e2e` — Playwright headless
- `bun run test:e2e:headed` — Playwright with browser visible
- `bun run test:db` — pgTAP suite (`supabase test db`); needs a local Supabase stack (`supabase start`, which needs Docker) — see `supabase/tests/README.md`

## CI

Four separate GitHub Actions workflows, not one combined pipeline:

- **`.github/workflows/ci.yml`** — runs on every push/PR to `main`: `bun run typecheck` → `bun run lint` → `bun run test` → `supabase start` + `bun run test:db` → `bun run build`.
- **`.github/workflows/e2e.yml`** — PR-only. Skipped when every changed file matches `docs/**`, `supabase/**`, or `**/*.md` (a PR that also touches app code still runs). Builds the app, then runs `bun run test:e2e -- --project=chromium` (Chromium only in CI; the `mobile`/Pixel 5 project defined in `playwright.config.ts` is not run in CI) against test-account credentials injected as secrets.
- **`.github/workflows/changelog.yml`** — PR gate enforcing CLAUDE.md's "every push needs a `docs/CHANGELOG.md` entry" rule. Fails a PR that changes any file outside `docs/` without also touching `docs/CHANGELOG.md`, unless the PR carries the `skip-changelog` label.
- **`.github/workflows/post-deploy-smoke.yml`** — fires on the Vercel `deployment_status` event once a deployment is live (or via manual `workflow_dispatch` against any URL). Runs `tests/smoke/smoke.mjs` (zero dependencies by design) against the deployed URL and gates production promotion on the result; auto-promote is opt-in via the `SMOKE_AUTO_PROMOTE` repo variable and disabled by default.

None of the four workflows runs `design:lint`. The script does exist (`bunx @google/design.md lint design-system/DESIGN.md`, passing with 0 errors and 30 warnings as of 2026-09-03) — it is simply a manual check, not a gate. Lighthouse CI was considered and deliberately not pursued — see `docs/CHANGELOG.md`.
