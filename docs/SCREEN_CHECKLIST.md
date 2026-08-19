# Screen checklist

Apply this checklist to every new or modified screen in SmartKey.

## Before writing code

- [ ] The screen is documented in `design-system/screens.md`. If not, get the spec first.
- [ ] The route follows the IA: `/cso/*`, `/hod/*`, `/verifier/*`, `/me/*`, public.
- [ ] The role's middleware gate is correct (only the right role can reach this URL).
- [ ] You have read the relevant skills:
  - `.claude/skills/design-token-discipline/SKILL.md`
  - `.claude/skills/accessibility-floor/SKILL.md`
  - `.claude/skills/audit-log-discipline/SKILL.md` (if the screen mutates state)
  - `.claude/skills/realtime-and-offline/SKILL.md` (if the screen subscribes to live data)

## Visual

- [ ] No hardcoded colours, font sizes, spacing, or radii. All values come from Tailwind utility classes mapped to DESIGN.md tokens.
- [ ] One primary action per screen (or per logical region).
- [ ] Status colours always paired with an icon and a text label.
- [ ] Fraunces (`font-display`) used only on brand surfaces, never inside dashboards.
- [ ] Light and dark themes both render correctly. Toggle and check.

## Component reuse

- [ ] Existing shadcn primitives (`src/components/ui/`) used for buttons, inputs, dialogs, etc.
- [ ] Existing SmartKey components (`src/components/smartkey/`) reused where applicable.
- [ ] New components (if any) follow the `new-component` slash command pattern.

## Async surfaces — every state

For each piece of data that loads or mutates, the screen must handle:

- [ ] **Empty** — meaningful illustration + copy + primary action where useful.
- [ ] **Loading** — skeleton with the same dimensions as the content (no CLS).
- [ ] **Error** — inline near the field for validation; page-level fallback for fetch errors. Correlation ID surfaced. Stack traces never exposed.
- [ ] **Content** — the success path.
- [ ] **Offline** (realtime-dependent surfaces only) — OfflineBanner; destructive actions disabled.

## Accessibility

- [ ] Every interactive element reachable by Tab, in visual order.
- [ ] Visible focus ring on every focusable element.
- [ ] Every form field has a real `<label>`.
- [ ] Every status badge has an `aria-label`.
- [ ] Every icon-only button has an `aria-label`.
- [ ] Realtime updates announce via `aria-live="polite"`.
- [ ] Touch targets ≥ 44×44px on mobile.
- [ ] Reduced-motion respected.
- [ ] axe-core passes (run `pnpm test:e2e` or the browser extension).

## Mutations

- [ ] State change and audit log entry are atomic (single transaction or RPC).
- [ ] Audit entry has the correct event name and payload schema.
- [ ] Errors roll back both writes.
- [ ] Optimistic UI is NOT used. Wait for server response.
- [ ] Destructive actions disable while offline.
- [ ] Persistent confirmation card after success (not just a toast).

## Performance

- [ ] Server Component by default. `"use client"` only where genuinely needed.
- [ ] No N+1 queries — joins or RPCs.
- [ ] Images via `next/image` with explicit width and height.
- [ ] No obvious LCP/CLS red flags (unsized images, layout-shifting skeletons, render-blocking client-side fetches) — confirmed post-ship via Vercel Speed Insights, not a pre-merge score gate.

## Testing

- [ ] Unit tests for any pure logic.
- [ ] E2E test in `tests/e2e/<role>/<screen>.spec.ts` covering happy path + one error path.
- [ ] axe-core runs in the E2E test.

## Final

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm test:e2e` passes for at least the new screen.
- [ ] Manual: tab through, check focus, toggle theme, simulate offline.
