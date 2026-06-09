'use client';

import { useEffect, useState } from 'react';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

// Module-level event emitter so all subscribers share one source of truth.
type StatusListener = (status: ConnectionStatus) => void;

const listeners = new Set<StatusListener>();
let currentStatus: ConnectionStatus = 'connected';

export const setConnectionStatus = (status: ConnectionStatus): void => {
  if (status === currentStatus) return;
  currentStatus = status;
  listeners.forEach((fn) => fn(status));
};

export const getConnectionStatus = (): ConnectionStatus => currentStatus;

export const useConnectionStatus = (): ConnectionStatus => {
  // Lazy initializer reads the module-level value at first render, so we're
  // already in sync even if the status changed before mount.
  const [status, setStatus] = useState<ConnectionStatus>(() => currentStatus);

  useEffect(() => {
    const listener: StatusListener = (s) => setStatus(s);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return status;
};
