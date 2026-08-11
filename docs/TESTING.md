# Testing

## Layers

| Layer     | Tool                           | Coverage target                                                                                                                                                          |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit      | Vitest                         | Pure logic, especially `src/lib/ai/risk/` and `src/lib/audit/`                                                                                                           |
| Component | Vitest + React Testing Library | Most components in `src/components/smartkey/`                                                                                                                            |
| E2E       | Playwright + axe-core          | Every primary user flow per role                                                                                                                                         |
| Database  | _Not yet implemented_          | pgTAP is the intended tool for RPCs/RLS; no `supabase/tests/` directory or `test:db` script exists yet — RPCs and RLS policies currently have no automated test coverage |

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

- `npm test` — unit and component tests (Vitest)
- `npm run test:watch` — watch mode
- `npm run test:e2e` — Playwright headless
- `npm run test:e2e:headed` — Playwright with browser visible
- No `test:db` command exists yet — see the Database row above.

## CI

Three separate GitHub Actions workflows, not one combined pipeline:

- **`.github/workflows/ci.yml`** — runs on every push/PR to `main`: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.
- **`.github/workflows/e2e.yml`** — PR-only. Skipped when every changed file matches `docs/**`, `supabase/**`, or `**/*.md` (a PR that also touches app code still runs). Builds the app, then runs `npm run test:e2e -- --project=chromium` (Chromium only in CI; the `mobile`/Pixel 5 project defined in `playwright.config.ts` is not run in CI) against test-account credentials injected as secrets.
- **`.github/workflows/lighthouse.yml`** — PR-only, same `paths-ignore` as `e2e.yml`. Runs `npm run build` once, then three independent `lhci autorun` passes against the report's own targets (performance ≥85, LCP ≤2.5s, CLS <0.1 — `docs/PRODUCT.md`'s Success Criteria table): the 5 public pages (`lighthouserc.js`) and the Requester dashboard (`lighthouse/requester.config.js`, reusing `tests/e2e/auth.setup.ts`'s REQUESTER login — no MFA involved) both block the PR on a regression; the Verifier dashboard (`lighthouse/verifier.config.js`) is audited too but every assertion there is `warn`-severity and its login step runs with `continue-on-error`, since Verifier login needs a real OTP round trip through the shared IMAP mailbox (`docs/E2E_OTP_SETUP.md`) and a performance gate shouldn't fail a PR for mailbox flakiness. `scripts/lighthouse-auth-cookie.mjs` bridges Playwright's storageState cookies into the `Cookie` header Lighthouse needs. Locally, `npm run test:lighthouse` runs the public-pages config only — no test account required.

`design:lint` still isn't run by any workflow — no CI step invokes `npx @google/design.md lint`. That gap is unrelated to Lighthouse CI and remains open.
