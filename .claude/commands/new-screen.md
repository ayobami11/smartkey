# Create a new screen

Build a new screen for the SmartKey application following the project's design system, accessibility floor, and state-coverage rules.

Arguments: `$ARGUMENTS` (e.g. `verifier/incidents-detail`)

Steps:

1. Confirm the screen is documented in `design-system/screens.md`. If not, ask the user for the spec before writing code.
2. Read `docs/SCREEN_CHECKLIST.md` and apply every item.
3. Place the route under `src/app/(<role>)/<path>/page.tsx` matching the IA in `design-system/screens.md`.
4. Default to a Server Component. Add `"use client"` only for state, effects, or browser APIs.
5. Use shadcn/ui primitives and SmartKey-specific components from `src/components/smartkey/`. Do not write custom UI when a primitive exists.
6. Design tokens come from DESIGN.md via Tailwind utility classes. No hardcoded colours, sizes, or spacing.
7. Implement empty, loading, error, content, and (where applicable) offline states. Each must be visually verifiable.
8. Add an E2E test under `tests/e2e/<role>/<screen>.spec.ts` that walks the happy path and checks accessibility with axe-core.
9. Run `npm run typecheck && npm run lint && npm test` before declaring done.

Show me the plan before writing any code.
