---
name: realtime-and-offline
description: Use this skill when building screens or features that subscribe to live data (verifier dashboard, CSO dashboard, requester active-request banner) or that perform actions while connectivity may be unstable. Triggers on any work involving Supabase Realtime, live counters, queues, or destructive actions that need offline guards.
---

# Realtime and offline behaviour

SmartKey runs at the security desk where connectivity is not always stable. The UI must communicate connection state clearly and never let users believe a destructive action succeeded if it has not.

## Realtime via Supabase

Use Supabase Realtime (Postgres changes streamed via websocket). Pattern:

```ts
// src/hooks/useRealtimeRequests.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export const useRealtimeRequests = () => {
  const [requests, setRequests] = useState<Request[]>([]);
  const [status, setStatus] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'offline'
  >('connecting');

  useEffect(() => {
    const channel = supabase
      .channel('requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requests' },
        (payload) => {
          // update local state from payload
        }
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('connected');
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT')
          setStatus('reconnecting');
        if (s === 'CLOSED') setStatus('offline');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return { requests, status };
};
```

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
const { isOffline } = useConnectionStatus();
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
- Any items missed during offline period are fetched (the realtime subscription does not replay; you must fetch the gap manually).
- If destructive actions were attempted while offline, they are queued in memory only — never persisted to localStorage. The user must re-confirm them after reconnect.

## Verification

For every realtime-dependent screen:

- Open dev tools → Network tab → set to Offline. The OfflineBanner appears within 30s. Destructive buttons disable.
- Set back to Online. Banner disappears, success toast appears, queue updates.
- Tab away for 60 seconds, come back. Connection re-establishes, no stale data.
