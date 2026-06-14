'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { createBrowserClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { setConnectionStatus } from '@/hooks/useConnectionStatus';

// Backoff delays in milliseconds: 1s, 2s, 4s, 8s, 16s, 30s (capped).
const BACKOFF_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
const MAX_BACKOFF_MS = 30_000;

type RealtimePayload<
  T extends Record<string, unknown> = Record<string, unknown>,
> = RealtimePostgresChangesPayload<T>;

export type UseRealtimeOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  table: string;
  filter?: { column: string; value: string };
  onInsert?: (payload: RealtimePayload<T>) => void;
  onUpdate?: (payload: RealtimePayload<T>) => void;
  onDelete?: (payload: RealtimePayload<T>) => void;
};

// --- Module-level Registry for Multiplexing ---
type Subscriber = {
  onInsert?: (payload: RealtimePayload) => void;
  onUpdate?: (payload: RealtimePayload) => void;
  onDelete?: (payload: RealtimePayload) => void;
};

type RegistryEntry = {
  subscribers: Set<Subscriber>;
  cleanup: () => void;
};

const channelRegistry = new Map<string, RegistryEntry>();

export const useRealtime = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  options: UseRealtimeOptions<T>
): void => {
  const optionsRef = useRef(options);

  // Keep the ref current after every render so the subscription callbacks
  // always read the latest prop values without needing to re-subscribe.
  // useLayoutEffect runs synchronously before the browser paint, which means
  // the ref is up to date before the subscription effect fires on mount.
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const { table, filter } = optionsRef.current;

    // Create a deterministic channel name based on table and filter
    const channelName = `realtime:${table}${
      filter ? `:${filter.column}=eq.${filter.value}` : ''
    }`;

    // 1. Create a subscriber interface for this specific hook instance
    // It reads from optionsRef.current to always fire the latest callback closures
    // The registry is non-generic (it holds subscribers from callers with
    // different T), so bridge its base payload to this instance's generic
    // callbacks. The cast is sound: T is the row shape for `table`, which is
    // exactly what the payload carries.
    const subscriber: Subscriber = {
      onInsert: (payload) =>
        optionsRef.current.onInsert?.(payload as RealtimePayload<T>),
      onUpdate: (payload) =>
        optionsRef.current.onUpdate?.(payload as RealtimePayload<T>),
      onDelete: (payload) =>
        optionsRef.current.onDelete?.(payload as RealtimePayload<T>),
    };

    let registry = channelRegistry.get(channelName);

    // 2. If channel doesn't exist, create it and set up the connection logic
    if (!registry) {
      const supabase = createBrowserClient();
      let retryCount = 0;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let destroyed = false;
      let channelRef: ReturnType<typeof supabase.channel> | null = null;

      const filterStr = filter
        ? `${filter.column}=eq.${filter.value}`
        : undefined;

      const subscribe = () => {
        if (destroyed) return;

        const channel = supabase.channel(channelName);
        channelRef = channel;

        // Subscribe to all changes (*) on this table/filter once
        channel
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table,
              ...(filterStr ? { filter: filterStr } : {}),
            },
            (payload) => {
              const currentRegistry = channelRegistry.get(channelName);
              if (!currentRegistry) return;

              // Broadcast to all registered hook instances
              currentRegistry.subscribers.forEach((sub) => {
                if (payload.eventType === 'INSERT') sub.onInsert?.(payload);
                else if (payload.eventType === 'UPDATE')
                  sub.onUpdate?.(payload);
                else if (payload.eventType === 'DELETE')
                  sub.onDelete?.(payload);
              });
            }
          )
          .subscribe((status, err) => {
            if (destroyed) return;

            if (status === 'SUBSCRIBED') {
              logger.info('Realtime subscribed', { table, channelName });
              setConnectionStatus('connected');
              retryCount = 0;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              const delay =
                BACKOFF_DELAYS[Math.min(retryCount, BACKOFF_DELAYS.length - 1)];
              logger.warn('Realtime channel error; scheduling reconnect', {
                table,
                channelName,
                status,
                err: err?.message,
                retryCount,
                delayMs: delay,
              });

              if (delay >= MAX_BACKOFF_MS) {
                setConnectionStatus('offline');
              } else {
                setConnectionStatus('reconnecting');
              }

              supabase.removeChannel(channel).catch(() => {});

              if (
                delay < MAX_BACKOFF_MS ||
                retryCount < BACKOFF_DELAYS.length - 1
              ) {
                timeoutId = setTimeout(() => {
                  retryCount += 1;
                  subscribe();
                }, delay);
              } else {
                logger.warn('Realtime max backoff reached; staying offline', {
                  table,
                });
                setConnectionStatus('offline');
              }
            } else if (status === 'CLOSED') {
              logger.info('Realtime channel closed', { table, channelName });
            }
          });
      };

      subscribe();

      registry = {
        subscribers: new Set(),
        cleanup: () => {
          destroyed = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
          if (channelRef) {
            supabase.removeChannel(channelRef).catch(() => {});
          }
        },
      };

      channelRegistry.set(channelName, registry);
    }

    // 3. Register this component instance to the shared channel
    registry.subscribers.add(subscriber);

    // 4. Cleanup on unmount
    return () => {
      const currentRegistry = channelRegistry.get(channelName);
      if (currentRegistry) {
        currentRegistry.subscribers.delete(subscriber);

        // Ref-counting: Destroy channel if no one is listening anymore
        if (currentRegistry.subscribers.size === 0) {
          currentRegistry.cleanup();
          channelRegistry.delete(channelName);
        }
      }
    };
  }, []); // Empty deps array: we only evaluate setup once per component mount
};
