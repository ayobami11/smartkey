'use client';

import { useEffect, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ClockIcon } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { useRealtime } from '@/hooks/use-realtime';
import { useConnectionStatus } from '@/hooks/use-connection-status';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCardHeader } from '@/components/smartkey/section-card-header';
import {
  TRANSACTION_STATUS_CONFIG,
  type Transaction,
} from '@/components/smartkey/transaction-status';
import { formatDate, relativeTimeCompact } from '@/lib/dates';

const QUERY_KEY = ['dean', 'recent-activity'];
const PAGE_LIMIT = 10;

type HistoryPage = { transactions: Transaction[]; next_cursor: string | null };

export const RecentActivity = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();

  useRealtime({
    table: 'requests',
    onInsert: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onUpdate: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const {
    data: firstPage,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async (): Promise<HistoryPage> => {
      const result = await apiFetch<HistoryPage>(
        `/api/keys/history?limit=${PAGE_LIMIT}`
      );
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load recent activity.');
      return result.data;
    },
  });

  // Extra pages loaded via "Load more", kept separate from the react-query
  // cache so a realtime-triggered refetch of the first page (see useRealtime
  // above) doesn't fight with locally-accumulated pages. Reset whenever the
  // first page changes — its own cursor is no longer valid otherwise.
  const [extraTransactions, setExtraTransactions] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  useEffect(() => {
    setExtraTransactions([]);
    setNextCursor(firstPage?.next_cursor ?? null);
  }, [firstPage]);

  const transactions = [
    ...(firstPage?.transactions ?? []),
    ...extraTransactions,
  ];

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      // Raw timestamptz cursors from PostgREST include a "+00:00" offset —
      // an unencoded "+" in a query string decodes as a space server-side,
      // corrupting the timestamp and making Postgres reject it. Must encode.
      const result = await apiFetch<HistoryPage>(
        `/api/keys/history?limit=${PAGE_LIMIT}&cursor=${encodeURIComponent(nextCursor)}`
      );
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load more.');
      const page = result.data;
      setExtraTransactions((prev) => [...prev, ...page.transactions]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      setLoadMoreError(
        err instanceof Error ? err.message : 'Failed to load more.'
      );
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCardHeader title="Recent activity" />

      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
            >
              <Skeleton className="w-1 shrink-0 rounded-none" />
              <div className="flex flex-1 items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              </div>
            </div>
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

      {!isLoading && !error && transactions.length === 0 && (
        <Empty className="border border-border bg-card">
          <EmptyContent>
            <EmptyTitle>No key activity yet.</EmptyTitle>
            <EmptyDescription>
              Issued and returned keys for your faculty will appear here.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !error && transactions.length > 0 && (
        <ul
          className="flex flex-col gap-3"
          aria-live="polite"
          aria-relevant="additions"
        >
          {transactions.map((tx) => {
            const config = TRANSACTION_STATUS_CONFIG[tx.status];

            // created_at, not getTransactionDate() — the latter falls back
            // to requested_for for terminal states, which for a weekend
            // request is a future Sat/Sun even after it's cancelled/
            // declined/expired. relativeTimeCompact has no way to render a
            // future date sensibly as "time ago"; created_at is always a
            // real past timestamp.
            const dateIso = tx.created_at;

            return (
              <li
                key={tx.id}
                className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div
                  className={`w-1 shrink-0 ${config.stripe}`}
                  aria-hidden="true"
                />
                <div className="flex flex-1 items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {tx.key?.code ?? '—'}
                      </span>
                      <Badge className={config.badge} aria-label={config.label}>
                        {config.label}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {tx.key?.room_name ?? 'Key unavailable'}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ClockIcon
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                      <time dateTime={dateIso} title={formatDate(dateIso)}>
                        {relativeTimeCompact(dateIso)}
                      </time>
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {tx.type === 'WEEKEND' ? 'Weekend' : 'Weekday'}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!isLoading && !error && loadMoreError && (
        <p className="text-xs text-destructive" role="alert">
          {loadMoreError}
        </p>
      )}

      {!isLoading && !error && nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
            aria-busy={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
};
