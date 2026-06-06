'use client';

import { useEffect, useState } from 'react';

import { AlertTriangleIcon, CheckCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

import { formatFactors, formatTime } from './helpers';

// ── Types ──────────────────────────────────────────────────────────────────

type RiskAlert = {
  id: string;
  risk_tier: string;
  created_at: string;
  key?: { code: string; room_name: string } | null;
  requester?: { full_name: string } | null;
  risk_factors?: unknown[];
};

// ── Component ──────────────────────────────────────────────────────────────

export const RiskAlerts = () => {
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [alertsState, setAlertsState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );

  const fetchAlerts = async () => {
    setAlertsState('loading');
    try {
      const res = await fetch('/api/ai/risk-alerts');
      const json = await res.json();
      if (!res.ok) {
        setAlertsState('error');
        return;
      }
      setAlerts((json.data?.alerts ?? []) as RiskAlert[]);
      setAlertsState('ready');
    } catch {
      setAlertsState('error');
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAlerts();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Risk alerts</h2>

      {alertsState === 'loading' && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {alertsState === 'error' && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">
            Failed to load risk alerts.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={fetchAlerts}
          >
            Retry
          </Button>
        </div>
      )}

      {alertsState === 'ready' && (
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
