'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarIcon, HistoryIcon, KeyRoundIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

// Types

type RequestStatus =
  | 'CODE_ISSUED'
  | 'KEY_ISSUED'
  | 'KEY_RETURNED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'DECLINED'
  | 'PENDING_HOD';

type RequestType = 'WEEKDAY' | 'WEEKEND';

type RequestRow = {
  id: string;
  created_at: string;
  type: RequestType;
  status: RequestStatus;
  key: { code: string; room_name: string } | null;
};

type ApiResponse = {
  requests: RequestRow[];
  next_cursor: string | null;
};

// Helpers

const STATUS_CONFIG: Record<
  RequestStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  CODE_ISSUED: { label: 'Code issued', variant: 'secondary' },
  KEY_ISSUED: { label: 'Key issued', variant: 'default' },
  KEY_RETURNED: { label: 'Returned', variant: 'outline' },
  EXPIRED: { label: 'Expired', variant: 'secondary' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  DECLINED: { label: 'Declined', variant: 'destructive' },
  PENDING_HOD: { label: 'Pending HOD', variant: 'secondary' },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

// Skeleton rows

const HistorySkeleton = () => (
  <ul className="divide-y" aria-busy="true" aria-label="Loading history">
    {Array.from({ length: 5 }).map((_, i) => (
      <li key={i} className="flex items-center justify-between gap-4 py-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </li>
    ))}
  </ul>
);

// Component

export default function RequesterHistoryPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ limit: '20' });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`/api/requests/my?${params.toString()}`);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error ?? `Error ${res.status}`);
    }
    const json: { data: ApiResponse; error: null } = await res.json();
    return json.data;
  }, []);

  // Initial load

  useEffect(() => {
    fetchHistory()
      .then((data) => {
        setRequests(data.requests ?? []);
        setNextCursor(data.next_cursor);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fetchHistory]);

  // Load more

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchHistory(nextCursor);
      setRequests((prev) => [...prev, ...(data.requests ?? [])]);
      setNextCursor(data.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more.');
    } finally {
      setLoadingMore(false);
    }
  };

  // Render

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <HistorySkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Failed to load history
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchHistory()
                .then((data) => {
                  setRequests(data.requests ?? []);
                  setNextCursor(data.next_cursor);
                })
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4 pt-0">
        <Empty className="border border-border bg-card">
          <EmptyMedia variant="icon">
            <HistoryIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>No requests yet</EmptyTitle>
            <EmptyDescription>
              You have not requested a key yet. Your request history will appear
              here.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <ul className="divide-y rounded-lg border" aria-label="Request history">
        {requests.map((req) => {
          const statusCfg = STATUS_CONFIG[req.status] ?? {
            label: req.status,
            variant: 'secondary' as const,
          };

          return (
            <li
              key={req.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              {/* Left: date + key */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarIcon
                    className="size-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{formatDate(req.created_at)}</span>
                </div>
                {req.key ? (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <KeyRoundIcon
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="truncate font-mono text-sm font-medium">
                      {req.key.code}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">
                      · {req.key.room_name}
                    </span>
                  </div>
                ) : (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Key unavailable
                  </p>
                )}
              </div>

              {/* Right: type + status badges */}
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <Badge variant="outline" className="text-xs">
                  {req.type === 'WEEKDAY' ? 'Weekday' : 'Weekend'}
                </Badge>
                <Badge
                  variant={statusCfg.variant}
                  aria-label={`Status: ${statusCfg.label}`}
                  className="text-xs"
                >
                  {statusCfg.label}
                </Badge>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Load more */}
      {nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
            aria-busy={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
