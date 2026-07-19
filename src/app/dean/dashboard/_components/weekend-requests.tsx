'use client';

import Link from 'next/link';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  UserRoundIcon,
} from 'lucide-react';

import { useConnectionStatus } from '@/hooks/use-connection-status';
import { useRealtime } from '@/hooks/use-realtime';
import { apiFetch } from '@/lib/api';
import { isPastDate } from '@/lib/dates';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpiredBadge } from '@/components/smartkey/expired-badge';
import { SectionCardHeader } from '@/components/smartkey/section-card-header';

// Types

type PendingRequest = {
  id: string;
  requester: { full_name: string } | null;
  guest: { full_name: string } | null;
  key: { code: string } | null;
  requested_for: string;
  type: 'WEEKDAY' | 'WEEKEND';
};

const QUERY_KEY = ['requests', 'pending-weekend'];

// Component

export const WeekendRequests = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();

  const {
    data: pendingRequests = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async (): Promise<PendingRequest[]> => {
      const result = await apiFetch<{ requests: PendingRequest[] }>(
        '/api/requests/pending'
      );
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load weekend requests.');
      return result.data.requests ?? [];
    },
  });

  useRealtime({
    table: 'requests',
    filter: { column: 'type', value: 'WEEKEND' },
    onInsert: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onUpdate: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionCardHeader
        title="Weekend requests"
        count={pendingRequests.length}
        countLabel="pending"
        badgeVariant="neutral"
        viewAllHref="/dean/weekend-requests"
      />

      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {!!error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">{(error as Error).message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {pendingRequests.length === 0 ? (
            <Empty className="border border-border bg-card">
              <EmptyMedia variant="icon">
                <CheckCircleIcon
                  className="size-8 text-emerald-600"
                  aria-hidden="true"
                />
              </EmptyMedia>
              <EmptyContent>
                <EmptyTitle>No pending requests</EmptyTitle>
                <EmptyDescription>
                  Weekend requests appear here when staff or visitors submit
                  them.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingRequests.slice(0, 5).map((req) => {
                const requesterName =
                  req.requester?.full_name ??
                  req.guest?.full_name ??
                  'External requester';
                const isGuest = !!req.guest;
                return (
                  <div
                    key={req.id}
                    className="flex w-full overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                  >
                    <div
                      className="w-1 shrink-0 bg-amber-500"
                      aria-hidden="true"
                    />
                    <div className="flex flex-1 items-center gap-3 p-4">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {requesterName}
                          </span>
                          {isGuest && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                              aria-label="External requester"
                            >
                              <UserRoundIcon
                                className="size-3"
                                aria-hidden="true"
                              />
                              External
                            </span>
                          )}
                          {isPastDate(req.requested_for) && <ExpiredBadge />}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {req.key?.code ? (
                            <span className="font-mono font-medium text-foreground">
                              {req.key.code}
                            </span>
                          ) : (
                            <span>Key on approval</span>
                          )}
                          <span
                            className="flex items-center gap-1"
                            aria-label={`Requested for ${new Date(
                              req.requested_for
                            ).toLocaleDateString('en-GB', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })}`}
                          >
                            <CalendarIcon
                              className="size-3"
                              aria-hidden="true"
                            />
                            {new Date(req.requested_for).toLocaleDateString(
                              'en-GB',
                              {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                              }
                            )}
                          </span>
                        </div>
                      </div>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        aria-label={`Review weekend request from ${requesterName}`}
                      >
                        <Link href="/dean/weekend-requests">
                          <ExternalLinkIcon
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          Review
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
