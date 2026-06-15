'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarIcon, HistoryIcon } from 'lucide-react';

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
    stripe: string;
  }
> = {
  CODE_ISSUED: {
    label: 'Code issued',
    variant: 'secondary',
    stripe: 'bg-amber-400',
  },
  KEY_ISSUED: { label: 'Key issued', variant: 'default', stripe: 'bg-primary' },
  KEY_RETURNED: {
    label: 'Returned',
    variant: 'outline',
    stripe: 'bg-emerald-500',
  },
  EXPIRED: { label: 'Expired', variant: 'secondary', stripe: 'bg-slate-400' },
  CANCELLED: {
    label: 'Cancelled',
    variant: 'secondary',
    stripe: 'bg-slate-400',
  },
  DECLINED: {
    label: 'Declined',
    variant: 'destructive',
    stripe: 'bg-destructive',
  },
  PENDING_HOD: {
    label: 'Pending HOD',
    variant: 'secondary',
    stripe: 'bg-amber-400',
  },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

// Skeleton rows

const HistorySkeleton = () => (
  <div
    className="flex flex-col gap-3"
    aria-busy="true"
    aria-label="Loading history"
  >
    {Array.from({ length: 5 }).map((_, i) => (
      <Skeleton key={i} className="h-18 rounded-lg" />
    ))}
  </div>
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

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <h2 className="text-sm font-semibold text-foreground">Request history</h2>

      {/* Loading */}
      {loading && <HistorySkeleton />}

      {/* Error */}
      {!loading && error && (
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
      )}

      {/* Empty */}
      {!loading && !error && requests.length === 0 && (
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
      )}

      {/* Content */}
      {!loading && !error && requests.length > 0 && (
        <>
          <ul className="flex flex-col gap-3" aria-label="Request history">
            {requests.map((req) => {
              const statusCfg = STATUS_CONFIG[req.status] ?? {
                label: req.status,
                variant: 'secondary' as const,
                stripe: 'bg-slate-400',
              };

              return (
                <li
                  key={req.id}
                  className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                >
                  <div
                    className={`w-1 shrink-0 ${statusCfg.stripe}`}
                    aria-hidden="true"
                  />
                  <div className="flex flex-1 items-center gap-3 p-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {/* Line 1: key code + status badge */}
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {req.key?.code ?? '—'}
                        </span>
                        <Badge
                          variant={statusCfg.variant}
                          aria-label={`Status: ${statusCfg.label}`}
                          className="text-xs"
                        >
                          {statusCfg.label}
                        </Badge>
                      </div>
                      {/* Line 2: room name */}
                      <p className="truncate text-xs text-muted-foreground">
                        {req.key?.room_name ?? 'Key unavailable'}
                      </p>
                      {/* Line 3: date */}
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarIcon
                          className="size-3 shrink-0"
                          aria-hidden="true"
                        />
                        {formatDate(req.created_at)}
                      </p>
                    </div>
                    {/* Right: type badge */}
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {req.type === 'WEEKDAY' ? 'Weekday' : 'Weekend'}
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
        </>
      )}
    </div>
  );
}
