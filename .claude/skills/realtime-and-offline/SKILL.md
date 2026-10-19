---
name: realtime-and-offline
description: Use this skill when building screens or features that subscribe to live data (verifier dashboard, CSO dashboard, requester active-request banner) or that perform actions while connectivity may be unstable. Triggers on any work involving Supabase Realtime, live counters, queues, or destructive actions that need offline guards.
---

# Realtime and offline behaviour

SmartKey runs at the security desk where connectivity is not always stable. The UI must communicate connection state clearly and never let users believe a destructive action succeeded if it has not.

## Realtime via Supabase: use `useLiveQuery`

Supabase Realtime streams Postgres changes over a websocket. A surface that shows server data and keeps it live declares a **live query** (`src/hooks/use-live-query.ts`) instead of wiring `useQuery` + `useRealtime` + `invalidateQueries` + a polling interval by hand:

```tsx
const {
  data = [],
  isLoading,
  error,
  refetch,
  invalidate,
} = useLiveQuery({
  queryKey: ['dean', 'collectors'],
  queryFn: fetchCollectors,
  subscriptions: [{ table: 'authorisations' }], // any event → invalidate
});
```

- **Reaction**: by default any event on a subscribed table invalidates the query. Narrow with `events: ['INSERT', 'UPDATE']`, or pass `on: (payload, live) => …` and call `live.invalidate()` only when the row matters (e.g. `requester_id === userId`), or `live.setData(updater)` to patch the cache without a refetch.
- **Keys**: `live.invalidate`, `live.setData` and the returned `invalidate()` all target the declared `queryKey`. Use the returned `invalidate()` after a mutation instead of `queryClient.invalidateQueries({ queryKey: [...] })` — retyping the key is how PR #59/#60 happened.
- **Filters**: `filter: { column, value }` is a single-column equality filter and part of the channel key (see "Channel multiplexing" in `docs/ARCHITECTURE.md`). Prefer filtering in `on` unless the value is fixed and the channel would otherwise be noisy.
- **Seed**: pass `initialData` for a server-rendered first paint, or prefetch the same key on the server and wrap in `HydrationBoundary`.
- **Polling**: defaults to every 10s while the connection is not `connected` (`poll: 'whileDisconnected'`). `poll: 60_000` polls always (for clock-derived data); `poll: false` never.
- **Bursts**: `debounceMs` collapses a burst of events into one refetch.
- **Reconnect**: when the status returns to `connected`, every mounted live query refetches once, so changes missed while offline appear. Nothing to write per surface.

Never call `supabase.channel()` in a component. `useLiveQuery` and `useRealtime` both attach through the shared registry in `src/hooks/use-realtime.ts`. Use `useRealtime` directly only for a subscription that does not feed a TanStack query.

The connection state is rendered as a small dot in the app bar:

- **Green** — connected.
- **Amber** — reconnecting (exponential backoff, max 30s).
- **Red** — offline (after 30s of failed reconnects, surface the OfflineBanner).

## OfflineBanner behaviour

When connection state is `offline` for more than 30 seconds, the `OfflineBanner` component renders persistently at the top of the screen. While shown:

- **Destructive and authoritative actions disable**: issue key, mark returned, approve memo, decline memo, save settings. The disabled buttons show a tooltip "Available again when you reconnect."
- **Read-only actions remain available** with last-known data.
- **Forms can still be filled in** but submission is disabled.

Use the `useConnectionStatus` hook to gate behaviour:

```tsx
const isOffline = useConnectionStatus() === 'offline';
<Button disabled={isOffline} onClick={handleIssueKey}>
  Issue key
</Button>;
{
  isOffline && <span className="sr-only">Disabled while offline</span>;
}
```

## Optimistic updates: don't

The audit log is the integrity backbone. Optimistic UI updates risk lying to the user about what was logged. Pattern instead:

1. User taps action button → button enters loading state.
2. Server-side mutation runs (audit + state in a single transaction).
3. On success, the server returns the new state; client updates from authoritative response.
4. On failure, button returns to enabled with an error message.

Rendering "issued" optimistically and then rolling back if the server says otherwise is forbidden — this is exactly the kind of mistake the paper logbook used to make. The button takes ~300–500ms; that is acceptable.

## Animations on realtime updates

When a new item arrives via Realtime, animate it in (slide-in, 200ms).

- Respect `prefers-reduced-motion` — under reduced motion, no animation, just the new item appearing.
- Sound on new request is opt-in only and respects OS Do Not Disturb where the browser exposes it.

## Reconnection UX

On reconnect after an offline period:

- Banner replaced by a 3-second success toast: "Reconnected. Live updates resumed."
- Any items missed during the offline period are fetched. The realtime subscription does not replay, so `useLiveQuery` refetches each mounted live query once on reconnect. A surface on bare `useRealtime` (today only the verifier live request queue) does not get this.
- If destructive actions were attempted while offline, they are queued in memory only — never persisted to localStorage. The user must re-confirm them after reconnect.

## Verification

For every realtime-dependent screen:

- Open dev tools → Network tab → set to Offline. The OfflineBanner appears within 30s. Destructive buttons disable.
- Set back to Online. Banner disappears, success toast appears, queue updates.
- Tab away for 60 seconds, come back. Connection re-establishes, no stale data.
