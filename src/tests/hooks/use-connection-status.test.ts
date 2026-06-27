import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getConnectionStatus,
  setConnectionStatus,
  useConnectionStatus,
} from '@/hooks/use-connection-status';

afterEach(() => {
  // Unmount any rendered hooks before resetting module-level state so the
  // setConnectionStatus call doesn't fire into a still-subscribed listener.
  cleanup();
  if (getConnectionStatus() !== 'connected') {
    act(() => setConnectionStatus('connected'));
  }
});

describe('useConnectionStatus', () => {
  it('returns "connected" on the initial render', () => {
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current).toBe('connected');
  });

  it('updates when setConnectionStatus is called', () => {
    const { result } = renderHook(() => useConnectionStatus());
    act(() => setConnectionStatus('offline'));
    expect(result.current).toBe('offline');
  });

  it('tracks multiple consecutive transitions', () => {
    const { result } = renderHook(() => useConnectionStatus());
    act(() => setConnectionStatus('reconnecting'));
    expect(result.current).toBe('reconnecting');
    act(() => setConnectionStatus('connected'));
    expect(result.current).toBe('connected');
  });

  it('notifies all mounted hook instances simultaneously', () => {
    const { result: r1 } = renderHook(() => useConnectionStatus());
    const { result: r2 } = renderHook(() => useConnectionStatus());
    act(() => setConnectionStatus('offline'));
    expect(r1.current).toBe('offline');
    expect(r2.current).toBe('offline');
  });

  it('stops receiving updates after unmount (listener cleanup)', () => {
    const { result, unmount } = renderHook(() => useConnectionStatus());
    unmount();
    act(() => setConnectionStatus('offline'));
    // result.current retains the last rendered value; no further updates after unmount
    expect(result.current).toBe('connected');
    // The module state did change — only the unmounted hook missed it
    expect(getConnectionStatus()).toBe('offline');
  });

  it('is a no-op when called with the current status', () => {
    const { result } = renderHook(() => useConnectionStatus());
    // 'connected' is already the current status — should be a no-op
    act(() => setConnectionStatus('connected'));
    expect(result.current).toBe('connected');
    expect(getConnectionStatus()).toBe('connected');
  });

  it('returns the correct status at first render without waiting for an effect', () => {
    // Set status to 'offline' before the hook mounts. The lazy useState
    // initialiser reads currentStatus synchronously, so result.current is
    // 'offline' on the very first render — no 'connected' → 'offline' flash.
    act(() => setConnectionStatus('offline'));
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current).toBe('offline');
  });
});

describe('setConnectionStatus / getConnectionStatus', () => {
  it('getConnectionStatus reflects the latest value', () => {
    expect(getConnectionStatus()).toBe('connected');
    act(() => setConnectionStatus('reconnecting'));
    expect(getConnectionStatus()).toBe('reconnecting');
  });
});
