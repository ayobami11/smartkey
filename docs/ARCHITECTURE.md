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
├── hooks/               # file names are kebab-case; this list is illustrative, not exhaustive
│   ├── use-live-query.ts
│   ├── use-realtime.ts
│   ├── use-connection-status.ts
│   ├── use-debounce.ts
│   ├── use-media-query.ts
│   ├── use-mobile.ts
│   └── use-object-url.ts
├── lib/
│   ├── supabase/        # typed client, server, middleware
│   ├── audit/           # write-only API for audit_log
│   ├── ai/
│   │   ├── risk/        # rule engine
│   │   ├── reports/     # Gemini integration
│   │   └── signature/   # Sharp + Pixelmatch
│   ├── http/            # route() wrapper, respond.* envelope builder, RPC error → HTTP catalogue
│   ├── rpc/             # callRpc / callRpcVoid: typed RPC calls with parsed error kinds
│   ├── email/           # html.ts (escaping `markup` template), transport.ts (Gmail SMTP), templates/
│   ├── notifications/   # request-lifecycle emails: notify(event) → who, preferences, send
│   ├── queries/         # TanStack Query client + role-specific query builders
│   ├── requests/        # shared request-decision logic (e.g. decide-weekend.ts)
│   ├── validation/      # shared zod primitives and schemas
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
└── brand/               # logo/mark SVG source files (smartkey-mark.svg, etc.)

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

### Live queries — how a surface subscribes a query

A dashboard surface that shows server data and keeps it fresh with Realtime uses **`useLiveQuery`** (`src/hooks/use-live-query.ts`). The caller declares what to fetch and which tables to watch; the hook owns the rest:

```ts
const {
  data = [],
  isLoading,
  error,
  refetch,
  invalidate,
} = useLiveQuery({
  queryKey: ['cso', 'pending-review'],
  queryFn: fetchQueue,
  subscriptions: [
    {
      table: 'requests',
      events: ['INSERT', 'UPDATE'], // default: all three
      on: (payload, live) => {
        // default: live.invalidate()
        if ((payload.new as { risk_tier?: string }).risk_tier === 'HIGH')
          live.invalidate();
      },
    },
  ],
});
```

| Option                 | Meaning                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queryKey`, `queryFn`  | The TanStack query. Every invalidation and patch the hook makes targets this key.                                                                                                                                    |
| `initialData`          | Server-rendered seed for first paint; counts as fresh, so no fetch on mount. (A server `prefetchQuery` + `HydrationBoundary` under the same key works too.)                                                          |
| `enabled`, `staleTime` | Passed to `useQuery`. Omitted means the `QueryClient` default.                                                                                                                                                       |
| `subscriptions`        | `{ table, filter?, events?, on? }[]`. `filter` is the same single-column equality filter as `useRealtime`, and is part of the channel key.                                                                           |
| `on(payload, live)`    | The reaction. `live.invalidate()` (debounced when `debounceMs` is set) and `live.setData(updater)` (patch the cache, no refetch) are bound to `queryKey`. Read through a ref, so inline closures do not resubscribe. |
| `poll`                 | `'whileDisconnected'` (default): every 10s while the status is not `connected`. A number: always at that interval. `false`: never.                                                                                   |
| `debounceMs`           | Collapse a burst of event-driven invalidations into one, trailing edge.                                                                                                                                              |
| `invalidatePrefix`     | Invalidate the first N segments of `queryKey` (e.g. every cached date range of a chart). Still derived from the declared key.                                                                                        |

It returns the `useQuery` result plus `invalidate()`, bound to the same key, for mutation handlers.

What the hook guarantees:

- **The invalidated key is the declared key.** A surface cannot name a different one, which is the bug PR #59/#60 fixed by hand (the CSO weekend-requests page invalidated the Dean page's key, `['requests', 'pending-weekend']`, instead of its own, so it never updated live).
- **Refetch on reconnect.** Realtime does not replay events missed while the socket was down. When the shared status goes from `reconnecting`/`offline` back to `connected`, every mounted live query refetches once.
- **Channels come from the registry below.** The hook attaches through `subscribeRealtime()` in `use-realtime.ts`; it never calls `supabase.channel()`.

Announcements (`aria-live` regions) and reduced-motion handling stay in the surface's JSX; the hook only manages data.

`useRealtime` is still exported for a subscription that does not feed a TanStack query. One caller remains: the verifier live request queue (`src/app/verifier/_components/live-request-queue.tsx`), which keeps rows in local state and patches them with a per-row fetch. It does not refetch on reconnect.

### Channel multiplexing — read this before adding a subscription

`src/hooks/use-realtime.ts` holds a **module-level channel registry** keyed by `realtime:<table>[:<column>=eq.<value>]` (`realtimeChannelKey()`). Every subscription, from `useLiveQuery` or `useRealtime`, goes through `subscribeRealtime()` and resolves to that key: the first caller opens the websocket channel, later callers with the same key attach to it as additional subscribers. The registry ref-counts — when the last subscriber for a key unmounts, the channel is removed and the entry deleted.

This is why ~20 subscriptions across the app (17 live queries and one `useRealtime`) cost four or five websocket channels rather than twenty. Concurrent channels are a Realtime quota, and the server re-evaluates RLS per channel on every change, so the count is worth keeping low. This goes beyond what `docs/BACKEND.md` §8 specifies; it is deliberate.

Rules:

- **Never call `supabase.channel()` in a component.** `subscribeRealtime()` in `use-realtime.ts` is the only place a channel is created. A per-component channel silently multiplies the connection count.
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
