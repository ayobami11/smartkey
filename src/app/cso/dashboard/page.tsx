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

const zones = [
  { name: 'New Senate', issued: 12, total: 47, trend: +2 },
  { name: 'Old Senate', issued: 8, total: 31, trend: -1 },
];

const anomalies = [
  {
    id: 1,
    severity: 'HIGH' as const,
    title: 'Signature mismatch on weekend approval',
    description: 'Prof. Adeleke, Faculty of Sciences — 78% mismatch detected.',
    time: '14:22',
  },
  {
    id: 2,
    severity: 'MEDIUM' as const,
    title: 'Outstanding key past return deadline',
    description: 'Old Senate Room 12, Dr. Bakare — issued 09:15 yesterday.',
    time: '17:05',
  },
  {
    id: 3,
    severity: 'MEDIUM' as const,
    title: 'Request frequency exceeds rolling window',
    description: 'New Senate Room 304 — 4 requests in 24 hours.',
    time: '12:40',
  },
];

type EventType = 'ISSUED' | 'RETURNED' | 'FLAGGED' | 'HANDOVER';

const events: {
  id: number;
  type: EventType;
  key?: string;
  label: string;
  time: string;
}[] = [
  {
    id: 1,
    type: 'ISSUED',
    key: 'Senate 304',
    label: 'Key issued',
    time: '13:48',
  },
  {
    id: 2,
    type: 'RETURNED',
    key: 'Senate 211',
    label: 'Key returned',
    time: '13:22',
  },
  {
    id: 3,
    type: 'FLAGGED',
    key: 'Senate 304',
    label: 'High-risk request flagged',
    time: '12:40',
  },
  { id: 4, type: 'HANDOVER', label: 'Shift handover completed', time: '12:00' },
  {
    id: 5,
    type: 'ISSUED',
    key: 'Senate 211',
    label: 'Key issued',
    time: '11:05',
  },
];

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

export default function CsoDashboardPage() {
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
          <Link href="/cso/logs">
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
