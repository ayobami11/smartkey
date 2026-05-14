# Sync the design system from DESIGN.md to the codebase

When DESIGN.md changes, regenerate the Tailwind config and CSS variables.

Steps:

1. Run `npm run design:lint` — must return zero errors. If there are contrast warnings, surface them and ask before proceeding.
2. Run `npm run design:export` — regenerates `tailwind.theme.json` from DESIGN.md.
3. Run the small generator `scripts/sync-design.mjs` (in this repo) to update:
   - `src/app/globals.css` (CSS variable definitions, light + dark blocks)
   - `tailwind.config.ts` (theme.extend.colors, fontFamily, fontSize, borderRadius, spacing)
4. Run `npm run build` to verify the change compiles.
5. Run `npm run test:e2e` to verify visual regression doesn't fire (Playwright snapshots).
6. Show me the diff in `globals.css` and `tailwind.config.ts` so I can review before commit.

If new tokens were added, also check that any component referencing them in `src/components/smartkey/` still type-checks.
