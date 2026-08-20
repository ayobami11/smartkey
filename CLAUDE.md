# SmartKey

> Claude Code reads this file at the start of every session. Keep it lean (~200 lines). Anything longer or task-specific lives in `docs/` or `.claude/skills/` and is referenced from here.

## What this is

SmartKey is a key management web application for the University of Lagos Senate Building. It replaces a paper logbook with role-specific dashboards, an immutable audit trail, and three AI components: rule-based risk scoring, Gemini-generated shift reports, and pixel-level signature verification.

Four roles share the application: **CSO** (admin oversight), **Dean** (faculty key authoriser; system role `DEAN`), **Verifier** (security personnel at the desk), **Requester** (university staff). Some internal identifiers (routes, RPCs, audit events — e.g. `hod_decisions`, `HOD_APPROVED`) retain the old `hod` name for historical continuity; the role enum itself does not.

For a full domain overview see @docs/PRODUCT.md.
For architectural decisions see @docs/ARCHITECTURE.md.
For the design system see @design-system/DESIGN.md.

## Tech stack

- **Framework**: Next.js 16 with the App Router
- **Language**: TypeScript (strict mode, no `any`)
- **Database**: Supabase (Postgres + Realtime + Auth)
- **Styling**: Tailwind CSS v4 with shadcn/ui as the component layer
- **Forms**: react-hook-form + zod
- **AI**: Google Gemini (shift reports), rule-engine in TS (risk scoring), Sharp + Pixelmatch (signature verification)
- **Testing**: Vitest (unit), Playwright (E2E with axe-core)
- **Email**: Nodemailer (Gmail SMTP via `smtp.gmail.com:587`)

## Directory map

- `src/app/` — App Router routes (one folder per role: `(public)`, `(cso)`, `(hod)`, `(verifier)`, `(requester)`)
- `src/components/ui/` — shadcn/ui primitives (do not edit by hand; use `bunx shadcn@latest add`)
- `src/components/smartkey/` — SmartKey-specific components (KeyTile, RiskTierBadge, VerificationCodeDisplay, etc.)
- `src/lib/` — Shared utilities, Supabase client, AI integrations
- `src/lib/ai/` — Risk engine, Gemini client, signature verifier
- `src/lib/audit/` — Audit log writer (write-only API)
- `src/types/` — Shared TypeScript types
- `src/hooks/` — Custom React hooks (useRealtime, useShift, etc.)
- `design-system/` — DESIGN.md (source of truth for tokens), screens.md, per-screen Stitch prompts
- `docs/` — Long-form documentation (referenced from this file)
- `tests/` — E2E tests (unit tests co-locate as `*.test.ts` next to source)
- `supabase/` — Migrations, RLS policies, seed data

## Commands

```bash
bun run dev          # Start development server at http://localhost:3000
bun run build        # Production build
bun run lint         # Run ESLint
bun run lint:fix     # Run ESLint with auto-fix
bun run format       # Format src/** with Prettier
bun run format:check # Check formatting without writing
bun run typecheck    # tsc --noEmit
bun run db:migrate   # Apply Supabase migrations
bun run test         # Run unit tests
bun run test:e2e     # Run Playwright E2E with axe-core checks
```

`bun run design:lint` / `bun run design:export` are not real scripts — no `design:*` entry exists in `package.json`. To validate `design-system/DESIGN.md`, run `bunx @google/design.md lint DESIGN.md` directly (see `design-system/prompts/README.md`); there is no equivalent export command wired up yet.

## Coding conventions

- Use **named exports**, never default exports.
- Use **`type`** over **`interface`** unless you need declaration merging.
- Components are functional with arrow-const syntax: `const KeyTile = (props: KeyTileProps) => { ... }`.
- Default to **Server Components**; add `"use client"` only when needed (state, effects, browser APIs).
- Event handlers prefixed `handle`: `handleSubmit`, `handleClick`.
- File names: PascalCase for components, kebab-case for utilities.
- Tests live in a parallel `src/tests/<area>/` tree, not co-located with the component (e.g. `src/components/smartkey/risk-tier-badge.tsx` → `src/tests/smartkey/risk-tier-badge.test.tsx`). Follow this convention for new tests rather than co-locating.
- All API responses follow the shape `{ data, error, status }`.

## Design system rules (these matter)

The design system is in @design-system/DESIGN.md. **Do not invent colours, typography, or component styling.** Use the tokens.

- Colours come from the CSS variables defined in `globals.css` (which mirror DESIGN.md). Never hardcode hex values in components.
- Typography is **DM Sans** (UI), **Fraunces** (display/brand surfaces only), or **JetBrains Mono** (codes, timestamps). Never use Fraunces inside dashboards.
- Use the maroon `primary` colour for **one action per screen** — the most important thing the user can do.
- Pair every status colour with an icon and a text label. Colour is never the sole carrier of meaning.
- All components default to Tailwind utility classes; prefer composing shadcn primitives over writing custom components.

## Off-limits

