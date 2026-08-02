# Testing

## Layers

| Layer     | Tool                           | Coverage target                                                |
| --------- | ------------------------------ | -------------------------------------------------------------- |
| Unit      | Vitest                         | Pure logic, especially `src/lib/ai/risk/` and `src/lib/audit/` |
| Component | Vitest + React Testing Library | Most components in `src/components/smartkey/`                  |
| E2E       | Playwright + axe-core          | Every primary user flow per role                               |
| Database  | *Not yet implemented*          | pgTAP is the intended tool for RPCs/RLS; no `supabase/tests/` directory or `test:db` script exists yet — RPCs and RLS policies currently have no automated test coverage |

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

Two separate GitHub Actions workflows, not one combined pipeline:

- **`.github/workflows/ci.yml`** — runs on every push/PR to `main`: `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.
- **`.github/workflows/e2e.yml`** — PR-only. Skipped when every changed file matches `docs/**`, `supabase/**`, or `**/*.md` (a PR that also touches app code still runs). Builds the app, then runs `npm run test:e2e -- --project=chromium` (Chromium only in CI; the `mobile`/Pixel 5 project defined in `playwright.config.ts` is not run in CI) against test-account credentials injected as secrets.

Neither workflow runs `design:lint` or Lighthouse CI — no `design:lint` script exists in `package.json`, and there is no Lighthouse step configured anywhere in `.github/`. Both are aspirational until added.
