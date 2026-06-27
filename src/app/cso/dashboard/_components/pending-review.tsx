'use client';

import { useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, ShieldAlertIcon } from 'lucide-react';

import { useRealtime } from '@/hooks/use-realtime';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

import {
  formatFactors,
  formatTime,
} from '@/app/cso/dashboard/_components/helpers';

// Types

type CsoRequest = {
  id: string;
  status: string;
  risk_tier: string;
  created_at: string;
  key?: { code: string; room_name: string } | null;
  requester?: { full_name: string } | null;
  risk_factors?: unknown[];
};

// Component

export const PendingReview = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const {
    data: queue = [],
    isLoading: queueLoading,
    error: queueError,
    refetch,
  } = useQuery({
    queryKey: ['cso', 'pending-review'],
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const res = await fetch('/api/requests/cso-queue');
      const json = await res.json();
      if (!res.ok)
        throw new Error(
          (json as { error?: string }).error ??
            'Failed to load pending requests.'
        );
      return (
        (json as { data?: { requests?: CsoRequest[] } }).data?.requests ?? []
      );
    },
  });

  useRealtime({
    table: 'requests',
    onInsert: (payload) => {
      const row = payload.new as { risk_tier?: string };
      if (row.risk_tier === 'HIGH')
        queryClient.invalidateQueries({ queryKey: ['cso', 'pending-review'] });
    },
    onUpdate: (payload) => {
      const row = payload.new as { risk_tier?: string };
      if (row.risk_tier === 'HIGH')
        queryClient.invalidateQueries({ queryKey: ['cso', 'pending-review'] });
    },
  });

  const handleDecision = async (
    requestId: string,
    decision: 'APPROVED' | 'DECLINED'
  ) => {
    setDecidingId(requestId);
    setDecisionError(null);
    try {
      const res = await fetch('/api/requests/cso-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, decision }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDecisionError(json.error ?? 'Failed to process decision.');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['cso', 'pending-review'] });
    } catch {
      setDecisionError('Something went wrong. Check your connection.');
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Pending review</h2>

      {queueLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {!!queueError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">
            {(queueError as Error).message}
          </p>
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

      {!queueLoading && !queueError && (
        <>
          {decisionError && (
            <p className="text-sm text-destructive" role="alert">
              {decisionError}
            </p>
          )}
          {queue.length === 0 ? (
            <Empty className="border border-border bg-card">
              <EmptyMedia variant="icon">
                <CheckCircleIcon
                  className="size-8 text-emerald-600"
                  aria-hidden="true"
                />
              </EmptyMedia>
              <EmptyContent>
                <EmptyTitle>Queue is clear</EmptyTitle>
                <EmptyDescription>
                  No high-risk requests pending review.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {queue.map((req) => {
                const key = req.key as
                  | { code: string; room_name: string }
                  | null
                  | undefined;
                const requester = req.requester as
                  | { full_name: string }
                  | null
                  | undefined;
                const isDeciding = decidingId === req.id;
                return (
                  <div
                    key={req.id}
                    className="flex w-full overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                  >
                    <div
                      className="w-1 shrink-0 bg-destructive"
                      aria-hidden="true"
                    />
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <ShieldAlertIcon
                            className="size-4 shrink-0 text-destructive"
                            aria-hidden="true"
                          />
                          <span className="text-xs font-semibold text-destructive">
                            High risk
                          </span>
                        </div>
                        <time className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatTime(req.created_at)}
                        </time>
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {key ? `${key.room_name} — ${key.code}` : 'Unknown key'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {requester?.full_name ?? 'Unknown user'} —{' '}
                        {formatFactors(
                          req.risk_factors as unknown[] | undefined
                        )}
                      </p>
                      <div className="mt-1 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                          disabled={isDeciding}
                          aria-busy={isDeciding}
                          onClick={() => handleDecision(req.id, 'APPROVED')}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                          disabled={isDeciding}
                          aria-busy={isDeciding}
                          onClick={() => handleDecision(req.id, 'DECLINED')}
                        >
                          Decline
                        </Button>
                      </div>
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
