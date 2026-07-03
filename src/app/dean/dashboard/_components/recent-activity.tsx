'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { useRealtime } from '@/hooks/use-realtime';
import { useConnectionStatus } from '@/hooks/use-connection-status';

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
  getTransactionDate,
  getTransactionReturnLine,
  TRANSACTION_STATUS_CONFIG,
  type Transaction,
} from '@/components/smartkey/transaction-status';
import { formatDate, relativeTimeCompact } from '@/lib/dates';

const QUERY_KEY = ['dean', 'recent-activity'];

// One-line, past-tense description of what happened, e.g. "Dr. Bakare
// collected the key for Senate Hall A (NS-304)" — the card's headline
// rather than listing the key and requester as separate, disconnected facts.
const describeActivity = (tx: Transaction): string => {
  const who = tx.requester?.full_name ?? 'Someone';
  const what = tx.key
    ? `the key for ${tx.key.room_name} (${tx.key.code})`
    : 'a key';
  switch (tx.status) {
    case 'KEY_ISSUED':
      return `${who} collected ${what}`;
    case 'KEY_RETURNED':
      return `${who} returned ${what}`;
    case 'EXPIRED':
      return `${who}’s request to collect ${what} expired`;
    case 'CANCELLED':
      return `${who} cancelled their request to collect ${what}`;
    case 'DECLINED':
      return `${who}’s request to collect ${what} was declined`;
  }
};

export const RecentActivity = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();

  useRealtime({
    table: 'requests',
    onInsert: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onUpdate: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const {
    data: transactions = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async (): Promise<Transaction[]> => {
      const result = await apiFetch<{
        transactions: Transaction[];
        next_cursor: string | null;
      }>('/api/keys/history?limit=5');
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load recent activity.');
      return result.data.transactions;
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionCardHeader title="Recent activity" />

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
            <EmptyTitle>No key activity yet.</EmptyTitle>
            <EmptyDescription>
              Issued and returned keys for your faculty will appear here.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      )}

      {!isLoading && !error && transactions.length > 0 && (
        <div
          className="flex flex-col gap-3"
          aria-live="polite"
          aria-relevant="additions"
        >
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
                    <p className="truncate text-sm font-medium text-foreground">
                      {describeActivity(tx)}
                    </p>
                    {returnLine && (
                      <p className="truncate text-xs text-muted-foreground">
                        {returnLine}
                      </p>
                    )}
                  </div>
                  <time
                    dateTime={dateIso}
                    title={formatDate(dateIso)}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {relativeTimeCompact(dateIso)}
                  </time>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
