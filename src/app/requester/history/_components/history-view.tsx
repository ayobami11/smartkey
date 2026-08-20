'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

import { type RequestRow } from '@/app/requester/history/_components/request-card';
import { HistoryEmpty } from '@/app/requester/history/_components/history-empty';
import { HistorySkeleton } from '@/app/requester/history/_components/history-skeleton';
import { RequestList } from '@/app/requester/history/_components/request-list';

type ApiResponse = {
  requests: RequestRow[];
  next_cursor: string | null;
};

// View

export const HistoryView = () => {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ limit: '10' });
    if (cursor) params.set('cursor', cursor);
    const result = await apiFetch<ApiResponse>(
      `/api/requests/my?${params.toString()}`
    );
    if (result.error || !result.data) {
      throw new Error(result.error ?? `Error ${result.status}`);
    }
    return result.data;
  }, []);

  useEffect(() => {
    fetchHistory()
      .then((data) => {
        setRequests(data.requests ?? []);
        setNextCursor(data.next_cursor);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fetchHistory]);

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

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <h2 className="text-sm font-semibold text-foreground">Request history</h2>

      {loading && <HistorySkeleton />}

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

      {!loading && !error && requests.length === 0 && <HistoryEmpty />}

      {!loading && !error && requests.length > 0 && (
        <RequestList
          requests={requests}
          nextCursor={nextCursor}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
        />
      )}
    </div>
  );
};
