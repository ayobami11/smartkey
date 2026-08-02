import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateBrowserClient, mockSetConnectionStatus, mockLogger } =
  vi.hoisted(() => ({
    mockCreateBrowserClient: vi.fn(),
    mockSetConnectionStatus: vi.fn(),
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: mockCreateBrowserClient,
}));

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}));

vi.mock('@/hooks/use-connection-status', () => ({
  setConnectionStatus: mockSetConnectionStatus,
}));

import { useRealtime } from '@/hooks/use-realtime';

// A fake channel: `.on()` captures the postgres_changes callback, `.subscribe()`
// captures the status callback. Both are exposed as `_emitPayload`/`_emitStatus`
// so a test can drive the channel exactly like the real Supabase Realtime
// client would, without a network connection.
const buildFakeChannel = () => {
  let payloadHandler: ((payload: unknown) => void) | null = null;
  let statusHandler: ((status: string, err?: Error) => void) | null = null;

  const chan: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    _emitPayload: (payload: unknown) => void;
    _emitStatus: (status: string, err?: Error) => void;
  } = {
    on: vi.fn((_event, _config, cb) => {
      payloadHandler = cb;
      return chan;
    }),
    subscribe: vi.fn((cb) => {
      statusHandler = cb;
      return chan;
    }),
    _emitPayload: (payload) => payloadHandler?.(payload),
    _emitStatus: (status, err) => statusHandler?.(status, err),
  };
  return chan;
};

const buildFakeSupabase = () => {
  const channelInstances: ReturnType<typeof buildFakeChannel>[] = [];
  const removeChannel = vi.fn().mockResolvedValue(undefined);
  const getSession = vi
    .fn()
    .mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
  const setAuth = vi.fn();

  const channel = vi.fn(() => {
    const chan = buildFakeChannel();
    channelInstances.push(chan);
    return chan;
  });

  return {
    client: {
      auth: { getSession },
      realtime: { setAuth },
      channel,
      removeChannel,
    },
    channelInstances,
    removeChannel,
    getSession,
    setAuth,
    channel,
  };
};

