---
name: accessibility-floor
description: Use this skill whenever you build, modify, or review a UI surface — every screen, component, form, dialog, or interactive element. Enforces the WCAG 2.2 AA accessibility floor that SmartKey commits to. Triggers on any frontend work; do not skip even for "small" components.
---

# Accessibility floor: WCAG 2.2 AA

SmartKey commits to WCAG 2.2 AA across every flow. This is the floor, not the ceiling. The system serves users with mixed technical literacy in a context where mistakes are operationally consequential.

## Non-negotiable requirements

### Colour contrast

- Body text ≥ 4.5:1 against its background.
- Large text (≥ 18px regular or ≥ 14px bold) ≥ 3:1.
- Icons that convey meaning ≥ 3:1.
- The DESIGN.md linter validates this for every component pair. Run `pnpm design:lint` if you change colours.

### Keyboard navigation

- Every interactive element must be reachable by Tab in visual order.
- Every flow must be completable by keyboard alone.
- Modal/dialog/sheet must trap focus while open and return focus to the trigger on close (use shadcn's `Dialog` and `Sheet` — they handle this; don't roll your own).
- Escape closes any overlay.

### Focus visible

- 2px maroon outline with 2px offset on every focusable element. The default ring is configured in `tailwind.config.ts` and `globals.css`. **Never remove the focus ring.** If you write `focus:outline-none`, you must replace it with `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

### Screen reader

- Every form field has a real `<label>` (not just a placeholder). Use shadcn's `<Label>` component and the `htmlFor` attribute.
- Every status badge has an `aria-label` ("Risk: High").
- Decorative icons have `aria-hidden="true"`.
- Realtime updates announce via `aria-live="polite"` regions ("New request from Dr. Bakare").
- Buttons with only an icon must have an `aria-label`.

### Touch targets

- Minimum 44×44px on phone (WCAG 2.5.5). For shadcn buttons, this means `size-default` or `size-lg` on mobile; `size-sm` is fine on desktop only.

### Colour as carrier

**Colour is never the sole carrier of meaning.** Risk tiers, validation states, and status indicators always combine colour + icon + text label. If you find yourself signalling something with colour alone, you have a bug.

### Motion

- All non-trivial animation must respect `prefers-reduced-motion`. Use the `motion-reduce:` Tailwind variant or check the user preference in JS:

```tsx
import { useReducedMotion } from '@/hooks/useReducedMotion';
const reduced = useReducedMotion();
```

- No essential information conveyed only through motion.

### Timeouts

- The 10-minute code expiry is operational, not interactive — show clear remaining time. Do not auto-extend without user action; let the user request a new code.

## Verification on every screen

Before marking UI work as done:

1. **Tab through the whole flow**. Every interactive element reachable, in visual order, with visible focus.
2. **Run axe-core in the browser**. No violations.
3. **Test with NVDA on Windows or VoiceOver on iOS** for at least one screen per flow. Form labels announce, status badges announce, errors announce.
4. **Toggle reduce-motion in OS settings** and confirm animations disable or shorten.
5. **Run `pnpm test:e2e`** — Playwright runs axe-core checks on every test.

## Common mistakes Claude makes

- Using `<div onClick>` instead of a real `<button>`. Always use semantic elements; shadcn primitives are correct out of the box.
- Forgetting `aria-label` on icon-only buttons.
- Removing focus rings to "clean up" the design.
- Using placeholder text as the only label.
- Animating without checking `prefers-reduced-motion`.

If you catch one of these, fix it immediately — don't defer.
