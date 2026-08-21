# SmartKey — Architecture

## Tech stack

| Layer          | Technology                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Frontend       | Next.js 16 (App Router), React 19, TypeScript strict                                                |
| UI             | Tailwind CSS v4, shadcn/ui, lucide-react icons                                                      |
| Forms          | react-hook-form + zod                                                                               |
| State          | React Server Components + server actions; client state via React hooks; URL state via search params |
| Database       | Supabase (Postgres)                                                                                 |
| Realtime       | Supabase Realtime (Postgres → websocket)                                                            |
| Auth           | Supabase Auth (email OTP MFA on top of password)                                                    |
| File storage   | Supabase Storage (signature/stamp images)                                                           |
| AI — risk      | Pure TypeScript rule engine (no external API)                                                       |
| AI — reports   | Google Gemini API (server-side)                                                                     |
| AI — signature | Sharp + Pixelmatch (server-side)                                                                    |
| Email          | Nodemailer (Gmail SMTP via `smtp.gmail.com:587`)                                                    |
| Testing        | Vitest (unit), Playwright + axe-core (E2E)                                                          |
| Hosting        | Vercel (frontend), Supabase (backend)                                                               |

## High-level flow

```
Browser ──┬── Server Components / Server Actions ──┬── Supabase (Postgres + RLS)
          │                                         ├── Supabase Realtime (websocket)
          │                                         ├── Supabase Storage
          │                                         ├── Gemini API (server-side only)
          │                                         └── Nodemailer / Gmail SMTP (email)
          │
          └── Realtime websocket subscriptions for live dashboards
```

## Folder structure

```
src/
├── app/
│   ├── (public)/        # landing, login, activation, forgot-password, help
│   ├── cso/             # /cso/*
│   ├── dean/            # /dean/*
│   ├── verifier/        # /verifier/*
│   ├── requester/       # /requester/*
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
│   ├── email/           # Nodemailer/Gmail SMTP templates and senders
│   ├── auth/            # MFA flow, session helpers
│   └── logger.ts        # structured logging
├── types/               # shared types and zod schemas
└── proxy.ts             # auth + role gating (Next.js 16 `proxy` convention, formerly `middleware.ts`)

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

`src/proxy.ts` (the `proxy` file convention, renamed from `middleware.ts` in Next.js 16) reads the Supabase session and the user's role, gates routes by role, and rewrites unauthorised access to a 403 page. The role is stored in a `profiles.role` column (`CSO`, `DEAN`, `VERIFIER`, `REQUESTER`) and joined into JWT claims via Supabase function. Internal identifiers (routes, RPCs, audit events — e.g. `hod_decisions`, `HOD_APPROVED`) retain the `hod` name for historical continuity, but the role enum value itself is `DEAN`.

## Realtime subscriptions

Dashboards subscribe on mount to the tables their live surfaces depend on. Four tables are published to `supabase_realtime` and carry every realtime surface in the app:

- **`requests`** — verifier queue and outstanding keys, requester active-request banner and code view, Dean/CSO weekend-request panels (the weekend panels subscribe with `filter: type=eq.WEEKEND`).
- **`keys`** — verifier outstanding keys, CSO zone/key counters.
- **`authorisations`** — Dean collectors table.
- **`audit_log`** — CSO events chart and signature-mismatch alerts.

Connection state is exposed via `useConnectionStatus()` and rendered as the green/amber/red dot in the app bar. It is backed by a module-level emitter in `src/hooks/use-connection-status.ts` written to by the subscription layer below, so every consumer reads one shared status rather than a per-component one.

### Channel multiplexing — read this before adding a subscription

`src/hooks/use-realtime.ts` holds a **module-level channel registry** keyed by `realtime:<table>[:<column>=eq.<value>]`. Every `useRealtime()` call resolves to that key: the first caller opens the websocket channel, later callers with the same key attach to it as additional subscribers. The registry ref-counts — when the last subscriber for a key unmounts, the channel is removed and the entry deleted.

This is why ~18 subscription call sites across the app cost four or five websocket channels rather than eighteen. Concurrent channels are a Realtime quota, and the server re-evaluates RLS per channel on every change, so the count is worth keeping low. This goes beyond what `docs/BACKEND.md` §8 specifies; it is deliberate.

Rules:

- **Never call `supabase.channel()` in a component.** `use-realtime.ts` is the only place a channel is created. A per-component channel silently multiplies the connection count.
- A channel subscribes with `event: '*'` and fans payloads out to subscribers by `eventType`. Narrow with `onInsert` / `onUpdate` / `onDelete`, not with separate channels.
- Only single-column equality filters are supported (`filter: { column, value }`), and the filter is part of the channel key. A filter that varies per user creates one channel per user — filter inside the callback instead unless the cardinality is genuinely small.
- Callbacks are read through a ref, so inline closures do not cause a resubscribe. Only `table` and the filter column/value are effect dependencies.
- The registry calls `realtime.setAuth()` with the session token **before** creating the channel. The Realtime server locks its RLS check at join time, so a channel joined before `setAuth` connects as `anon` and then silently delivers nothing — calling `setAuth` afterwards does not fix it.
- Reconnect lives in the registry, not the component: exponential backoff 1s → 30s on `CHANNEL_ERROR` / `TIMED_OUT`, status `reconnecting` while retrying, `offline` once backoff is exhausted.

## RLS overview

Every table has RLS. The patterns:

- **profiles**: read your own + same-faculty staff (Dean); CSO reads all.
- **keys**: read all (everyone needs to see keys they may interact with); write CSO only.
- **requests**: read your own (requester) + verifier-on-shift + Dean for their faculty + CSO; write requester (own) + verifier (status transitions) + system (RPCs).
- **audit_log**: read CSO only; INSERT via RPC only; UPDATE/DELETE denied for every RLS-governed role, including service. RLS is bypassed for Postgres superusers, so a direct superuser connection sits outside the guarantee — see `docs/DATABASE.md`.
- **shift_reports**: read CSO; INSERT via RPC only; UPDATE/DELETE denied.
- **comments on reports**: read CSO; INSERT CSO; UPDATE/DELETE denied.

Detailed policies live in the migration files.
