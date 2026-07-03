'use client';

import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/dates';
import {
  getTransactionDate,
  getTransactionReturnLine,
  TRANSACTION_STATUS_CONFIG,
  type Transaction,
} from '@/components/smartkey/transaction-status';

type Props = { keyId: string };

// Component

export const KeyHistory = ({ keyId }: Props) => {
  const [extra, setExtra] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const {
    data: firstPage = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['key-history', keyId],
    queryFn: async (): Promise<Transaction[]> => {
      const result = await apiFetch<{
        transactions: Transaction[];
        next_cursor: string | null;
      }>(`/api/keys/history?key_id=${keyId}&limit=10`);
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load history.');
      setCursor(result.data.next_cursor);
      setHasMore(result.data.next_cursor !== null);
      setExtra([]);
      return result.data.transactions;
    },
  });

  const handleLoadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    const result = await apiFetch<{
      transactions: Transaction[];
      next_cursor: string | null;
    }>(`/api/keys/history?key_id=${keyId}&limit=10&cursor=${cursor}`);
    setLoadingMore(false);
    if (result.error || !result.data) return;
    setExtra((prev) => [...prev, ...result.data!.transactions]);
    setCursor(result.data.next_cursor);
    setHasMore(result.data.next_cursor !== null);
  };

  const transactions = [...firstPage, ...extra];

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        Transaction history
      </h2>

      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
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
            <EmptyTitle>No transaction history yet.</EmptyTitle>
            <EmptyDescription>
              Issued, returned, and declined requests will appear here.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !error && transactions.length > 0 && (
        <div className="flex flex-col gap-3">
          {transactions.map((tx) => {
            const config = TRANSACTION_STATUS_CONFIG[tx.status];
            const { Icon } = config;

            const dateIso = getTransactionDate(tx);
            const returnLine = getTransactionReturnLine(tx);

            return (
              <div
                key={tx.id}
                className="flex w-full overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div
                  className={`w-1 shrink-0 ${config.stripe}`}
                  aria-hidden="true"
                />
                <div className="flex flex-1 items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${config.badge}`}
                        aria-label={config.label}
                      >
                        <Icon className="size-3" aria-hidden="true" />
                        {config.label}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {tx.type === 'WEEKEND' ? 'Weekend' : 'Weekday'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {tx.requester?.full_name ?? 'Unknown'}
                    </p>
                    {returnLine && (
                      <p className="text-xs text-muted-foreground">
                        {returnLine}
                      </p>
                    )}
                  </div>
                  <time
                    dateTime={dateIso}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {formatDate(dateIso)}
                  </time>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={loadingMore}
              aria-busy={loadingMore}
              onClick={handleLoadMore}
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
