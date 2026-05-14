# SmartKey — Architecture

## Tech stack

| Layer          | Technology                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Frontend       | Next.js 15 (App Router), React 19, TypeScript strict                                                |
| UI             | Tailwind CSS v3, shadcn/ui, lucide-react icons                                                      |
| Forms          | react-hook-form + zod                                                                               |
| State          | React Server Components + server actions; client state via React hooks; URL state via search params |
| Database       | Supabase (Postgres)                                                                                 |
| Realtime       | Supabase Realtime (Postgres → websocket)                                                            |
| Auth           | Supabase Auth (email OTP MFA on top of password)                                                    |
| File storage   | Supabase Storage (signature/stamp images)                                                           |
| AI — risk      | Pure TypeScript rule engine (no external API)                                                       |
| AI — reports   | Google Gemini API (server-side)                                                                     |
| AI — signature | Sharp + Pixelmatch (server-side)                                                                    |
| Email          | Resend                                                                                              |
| Testing        | Vitest (unit), Playwright + axe-core (E2E)                                                          |
| Hosting        | Vercel (frontend), Supabase (backend)                                                               |

## High-level flow

```
Browser ──┬── Server Components / Server Actions ──┬── Supabase (Postgres + RLS)
          │                                         ├── Supabase Realtime (websocket)
          │                                         ├── Supabase Storage
          │                                         ├── Gemini API (server-side only)
          │                                         └── Resend (email)
          │
          └── Realtime websocket subscriptions for live dashboards
```

## Folder structure

```
src/
├── app/
│   ├── (public)/        # landing, login, activation, forgot-password, help
│   ├── (cso)/           # /cso/*
│   ├── (hod)/           # /hod/*
│   ├── (verifier)/      # /verifier/*
│   ├── (requester)/     # /me/*
│   ├── api/             # server actions and route handlers
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/              # shadcn primitives (do not edit by hand)
│   └── smartkey/        # SmartKey-specific components
├── hooks/
│   ├── useRealtime.ts
│   ├── useShift.ts
│   ├── useReducedMotion.ts
│   └── useConnectionStatus.ts
├── lib/
│   ├── supabase/        # typed client, server, middleware
│   ├── audit/           # write-only API for audit_log
│   ├── ai/
│   │   ├── risk/        # rule engine
│   │   ├── reports/     # Gemini integration
│   │   └── signature/   # Sharp + Pixelmatch
│   ├── email/           # Resend templates and senders
│   ├── auth/            # MFA flow, session helpers
│   └── logger.ts        # structured logging
├── types/               # shared types and zod schemas
└── middleware.ts        # auth + role gating

supabase/
├── migrations/          # timestamped SQL files
├── seed.sql             # development seed
└── tests/               # pgTAP tests for RPCs and RLS

design-system/
├── DESIGN.md            # source of truth (Google DESIGN.md spec)
├── screens.md           # IA, flows, screen specs
├── prompts/             # per-screen Stitch prompt files
├── tailwind.theme.json  # exported by design.md CLI
└── tokens.dtcg.json     # exported by design.md CLI

docs/
└── (this folder)
```

## Architectural decisions

Key decisions live in `docs/adr/` as numbered records. Read them when in doubt.

- **ADR-0001**: Use Supabase as the only backend. Simplifies auth, realtime, storage.
- **ADR-0002**: Audit log is append-only via RPCs. RLS denies UPDATE and DELETE.
- **ADR-0003**: AI risk scoring is rule-based, not learned. Auditable and explainable.
- **ADR-0004**: Default to Server Components; client components only for interactivity.
- **ADR-0005**: Design tokens managed via Google DESIGN.md spec; exports drive Tailwind.

## Auth and role gating

`middleware.ts` reads the Supabase session and the user's role, gates routes by role, and rewrites unauthorised access to a 403 page. The role is stored in a `profiles.role` column (CSO, HOD, VERIFIER, REQUESTER) and joined into JWT claims via Supabase function.

## Realtime subscriptions

Every dashboard subscribes on mount to its relevant tables:

- Verifier: `requests` (status='pending'), `outstanding_keys`, `current_shift`.
- CSO: `anomalies`, `zone_counts` (materialised view), `recent_events`.
- Requester: own `requests` row.
- HOD: `weekend_requests` (department-scoped), department `keys`.

Connection state is exposed via `useConnectionStatus()` and rendered as the green/amber/red dot in the app bar.

## RLS overview

Every table has RLS. The patterns:

- **profiles**: read your own + same-department staff (HOD); CSO reads all.
- **keys**: read all (everyone needs to see keys they may interact with); write CSO only.
- **requests**: read your own (requester) + verifier-on-shift + HOD for their department + CSO; write requester (own) + verifier (status transitions) + system (RPCs).
- **audit_log**: read CSO only; INSERT via RPC only; UPDATE/DELETE denied for everyone.
- **shift_reports**: read CSO; INSERT via RPC only; UPDATE/DELETE denied.
- **comments on reports**: read CSO; INSERT CSO; UPDATE/DELETE denied.

Detailed policies live in the migration files.
