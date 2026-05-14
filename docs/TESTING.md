# Testing

## Layers

| Layer     | Tool                           | Coverage target                                                |
| --------- | ------------------------------ | -------------------------------------------------------------- |
| Unit      | Vitest                         | Pure logic, especially `src/lib/ai/risk/` and `src/lib/audit/` |
| Component | Vitest + React Testing Library | Every component in `src/components/smartkey/`                  |
| E2E       | Playwright + axe-core          | Every primary user flow per role                               |
| Database  | pgTAP                          | Every RPC and RLS policy                                       |

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

- `pnpm test` — unit and component tests
- `pnpm test:watch` — watch mode
- `pnpm test:e2e` — Playwright headless
- `pnpm test:e2e:headed` — Playwright with browser visible
- `pnpm test:db` — pgTAP against local Supabase

## CI

GitHub Actions runs on every PR:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e` (against a Supabase preview branch)
- `pnpm design:lint` (validates DESIGN.md)
- Lighthouse CI on key routes (must score ≥ 85)
