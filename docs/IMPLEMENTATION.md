# SmartKey — Implementation Documentation

> A complete account of how SmartKey was conceived, designed, and built — from the first commit to the current state of the codebase. Written as source material for the project report; it is intentionally exhaustive rather than a quick summary. For the condensed, living version of this information, see `CLAUDE.md` and the rest of `docs/`.

**Repository**: `ayobami11/smartkey` · **Timeframe covered**: 2026-04-14 (initial commit) → 2026-07-23 (most recent activity at time of writing) · **Scale at time of writing**: 596 tracked files, ~41,100 lines of TypeScript under `src/`, 43 database migrations, 54 API routes, ~435 commits.

---

## Table of contents

1. [Overview](#1-overview)
2. [Conception and requirements](#2-conception-and-requirements)
3. [Architecture and key decisions](#3-architecture-and-key-decisions)
4. [Tech stack](#4-tech-stack)
5. [Database design](#5-database-design)
6. [API layer](#6-api-layer)
7. [AI components](#7-ai-components)
8. [Frontend and design system](#8-frontend-and-design-system)
9. [Security model](#9-security-model)
10. [Testing strategy](#10-testing-strategy)
11. [Development timeline](#11-development-timeline-chronological-narrative)
12. [Known inconsistencies and mid-project pivots](#12-known-inconsistencies-and-mid-project-pivots-the-warts)
13. [Current implementation status](#13-current-implementation-status)

---

## 1. Overview

SmartKey is a key management web application built for the security desk at the University of Lagos (UNILAG) Senate Building. It replaces a **paper logbook** that had been the sole record of every physical key issued and returned in the building — a system with no enforced deadlines, no way to check whether a collector was currently authorised, no detection of after-hours activity, and no searchable trail when something went wrong.

The system serves four distinct roles, each with a purpose-built dashboard:

| Role          | System role name | Who they are                                                                     | Primary device |
| ------------- | ---------------- | -------------------------------------------------------------------------------- | -------------- |
| **CSO**       | `CSO`            | Chief Security Officer — senior administrator, one per institution               | Desktop        |
| **Dean**      | `DEAN`           | Faculty Dean — authorises collectors and weekend access for their faculty's keys | Mixed          |
| **Verifier**  | `VERIFIER`       | Security personnel at the desk, two per 8-hour shift, 24/7                       | Shared desktop |
| **Requester** | `REQUESTER`      | University staff who need a key                                                  | Phone          |

It is built around three purpose-specific AI components — **not** a single general-purpose model bolted onto everything:

1. A **deterministic rule-based engine** that scores every key request for risk (Low/Medium/High) and explains exactly why.
2. **Google Gemini**, used narrowly to turn structured shift-event data into readable end-of-shift narrative reports.
3. **Pixel-level image comparison** (Sharp + Pixelmatch) that checks a Dean's submitted signature against their onboarded reference signature, with no machine learning involved.

The application replaces the logbook with role-specific dashboards, an immutable audit trail, and real-time updates over Supabase Realtime, targeting the following success criteria (from `docs/PRODUCT.md`):

| Criterion                                | Target                                             |
| ---------------------------------------- | -------------------------------------------------- |
| Processing time reduction (UAT vs paper) | 80–90%                                             |
| Audit-log accuracy                       | Zero missing or malformed entries                  |
| Operational uptime                       | 99.5%                                              |
| Performance                              | LCP ≤ 2.5s · CLS < 0.1 (via Vercel Speed Insights) |
| Accessibility                            | WCAG 2.2 AA across every flow                      |

Scale at launch: 5 departments, up to 50 keys per zone across 2 zones (New Senate, Old Senate), all keys collected every weekday, roughly 100–500 staff requesters.

---

## 2. Conception and requirements

### The problem being replaced

Before SmartKey, every key handover at the Senate Building security desk was recorded by hand in a physical logbook. `docs/PRODUCT.md` documents the specific failure modes this created:

- Illegible entries written under time pressure.
- Missing or wrong timestamps.
- No enforced return deadline — keys could be borrowed indefinitely.
- No real-time check on whether a collector was currently authorised for a given key.
- No detection of keys collected outside permitted hours.
- Slow incident investigations, because records were physical and not searchable.
- Dean (then "HOD") authorisations sent as paper memos, minuted by the CSO after the fact.

### Note on provenance

There is **no separate proposal, dissertation, or literature-review document committed to the repository** — no `proposal/`, `thesis/`, or `writeup/` folder, and no `ROADMAP.md` distinct from what's described below. The closest thing to a formal project-conception record living in the repo itself is:

- `docs/PRODUCT.md` — reads like a condensed project brief: problem statement, role definitions, operational rules, and the success-criteria table reproduced above.
- The five Architectural Decision Records in `docs/adr/` (walked through in full in §3).
- The "Initial scaffold" entry at the tail of `docs/CHANGELOG.md`.

The project was built with heavy Claude Code / AI-agent tooling from very early on — `.claude/`, `.agents/`, `skills-lock.json`, `AGENTS.md`, and `CLAUDE.md` are all present at the repository root, and commit `6aace3a` ("setup: configure claude code with skills, hooks, and project docs") appears just two days after the very first commit. The project's own documentation set (`docs/*.md`, `design-system/*.md`) effectively **is** the requirements and design specification — there was no separate paper design document that preceded the code; the docs and the implementation were built and evolved together.

### Roles, goals, and routes

**Chief Security Officer (CSO)** — senior administrator, desktop-primary, one per institution.
Goals: see live key counts per zone, review anomaly alerts, generate and download shift reports, manage user accounts, investigate incidents quickly.
Routes: `/cso`, `/cso/reports`, `/cso/audit`, `/cso/users`, `/cso/keys`, `/cso/settings` (implemented today as `/cso/dashboard`, `/cso/reports`, `/cso/audit`, `/cso/users`, `/cso/keys`, `/cso/admin-keys`, `/cso/weekend-requests`, `/cso/settings`).

**Dean (system role `DEAN`)** — faculty Dean, mixed device usage, one per faculty. The Administration group's keys are authorised by the CSO directly (no Dean exists for it).
Goals: whitelist up to three authorised collectors per faculty key, approve weekend access requests, upload signature and stamp on first sign-in, track faculty activity.
Routes: `/dean`, `/dean/keys/:keyId`, `/dean/weekend-requests`, `/dean/onboarding`, `/dean/settings`.

**Security Personnel (Verifier)** — two officers per shift, 24/7 in 8-hour shifts, shared desktop at the desk with phone fallback.
Goals: issue and receive keys quickly, see pending requests as they arrive, acknowledge outstanding keys at shift handover, log incidents.
Routes: `/verifier`, `/verifier/dashboard`, `/verifier/handover`, `/verifier/incidents` (issue/return flows are sheets within the dashboard rather than separate routes in the current implementation).

**Requester (university staff)** — departmental staff, phone-primary, lowest visit frequency and lowest tolerance for friction.
Goals: see authorised keys, request a key, receive a 6-digit code by email, present the code at the desk, acknowledge return.
Routes: `/requester/dashboard`, `/requester/request/:requestId/code`, `/requester/history`, `/requester/settings`.

### Operational rules baked in from the start

- **Operational hours**: configurable per zone, default 06:00–22:00 weekday, closed weekends.
- **Return SLA**: end of business day (17:00 default), configurable in CSO settings.
- **Code expiry**: 10 minutes from generation; no auto-renew, the requester must ask for a new one.
- **Authorisation slots**: exactly 3 per key, enforced at the database level.
- **Weekend access**: a separate flow entirely, gated on Dean/CSO approval, with its own code lifecycle.
- **Account onboarding**: CSO provisions every account; the user activates via a 24-hour emailed link, sets a password, and completes email-OTP MFA. Deans are then forced into signature/stamp onboarding before they can do anything else.

---

## 3. Architecture and key decisions

### High-level shape

SmartKey is deliberately **not** a microservices system. `docs/BACKEND.md` §2.1 frames this explicitly: rather than standing up a separate backend server (Express, Flask, etc.), all server-side logic lives in Next.js API routes deployed as Vercel serverless functions. The stated reasons: no CORS configuration needed (frontend and API share a host), no separate deployment pipeline or always-on infrastructure cost, automatic scale-to-zero appropriate for a pilot-scale university deployment, and citing research (Newman) that monolithic architectures reduce deployment failures and debugging complexity for systems of SmartKey's moderate complexity.

The high-level request flow:

```
Browser ──┬── Server Components / Server Actions / API Routes ──┬── Supabase (Postgres + RLS)
          │                                                      ├── Supabase Realtime (websocket)
          │                                                      ├── Supabase Storage
          │                                                      ├── Gemini API (server-side only)
          │                                                      └── Nodemailer / Gmail SMTP (email)
          │
          └── Realtime websocket subscriptions for live dashboards
```

Every client request follows the same lifecycle: the Next.js page calls an authenticated API route → the route validates the Supabase-issued JWT → business logic runs (including, where relevant, the risk engine) → the route performs the DB operation through the typed Supabase client, with RLS enforcing isolation → if the write affects a Realtime-subscribed table, connected clients get pushed the change over websocket → the route returns the `{ data, error, status }` envelope.

### The five Architectural Decision Records

All five ADRs live in `docs/adr/`, are dated 2026-05, and are marked **accepted**. Each documents context, the decision, alternatives considered, and consequences.

#### ADR 0001 — Supabase as the only backend

**Context**: the system needs auth, a relational database, realtime updates, file storage, and email delivery. These could be sourced from separate best-of-breed vendors or from one platform.

**Decision**: Supabase provides auth, database, realtime, and storage; email is handled separately via Nodemailer over Gmail SMTP (`smtp.gmail.com:587`, App Password) rather than a Supabase-adjacent service, for activation links, OTP codes, weekend reminders, and password resets.

**Alternatives considered**: composing Auth0 + a standalone Postgres instance + Pusher + S3 + SendGrid — rejected as too much operational surface area for a team without dedicated DevOps.

**Consequences**: one vendor to operate, Realtime built on Postgres logical replication fits the live-dashboard requirement well, Row Level Security lives next to the schema so auth and authorisation get reviewed together — but the whole system is exposed to a single point of failure if Supabase has an outage (mitigated by the 99.5% uptime target and an explicit `OfflineBanner` UX rather than pretending failures don't happen), and the team is now committed to Postgres-flavoured SQL and Supabase's RPC conventions, which raises the cost of ever migrating off it.

#### ADR 0002 — The audit log is append-only

**Context**: SmartKey's entire reason for existing is replacing an unaccountable paper trail with an accountable digital one. A log table that can be edited or deleted after the fact would be no more trustworthy than the logbook it replaces.

**Decision**: `audit_log` is append-only enforced at the database level — INSERT happens only via RPC, and UPDATE/DELETE are denied to every role, including the service role. No application code path performs an UPDATE or DELETE against it. Any migration touching these policies requires explicit review and a CHANGELOG entry. "Corrections" (a CSO comment on a report, an incident being resolved) are always **new** audit entries that reference the original event, never edits to it.

**Consequences**: stronger evidentiary value at the cost of more verbose history (an incident moving `OPEN → ESCALATED → RESOLVED` is three separate rows, not one row mutated twice); there is no "fix a typo" operation for the log — a wrong entry needs a corrective follow-up entry, not a silent edit. The CSO reports UI is built around this: comments are additions with explanatory copy, never inline edits to the underlying report.

#### ADR 0003 — Rule-based risk scoring, not a learned model

**Context**: the original framing of "AI-powered risk scoring" reads naturally as a trained ML model. But a learned model would need training data the team doesn't have at launch, would be opaque to the verifier trying to decide whether to issue a key, and would be nearly impossible to audit rule-by-rule.

**Decision**: a deterministic rule engine written in pure TypeScript. Each rule is named, has a plain-English description, and carries a configurable weight. The final score is the sum of triggered rule weights; tier thresholds are configurable from CSO settings; the engine's output includes both the tier **and** the list of contributing factors — never a bare number.

**Consequences**: fully explainable and auditable decisions (a verifier can see exactly why a request is High risk; a CSO can retune weights over time); no ML-ops burden, no training-data requirement; the trade-off is that the system cannot detect genuinely novel patterns outside its rule set — mitigated by the CSO's ability to add new rules and by retrospective audit-log review. The ADR is explicit that the verifier's "View factors" popover is **required, not a nice-to-have** — without it, the design loses the entire advantage it claims over a black-box model.

#### ADR 0004 — Server Components by default

**Context**: Next.js's App Router supports React Server Components. Defaulting to them shrinks client-side JavaScript and keeps secrets (the Supabase service-role key, the Gemini API key) server-side by construction rather than by discipline.

**Decision**: every component under `src/app/` and `src/components/smartkey/` is a Server Component unless it specifically needs client state, effects, or browser APIs — and even then, `"use client"` is applied at the smallest possible **leaf** component, not hoisted up to wrap an entire page. Forms prefer server actions where practical; `react-hook-form` is reserved for genuinely complex client-side forms (multi-step wizards, dynamic field arrays).

**Consequences**: smaller client bundles, which matters given the Requester's primary device is a phone; a build-time error if a server-only import leaks into client code; realtime subscriptions still need small client "islands" inside otherwise server-rendered shells; a modest learning-curve cost for anyone used to a single-environment React mental model.

#### ADR 0005 — DESIGN.md as the single source of truth for the design system

**Context**: the team was using Google Stitch for design generation alongside Tailwind in code and ad-hoc design references, which caused the design tool and the implementation to drift out of sync on tokens.

**Decision**: adopt Google Labs' DESIGN.md specification (Apache 2.0) as the sole source of truth, living at `design-system/DESIGN.md`. The accompanying CLI (`@google/design.md`) lints the file's structure and WCAG contrast, and exports it to a Tailwind config and W3C DTCG design tokens. Tailwind config and `globals.css` are meant to be **generated from DESIGN.md, never hand-authored**. Stitch reads `DESIGN.md` natively as persistent project context, so every UI generation is conditioned on the same tokens the codebase uses.

**Consequences**: one file is the single truth for both designers and developers; a token change follows a defined flow — edit → `bun run design:lint` → `bun run design:export` → regenerate downstream files; the team is committed to an alpha-stage external spec (mitigated by pinning the CLI version and reviewing spec changes before upgrading). As documented in §12, the export step (`tailwind.theme.json` / `tokens.dtcg.json`) has not actually been run yet — the tokens currently live only as prose/tables inside `DESIGN.md` itself.

### Auth and role gating

`src/middleware.ts` (moved into `src/` late in the project — see §12) reads the Supabase session on every request and gates routes by role, redirecting unauthorised access. The role lives in `profiles.role` and is read from the database rather than trusted purely from the JWT claim — `getUser()` is used for identity checks, never `getSession()` alone.

### Realtime subscriptions

Each dashboard subscribes on mount to the tables relevant to it: the Verifier watches `requests` (status `CODE_ISSUED`), outstanding keys, and the current shift; the CSO watches anomalies, zone counts, and the recent-events stream (plus, after migration 41, the `audit_log` for live signature-mismatch alerts); the Requester watches their own `requests` row; the Dean watches faculty-scoped `weekend_requests`/`requests` and their faculty's `keys`. Connection state is exposed through `useConnectionStatus()` and rendered as the green/amber/red dot in the app bar.

---

## 4. Tech stack

| Layer                       | Technology                                                                   | Why                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Framework                   | Next.js 16 (App Router), React 19, TypeScript strict                         | Unified frontend + serverless API; RSC boundaries; no separate backend server needed                 |
| Styling                     | Tailwind CSS v4 + shadcn/ui + radix-ui primitives                            | Utility-first styling driven by DESIGN.md tokens; shadcn as the composable component layer           |
| Forms                       | react-hook-form + zod (+ `@hookform/resolvers`)                              | Client-side form state and schema validation for genuinely complex forms                             |
| Data fetching/caching       | TanStack Query + TanStack Table                                              | Client-side cache/query management and the CSO users data table                                      |
| Database                    | Supabase (Postgres 15)                                                       | ACID transactions; UNIQUE/CHECK constraints enforce business rules at the engine level               |
| Realtime                    | Supabase Realtime                                                            | Postgres logical replication pushed over websocket; no separate WebSocket server                     |
| Auth                        | Supabase Auth (email/password + email-OTP MFA)                               | Native RLS integration, JWT issuance                                                                 |
| File storage                | Supabase Storage                                                             | Passport photos, Dean signatures/stamps, weekend authorisation letters                               |
| AI — risk scoring           | Pure TypeScript rule engine                                                  | No external API; deterministic and auditable (ADR 0003)                                              |
| AI — shift reports          | Google Gemini (`@google/generative-ai`, model `gemini-3.5-flash` by default) | Only task suited to an LLM: structured-data-to-prose                                                 |
| AI — signature verification | `sharp` + `pixelmatch`                                                       | Pixel-level diff; no GPU, no training data                                                           |
| Charts                      | recharts (+ shadcn chart wrapper)                                            | CSO dashboard visualisations                                                                         |
| PDF export                  | `@react-pdf/renderer`                                                        | Branded shift-report PDF download                                                                    |
| Email                       | Nodemailer over Gmail SMTP                                                   | Activation links, OTP, weekend reminders, password resets (see §12 for the provider's rocky history) |
| Testing                     | Vitest + Testing Library (unit/component), Playwright + axe-core (E2E)       | Layered testing strategy, see §10                                                                    |
| Hosting                     | Vercel (frontend/API) + Supabase Cloud (backend)                             | Zero-config Next.js deploys, managed Postgres/Auth/Realtime/Storage                                  |

### Full dependency list (from `package.json`, `smartkey` v0.1.0)

**Production dependencies**

| Package                            | Version         | Purpose                                                    |
| ---------------------------------- | --------------- | ---------------------------------------------------------- |
| `@base-ui/react`                   | ^1.5.0          | Headless UI primitives (e.g. combobox)                     |
| `@google/generative-ai`            | ^0.24.1         | Gemini SDK for shift-report generation                     |
| `@hookform/resolvers`              | ^5.2.2          | Connects `react-hook-form` to zod schemas                  |
| `@react-pdf/renderer`              | ^4.5.1          | Branded PDF export for shift reports                       |
| `@supabase/ssr`                    | ^0.10.3         | Cookie-based Supabase client for SSR                       |
| `@supabase/supabase-js`            | ^2.51.0         | Supabase JS client                                         |
| `@tanstack/react-query`            | ^5.100.10       | Data fetching/caching                                      |
| `@tanstack/react-table`            | ^8.21.3         | Data tables (CSO users page)                               |
| `@types/nodemailer`                | ^8.0.0          | Types for nodemailer                                       |
| `class-variance-authority`         | ^0.7.1          | Component variant styling                                  |
| `clsx`                             | ^2.1.1          | Conditional class names                                    |
| `date-fns`                         | ^4.4.0          | Date/time formatting                                       |
| `input-otp`                        | ^1.4.2          | OTP input component                                        |
| `lucide-react`                     | ^1.14.0         | Icon set (project-wide standard)                           |
| `next`                             | 16.2.3          | Framework                                                  |
| `next-themes`                      | ^0.4.6          | Light/dark theme switching                                 |
| `nodemailer`                       | ^8.0.10         | Gmail SMTP email delivery                                  |
| `pixelmatch`                       | ^6.0.0          | Pixel diffing for signature verification                   |
| `radix-ui`                         | ^1.4.3          | Unstyled primitives underlying shadcn/ui                   |
| `react` / `react-dom`              | 19.2.4          | UI library                                                 |
| `react-day-picker`                 | ^10.0.1         | Date picker                                                |
| `react-hook-form`                  | ^7.75.0         | Form state                                                 |
| `react-markdown` + `remark-gfm`    | ^9.1.0 / ^4.0.1 | Renders Gemini-generated shift-report markdown             |
| `recharts`                         | ^3.8.0          | CSO dashboard charts                                       |
| `resend`                           | ^4.6.0          | Email provider — installed but not the active one; see §12 |
| `shadcn`                           | ^4.7.0          | Component-generation CLI                                   |
| `sharp`                            | ^0.33.5         | Image preprocessing for signature verification             |
| `sonner`                           | ^2.0.7          | Toast notifications                                        |
| `tailwind-merge`, `tw-animate-css` | ^3.6.0 / ^1.4.0 | Tailwind class merging and animation utilities             |
| `zod`                              | ^4.4.3          | Schema validation                                          |

**Dev dependencies**

| Package                                                                                | Purpose                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------- |
| `@axe-core/playwright`                                                                 | Accessibility scanning inside E2E tests |
| `@commitlint/cli` + `@commitlint/config-conventional`                                  | Enforces Conventional Commits           |
| `@playwright/test`                                                                     | E2E test runner                         |
| `@tailwindcss/postcss`, `tailwindcss`                                                  | Tailwind v4 build pipeline              |
| `@tanstack/eslint-plugin-query`, `@tanstack/react-query-devtools`                      | Query linting/devtools                  |
| `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`   | Component testing                       |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/pixelmatch`, `@types/sharp` | Type packages                           |
| `@vitejs/plugin-react`                                                                 | React support for Vitest                |
| `eslint`, `eslint-config-next`, `eslint-config-prettier`                               | Linting                                 |
| `happy-dom`                                                                            | DOM environment for Vitest              |
| `husky`, `lint-staged`                                                                 | Git hooks: pre-commit lint/format       |
| `prettier`                                                                             | Formatting                              |
| `typescript`                                                                           | Type checking                           |
| `vitest`                                                                               | Unit/component test runner              |

---

## 5. Database design

### Schema summary

The schema (fully detailed in `docs/DATABASE.md`, authoritative source in `supabase/migrations/`) currently has 12 core tables:

- **`profiles`** — every person in the system; role enum (`CSO`/`DEAN`/`VERIFIER`/`REQUESTER`), status enum (`PENDING_ACTIVATION`/`ACTIVE`/`DEACTIVATED`), signature/stamp reference URLs for Deans.
- **`departments`** (now the "unit" grouping — see below) — each row is a faculty (owns a Dean's Office + Porter's Lodge key) or the single non-faculty "Administration" group; an `authoriser` column (`DEAN`|`CSO`) drives who approves what.
- **`guest_requesters`** — external, non-registered people who submit a weekend-only key request; deliberately **not** a `profiles`/`auth.users` row, because that would require an auth account and break the chain-of-trust `invited_by` model.
- **`keys`** — physical keys: code, zone, room name, owning department, status.
- **`authorisations`** — composite-PK table of which staff may collect which key; capped at 3 per key by a database trigger, not application logic.
- **`requests`** — the central lifecycle table: weekday or weekend, status machine from `PENDING_HOD`/`APPROVED` through `CODE_ISSUED` → `KEY_ISSUED` → `KEY_RETURNED`, plus `EXPIRED`/`CANCELLED`/`DECLINED`; carries the AI-computed `risk_tier`/`risk_factors`.
- **`hod_decisions`** — weekend approval/decline records with optional signature-verification results.
- **`shifts`** / **`shift_handovers`** — verifier shift records and chain-of-custody handover acknowledgements.
- **`shift_reports`** / **`shift_report_comments`** — immutable Gemini-generated reports and immutable CSO commentary on them.
- **`incidents`** — append-only incident log with auto-generated human-readable references (`INC-YYYY-NNNN`).
- **`audit_log`** — the append-only evidentiary backbone, denormalised with actor name/role/department at write time for fast paginated reads.

### How the schema actually evolved (migration-by-migration)

43 timestamped migrations exist under `supabase/migrations/`. Rather than being designed once and left alone, the schema visibly evolved in response to real usage and bugs discovered along the way. The full chronological list:

**Foundation (2026-05-25, 9 migrations in one day)**

1. `enums_profiles_departments` — every custom enum type, `departments`, `profiles` (with a circular FK to `departments.hod_id` resolved via a later `ALTER TABLE`).
2. `keys_authorisations` — `keys` and `authorisations`, plus a `BEFORE INSERT` trigger (`check_authorisation_limit()`) enforcing the 3-collector cap at the engine level, immune to application-layer race conditions.
3. `requests_hod_decisions` — the full `requests` lifecycle table and `hod_decisions`.
4. `shifts_handovers` — `shifts` and `shift_handovers`.
5. `shift_reports_comments` — immutable `shift_reports` and `shift_report_comments`.
6. `incidents` — the append-only incident table with its `INC-YYYY-NNNN` reference-number trigger.
7. `audit_log` — the audit table itself (immutability enforced in the next migration).
8. `rls_policies` — RLS for all 12 tables in one migration, plus `SECURITY DEFINER` helper functions `user_role()` and `user_department_id()` to avoid recursive-RLS problems. `incidents` and `audit_log` get both an explicit `USING (false)` denial policy **and** a `REVOKE UPDATE, DELETE ... FROM authenticated` — belt-and-suspenders immutability.
9. `rpcs` — the original 10 transactional RPCs (`provision_user`, `create_request`, `issue_key`, `return_key`, `approve_weekend`, `decline_weekend`, `acknowledge_shift_handover`, `generate_shift_report`, `add_report_comment`, `mark_key_overdue`), each `SECURITY DEFINER` with a pinned `search_path`, each writing to `audit_log` through a private `_write_audit()` helper.

**Early hardening (June 3–13)**

10. Nullable `incidents.shift_id` — incidents can be logged without an active shift.
11. Storage buckets + RLS for `passport-photos` and `hod-signatures`.
12. Private `weekend-letters` bucket for Dean authorisation letters.
13. First attempt at scheduled jobs — pg_cron + pg_net calling Edge Functions via `http_post` (later found not to work on managed Supabase; see #32 and §12).
14. `faculty` column added to `departments`, seed data for Engineering and Management Sciences.
15. `REPLICA IDENTITY FULL` on `requests` — needed so Realtime `UPDATE` events actually include old-row data.
16. `nominate_collector` / `remove_collector` RPCs — moves `authorisations` writes out of direct table access and into audited, transactional RPCs.
17. Fixes the realtime publication for `requests` (a gap in migration 15's assumption).
18. `REPLICA IDENTITY FULL` + realtime publication for `keys` — powers the CSO "building pulse" live zone counts.
19. Fixes `provision_user` to actually set `departments.hod_id` when provisioning a Dean (previously left null).

**Return-code flow and audit denormalisation (June 14)**

20. `return_code_flow` — adds `return_code`/`return_code_expires_at`; new `request_return()` RPC lets the _requester_ generate a return code; `return_key()` is rewritten to require either that code (verified path) or an `override_reason` (unverified path, which raises a `SUSPICIOUS_ACTIVITY` incident). This closed a gap where a verifier alone could log a phantom return.
21. `audit_log_actor_denormalisation` — adds `actor_name`/`actor_department` captured at write time, for the read-heavy paginated audit page. (152 existing rows backfilled.)
22. Adds the `APPROVED` value to the `request_status` enum (a separate migration, since a brand-new enum value can't be used in the same transaction that creates it).
23. `weekend_deferred_code_and_expiry` — a significant redesign ("Option A"): weekend approval used to mint a code immediately, which meant a valid code could sit around for up to a week, defeating the point of a short-lived OTP. From this migration on, approval only moves the request to `APPROVED`; a new `generate_weekend_code` RPC mints a 10-minute code only on the requested day itself. Adds `expire_request`.

**Guest/external requester feature (June 15–16, the most structurally significant single feature)**

24. `guest_weekend_requests_schema` — adds `guest_requesters`; relaxes `requests.requester_id`/`key_id` to nullable; adds `guest_id`, `requested_department_id`, an unguessable `access_token` (for a session-less status page), `letter_url`; a `CHECK` constraint ensures exactly one of `requester_id`/`guest_id` is set.
25. `guest_weekend_requests_rpcs` — guest analogues of the registered-user flow, keyed by `access_token` instead of `auth.uid()`, all `SECURITY DEFINER` with execute revoked from `anon`/`public` (called only from server-side routes using the admin client): `_write_audit_guest()`, `create_guest_weekend_request`, `approve_guest_weekend`, `generate_guest_weekend_code`, `expire_guest_request`.
26. Adds `requested_room` to guest requests.
27. Fixes RLS so Deans and Verifiers can actually see guest-request details (previously only the CSO could, causing "Unknown requester" in dashboards).
28. Extends the "key required after pending" check constraint to also allow a null `key_id` when a guest request is `DECLINED`.
29. Removes a redundant `" (external)"` suffix from guest audit-log actor names (the `payload->>'external'` flag already discriminates guest vs registered events).

**Reliability and cron infrastructure (June 22)**

30. `expire_stale_weekend_requests()` — auto-expires weekend requests whose date has passed while still pending, so a stranded request doesn't permanently block its key.
31. `weekend_code_reminders` — `reminder_sent_at` column plus a pg_cron job at 06:00 UTC on weekend days to remind approved requesters to mint their code.
32. `cron_jobs_direct_sql` — replaces the HTTP-based Edge Function cron jobs from migration 13 with **direct-SQL pg_cron jobs**, after discovering that the original approach (reading the Edge Function URL from `current_setting('app.supabase_url')`, itself set via `ALTER DATABASE ... SET`) is not permitted on managed Supabase — meaning those jobs had silently never fired since launch.
33. `expire_lapsed_codes()` — a server-side backstop that expires any lapsed 10-minute code (registered or guest) even if the browser tab that would have expired it client-side was closed.

**Data-integrity fixes (June 23)**

34. Reconciles Storage buckets to `public = true` — the original migration's `ON CONFLICT DO NOTHING` silently no-opped where buckets already existed as private, causing `ERR_BLOCKED_BY_ORB` errors reading photos back.

**The two big renames (June 26–27)**

35. `rename_hod_to_dean` — `ALTER TYPE user_role RENAME VALUE 'HOD' TO 'DEAN'`, plus recreation of the 6 functions whose SQL bodies embedded the literal string `'HOD'`.
36. `rename_hod_to_dean_rls_text_policies` — a necessary follow-up: RLS policies comparing `user_role() = 'HOD'::text` (a text comparison, not an enum comparison) are **not** automatically updated by an enum-value rename, so every affected policy had to be explicitly recreated.
37. `rename_departments_to_units` — `departments` → `units`, `profiles.department_id` → `unit_id`, `keys.department_id` → `unit_id`, `requests.requested_department_id` → `requested_unit_id`; FK constraint names updated for PostgREST embedding; `user_department_id()` renamed to `user_unit_id()` with a back-compat alias kept.
38. Guards `nominate_collector` against deactivated users (RLS on `authorisations` doesn't inspect requester status, so the check moved into the RPC body).
39. `weekend_code_expiry_rollback` — changes expiry semantics: expiring a **same-day** code rolls the request back to `APPROVED` (re-mintable); only a **past-date** expiry is terminal.
40. `guest_return_code` — `request_return_guest(access_token)`, the token-keyed analogue of `request_return` for guests.

**Most recent (July)**

41. `cso_signature_override` — adds a `p_cso_override` parameter to `approve_weekend`/`decline_weekend`, letting the CSO resolve a request the Dean's own approval is blocked on **only** when a `SIGNATURE_MISMATCH` audit entry already exists for it (a scoped escalation, enforced at the database level, not a blanket bypass). Also adds `audit_log` to the realtime publication for live CSO alerts.
42. `guard_stale_weekend_approvals` — closes a race window by rejecting a Dean's approve/decline call once `requested_for < current_date`, rather than relying solely on the nightly cron to catch it.

### Recurring database-design pattern

Across all 42 migrations, the same philosophy repeats: **business rules are enforced by the database engine, not just by application code.** The 3-collector cap is a trigger, not a check in a route handler. Audit-log immutability is both an RLS policy and a `REVOKE`. Every multi-table mutation goes through a `SECURITY DEFINER` RPC with a pinned `search_path` (closing a class of search-path-injection vulnerabilities) rather than the client performing several separate writes that could partially fail. This is the same idea behind `docs/ARCHITECTURE.md`'s RLS overview: a Dean cannot read another faculty's data, even via a direct API call that bypasses application-level checks — the database itself enforces the isolation.

---

## 6. API layer

### Conventions

Every route returns the same envelope:

```typescript
type ApiResponse<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number };
```

Error strings are always user-facing; stack traces and raw Supabase errors are never returned to the client — they're logged server-side with a correlation reference that _is_ included in the user-facing string (e.g. "Error reference: 7f3e9b22 — share this with the CSO if you contact support"). Every route except `/api/auth/login` and `/api/auth/reset-password` requires a valid Supabase session, verified with `getUser()`. Role is read from `profiles.role` post-session-confirmation, never trusted from the JWT claim alone — RLS is the authoritative enforcement layer, and route-level role checks exist only as defence in depth. The service-role key is used only in Edge Functions and specific server-side admin operations (e.g. signed URLs, guest RPC calls), never in browser-reachable code.

### Route inventory (54 routes across 11 domains)

| Domain                             | Count | Examples                                                                                                                                                             |
| ---------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`                            | 9     | `login`, `logout`, `register`, `callback`, `resend-otp`, `verify-otp`, `activate-hod`, `change-password`, `reset-password`                                           |
| `admin/`                           | 8     | `departments`, `units`, `keys`, `users`, `users/[id]`, `users/[id]/resend-invite`, `users/[id]/revoke`, `authorisations`, `authorisations/[key_id]/[requester_id]`   |
| `ai/`                              | 3     | `verify-signature`, `risk-alerts`, `signature-alerts`                                                                                                                |
| `requests/`                        | 11    | `submit`, `pending`, `my`, `cancel`, `expire`, `weekend-code`, `hod-decision`, `cso-decision`, `cso-queue`, `live-queue`, `[id]/letter`, `request-return`, `collect` |
| `keys/`                            | 4     | `out`, `history`, `return`, `mark-lost`                                                                                                                              |
| `shifts/`                          | 3     | `current`, `start`, `handover`                                                                                                                                       |
| `incidents/`                       | 1     | `GET`/`POST` on one route                                                                                                                                            |
| `reports/`                         | 3     | `route.ts`, `generate`, `[id]/comments`                                                                                                                              |
| `profile/`                         | 3     | `me`, `photo`, `signature`                                                                                                                                           |
| `public/` (guest, unauthenticated) | 5     | `weekend-request`, `weekend-request/[token]`, `.../code`, `.../expire`, `.../return-code`                                                                            |
| `cron/`                            | 1     | `weekend-reminders`                                                                                                                                                  |

Each mutation route delegates its actual write to a Postgres RPC — the API route validates the request with a zod schema, checks role, calls the RPC, and shapes the response. The full RPC cross-reference (from `docs/API.md`):

| RPC                                       | Called by route                                   |
| ----------------------------------------- | ------------------------------------------------- |
| `create_request`                          | `POST /api/requests/submit`                       |
| `issue_key`                               | `POST /api/requests/collect`                      |
| `generate_weekend_code`                   | `POST /api/requests/weekend-code`                 |
| `expire_request`                          | `POST /api/requests/expire`                       |
| `request_return`                          | `POST /api/requests/request-return`               |
| `return_key`                              | `POST /api/keys/return`                           |
| `approve_weekend` / `decline_weekend`     | `POST /api/requests/hod-decision`                 |
| `approve_guest_weekend`                   | `POST /api/requests/hod-decision` (guest branch)  |
| `nominate_collector` / `remove_collector` | `POST` / `DELETE /api/admin/authorisations[...]`  |
| `create_guest_weekend_request`            | `POST /api/public/weekend-request`                |
| `generate_guest_weekend_code`             | `POST /api/public/weekend-request/[token]/code`   |
| `expire_guest_request`                    | `POST /api/public/weekend-request/[token]/expire` |
| `acknowledge_shift_handover`              | `POST /api/shifts/handover`                       |
| `generate_shift_report`                   | `POST /api/reports/generate`                      |
| `add_report_comment`                      | `POST /api/reports/[id]/comments`                 |
| `provision_user`                          | `POST /api/admin/users`                           |

### A representative flow: weekday key collection

1. Requester taps a key tile → `POST /api/requests/submit` → `create_request` RPC runs the risk engine, generates a code, writes the audit entry — all inside one transaction.
2. Verifier types the 6-digit code → `POST /api/requests/collect` → `issue_key` RPC validates the code, marks the key issued, clears the code, writes the audit entry.
3. Requester generates a return code → `POST /api/requests/request-return` → `request_return` RPC.
4. Verifier confirms the return, with or without the code (`override_reason` path raises a `SUSPICIOUS_ACTIVITY` incident) → `POST /api/keys/return` → `return_key` RPC.

Every step in this chain writes exactly one audit entry as part of the same database transaction as the state change — this is a hard rule (see §9).

---

## 7. AI components

SmartKey deliberately uses **three different techniques for three different sub-problems**, rather than one general model for everything. `docs/AI.md` and `docs/BACKEND.md` §6 both frame this as a matter of using the simplest approach that's actually correct for each task.

### 1. Risk scoring — deterministic rule engine

**Location**: `src/lib/ai/risk/` (`rules.ts`, `thresholds.ts`, `engine.ts`, plus `rules.test.ts`/`engine.test.ts`).

Five rules, each with a default weight:

| Rule                           | Default weight | What it detects                                                                                                                                                 |
| ------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outside_operational_hours`    | 3              | Request submitted outside the zone's configured hours                                                                                                           |
| `outstanding_key_not_returned` | 5              | Requester is holding a key they are **not currently authorised for** (suppressed for a legitimate bulk collector still holding only keys they're authorised on) |
| `weekend_without_memo`         | 4              | Weekend request with no approved Dean memo                                                                                                                      |
| `excess_request_frequency`     | 2              | More than N requests in a rolling 24-hour window                                                                                                                |
| `collector_not_whitelisted`    | 5              | Requester isn't in the key's `authorisations`                                                                                                                   |

Tiers (configurable via CSO settings): Low ≤ 3, Medium ≤ 6, High > 6. The `outstanding_key_not_returned` rule was specifically hardened on 2026-06-23 to stop false-positiving on legitimate bulk collectors like porters. The UI surface is `<RiskTierBadge>` with a "View factors" popover that lists every contributing rule in plain English with its weight — non-negotiable per ADR 0003. High-risk requests insert an explicit acknowledgement step into the verifier's issue-key flow; the system never auto-issues a high-risk key.

### 2. Shift reports — Google Gemini

**Location**: `src/lib/ai/reports/` (`types.ts`, `prompts.ts`, `parser.ts`, `client.ts`).

This is the only place an LLM is used, and only for the task LLMs are genuinely good at: turning structured data into readable prose. `generateShiftReport(shiftId, events)` builds a structured prompt from the shift's raw audit-log events, calls Gemini (`gemini-3.5-flash` by default, overridable via `GEMINI_MODEL`), and parses the response into `{ markdown, timeline, metadata }`. If the Gemini call fails — no API key, SDK exception, or unparseable output — a deterministic TypeScript template (`buildTemplateReport`) fills the same structure so report generation always succeeds, just with less natural prose. Every report carries a footer disclosure: "Generated by AI from shift event data." Reports are stored immutably in `shift_reports` (RLS denies UPDATE); the CSO can add immutable, timestamped comments but never edit the report body itself.

### 3. Signature verification — Sharp + Pixelmatch

**Location**: `src/lib/ai/signature/verifier.ts`.

No machine learning, no GPU, no training data. The pipeline: greyscale → resize to 800×400 → binary threshold via Sharp, then a pixel-by-pixel diff via Pixelmatch, producing a mismatch percentage against a configurable threshold (`SIGNATURE_DIFF_THRESHOLD`, default 15%). On match: silent, an audit entry records "Signature verified," approval proceeds. On mismatch: the approval is **held**, a `SIGNATURE_MISMATCH` audit entry is written with both image URLs and the mismatch percentage, and the CSO dashboard surfaces an alert showing the reference and submitted images side by side — never a bare pass/fail verdict. The CSO resolves it either by `cso_override` (migration 41) or by other means; the Dean's original approval path is never silently overridden without a specific, on-record justification.

Verification is skipped in three well-defined cases: no `submitted_signature_url` was attached to the request (no letter was uploaded), the actor is the CSO (who has no reference signature of their own — `approve_weekend` is called directly with `signature_verified: true`), or the request is a guest request (a guest has no reference signature; the Dean manually reviews the uploaded letter and no pixel comparison runs).

### Cross-cutting rules for all three

All AI calls happen server-side only. Every AI output is inspectable in the UI, never presented as an opaque verdict. None of the three AI components auto-blocks an operation outright — a human always acknowledges (the verifier for high risk, the CSO for a signature mismatch). AI outputs feed the audit log; the audit log never feeds back into an AI decision.

---

## 8. Frontend and design system

### DESIGN.md as the single source

Per ADR 0005, `design-system/DESIGN.md` is the canonical definition of every visual token: colour (UNILAG maroon `#7B1F2D` as the sole primary-action colour, reserved and never decorative), typography (DM Sans for UI, Fraunces for brand surfaces only — never inside dashboards, JetBrains Mono for codes and timestamps), an 8px spacing rhythm, restrained elevation, an `8px`-default border radius, motion durations capped at 300ms and fully respecting `prefers-reduced-motion`, and a WCAG 2.2 AA accessibility floor. `design-system/screens.md` is the companion document describing _what_ to build on top of those tokens — the full information architecture, user flows, and per-screen specifications (state catalogue covering empty/loading/error/offline/content for every async surface).

### Design-to-code workflow

`design-system/prompts/` holds 39 files: 2 top-level (`_shared-blocks.md`, the canonical source for text duplicated across every prompt file, and `README.md`), plus per-role prompt sets — 8 for public/guest screens, 8 for CSO, 6 for Dean, 5 for Verifier, 7 for Requester (36 individual screen prompts total). Each prompt is pasted into Google Stitch, which has `DESIGN.md` loaded as persistent project context, so every generated screen is conditioned on the same tokens the codebase uses. This is explicitly a living, iterated system — `design-system/prompts/README.md` documents that the HOD→Dean and Department→Unit renames each required an "undocumented, file-by-file archaeology dig through all 27 files" before `_shared-blocks.md` existed as a canonical source, which is precisely why that file exists now.

### Route inventory

31 `page.tsx` files across the five areas:

- **Public** (8): landing, login, activation, forgot-password, reset-password, help, weekend-access (guest form), weekend-access/[token] (guest status page).
- **CSO** (10): dashboard, reports, reports/[id], audit, users, keys, admin-keys, admin-keys/[keyId], weekend-requests, settings.
- **Dean** (6): dashboard, keys, keys/[keyId], weekend-requests, onboarding, settings.
- **Verifier** (4): the base route plus dashboard, incidents, handover.
- **Requester** (4): dashboard, history, request/[requestId]/code, settings.

### Component inventory

18 SmartKey-specific components in `src/components/smartkey/` (built by composing shadcn primitives, never editing them directly): `risk-tier-badge`, `risk-factor-popover`, `guest-badge`, `expired-badge`, `offline-banner`, `shift-timeline`, `mode-toggle`, `sidebar-brand`, `sidebar-nav`, `dashboard-header-avatar`, `smart-key-mark`, `change-password-form`, `profile-photo-upload` (+ its preview and skeleton variants), `section-card-header`, `time-range-filter`, `transaction-status`. A further 36 shadcn/ui primitives live in `src/components/ui/` (button, card, dialog, sheet, sidebar, table, tabs, chart, combobox, and so on) — these are never hand-edited; SmartKey-specific behaviour is always wrapped around them in `src/components/smartkey/`.

Screen-specific compound components (dialogs and tables used on exactly one dashboard) live under `_components/` folders next to the route that owns them, rather than in the shared `smartkey/` tree — e.g. `src/app/cso/audit/_components/audit-table.tsx`.

---

## 9. Security model

- **RLS as the primary enforcement layer.** Every table has Row Level Security policies, and — per `docs/ARCHITECTURE.md` — this is the _authoritative_ boundary, not a backstop to application code. A Dean cannot read another faculty's data even through a direct API call that bypasses route-level checks, because the database itself refuses the row.
- **Chain-of-trust registration.** No one can self-register. The CSO seeds itself, then provisions Dean and Verifier accounts by invite; Deans nominate up to three collectors per key; every account traces back to a verifiable superior via `invited_by`.
- **Append-only audit and incident logs** (ADR 0002) — enforced by both RLS denial and a database-level `REVOKE`, not application discipline alone.
- **One-time collection codes.** The 6-digit code (`qr_token`/`code` field naming varies across docs versions, but functionally a short-lived collection secret) is cleared the moment a key is issued, preventing replay.
- **Scoped CSO override**, not a blanket admin bypass. The `cso_override` parameter added in migration 41 only functions when a `SIGNATURE_MISMATCH` audit entry already exists for the specific request — enforced inside the RPC body, not just at the route layer, so it cannot become a general escape hatch for the Dean-authoriser gate.
- **SECURITY DEFINER + pinned search_path** on every RPC, closing a class of Postgres search-path-injection vulnerabilities (explicitly called out as a fix in the 2026-05-25 CHANGELOG entry, alongside revoking EXECUTE from PUBLIC and consolidating RLS policies for performance).
- **Per-role auth cookie namespacing** — added specifically to fix a bug where sessions from different roles could overwrite each other's cookies.
- **Service-role key is server-only.** Browser code never sees it; it's used only in Edge Functions and specific admin-client operations like signing short-lived URLs for the guest letter preview.
- **High-risk requests always require explicit human acknowledgement** before the verifier can issue — this is treated as a security control, not just a UX nicety, since it's the mechanism preventing a compromised or careless verifier session from rubber-stamping a flagged request.

---

## 10. Testing strategy

### The four layers (as designed in `docs/TESTING.md`)

| Layer     | Tool                           | Coverage target                                                |
| --------- | ------------------------------ | -------------------------------------------------------------- |
| Unit      | Vitest                         | Pure logic, especially `src/lib/ai/risk/` and `src/lib/audit/` |
| Component | Vitest + React Testing Library | Every component in `src/components/smartkey/`                  |
| E2E       | Playwright + axe-core          | Every primary user flow per role                               |
| Database  | pgTAP                          | Every RPC and RLS policy                                       |

### What actually exists today

**33 unit/component test files**: 9 under `src/lib/` (the risk engine, the signature verifier, the report parser/prompts, the audit writer and event-types, date helpers), 14 under `src/tests/smartkey/` (one per shared component — risk-tier-badge, risk-factor-popover, dashboard-header-avatar, change-password-form, offline-banner, profile-photo-upload/preview, guest-badge, section-card-header, shift-timeline, sidebar-nav, mode-toggle, time-range-filter, transaction-status), plus role-scoped tests under `src/tests/public/`, `src/tests/verifier/`, `src/tests/requester/`, `src/tests/dean/`, `src/tests/hooks/`, `src/tests/cso/`, and one co-located with its component at `src/app/cso/audit/_components/audit-table.test.ts`.

**16 Playwright E2E specs** grouped by role under `tests/e2e/`: 4 public (auth, help, forgot-password, reset-password), 4 CSO (dashboard, admin-keys, users, signature-mismatch-alerts), 1 `dean/weekend-requests.spec.ts` (the legacy `hod/dashboard.spec.ts` this snapshot originally described has since been removed — only `dean/` exists now), 4 verifier (dashboard, issue-key, return-key, handover), 2 requester (dashboard, request-key). Every E2E spec runs an axe-core accessibility scan as part of the test, per `docs/TESTING.md`'s requirement that every screen test include an axe-core pass with no violations.

**pgTAP / database tests do not exist yet.** `docs/TESTING.md` and the CI workflow both reference a `test:db` step for RPC/RLS testing, but no `supabase/tests/` directory or pgTAP files exist in the repository at time of writing. This is a real gap between the documented testing strategy and its current implementation — see §12.

### CI pipeline

Two GitHub Actions workflows in `.github/workflows/`:

- **`ci.yml`** — runs on every push/PR to `main`: checkout → Bun setup → `bun install --frozen-lockfile` → `bun run typecheck` → `bun run lint` → `bun run test` → `bun run build`.
- **`e2e.yml`** — runs on PRs to `main`, skipping pure `docs/**`/`supabase/**`/`**/*.md` changes: checkout → Bun setup → `bun install --frozen-lockfile` → cached Playwright chromium install → cached `.next` build cache → `bun run build` → `bun run test:e2e -- --project=chromium` with per-role test credentials injected as secrets (`TEST_CSO_*`, `TEST_DEAN_*`, `TEST_VERIFIER_*`, `TEST_REQUESTER_*`) → Playwright HTML report uploaded as an artifact on failure, retained 7 days.

---

## 11. Development timeline (chronological narrative)

Reconstructed from ~435 commits on `main` (2026-04-14 → 2026-07-23), the branch list, merge-commit messages, and `docs/CHANGELOG.md`'s ~35 dated entries. No release tags exist; everything ships directly to `main` via PRs (with a visible mix of squash-merged feature branches and routine collaborative sync merges).

### Phase 0 — Bootstrap (2026-04-14 to 04-16)

Initial commit → Next.js install → Prettier → ESLint → Husky → commitlint → move to `/src/app` layout → dependency install → **Claude Code tooling introduced** (`6aace3a`, "configure claude code with skills, hooks, and project docs" — just two days after the very first commit) → `.gitignore` cleanup.

### Phase 1 — Design system and frontend scaffolding (05-10 to 05-23)

shadcn configured (05-10) → design-system docs, src-layout restructure, SmartKey tokens/typefaces, shared UI components/hooks/utilities, login/forgot-password/reset-password pages, landing page → **PR #4 merged** (login page, 05-14) → breadcrumb/collapsible/dropdown/pagination primitives, CSO sidebar/layout, full CSO dashboard/reports/audit/users/keys/settings pages → **PR #6 merged** (CSO dashboard, 05-17) → a heavy documentation day (05-18): E2E testing guidelines, `docs/BACKEND.md`, `docs/API.md`, PR/issue templates, `docs/GITHUB.md`, package.json test/typecheck scripts → HOD dashboard area → **PR #8 merged** (05-23).

### Phase 2 — Backend foundation (05-25 to 05-27)

The single densest day in the project's history is 2026-05-25: Supabase init → **PR #26**; then, in rapid succession, Supabase client utilities/logger/audit writer/shared types, all 12 tables' schema migrations, Next.js middleware, RLS policies for all 12 tables, 10 transactional RPCs, a fix moving RLS helper functions from the `auth` schema to `public`, **PR #32** (auth API routes) and **PR #33** (request management routes), plus several search-path-injection and RLS-performance fixes recorded in the same day's CHANGELOG entries. 05-26/27: CSO dashboard wired to live data, verifier and requester dashboards stood up, shift/incident/report/risk-alert routes, key-transaction and user-admin routes.

### Phase 3 — Auth hardening (06-02)

TS build fixes → **PR #36** (key/admin routes) → **PR #37** (shift/incident routes) → multi-step login with OTP verification, sidebar user-panel wired to live profile data across all four dashboards.

### Phase 4 — Onboarding, email, dark mode (06-03 to 06-08)

CSO endpoint fixes, `GET /api/admin/departments`, regenerated DB types, zod v3→v4 migration, seed cleanup, invite-email and activation-token fixes, **the first round of email-provider churn** (Resend → Supabase-native SMTP → custom Gmail SMTP via nodemailer), OTP UX iterated several times (InputOTP → plain text → uncontrolled ref → shadcn input-otp with auto-submit-on-paste), dark mode via `next-themes`, storage buckets for onboarding uploads, per-role auth-cookie namespacing (fixing a session-overwrite bug).

### Phase 5 — Risk engine, realtime, signature verification (06-09 to 06-13)

Risk scoring engine → **PR #38**; realtime subscriptions + offline banner → **PR #39**; RiskTierBadge/RiskFactorPopover → **PR #40**; TanStack Table added; weekend-request validation via react-hook-form + zod; signature verification (Sharp + Pixelmatch) → **PR #41**; Edge Functions (overdue-key-check, daily-shift-summary) → **PR #42**; departments remodelled around faculties, seeded → **PR #43**; a realtime replica-identity fix (**PR #44**); `nominate_collector`/`remove_collector` RPCs.

### Phase 6 — Return codes, guest flow, Gemini reports (06-14 to 06-18)

Requester-verified return-code flow, audit-log actor-name/department denormalisation, `APPROVED` status + deferred weekend code, login/password-change audit events, TanStack Query migration, **the external/guest weekend-request flow** (a major, multi-migration feature enabling non-registered visitors to request weekend access), Gemini shift-report generation with template fallback (06-16), profile-photo upload, CSO edit-user feature.

### Phase 7 — Dashboard polish, CI/CD, PDF export (06-21 to 06-23)

Client pages extracted into view components, CI/CD pipeline + Playwright config + placeholder E2E specs → **PR #46**; weekend-request dead-end fix and stale-request expiry; morning reminder emails; cron jobs moved to run directly in SQL after discovering the Edge-Function-based approach never actually worked on managed Supabase → **PR #47**; E2E speed-up → **PR #48**; shift-report PDF export via `@react-pdf/renderer` → **PR #49**; duplicate-Dean guard + `GET /api/profile/me` (**PR #50**); the outstanding-key risk rule made authorisation-aware.

### Phase 8 — The two renames + faculty/unit remodel (06-25 to 06-27)

The single most structurally disruptive stretch of the project. On 06-25, `departments` was rebuilt around faculties with a CSO-authorised Administration group — a **data-destructive rebuild on the live Supabase project**, with the old departments/keys/requests data snapshotted to a `_backup_20260625` schema before being replaced by 4 faculties plus an 18-key Administration group. On 06-26/27, the HOD role was renamed to Dean at the database level (`ALTER TYPE ... RENAME VALUE`), with a necessary follow-up fixing RLS text-comparison policies that the enum rename didn't touch automatically, and the route tree moved from `src/app/hod` to `src/app/dean`. Then `departments` itself was renamed to `units` throughout the schema, API (`/api/admin/units`), and UI labels. Also in this window: MFA OTP latency optimisation, CSO Administration key-slot management, and the first component/unit test suite added.

### Phase 9 — Centralisation, charts, second email round (06-28 to 07-05)

Date/time formatting centralised into `src/lib/dates`, badge-colour differentiation, GuestBadge component, branded password-reset email, bulk-acknowledge replaced by a select-all checkbox for shift handover, guest return-code generation, **a second full round of email-provider churn** (nodemailer → Resend → lazy-init Resend → reverted back to nodemailer/Gmail, `083530a` "revert(email): restore nodemailer gmail smtp"), CSO signature-mismatch review/override (**PR #52**), CSO dashboard charts via recharts → **PR #53**, Dean recent-activity/collectors widgets → **PR #54**, network-vs-invalid-credentials error distinction on login.

### Phase 10 — Late fixes and documentation sweep (07-19 to 07-23)

`middleware.ts` moved into `src/` for correct Next.js detection, a shared time-range filter for CSO charts, weekend-request expiry/decision-blocking guard (migration 42), and — on 07-23, the date this document's underlying research was conducted — a documentation-focused cluster: Resend removed from the documented email-services section, a `_shared-blocks.md` canonical prompt source added, the HOD→Dean/Department→Unit rename swept through design-system prompts, new screen prompts added, and a component-test-suite completion commit.

### PR/issue cross-reference

| Issue (from `docs/GITHUB.md`'s original plan) | What it covered              | PR that shipped it             |
| --------------------------------------------- | ---------------------------- | ------------------------------ |
| #9                                            | Supabase init                | #26                            |
| #10                                           | Schema (12 tables)           | #27                            |
| #11                                           | RLS policies                 | #30                            |
| #12                                           | Postgres RPCs                | #31                            |
| #13                                           | Supabase client utilities    | #29                            |
| #14                                           | Middleware / role gating     | #28                            |
| #15                                           | Auth API routes              | #32                            |
| #16                                           | Request management routes    | #33                            |
| #17                                           | Key/admin routes             | #36                            |
| #18                                           | Realtime + offline guard     | #39                            |
| #19                                           | Risk engine                  | #38                            |
| #20                                           | Risk UI (badge/popover)      | #40                            |
| #21                                           | Gemini shift reports         | landed directly, no cited PR # |
| #22                                           | Signature verification       | #41                            |
| #23                                           | Shift/incident/report routes | #37                            |
| #24                                           | Edge Functions               | #42                            |
| #25                                           | CI/CD pipeline               | #46                            |

Additional PRs that shipped work not in the original issue plan: **#43** (faculty seed), **#44** (realtime replica-identity fix), **#47** (cron interval fix), **#48** (E2E speed-up), **#49** (PDF export), **#50** (duplicate-Dean guard / profile endpoint), **#52** (signature-mismatch review), **#53** (dashboard charts), **#54** (Dean collectors table).

---

## 12. Known inconsistencies and mid-project pivots (the "warts")

A report that only shows the clean end state would misrepresent how the project was actually built. These are the real gaps, reversals, and mid-flight discoveries surfaced by the git-history and current-state research — included deliberately, because they demonstrate genuine engineering iteration and debugging rather than a project that arrived fully-formed.

**The HOD→Dean rename was briefly incomplete outside the core app — since fixed.** At one point the database enum, the app route tree (`src/app/dean/`), and the design-system prompt folder (`design-system/prompts/dean/`) had all been updated, but `tests/e2e/hod/dashboard.spec.ts` still existed as a separate file alongside `tests/e2e/dean/weekend-requests.spec.ts`, and the E2E CI workflow (`.github/workflows/e2e.yml`) still injected `TEST_HOD_EMAIL`/`TEST_HOD_PASSWORD` rather than `TEST_DEAN_*` — a leftover-sweep gap, not an intentional choice. That gap was closed on 2026-08-09 (see `docs/CHANGELOG.md`): the legacy `hod/` E2E folder is gone and CI now injects `TEST_DEAN_*`. Internally, this remains a deliberate, documented choice for _database identifiers_ — the CHANGELOG explicitly states that `hod_decisions`, `hod_id`, `HOD_APPROVED`/`HOD_DECLINED` audit event names, and the `/api/requests/hod-decision` route path were kept as-is "to avoid data-migration risk," and that part was never a gap.

**The two Supabase Edge Functions are effectively vestigial.** `overdue-key-check` and `daily-shift-summary` are still deployed under `supabase/functions/`, but migration 32 (`cron_jobs_direct_sql`) discovered that the mechanism they depended on — reading a custom Postgres setting (`current_setting('app.supabase_url')`) set via `ALTER DATABASE ... SET` — isn't permitted on managed Supabase at all. Per the CHANGELOG's own words, this meant the scheduled jobs had **"silently never fired since launch."** The fix moved both jobs' actual logic into direct-SQL pg_cron functions; the Edge Function files remain in the repo and (presumably) still deployed, but are no longer the code path that actually runs on a schedule.

**Three separate rounds of email-provider churn.** The email delivery mechanism changed direction multiple times: an initial choice of Resend, reverted to Supabase's native SMTP, then to a custom Gmail SMTP via nodemailer; later, a second round moved to Resend again (with a lazy-initialization fix along the way), before being reverted back to nodemailer/Gmail SMTP (commit `083530a`, "revert(email): restore nodemailer gmail smtp"). The `resend` package remains listed in `package.json`'s dependencies despite not being the active provider — evidently left in rather than cleaned up after the final revert. ADR 0001 states the Nodemailer/Gmail-SMTP choice as settled, but the commit history shows it took two full round trips through Resend to arrive there — most plausibly because of Resend's sending-domain verification requirements or free-tier limits colliding with a university pilot project's lack of a verified custom domain, though the exact reasoning isn't recorded in any commit message.

**A destructive schema rebuild ran directly on live data.** On 2026-06-25, the `departments` table was rebuilt around a faculty model (4 faculties + an 18-key Administration group replacing a more granular ~12-department, ~60-key structure). This was not a purely additive migration — the old departments/keys/requests data was explicitly snapshotted into a `_backup_20260625` Postgres schema before being replaced. This is a legitimate and reasonably careful way to handle a breaking schema change on a live pilot system (better than dropping data outright), but it is a genuine data-migration event worth naming plainly in a report, not glossing over as "the schema was updated."

**A production-only realtime bug, masked by React StrictMode in development.** The CHANGELOG records that Realtime subscriptions worked in local development but silently withheld all `postgres_changes` events in production. The root cause: nothing ever called `realtime.setAuth()`, so a websocket channel could join as the anonymous role before the session resolved from cookies — and RLS then withheld everything from that unauthenticated channel. React StrictMode's double-mount behavior in development happened to trigger a second, correctly-authenticated subscription attempt that masked the bug locally; production's single mount exposed it. This is a good example of an environment-specific bug class worth discussing in a report on lessons learned.

**A weekend-request "dead end" discovered in production.** Before migration 30 (`expire_stale_weekend_requests`), an approved weekend request whose requested date passed without a code ever being minted had no lifecycle terminus — it just sat in `APPROVED` forever, permanently blocking its assigned key from being requested again. The CHANGELOG notes this was found live, blocking two real keys (OE-203/OE-204), before the fix shipped.

---

## 13. Current implementation status

As of 2026-07-23, the repository contains:

- **596 tracked files**, ~41,100 lines of TypeScript under `src/`.
- **43 database migrations**, 12 core tables, ~19 RPCs (10 original + guest analogues + later additions), RLS on every table.
- **54 API routes** across 11 domains, all following the `{ data, error, status }` envelope.
- **31 pages** across public, CSO, Dean, Verifier, and Requester areas.
- **18 SmartKey-specific components** + **36 shadcn/ui primitives**.
- **33 unit/component test files** + **16 Playwright E2E specs**, all E2E specs including an axe-core accessibility scan.
- **2 GitHub Actions workflows** (`ci.yml`, `e2e.yml`) running on every push/PR.
- **2 Supabase Edge Functions** (now largely superseded by direct-SQL cron — see §12).
- All three AI components (rule-based risk scoring, Gemini shift reports, Sharp+Pixelmatch signature verification) implemented and wired into their respective UI surfaces.

Against the original 5-milestone roadmap recorded in `docs/GITHUB.md` (Foundation → Request Workflow → AI Risk Engine → LLM+Signature → CSO Backend+Jobs), every milestone's core deliverables have shipped — that document's own embedded status table is stale (it shows Milestones 4 and 5 as partially incomplete), but the CHANGELOG and merge-commit history confirm all of it landed by 2026-06-22 (CI/CD, the last item on Milestone 5) with substantial additional feature work continuing well past the original roadmap (the guest/external-requester flow, PDF export, dashboard charts, the two renames) through July.

**Known open gaps at time of writing**:

- No `supabase/tests/` pgTAP suite exists, despite being referenced by `docs/TESTING.md` and CI workflow comments.
- No `tailwind.theme.json` or `tokens.dtcg.json` design-token export exists — `design-system/DESIGN.md` remains the only machine- or human-readable source of truth for tokens; the CLI export step described in ADR 0005 has not yet been run.
- ~~The `tests/e2e/hod/` folder and `TEST_HOD_*` CI secrets have not been renamed to match the `dean/` rename elsewhere in the codebase.~~ Fixed 2026-08-09 — see `docs/CHANGELOG.md`.
- The `resend` npm package remains a listed dependency despite not being the active email provider.
