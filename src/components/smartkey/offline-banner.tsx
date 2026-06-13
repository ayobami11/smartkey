'use client';

import { WifiOff } from 'lucide-react';

import { useConnectionStatus } from '@/hooks/useConnectionStatus';

export const OfflineBanner = () => {
  const status = useConnectionStatus();

  if (status !== 'offline') return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="flex w-full items-center gap-3 rounded-none bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <WifiOff size={20} aria-hidden="true" className="shrink-0" />
      <p className="text-sm">
        You are offline. Live updates are paused. New requests will appear when
        you reconnect.
      </p>
    </div>
  );
};
