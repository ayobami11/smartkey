'use client';

import Link from 'next/link';
import { CalendarIcon, ChevronRightIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useConnectionStatus } from '@/hooks/use-connection-status';
import { useRealtime } from '@/hooks/use-realtime';
import { Skeleton } from '@/components/ui/skeleton';

type PendingRequest = {
  id: string;
  requester: { full_name: string } | null;
  guest: { full_name: string } | null;
  key: { code: string } | null;
  requested_for: string;
  type: 'WEEKDAY' | 'WEEKEND';
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const WeekendRequests = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();

  const { data: pendingRequests = [], isLoading } = useQuery({
    queryKey: ['requests', 'pending-weekend'],
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const res = await fetch('/api/requests/pending');
      if (!res.ok) return [];
      const json = await res.json();
      return (
        (json as { data?: { requests?: PendingRequest[] } }).data?.requests ??
        []
      );
    },
  });

  useRealtime({
    table: 'requests',
    filter: { column: 'type', value: 'WEEKEND' },
    onInsert: () =>
      queryClient.invalidateQueries({
        queryKey: ['requests', 'pending-weekend'],
      }),
    onUpdate: () =>
      queryClient.invalidateQueries({
        queryKey: ['requests', 'pending-weekend'],
      }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Weekend Requests
        </h2>
        {!isLoading && pendingRequests.length > 0 && (
          <span className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
            {pendingRequests.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : pendingRequests.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No pending requests right now.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pendingRequests.slice(0, 3).map((req) => (
            <div
              key={req.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
            >
              <div className="flex items-start gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {(req.requester?.full_name ?? req.guest?.full_name ?? '?')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {req.requester?.full_name ??
                      req.guest?.full_name ??
                      'External requester'}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {req.key?.code ?? 'No key assigned'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarIcon
                  className="size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {formatDate(req.requested_for)}
              </div>
              <Link
                href="/dean/weekend-requests"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Review
                <ChevronRightIcon className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/dean/weekend-requests"
        className="text-center text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        View all requests
      </Link>
    </div>
  );
};
