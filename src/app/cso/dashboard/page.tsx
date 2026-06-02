'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  FileTextIcon,
  SearchIcon,
  ShieldAlertIcon,
  SirenIcon,
  UserPlusIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────

type ZoneStat = {
  name: string;
  zone: string;
  issued: number;
  total: number;
  trend: number;
};

type CsoRequest = {
  id: string;
  status: string;
  risk_tier: string;
  created_at: string;
  key?: { code: string; room_name: string } | null;
  requester?: { full_name: string } | null;
  risk_factors?: unknown[];
};

type RiskAlert = {
  id: string;
  risk_tier: string;
  created_at: string;
  key?: { code: string; room_name: string } | null;
  requester?: { full_name: string } | null;
  risk_factors?: unknown[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatFactors = (factors: unknown[] | undefined) => {
  if (!Array.isArray(factors) || factors.length === 0)
    return 'risk factors detected';
  return factors
    .map((f) =>
      typeof f === 'object' && f !== null
        ? (((f as Record<string, unknown>).rule as string | undefined) ??
          String(f))
        : String(f)
    )
    .join(', ');
};

// ── Component ──────────────────────────────────────────────────────────────

export default function CsoDashboardPage() {
  // Zone counts (Supabase direct)
  const [zones, setZones] = useState<ZoneStat[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);

  // CSO request queue
  const [queue, setQueue] = useState<CsoRequest[]>([]);
  const [queueState, setQueueState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );

  // Risk alerts
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [alertsState, setAlertsState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );

  // Decision state
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // ── Fetch zone counts ─────────────────────────────────────────────────────

  const fetchZones = async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from('keys')
      .select('zone, status')
      .neq('status', 'RETIRED');

    const zoneMap: Record<string, ZoneStat> = {
      NEW_SENATE: {
        name: 'New Senate',
        zone: 'NEW_SENATE',
        issued: 0,
        total: 0,
        trend: 0,
      },
      OLD_SENATE: {
        name: 'Old Senate',
        zone: 'OLD_SENATE',
        issued: 0,
        total: 0,
        trend: 0,
      },
    };
    (data ?? []).forEach((k) => {
      if (k.zone in zoneMap) {
        zoneMap[k.zone].total++;
        if (k.status === 'ISSUED' || k.status === 'OVERDUE')
          zoneMap[k.zone].issued++;
      }
    });
    setZones(Object.values(zoneMap));
    setZonesLoading(false);
  };

  // ── Fetch CSO queue ───────────────────────────────────────────────────────

  const fetchQueue = async () => {
    setQueueState('loading');
    try {
      const res = await fetch('/api/requests/cso-queue');
      const json = await res.json();
      if (!res.ok) {
        setQueueState('error');
        return;
      }
      setQueue((json.data?.requests ?? []) as CsoRequest[]);
      setQueueState('ready');
    } catch {
      setQueueState('error');
    }
  };

  // ── Fetch risk alerts ─────────────────────────────────────────────────────

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
    fetchZones();
    fetchQueue();
    fetchAlerts();
  }, []);

  // ── CSO decision ──────────────────────────────────────────────────────────

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
      // Remove from queue optimistically
      setQueue((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      setDecisionError('Something went wrong. Check your connection.');
    } finally {
      setDecidingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/cso/reports">
            <FileTextIcon className="size-4" aria-hidden="true" />
            Generate report now
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cso/audit">
            <SearchIcon className="size-4" aria-hidden="true" />
            Search audit log
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cso/audit">
            <SirenIcon className="size-4" aria-hidden="true" />
            View incidents
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cso/users">
            <UserPlusIcon className="size-4" aria-hidden="true" />
            Provision user
          </Link>
        </Button>
      </div>

      {/* Three-column layout */}
      <div className="grid flex-1 items-start gap-6 lg:grid-cols-3">
        {/* Left — live zone counters */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            Live zone counts
          </h2>
          {zonesLoading ? (
            <>
              <Skeleton className="h-36 rounded-lg" />
              <Skeleton className="h-36 rounded-lg" />
            </>
          ) : (
            zones.map((zone) => {
              const up = zone.trend > 0;
              const ArrowIcon = up ? ArrowUpIcon : ArrowDownIcon;
              const trendClass = up ? 'text-destructive' : 'text-emerald-600';
              return (
                <div
                  key={zone.zone}
                  className="rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                >
                  <p className="text-sm font-medium text-muted-foreground">
                    {zone.name}
                  </p>
                  <p className="mt-2 text-5xl font-semibold tabular-nums text-foreground">
                    {zone.issued}
                    <span className="ml-1.5 text-2xl font-normal text-muted-foreground">
                      / {zone.total}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    keys checked out
                  </p>
                  <div
                    className={`mt-4 flex items-center gap-1 text-xs font-medium ${trendClass}`}
                    aria-label={`${Math.abs(zone.trend)} ${up ? 'more' : 'fewer'} than same time yesterday`}
                  >
                    <ArrowIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      {up ? '+' : ''}
                      {zone.trend} vs same time yesterday
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Centre — CSO request queue */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            Pending review
          </h2>

          {queueState === 'loading' && (
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          )}

          {queueState === 'error' && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
              role="alert"
            >
              <p className="text-sm text-destructive">
                Failed to load request queue.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={fetchQueue}
              >
                Retry
              </Button>
            </div>
          )}

          {queueState === 'ready' && (
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
                            {key
                              ? `${key.room_name} — ${key.code}`
                              : 'Unknown key'}
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

        {/* Right — risk alerts feed */}
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
                            {key
                              ? `${key.room_name} — ${key.code}`
                              : 'Unknown key'}
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
      </div>
    </div>
  );
}