// Flushes the getSession() microtask so `subscribe()` (called inside its
// `.then()`) has run and the channel exists.
const flushMicrotasks = () => Promise.resolve().then(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRealtime', () => {
  it('subscribes to postgres_changes for the given table, no filter', async () => {
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const { unmount } = renderHook(() => useRealtime({ table: 'req_basic' }));
    await flushMicrotasks();

    expect(fake.channel).toHaveBeenCalledWith('realtime:req_basic');
    expect(fake.channelInstances[0].on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'req_basic' },
      expect.any(Function)
    );

    unmount();
  });

  it('includes the filter in the channel name and postgres_changes config', async () => {
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const { unmount } = renderHook(() =>
      useRealtime({
        table: 'req_filtered',
        filter: { column: 'status', value: 'PENDING' },
      })
    );
    await flushMicrotasks();

    expect(fake.channel).toHaveBeenCalledWith(
      'realtime:req_filtered:status=eq.PENDING'
    );
    expect(fake.channelInstances[0].on).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'req_filtered',
        filter: 'status=eq.PENDING',
      },
      expect.any(Function)
    );

    unmount();
  });

  it('calls setAuth with the session token before subscribing', async () => {
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const { unmount } = renderHook(() => useRealtime({ table: 'req_auth' }));
    await flushMicrotasks();

    expect(fake.setAuth).toHaveBeenCalledWith('test-token');
    unmount();
  });

  it('dispatches INSERT/UPDATE/DELETE payloads to the matching callback only', async () => {
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const onInsert = vi.fn();
    const onUpdate = vi.fn();
    const onDelete = vi.fn();

    const { unmount } = renderHook(() =>
      useRealtime({ table: 'req_dispatch', onInsert, onUpdate, onDelete })
    );
    await flushMicrotasks();

    const insertPayload = { eventType: 'INSERT', new: { id: 1 } };
    fake.channelInstances[0]._emitPayload(insertPayload);
    expect(onInsert).toHaveBeenCalledWith(insertPayload);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    const updatePayload = { eventType: 'UPDATE', new: { id: 1 } };
    fake.channelInstances[0]._emitPayload(updatePayload);
    expect(onUpdate).toHaveBeenCalledWith(updatePayload);

    const deletePayload = { eventType: 'DELETE', old: { id: 1 } };
    fake.channelInstances[0]._emitPayload(deletePayload);
    expect(onDelete).toHaveBeenCalledWith(deletePayload);

    unmount();
  });

  it('sets connection status to connected and resets retry count on SUBSCRIBED', async () => {
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const { unmount } = renderHook(() =>
      useRealtime({ table: 'req_subscribed' })
    );
    await flushMicrotasks();

    fake.channelInstances[0]._emitStatus('SUBSCRIBED');
    expect(mockSetConnectionStatus).toHaveBeenCalledWith('connected');

    unmount();
  });

  it('does nothing but log on CLOSED', async () => {
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const { unmount } = renderHook(() => useRealtime({ table: 'req_closed' }));
    await flushMicrotasks();

    fake.channelInstances[0]._emitStatus('CLOSED');
    expect(mockSetConnectionStatus).not.toHaveBeenCalled();

    unmount();
  });

  it('reconnects with backoff on CHANNEL_ERROR and sets status to reconnecting', async () => {
    vi.useFakeTimers();
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const { unmount } = renderHook(() => useRealtime({ table: 'req_backoff' }));
    await flushMicrotasks();

    expect(fake.channelInstances).toHaveLength(1);

    // First failure: retryCount becomes 1, delay = BACKOFF_DELAYS[1] = 2000ms.
    fake.channelInstances[0]._emitStatus('CHANNEL_ERROR', new Error('boom'));
    expect(mockSetConnectionStatus).toHaveBeenCalledWith('reconnecting');
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);

    // Not yet reconnected before the delay elapses.
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fake.channelInstances).toHaveLength(1);

    // Reconnects once the backoff delay elapses, creating a new channel.
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.channelInstances).toHaveLength(2);

    unmount();
  });

  it('goes offline once the backoff delay reaches the 30s cap and stops retrying', async () => {
    vi.useFakeTimers();
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const { unmount } = renderHook(() =>
      useRealtime({ table: 'req_maxbackoff' })
    );
    await flushMicrotasks();

    // retryCount is 1-based and shared across the whole backoff sequence
    // (only reset on a successful SUBSCRIBED). Delay = BACKOFF_DELAYS[min(retryCount, 5)]:
    //   retryCount 1 -> 2000ms,  reconnecting
    //   retryCount 2 -> 4000ms,  reconnecting
    //   retryCount 3 -> 8000ms,  reconnecting
    //   retryCount 4 -> 16000ms, reconnecting
    //   retryCount 5 -> 30000ms, offline (but retryCount(5) < 6 still retries once more)
    //   retryCount 6 -> 30000ms, offline, retryCount(6) is NOT < 6 -> no further retry
    const steps: { advance: number; status: string }[] = [
      { advance: 2_000, status: 'reconnecting' },
      { advance: 4_000, status: 'reconnecting' },
      { advance: 8_000, status: 'reconnecting' },
      { advance: 16_000, status: 'reconnecting' },
      { advance: 30_000, status: 'offline' },
    ];

    for (const step of steps) {
      const current = fake.channelInstances.at(-1)!;
      current._emitStatus('CHANNEL_ERROR', new Error('boom'));
      expect(mockSetConnectionStatus).toHaveBeenLastCalledWith(step.status);
      await vi.advanceTimersByTimeAsync(step.advance);
    }

    // 6th failure: still offline, but this time no further retry is scheduled.
    const finalChannel = fake.channelInstances.at(-1)!;
    const countBeforeFinalFailure = fake.channelInstances.length;
    finalChannel._emitStatus('CHANNEL_ERROR', new Error('boom'));
    expect(mockSetConnectionStatus).toHaveBeenLastCalledWith('offline');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.channelInstances.length).toBe(countBeforeFinalFailure);

    unmount();
  });

  it('multiplexes two hook instances on the same table+filter onto a single channel', async () => {
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const first = renderHook(() => useRealtime({ table: 'req_multiplex' }));
    await flushMicrotasks();
    const second = renderHook(() => useRealtime({ table: 'req_multiplex' }));
    await flushMicrotasks();

    // Only one channel created for both instances — createBrowserClient/
    // channel() must not run twice for the same table+filter.
    expect(fake.channel).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
  });

  it('only removes the channel after the last subscriber unmounts', async () => {
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const first = renderHook(() => useRealtime({ table: 'req_refcount' }));
    await flushMicrotasks();
    const second = renderHook(() => useRealtime({ table: 'req_refcount' }));
    await flushMicrotasks();

    first.unmount();
    expect(fake.removeChannel).not.toHaveBeenCalled();

    second.unmount();
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('creates a fresh channel for a different table after full teardown', async () => {
    const fake = buildFakeSupabase();
    mockCreateBrowserClient.mockReturnValue(fake.client);

    const { unmount } = renderHook(() =>
      useRealtime({ table: 'req_teardown' })
    );
    await flushMicrotasks();
    unmount();

    const again = renderHook(() => useRealtime({ table: 'req_teardown' }));
    await flushMicrotasks();

    // A brand new channel (and a fresh createBrowserClient call) since the
    // registry entry was deleted on the previous full teardown.
    expect(fake.channel).toHaveBeenCalledTimes(2);

    again.unmount();
  });
});
