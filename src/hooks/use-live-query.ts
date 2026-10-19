'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useConnectionStatus } from '@/hooks/use-connection-status';
import {
  realtimeChannelKey,
  subscribeRealtime,
  type RealtimeEvent,
  type RealtimeFilter,
  type RealtimePayload,
  type RealtimeSubscriber,
} from '@/hooks/use-realtime';

// A live query is one TanStack query kept fresh by Realtime. The caller says
// what to fetch and which tables to watch; this module owns the rest: the
// subscriptions (through use-realtime's channel registry), invalidating the
// declared key on events, polling while the socket is down, and one refetch
// on reconnect to recover what was missed while offline.
//
// Every cache write goes to the key the caller declared. There is no way to
// name a different key, so a surface cannot invalidate the wrong query (the
// bug in PR #59/#60).

/** Poll every 10s while Realtime is reconnecting or offline. */
export const DISCONNECTED_POLL_MS = 10_000;

const ALL_EVENTS: readonly RealtimeEvent[] = ['INSERT', 'UPDATE', 'DELETE'];

/** Cache operations bound to the live query's own key. */
export type LiveQueryActions<TData> = {
  /** Mark the query stale and refetch it if mounted (debounced if `debounceMs`). */
  invalidate: () => void;
  /** Patch the cached data in place, without a refetch. */
  setData: (updater: (current: TData | undefined) => TData | undefined) => void;
};

export type LiveSubscription<TData> = {
  table: string;
  /** Single-column equality filter. Part of the channel key, as in useRealtime. */
  filter?: RealtimeFilter;
  /** Which events to react to. Default: all three. */
  events?: readonly RealtimeEvent[];
  /**
   * The reaction. Default: invalidate. Pass a function to filter events
   * (call `invalidate` only when the row matters), to patch the cache with
   * `setData`, or both. Read through a ref, so an inline closure is fine.
   */
  on?: (payload: RealtimePayload, live: LiveQueryActions<TData>) => void;
};

/**
 * - `'whileDisconnected'` (default): poll every 10s while Realtime is down.
 * - a number: poll at that interval regardless of the connection.
 * - `false`: never poll.
 */
export type LivePoll = 'whileDisconnected' | number | false;

export type UseLiveQueryOptions<TData> = {
  queryKey: QueryKey;
  queryFn: () => Promise<TData>;
  /** Server-rendered seed for first paint. Counts as fresh, so no fetch on mount. */
  initialData?: TData;
  enabled?: boolean;
  staleTime?: number;
  subscriptions: readonly LiveSubscription<TData>[];
  poll?: LivePoll;
  /** Collapse a burst of event-driven invalidations into one (trailing edge). */
  debounceMs?: number;
  /**
   * Invalidate only the first N segments of `queryKey`, so sibling variants
   * (e.g. other date ranges of the same chart) go stale too. Default: the
   * whole key. Still derived from `queryKey`, never a separate key.
   */
  invalidatePrefix?: number;
};

export type UseLiveQueryResult<TData> = UseQueryResult<TData, Error> & {
  /** Invalidate this query now, e.g. after a mutation. Not debounced. */
  invalidate: () => Promise<void>;
};

const subscriptionSignature = <TData>(
  subscriptions: readonly LiveSubscription<TData>[]
): string =>
  subscriptions
    .map(
      (s) =>
        `${realtimeChannelKey(s.table, s.filter)}|${(s.events ?? ALL_EVENTS).join(',')}`
    )
    .join(';');

export const useLiveQuery = <TData>(
  options: UseLiveQueryOptions<TData>
): UseLiveQueryResult<TData> => {
  const queryClient = useQueryClient();
  const status = useConnectionStatus();

  // Latest options for the subscription callbacks, so inline `on` closures
  // and a changing key never force a resubscribe (same pattern as
  // useRealtime).
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const invalidate = useCallback((): Promise<void> => {
    const { queryKey, invalidatePrefix } = optionsRef.current;
    return queryClient.invalidateQueries({
      queryKey:
        invalidatePrefix === undefined
          ? queryKey
          : queryKey.slice(0, invalidatePrefix),
    });
  }, [queryClient]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    },
    []
  );

  const subscriptionsSignature = subscriptionSignature(options.subscriptions);

  useEffect(() => {
    const scheduleInvalidate = () => {
      const { debounceMs } = optionsRef.current;
      if (!debounceMs) {
        void invalidate();
        return;
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void invalidate();
      }, debounceMs);
    };

    const actions: LiveQueryActions<TData> = {
      invalidate: scheduleInvalidate,
      setData: (updater) => {
        queryClient.setQueryData<TData>(optionsRef.current.queryKey, updater);
      },
    };

    const detachers = optionsRef.current.subscriptions.map(
      (subscription, index) => {
        const react = (payload: RealtimePayload) => {
          const latest = optionsRef.current.subscriptions[index];
          if (latest?.on) latest.on(payload, actions);
          else scheduleInvalidate();
        };
        const events = subscription.events ?? ALL_EVENTS;
        const subscriber: RealtimeSubscriber = {
          ...(events.includes('INSERT') ? { onInsert: react } : {}),
          ...(events.includes('UPDATE') ? { onUpdate: react } : {}),
          ...(events.includes('DELETE') ? { onDelete: react } : {}),
        };
        return subscribeRealtime(
          subscription.table,
          subscription.filter,
          subscriber
        );
      }
    );

    return () => detachers.forEach((detach) => detach());
  }, [subscriptionsSignature, invalidate, queryClient]);

  // Realtime does not replay events missed while the socket was down, so
  // refetch once when it comes back. The status is shared by every channel,
  // so this fires on the transition back to 'connected', not per channel.
  const previousStatusRef = useRef(status);
  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (previous !== 'connected' && status === 'connected') void invalidate();
  }, [status, invalidate]);

  const poll = options.poll ?? 'whileDisconnected';
  const refetchInterval =
    poll === 'whileDisconnected'
      ? status !== 'connected'
        ? DISCONNECTED_POLL_MS
        : false
      : poll;

  // Only pass the options the caller set: an explicit `staleTime: undefined`
  // would override the QueryClient's default (60s) and make every query
  // stale on arrival.
  const result = useQuery<TData, Error>({
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    refetchInterval,
    ...(options.initialData !== undefined
      ? { initialData: options.initialData }
      : {}),
    ...(options.enabled !== undefined ? { enabled: options.enabled } : {}),
    ...(options.staleTime !== undefined
      ? { staleTime: options.staleTime }
      : {}),
  });

  // TanStack returns a Proxy that records which fields the component reads,
  // so it re-renders only when those change. Spreading it would read every
  // field; wrap it instead to add `invalidate` without losing that tracking.
  return new Proxy(result, {
    get: (target, prop, receiver) =>
      prop === 'invalidate' ? invalidate : Reflect.get(target, prop, receiver),
  }) as UseLiveQueryResult<TData>;
};
