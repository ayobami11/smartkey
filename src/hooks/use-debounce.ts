import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Trailing-edge debounce for an action (as opposed to `useDebounce`, which
 * debounces a value). A burst of N calls results in exactly one invocation,
 * `delay` ms after the last one.
 *
 * Used to collapse realtime bursts: a shift handover writes one `audit_log` row
 * per outstanding key, so an unthrottled invalidate-per-insert would refetch the
 * CSO dashboard once per key. The identity of the returned callback is stable
 * across renders, so it is safe to pass straight to `useRealtime`.
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay = 300
): (...args: A) => void {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return useCallback(
    (...args: A) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay]
  );
}
