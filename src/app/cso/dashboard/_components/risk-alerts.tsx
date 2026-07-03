'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, CheckCircleIcon } from 'lucide-react';

import { apiFetch } from '@/lib/api';
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
import { SectionCardHeader } from '@/app/cso/dashboard/_components/section-card-header';

// Types

type RiskAlert = {
  id: string;
  risk_tier: string;
  created_at: string;
  key?: { code: string; room_name: string } | null;
  requester?: { full_name: string } | null;
  risk_factors?: unknown[];
};

// Component

export const RiskAlerts = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();

  useRealtime({
    table: 'requests',
    onInsert: (payload) => {
      const row = payload.new as { risk_tier?: string };
      if (row.risk_tier === 'HIGH')
        queryClient.invalidateQueries({ queryKey: ['cso', 'risk-alerts'] });
    },
    onUpdate: (payload) => {
      const row = payload.new as { risk_tier?: string };
      if (row.risk_tier === 'HIGH')
        queryClient.invalidateQueries({ queryKey: ['cso', 'risk-alerts'] });
    },
  });

  const {
    data: alerts = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cso', 'risk-alerts'],
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const result = await apiFetch<{ alerts: RiskAlert[] }>(
        '/api/ai/risk-alerts'
      );
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load risk alerts.');
      return result.data.alerts ?? [];
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionCardHeader
        title="Risk alerts"
        count={alerts.length}
        countLabel="high-risk in the last 24 hours"
        badgeVariant="neutral"
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
          {alerts.length === 0 ? (
            <Empty className="border border-border bg-card">
              <EmptyMedia variant="icon">
                <CheckCircleIcon
                  className="size-8 text-emerald-600"
                  aria-hidden="true"
                />
              </EmptyMedia>
              <EmptyContent>
                <EmptyTitle>No anomalies</EmptyTitle>
                <EmptyDescription>
                  No HIGH-risk requests in the last 24 hours.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {alerts.map((alert) => {
                const key = alert.key as
                  | { code: string; room_name: string }
                  | null
                  | undefined;
                const requester = alert.requester as
                  | { full_name: string }
                  | null
                  | undefined;
                return (
                  <div
                    key={alert.id}
                    className="flex w-full overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                  >
                    <div
                      className="w-1 shrink-0 bg-amber-500"
                      aria-hidden="true"
                    />
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangleIcon
                            className="size-4 shrink-0 text-amber-600"
                            aria-hidden="true"
                          />
                          <span className="text-xs font-semibold text-amber-600">
                            {alert.risk_tier}
                          </span>
                        </div>
                        <time className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatTime(alert.created_at)}
                        </time>
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {key ? `${key.room_name} — ${key.code}` : 'Unknown key'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {requester?.full_name ?? 'Unknown user'} —{' '}
                        {formatFactors(
                          alert.risk_factors as unknown[] | undefined
                        )}
                      </p>
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
