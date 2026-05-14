---
name: shadcn-component
description: Use this skill when adding a new shadcn/ui primitive to the project, composing existing primitives into a SmartKey-specific component, or replacing a hand-rolled component with a shadcn equivalent. Triggers on requests like "add a Dialog", "build a date picker", "I need a Tabs component", or any request to create or refactor UI components.
---

# Adding and using shadcn/ui components

This project uses shadcn/ui as the component layer beneath every screen. **Always check whether shadcn/ui has the primitive you need before writing custom components.**

## Adding a new shadcn primitive

```bash
npx shadcn@latest add <component-name>
```

The CLI installs to `src/components/ui/`. **Do not edit files in this directory by hand** — they are managed by shadcn. Customisation happens in two layers:

1. **Token level**: edit `src/app/globals.css` (the CSS variables that map to DESIGN.md tokens). All shadcn components consume these variables.
2. **Composition level**: build a SmartKey-specific wrapper in `src/components/smartkey/` that composes shadcn primitives.

## SmartKey-specific components

Located in `src/components/smartkey/`. Build a new one when:

- The component has SmartKey-specific behaviour beyond what a shadcn primitive offers (e.g., the verification code display with its 10-min countdown).
- The component is reused across more than one screen with the same shape (e.g., KeyTile, RiskTierBadge).
- The component embeds business logic (e.g., AnomalyAlertItem, HandoverChecklist).

Pattern for a new SmartKey component:

```tsx
// src/components/smartkey/RiskTierBadge.tsx
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';

type RiskTier = 'low' | 'medium' | 'high';

type RiskTierBadgeProps = {
  tier: RiskTier;
  className?: string;
};

const config = {
  low: {
    icon: ShieldCheck,
    label: 'Low',
    cls: 'bg-risk-low-soft text-risk-low-strong',
  },
  medium: {
    icon: ShieldAlert,
    label: 'Medium',
    cls: 'bg-risk-medium-soft text-risk-medium-strong',
  },
  high: {
    icon: ShieldX,
    label: 'High',
    cls: 'bg-risk-high-soft text-risk-high-strong',
  },
} as const;

export const RiskTierBadge = ({ tier, className }: RiskTierBadgeProps) => {
  const { icon: Icon, label, cls } = config[tier];
  return (
    <Badge
      className={cn('gap-1.5 text-md font-medium', cls, className)}
      aria-label={`Risk: ${label}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Badge>
  );
};
```

Note: every status carries colour + icon + text label. Never colour alone.

## When NOT to add a new component

- If a one-off layout uses a shadcn primitive directly with class overrides, that's fine — leave it inline. Don't extract until used twice.
- If the difference from shadcn defaults is visual styling alone, edit the CSS variables, don't fork the component.

## Components already in the project

Check `src/components/smartkey/` for existing components before creating new ones. The current SmartKey-specific set:

- `VerificationCodeDisplay` — the 6-digit code shown to the requester (with countdown).
- `VerificationCodeInput` — verifier's 6-segment OTP input.
- `RiskTierBadge` — Low/Medium/High status pill with factor-reveal popover.
- `KeyTile` — used in HOD key grid and Requester authorised-keys grid.
- `AnomalyAlertItem` — single alert in the CSO feed.
- `SignatureUploader` — HOD signature/stamp upload with two-pane preview.
- `HandoverChecklist` — verifier shift handover acknowledgement list.
- `LiveZoneCounter` — animated CSO zone count.
- `ShiftTimeline` — vertical event timeline inside generated reports.
- `OfflineBanner` — persistent top banner with action-disabling behaviour.
- `EmptyState` — standardised empty-state pattern with illustration and CTA.

## After making changes

Run `pnpm typecheck && pnpm lint` and confirm the component renders in both light and dark themes by visual inspection (Storybook or the dev server).
