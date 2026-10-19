import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  RealtimeFilter,
  RealtimePayload,
  RealtimeSubscriber,
} from '@/hooks/use-realtime';

// The registry is replaced by a recorder: each subscribeRealtime() call is
// captured with its table, filter and subscriber, so a test can fire events
// at exactly the callbacks the hook registered. realtimeChannelKey stays real.
type Attached = {
  table: string;
  filter: RealtimeFilter | undefined;
  subscriber: RealtimeSubscriber;
  detach: ReturnType<typeof vi.fn>;
};

const { attached, mockSubscribe } = vi.hoisted(() => {
  const attached: Attached[] = [];
  const mockSubscribe = vi.fn(
    (
      table: string,
      filter: RealtimeFilter | undefined,
      subscriber: RealtimeSubscriber
    ) => {
      const detach = vi.fn();
      attached.push({ table, filter, subscriber, detach });
      return detach;
    }
  );
  return { attached, mockSubscribe };
});

vi.mock('@/lib/supabase/client', () => ({ createBrowserClient: vi.fn() }));

vi.mock('@/hooks/use-realtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-realtime')>()),
  subscribeRealtime: mockSubscribe,
}));

import { realtimeChannelKey } from '@/hooks/use-realtime';
import { setConnectionStatus } from '@/hooks/use-connection-status';
import {
  DISCONNECTED_POLL_MS,
  useLiveQuery,
  type UseLiveQueryOptions,
} from '@/hooks/use-live-query';

type Row = { id: string; status: string };

const payload = (
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  row: Record<string, unknown>
) =>
  ({
    eventType,
    new: row,
    old: {},
    schema: 'public',
    table: 'requests',
    commit_timestamp: '',
    errors: [],
  }) as unknown as RealtimePayload;

const makeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });

const renderLive = <TData,>(
  options: UseLiveQueryOptions<TData>,
  client = makeClient()
) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    (props: UseLiveQueryOptions<TData>) => useLiveQuery(props),
    { wrapper, initialProps: options }
  );
  return { ...rendered, client };
};

beforeEach(() => {
  attached.length = 0;
  mockSubscribe.mockClear();
});

afterEach(() => {
  act(() => setConnectionStatus('connected'));
  vi.useRealTimers();
});