- **No code outside `src/`** (except `supabase/`, `tests/`, `design-system/`, `docs/`).
- **No CSS-in-JS, no `style={{...}}` prop** — Tailwind only.
- **No `console.log` in committed code** — use the logger from `src/lib/logger.ts`.
- **No direct edits to `src/components/ui/*`** — those are shadcn primitives. Wrap them in `src/components/smartkey/` for SmartKey-specific behaviour.
- **No direct writes to the audit log table** — always go through `src/lib/audit/` (audit entries are immutable; the writer enforces this).
- **No raw `fetch` calls to Supabase** — use the typed client from `src/lib/supabase/`.

## Workflow rules

- **Every push to a branch must include a `docs/CHANGELOG.md` entry.** No exceptions — this applies to fixes, refactors, docs and config changes, not just features. Add the entry in the same commit as the change where practical, or as a follow-up commit before pushing. Each entry: dated heading, a **Why** line explaining the reason the change was needed (not just what changed), then the specifics. Newest entry goes at the top of `## Entries`.
- **Use plan mode** for anything that touches more than one file. Show the plan before writing code.
- After any change, run `bun run typecheck && bun run lint` before considering the task done.
- For new screens, **read @docs/SCREEN_CHECKLIST.md** first — it covers states (empty, loading, error, offline, content) you must design for every async surface.
- For new components, check `src/components/smartkey/` first. Reuse before creating.
- For database changes, write a migration in `supabase/migrations/` and update RLS policies. Document the change in `docs/CHANGELOG.md`.

## Critical security and operational rules

- **Audit log integrity**: every consequential action writes an audit log entry in the same transaction as the state change. Partial saves are not allowed.
- **High-risk requests**: the verifier UI requires explicit acknowledgement before proceeding. Never auto-issue a high-risk request.
- **Offline behaviour**: destructive actions disable while offline. Never let the UI claim success before the server confirms the write.
- **Supabase RLS**: every table has Row Level Security policies. Never query Supabase with the service-role key from the browser; service role is server-only.
- **HOD signature verification**: the comparison runs server-side. Mismatches above threshold hold the approval and raise a CSO alert.

## Claude Code customisations

**PostToolUse hook** (`.claude/settings.json`): Prettier runs automatically on every file after Write, Edit, or MultiEdit — no need to format manually.

**`/commit` skill** (`.claude/commands/commit.md`): generates a Conventional Commits message from `git diff --staged` (falls back to `git diff`).

**`jq` is not available** on this machine. Use `node` for any JSON parsing in shell commands.

## Installed agent skills

Six framework skills (from `npx skills`) in `.agents/skills/` load automatically:

| Skill                         | What it covers                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `next-best-practices`         | Next.js file conventions, RSC boundaries, async APIs, data patterns, routing, image/font, bundling |
| `shadcn`                      | shadcn/ui component management — add, update, compose, style                                       |
| `vercel-react-best-practices` | React performance: re-renders, async patterns, bundling, rendering                                 |
| `frontend-design`             | General frontend design guidance                                                                   |
| `web-design-guidelines`       | Visual/UX design guidelines                                                                        |
| `find-skills`                 | Discover and install new skills from skills.sh                                                     |

Six domain skills in `.claude/skills/` load automatically when the task matches:

| Skill                     | Triggers on                                           |
| ------------------------- | ----------------------------------------------------- |
| `shadcn-component`        | Adding/composing shadcn/ui primitives                 |
| `design-token-discipline` | Any UI work — Tailwind classes, CSS, component styles |
| `accessibility-floor`     | Any screen, component, form, or interactive element   |
| `audit-log-discipline`    | Any action with operational consequences              |
| `realtime-and-offline`    | Live-data subscriptions, offline guards               |
| `ai-integration`          | `src/lib/ai/` or AI output surfaces                   |

## Code quality tooling

**Pre-commit hook** (`lint-staged`): on staged JS/TS files runs ESLint with auto-fix; on JSON/CSS/MD files runs Prettier.

**Commit-msg hook** (`commitlint`): enforces Conventional Commits. Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `setup`. Subject max 72 chars, must not be start-case, pascal-case, or upper-case.

**Prettier config** (`.prettierrc`): single quotes, semicolons, 2-space tabs, trailing commas (ES5), 80 char print width, LF line endings.

**ESLint config** (`eslint.config.mjs`): Next.js core-web-vitals + TypeScript rules, Prettier integration.

## Where to find more

- Domain and product context: @docs/PRODUCT.md
- Architecture decisions: @docs/ARCHITECTURE.md
- Full backend system design (API routes, RPCs, AI, auth, jobs): @docs/BACKEND.md
- API route catalogue (every route — method, roles, schema, RPC): @docs/API.md
- Design system: @design-system/DESIGN.md and @design-system/screens.md
- Per-screen specs and prompt templates: @design-system/prompts/README.md
- Database schema: @docs/DATABASE.md
- AI integration details: @docs/AI.md
- Testing strategy: @docs/TESTING.md
- Screen checklist for new screens: @docs/SCREEN_CHECKLIST.md
- Glossary of project terms: @docs/GLOSSARY.md
- GitHub workflow (labels, milestones, issues, branches, PR template): @docs/GITHUB.md
- Architectural decision records: @docs/adr/
