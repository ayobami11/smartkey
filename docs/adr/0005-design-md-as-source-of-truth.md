# ADR 0005 — DESIGN.md as the design system source of truth

**Status**: accepted, 2026-05

## Context

The project uses Stitch for design generation, Tailwind in the codebase, and ad-hoc design references. Without a single source of truth, tokens drift between the design tool and the implementation.

## Decision

Use Google Labs' DESIGN.md spec (Apache 2.0, released April 2026) as the source of truth for all design tokens. The file lives at `design-system/DESIGN.md`. The Google CLI (`@google/design.md`) provides:

- Lint: validates structure and WCAG contrast ratios.
- Export: produces Tailwind config and W3C DTCG tokens.

The Tailwind config and `globals.css` are generated from DESIGN.md, not authored directly. Components use the resulting Tailwind utility classes, never hardcoded values.

Stitch reads DESIGN.md natively as persistent context; every UI generation is conditioned on the same tokens the codebase uses.

## Consequences

- One file, one truth. Designers and developers refer to the same source.
- Token changes flow: edit DESIGN.md → `pnpm design:lint` → `pnpm design:export` → `globals.css` and `tailwind.config.ts` regenerate → components automatically pick up new values.
- We commit to the (alpha) DESIGN.md spec. Risk: the spec evolves and breaks our file. Mitigation: pin the CLI version; review spec changes before upgrading.
- Hand-authoring Tailwind config or `globals.css` is forbidden; use the generator.
