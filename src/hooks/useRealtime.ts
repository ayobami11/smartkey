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
    const supabase = createBrowserClient();
    let retryCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const buildChannelName = () =>
      `realtime:${optionsRef.current.table}${
        optionsRef.current.filter
          ? `:${optionsRef.current.filter.column}=eq.${optionsRef.current.filter.value}`
          : ''
      }`;

    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = () => {
      if (destroyed) return;

      const { table, filter, onInsert, onUpdate, onDelete } =
        optionsRef.current;
      const channelName = buildChannelName();

      const filterStr = filter
        ? `${filter.column}=eq.${filter.value}`
        : undefined;

      const channel = supabase.channel(channelName);

      channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table,
            ...(filterStr ? { filter: filterStr } : {}),
          },
          (payload) => {
            if (onInsert) onInsert(payload as RealtimePayload<T>);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table,
            ...(filterStr ? { filter: filterStr } : {}),
          },
          (payload) => {
            if (onUpdate) onUpdate(payload as RealtimePayload<T>);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table,
            ...(filterStr ? { filter: filterStr } : {}),
          },
          (payload) => {
            if (onDelete) onDelete(payload as RealtimePayload<T>);
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
              // Capped at 30s; stop retrying, stay offline.
              logger.warn('Realtime max backoff reached; staying offline', {
                table,
              });
              setConnectionStatus('offline');
            }
          } else if (status === 'CLOSED') {
            logger.info('Realtime channel closed', { table, channelName });
          }
        });

      channelRef = channel;
    };

    subscribe();

    return () => {
      destroyed = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (channelRef) {
        supabase.removeChannel(channelRef).catch(() => {});
      }
    };
  }, []); // Subscribe once on mount; options are read via ref.
};