describe('useLiveQuery', () => {
  it('invalidates and refetches its own key when a subscribed event arrives', async () => {
    const queryFn = vi.fn().mockResolvedValue([] as Row[]);
    const { result, client } = renderLive({
      queryKey: ['cso', 'pending-review'],
      queryFn,
      subscriptions: [{ table: 'requests' }],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    act(() => attached[0].subscriber.onInsert?.(payload('INSERT', {})));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['cso', 'pending-review'],
    });
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
  });

  it('reacts to INSERT, UPDATE and DELETE by default, and only to `events` when given', () => {
    renderLive({
      queryKey: ['a'],
      queryFn: async () => 1,
      subscriptions: [
        { table: 'authorisations' },
        { table: 'requests', events: ['INSERT', 'UPDATE'] },
      ],
    });

    expect(attached[0].subscriber.onInsert).toBeTypeOf('function');
    expect(attached[0].subscriber.onUpdate).toBeTypeOf('function');
    expect(attached[0].subscriber.onDelete).toBeTypeOf('function');
    expect(attached[1].subscriber.onInsert).toBeTypeOf('function');
    expect(attached[1].subscriber.onUpdate).toBeTypeOf('function');
    expect(attached[1].subscriber.onDelete).toBeUndefined();
  });

  it('passes the filter through, so it resolves to use-realtime’s channel key', () => {
    renderLive({
      queryKey: ['requests', 'pending-weekend'],
      queryFn: async () => [],
      subscriptions: [
        { table: 'requests', filter: { column: 'type', value: 'WEEKEND' } },
        { table: 'keys' },
      ],
    });

    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    const keys = attached.map((a) => realtimeChannelKey(a.table, a.filter));
    expect(keys).toEqual(['realtime:requests:type=eq.WEEKEND', 'realtime:keys']);
  });

  it('lets `on` decide whether an event matters', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const { result, client } = renderLive({
      queryKey: ['cso', 'risk-alerts'],
      queryFn,
      subscriptions: [
        {
          table: 'requests',
          on: (p, live) => {
            if ((p.new as { risk_tier?: string }).risk_tier === 'HIGH')
              live.invalidate();
          },
        },
      ],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    act(() =>
      attached[0].subscriber.onInsert?.(payload('INSERT', { risk_tier: 'LOW' }))
    );
    expect(invalidateSpy).not.toHaveBeenCalled();

    act(() =>
      attached[0].subscriber.onUpdate?.(
        payload('UPDATE', { risk_tier: 'HIGH' })
      )
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['cso', 'risk-alerts'],
    });
  });

  it('patches the cached data with setData, without a refetch', async () => {
    const queryFn = vi
      .fn()
      .mockResolvedValue([{ id: 'r1', status: 'CODE_ISSUED' }] as Row[]);
    const { result } = renderLive<Row[]>({
      queryKey: ['verifier', 'queue'],
      queryFn,
      subscriptions: [
        {
          table: 'requests',
          on: (p, live) => {
            const row = p.new as Row;
            live.setData((current) =>
              (current ?? []).filter((r) => r.id !== row.id)
            );
          },
        },
      ],
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    act(() =>
      attached[0].subscriber.onUpdate?.(
        payload('UPDATE', { id: 'r1', status: 'KEY_ISSUED' })
      )
    );

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('refetches once when the connection comes back', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const { result } = renderLive({
      queryKey: ['dean', 'collectors'],
      queryFn,
      poll: false,
      subscriptions: [{ table: 'authorisations' }],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryFn).toHaveBeenCalledTimes(1);

    act(() => setConnectionStatus('reconnecting'));
    act(() => setConnectionStatus('offline'));
    expect(queryFn).toHaveBeenCalledTimes(1);

    act(() => setConnectionStatus('connected'));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));

    // Staying connected does not refetch again.
    await new Promise((r) => setTimeout(r, 20));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('polls only while disconnected by default; `poll` overrides it', async () => {
    const intervalOf = (client: QueryClient, key: string) =>
      client.getQueryCache().find({ queryKey: [key] })?.observers[0]?.options
        .refetchInterval;

    const live = renderLive({
      queryKey: ['default'],
      queryFn: async () => 1,
      subscriptions: [{ table: 'requests' }],
    });
    const fixed = renderLive({
      queryKey: ['fixed'],
      queryFn: async () => 1,
      poll: 60_000,
      subscriptions: [{ table: 'keys' }],
    });
    const never = renderLive({
      queryKey: ['never'],
      queryFn: async () => 1,
      poll: false,
      subscriptions: [{ table: 'authorisations' }],
    });

    expect(intervalOf(live.client, 'default')).toBe(false);
    expect(intervalOf(fixed.client, 'fixed')).toBe(60_000);
    expect(intervalOf(never.client, 'never')).toBe(false);

    act(() => setConnectionStatus('reconnecting'));

    await waitFor(() =>
      expect(intervalOf(live.client, 'default')).toBe(DISCONNECTED_POLL_MS)
    );
    expect(intervalOf(fixed.client, 'fixed')).toBe(60_000);
    expect(intervalOf(never.client, 'never')).toBe(false);
  });

  it('detaches every subscription on unmount', () => {
    const { unmount } = renderLive({
      queryKey: ['cso', 'key-occupancy'],
      queryFn: async () => [],
      subscriptions: [{ table: 'requests' }, { table: 'keys' }],
    });
    expect(attached).toHaveLength(2);
    attached.forEach((a) => expect(a.detach).not.toHaveBeenCalled());

    unmount();

    attached.forEach((a) => expect(a.detach).toHaveBeenCalledTimes(1));
  });

  it('does not resubscribe when only the `on` closure changes', () => {
    const { rerender } = renderLive({
      queryKey: ['x'],
      queryFn: async () => 1,
      subscriptions: [{ table: 'requests', on: () => {} }],
    });
    const second = vi.fn();
    rerender({
      queryKey: ['x'],
      queryFn: async () => 1,
      subscriptions: [{ table: 'requests', on: second }],
    });

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    act(() => attached[0].subscriber.onInsert?.(payload('INSERT', {})));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('renders the server seed on first paint without fetching', () => {
    const queryFn = vi.fn().mockResolvedValue(['fetched']);
    const { result } = renderLive({
      queryKey: ['verifier', 'seeded'],
      queryFn,
      initialData: ['seeded'],
      subscriptions: [{ table: 'requests' }],
    });

    expect(result.current.data).toEqual(['seeded']);
    expect(result.current.isLoading).toBe(false);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('does not fetch while `enabled` is false', async () => {
    const queryFn = vi.fn().mockResolvedValue(null);
    const { result } = renderLive({
      queryKey: ['active-request', null],
      queryFn,
      enabled: false,
      subscriptions: [{ table: 'requests' }],
    });

    act(() => attached[0].subscriber.onInsert?.(payload('INSERT', {})));
    await new Promise((r) => setTimeout(r, 20));
    expect(queryFn).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
  });

  it('debounces a burst of events into one invalidation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { client } = renderLive({
      queryKey: ['cso', 'activity-volume', 'from', 'to'],
      queryFn: async () => [],
      debounceMs: 1500,
      subscriptions: [{ table: 'audit_log', events: ['INSERT'] }],
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    act(() => {
      attached[0].subscriber.onInsert?.(payload('INSERT', {}));
      attached[0].subscriber.onInsert?.(payload('INSERT', {}));
      attached[0].subscriber.onInsert?.(payload('INSERT', {}));
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1500));
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidates a prefix of its own key when `invalidatePrefix` is set', () => {
    const { result, client } = renderLive({
      queryKey: ['cso', 'activity-volume', '2026-10-01', '2026-10-19'],
      queryFn: async () => [],
      invalidatePrefix: 2,
      subscriptions: [{ table: 'audit_log' }],
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    act(() => attached[0].subscriber.onInsert?.(payload('INSERT', {})));
    void result.current.invalidate();

    expect(invalidateSpy).toHaveBeenNthCalledWith(1, {
      queryKey: ['cso', 'activity-volume'],
    });
    expect(invalidateSpy).toHaveBeenNthCalledWith(2, {
      queryKey: ['cso', 'activity-volume'],
    });
  });

  it('returns an `invalidate` bound to the declared key for mutation handlers', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const { result, client } = renderLive({
      queryKey: ['keys', 'outstanding'],
      queryFn,
      subscriptions: [{ table: 'requests' }],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    await act(() => result.current.invalidate());

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['keys', 'outstanding'],
    });
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
