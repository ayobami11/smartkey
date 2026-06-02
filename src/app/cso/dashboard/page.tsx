import Link from 'next/link';
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  FileTextIcon,
  KeyRoundIcon,
  SearchIcon,
  ShieldAlertIcon,
  SirenIcon,
  UserPlusIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createServerClient } from '@/lib/supabase/server';

type EventType = 'ISSUED' | 'RETURNED' | 'FLAGGED' | 'HANDOVER';

const severityConfig: Record<
  'HIGH' | 'MEDIUM',
  { stripe: string; icon: LucideIcon; label: string; textClass: string }
> = {
  HIGH: {
    stripe: 'bg-destructive',
    icon: ShieldAlertIcon,
    label: 'High',
    textClass: 'text-destructive',
  },
  MEDIUM: {
    stripe: 'bg-amber-500',
    icon: AlertTriangleIcon,
    label: 'Medium',
    textClass: 'text-amber-600',
  },
};

const eventConfig: Record<EventType, { icon: LucideIcon; iconClass: string }> =
  {
    ISSUED: { icon: KeyRoundIcon, iconClass: 'text-primary' },
    RETURNED: { icon: CheckCircleIcon, iconClass: 'text-emerald-600' },
    FLAGGED: { icon: AlertTriangleIcon, iconClass: 'text-destructive' },
    HANDOVER: { icon: ArrowLeftRightIcon, iconClass: 'text-muted-foreground' },
  };

export default async function CsoDashboardPage() {
  const supabase = await createServerClient();

  const { data: allKeys } = await supabase
    .from('keys')
    .select('zone, status')
    .neq('status', 'RETIRED');

  type ZoneStat = {
    name: string;
    issued: number;
    total: number;
    trend: number;
  };
  const zoneMap: Record<string, ZoneStat> = {
    NEW_SENATE: { name: 'New Senate', issued: 0, total: 0, trend: 0 },
    OLD_SENATE: { name: 'Old Senate', issued: 0, total: 0, trend: 0 },
  };
  (allKeys ?? []).forEach((k) => {
    if (k.zone in zoneMap) {
      zoneMap[k.zone].total++;
      if (k.status === 'ISSUED' || k.status === 'OVERDUE')
        zoneMap[k.zone].issued++;
    }
  });
  const zones = Object.values(zoneMap);

  // eslint-disable-next-line react-hooks/purity
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: riskRequests } = await supabase
    .from('requests')
    .select(
      'id, risk_tier, risk_factors, created_at, key:keys!key_id(code, room_name), requester:profiles!requester_id(full_name)'
    )
    .eq('risk_tier', 'HIGH')
    .gte('created_at', since24h)
    .order('created_at', { ascending: false })
    .limit(5);

  const anomalies = (riskRequests ?? []).map(
    (r: Record<string, unknown>, i: number) => {
      const key = r.key as Record<string, unknown> | null;
      const requester = r.requester as Record<string, unknown> | null;
      const factors = Array.isArray(r.risk_factors)
        ? (r.risk_factors as Record<string, unknown>[])
            .map((f) => (f.rule as string | undefined) ?? String(f))
            .join(', ')
        : 'risk factors detected';
      return {
        id: i + 1,
        severity: 'HIGH' as const,
        title: `High-risk request — ${(key?.room_name as string | undefined) ?? 'unknown room'}`,
        description: `${(requester?.full_name as string | undefined) ?? 'Unknown user'} — ${factors}`,
        time: new Date(r.created_at as string).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    }
  );

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: auditRows } = await supabase
    .from('audit_log')
    .select(
      'id, event, actor_role, target_type, target_id, payload, occurred_at'
    )
    .gte('occurred_at', todayStart.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(20);

  const EVENT_MAP: Record<string, EventType> = {
    key_issued: 'ISSUED',
    key_returned: 'RETURNED',
    shift_handover_acknowledged: 'HANDOVER',
  };
  const events = (auditRows ?? []).map(
    (e: Record<string, unknown>, i: number) => {
      const eventName = e.event as string | undefined;
      const eventType: EventType =
        EVENT_MAP[eventName ?? ''] ??
        (eventName?.includes('risk') ? 'FLAGGED' : 'ISSUED');
      const payload =
        typeof e.payload === 'object' && e.payload !== null
          ? (e.payload as Record<string, unknown>)
          : {};
      return {
        id: i + 1,
        type: eventType,
        key: payload.key_code as string | undefined,
        label: eventName?.replace(/_/g, ' ') ?? 'Event',
        time: new Date(e.occurred_at as string).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    }
  );

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

      {/* Three-column layout: zone counters | anomaly feed | events stream */}
      <div className="grid flex-1 items-start gap-6 lg:grid-cols-3">
        {/* Left — live zone counters */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            Live zone counts
          </h2>
          {zones.map((zone) => {
            const up = zone.trend > 0;
            const ArrowIcon = up ? ArrowUpIcon : ArrowDownIcon;
            const trendClass = up ? 'text-destructive' : 'text-emerald-600';
            return (
              <div
                key={zone.name}
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
                  <ArrowIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {up ? '+' : ''}
                    {zone.trend} vs same time yesterday
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Centre — anomaly alert feed */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            Anomaly alerts
          </h2>
          {anomalies.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No anomalies in the last 24 hours.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {anomalies.map((anomaly) => {
                const cfg = severityConfig[anomaly.severity];
                const Icon = cfg.icon;
                return (
                  <button
                    key={anomaly.id}
                    type="button"
                    className="flex w-full overflow-hidden rounded-lg border border-border bg-card text-left shadow-[0_2px_4px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-label={`${cfg.label} severity: ${anomaly.title}`}
                  >
                    <div
                      className={`w-1 shrink-0 ${cfg.stripe}`}
                      aria-hidden="true"
                    />
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Icon
                            className={`size-4 shrink-0 ${cfg.textClass}`}
                            aria-hidden="true"
                          />
                          <span
                            className={`text-xs font-semibold ${cfg.textClass}`}
                          >
                            {cfg.label}
                          </span>
                        </div>
                        <time className="shrink-0 font-mono text-xs text-muted-foreground">
                          {anomaly.time}
                        </time>
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {anomaly.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {anomaly.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right — today's events stream */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            {"Today's events"}
          </h2>
          {events.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8">
              <p className="text-sm text-muted-foreground">
                No events recorded today.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
              {events.map((event, idx) => {
                const cfg = eventConfig[event.type];
                const Icon = cfg.icon;
                return (
                  <div
                    key={event.id}
                    className={`flex items-start gap-3 px-4 py-3 ${idx !== events.length - 1 ? 'border-b border-border' : ''}`}
                  >
                    <Icon
                      className={`mt-0.5 size-4 shrink-0 ${cfg.iconClass}`}
                      aria-hidden="true"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm text-foreground">
                        {event.label}
                      </span>
                      {event.key && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {event.key}
                        </span>
                      )}
                    </div>
                    <time className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
                      {event.time}
                    </time>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
