# SmartKey

SmartKey is a key management web application for the University of Lagos Senate
Building. It replaces the paper logbook at the security desk with role-specific
dashboards, an immutable audit trail, and three supporting AI components.

The Senate Building has two zones (New Senate and Old Senate). Staff borrow
physical room keys from a security desk. SmartKey tracks who is authorised to
collect each key, issues a short-lived verification code for each request,
records every issue and return, and flags requests that fall outside normal
patterns.

## Roles

Four roles share the application, each with its own dashboard:

- **CSO (Chief Security Officer)** — system-wide oversight. Reviews anomalies,
  generates shift reports, manages user accounts and key inventory, searches the
  audit log, and configures operational settings.
- **HOD (Head of Department)** — authorises up to three collectors per
  departmental key, approves weekend access requests, and uploads a reference
  signature and stamp on first sign-in.
- **Verifier** — security personnel at the desk, working 8-hour shifts. Issues
  and receives keys, acknowledges outstanding keys at shift handover, and logs
  incidents.
- **Requester** — university staff. Requests a key, receives a 6-digit code by
  email, and presents it at the desk to collect.

External (non-registered) people can also submit a weekend-only request through
a public form; an HOD authorises it and the guest collects with a code, checked
against their physical ID at the desk.

## How a key request works (weekday)

1. A requester selects an authorised key and confirms a return time.
2. The system runs the risk engine, generates a 6-digit code (valid 10 minutes),
   and emails it.
3. The requester presents the code at the desk. The verifier sees the
   requester's name, photo, the key, and a risk tier before issuing.
4. On return, the verifier records the handover. Every step writes an audit
   entry.

Weekend access is a separate flow that requires HOD approval before a code can be
generated.

## AI components

- **Risk scoring** — a rule-based engine (pure TypeScript, no external API)
  assigns each request a Low / Medium / High tier from explainable rules. The
  verifier can see the contributing factors.
- **Shift reports** — Google Gemini generates a readable summary of a shift from
  its raw audit events, with a deterministic template fallback when the API is
  unavailable.
- **Signature verification** — Sharp and Pixelmatch compare an HOD's submitted
  signature against their onboarded reference at the pixel level to detect gross
  tampering.

All AI runs server-side, and every AI output is inspectable rather than presented
as a black-box decision.

## Tech stack

- **Framework**: Next.js (App Router), React, TypeScript (strict)
- **Database / Auth / Realtime / Storage**: Supabase (Postgres with Row Level
  Security, email-OTP MFA, websocket subscriptions, file storage)
- **UI**: Tailwind CSS with shadcn/ui and lucide-react icons
- **Forms**: react-hook-form with zod
- **Email**: Resend
- **Testing**: Vitest (unit and component), Playwright with axe-core (E2E),
  pgTAP (database)
- **Hosting**: Vercel (frontend and API routes), Supabase Cloud (backend)

## Getting started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Copy `.env.local.example` to `.env.local` and fill in the required values
(Supabase URL and keys, Gemini API key, Resend key, and risk-engine thresholds)
before running against a real backend.

## Common commands

```bash
npm run dev          # Start the development server
npm run build        # Production build
npm run lint         # Run ESLint
npm run typecheck    # Type-check with tsc
npm test             # Unit and component tests
npm run test:e2e     # Playwright E2E tests
npm run db:migrate   # Apply Supabase migrations
```

## Project layout

```
src/app/          App Router routes, one group per role plus public and api
src/components/   ui/ (shadcn primitives) and smartkey/ (app components)
src/lib/          Supabase clients, audit writer, AI integrations, utilities
src/types/        Shared TypeScript types and zod schemas
supabase/         Migrations, RLS policies, seed data
design-system/    DESIGN.md (design tokens), screens, prompt files
docs/             Long-form documentation
```

## Documentation

- `CLAUDE.md` — conventions and project rules
- `docs/PRODUCT.md` — domain and product context
- `docs/ARCHITECTURE.md` — architectural decisions
- `docs/BACKEND.md` — backend system design
- `docs/API.md` — API route catalogue
- `docs/DATABASE.md` — database schema
- `docs/AI.md` — AI integration details
- `docs/TESTING.md` — testing strategy
- `design-system/DESIGN.md` — design system and tokens
