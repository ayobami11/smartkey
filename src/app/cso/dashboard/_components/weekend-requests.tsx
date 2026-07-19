'use client';

import Link from 'next/link';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  UserRoundIcon,
} from 'lucide-react';

import { useRealtime } from '@/hooks/use-realtime';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { isPastDate } from '@/lib/dates';
import { createBrowserClient } from '@/lib/supabase/client';

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

type WeekendRequest = {
  id: string;
  created_at: string;
  requested_for: string;
  is_guest: boolean;
  requester_name: string;
  key_code: string | null;
};

// Component

export const WeekendRequests = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();

  const {
    data: requests = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cso', 'dashboard-weekend-requests'],
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async (): Promise<WeekendRequest[]> => {
      const supabase = createBrowserClient();

      const { data: adminDepts } = await supabase
        .from('units')
        .select('id')
        .eq('authoriser', 'CSO');

      const adminDeptIds = new Set(
        ((adminDepts ?? []) as { id: string }[]).map((d) => d.id)
      );

      const { data, error: queryError } = await supabase
        .from('requests')
        .select(
          `id, requested_for, created_at, requested_unit_id,
           requester:profiles!requester_id(full_name),
           guest:guest_requesters!guest_id(full_name),
           key:keys!key_id(code, unit_id)`
        )
        .eq('type', 'WEEKEND')
        .eq('status', 'PENDING_HOD')
        .order('created_at', { ascending: false })
        .limit(5);

      if (queryError) throw new Error('Failed to load weekend requests.');

      return ((data ?? []) as Record<string, unknown>[])
        .filter((req) => {
          const key = req.key as { unit_id: string } | null;
          if (key?.unit_id) return adminDeptIds.has(key.unit_id);
          return req.requested_unit_id
            ? adminDeptIds.has(req.requested_unit_id as string)
            : false;
        })
        .map((req) => {
          const guest = req.guest as { full_name: string } | null;
          const requester = req.requester as { full_name: string } | null;
          const key = req.key as { code: string } | null;
          return {
            id: req.id as string,
            created_at: req.created_at as string,
            requested_for: req.requested_for as string,
            is_guest: !!guest,
            requester_name:
              guest?.full_name ?? requester?.full_name ?? 'Unknown',
            key_code: key?.code ?? null,
          };
        });
    },
  });

  useRealtime({
    table: 'requests',
    filter: { column: 'type', value: 'WEEKEND' },
    onInsert: () =>
      queryClient.invalidateQueries({
        queryKey: ['cso', 'dashboard-weekend-requests'],
      }),
    onUpdate: () =>
      queryClient.invalidateQueries({
        queryKey: ['cso', 'dashboard-weekend-requests'],
      }),
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionCardHeader
        title="Weekend requests"
        count={requests.length}
        countLabel="pending"
        badgeVariant="neutral"
        viewAllHref="/cso/weekend-requests"
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
          {requests.length === 0 ? (
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
              {requests.map((req) => (
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
                          {req.requester_name}
                        </span>
                        {req.is_guest && (
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
                        {req.key_code ? (
                          <span className="font-mono font-medium text-foreground">
                            {req.key_code}
                          </span>
                        ) : (
                          <span>Key on approval</span>
                        )}
                        <span
                          className="flex items-center gap-1"
                          aria-label={`Requested for ${new Date(req.requested_for).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`}
                        >
                          <CalendarIcon className="size-3" aria-hidden="true" />
                          {new Date(req.requested_for).toLocaleDateString(
                            'en-GB',
                            { weekday: 'short', day: 'numeric', month: 'short' }
                          )}
                        </span>
                      </div>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      aria-label={`Review weekend request from ${req.requester_name}`}
                    >
                      <Link href="/cso/weekend-requests">
                        <ExternalLinkIcon
                          className="size-3.5"
                          aria-hidden="true"
                        />
                        Review
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
