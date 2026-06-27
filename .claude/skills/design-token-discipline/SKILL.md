---
name: design-token-discipline
description: Use this skill any time you write Tailwind classes, CSS, or component styles. Triggers on any UI work — building a screen, styling a component, choosing a colour, picking a font size, setting spacing. Enforces the SmartKey design system tokens from DESIGN.md and prevents hardcoded values.
---

# Design token discipline

The design system is defined in `design-system/DESIGN.md` and exported into `src/app/globals.css` as CSS variables, then surfaced as Tailwind utility classes via `tailwind.config.ts`.

**Never hardcode colours, font sizes, spacing values, or radii.** If a value is not available as a token, the answer is to extend the token system, not to bypass it.

## Token cheat sheet

### Colours

Use Tailwind utility classes that map to DESIGN.md tokens:

| Use case           | Class                                         |
| ------------------ | --------------------------------------------- |
| Primary action     | `bg-primary text-primary-foreground`          |
| Brand surface      | `bg-primary`                                  |
| Card surface       | `bg-card text-card-foreground`                |
| Subtle surface     | `bg-muted`                                    |
| Body text          | `text-foreground`                             |
| Captions           | `text-muted-foreground`                       |
| Borders            | `border-border`                               |
| Focus ring         | `ring-ring`                                   |
| Risk: low          | `bg-risk-low-soft text-risk-low-strong`       |
| Risk: medium       | `bg-risk-medium-soft text-risk-medium-strong` |
| Risk: high         | `bg-risk-high-soft text-risk-high-strong`     |
| Success            | `bg-success-soft text-success-strong`         |
| Warning            | `bg-warning-soft text-warning-strong`         |
| Error              | `bg-error-soft text-error-strong`             |
| Destructive button | `bg-destructive text-destructive-foreground`  |

The dark mode counterpart of every token is bound to the `.dark` class on the document root. Use the same class names; the variable swaps automatically.

### Typography

| Token            | Tailwind class                                     | Use                |
| ---------------- | -------------------------------------------------- | ------------------ |
| headline-display | `font-display text-display-2xl`                    | Landing hero only  |
| heading-xl       | `font-sans text-3xl font-semibold`                 | Dashboard greeting |
| heading-lg       | `font-sans text-2xl font-semibold`                 | Section heading    |
| heading-md       | `font-sans text-xl font-semibold`                  | Card title         |
| heading-sm       | `font-sans text-lg font-semibold`                  | Subhead            |
| body-md          | `font-sans text-base`                              | Default body       |
| body-sm          | `font-sans text-sm`                                | Helper text        |
| caption          | `font-sans text-xs font-medium`                    | Labels             |
| code-display     | `font-mono text-6xl font-semibold tracking-widest` | The 6-digit code   |
| code-md          | `font-mono text-base`                              | Timestamps, IDs    |

**Fraunces (`font-display`) is for brand surfaces only** — landing page hero, login page header, report covers. **Never use it inside dashboards.**

### Spacing and radius

Tailwind defaults `p-1` through `p-24` map directly to the SmartKey spacing scale (every value is a multiple of 4). Use `rounded-md` (8px default), `rounded-lg` (12px modals), `rounded-full` (pills, avatars). Avoid sharp corners except on full-bleed banners.

## Forbidden patterns

```tsx
// NEVER hardcode colours
<div className="bg-[#7B1F2D]">...</div>            // ❌
<div style={{ color: '#dc2626' }}>...</div>        // ❌

// NEVER use arbitrary values for design-system properties
<div className="text-[18px]">...</div>             // ❌ — use text-lg
<div className="p-[15px]">...</div>                // ❌ — use p-4
<div className="rounded-[6px]">...</div>           // ❌ — use rounded-md

// NEVER convey state through colour alone
<Badge className="bg-error-soft">High</Badge>    // ❌ — needs an icon and visible "High" label

// NEVER use Fraunces inside a dashboard
<h2 className="font-display">Dashboard</h2>      // ❌
```

## Allowed patterns

```tsx
// Use tokens
<div className="bg-primary text-primary-foreground">...</div>     // ✅

// Use the type scale
<h2 className="text-2xl font-semibold text-foreground">...</h2>   // ✅

// Status with colour + icon + label
<Badge className="bg-risk-high-soft text-risk-high-strong">
  <ShieldX className="size-4" aria-hidden /> High
</Badge>                                                          // ✅
```

## When you genuinely need a value not in the system

If you find yourself reaching for an arbitrary value, that's a signal the design system needs to extend. Don't bypass — extend:

1. Add the token to `design-system/DESIGN.md` (with prose rationale).
2. Run `pnpm design:lint` to validate the change.
3. Run `pnpm design:export` to regenerate the Tailwind config.
4. Use the new token in your component.

## Verification

Before considering UI work done:

- Search for hardcoded hex values: `grep -rE '#[0-9a-fA-F]{6}' src/components` should return nothing.
- Search for arbitrary Tailwind values: `grep -rE 'class.*\\[(0-9|#)' src/components` should return nothing on design properties.
- Render the screen in both light and dark mode (toggle theme) and confirm contrast.
