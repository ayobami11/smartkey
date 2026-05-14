# Run a full accessibility check on a screen

Audit a screen against WCAG 2.2 AA.

Arguments: `$ARGUMENTS` (route path, e.g. `/verifier`)

Steps:

1. Run the dev server (`npm run dev`) if not running.
2. Navigate to the route.
3. Run axe-core via the Playwright E2E test for the screen, or directly via the browser devtools axe extension.
4. Report violations grouped by severity.
5. For each violation, propose a fix referencing the specific WCAG criterion (e.g., 1.4.3 contrast, 2.4.3 focus order, 4.1.2 name role value).
6. Specifically verify:
   - Tab order matches visual order.
   - Every interactive element has a visible focus ring.
   - Every form field has a real `<label>`.
   - Every status badge has an `aria-label`.
   - Every icon-only button has an `aria-label`.
   - Realtime updates announce via `aria-live="polite"`.
   - Touch targets ≥ 44×44px on mobile.
   - Reduced-motion respected.
7. Apply fixes and re-run.
8. Report final state.

Read `.claude/skills/accessibility-floor/SKILL.md` before starting.
