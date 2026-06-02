import {
  ArrowLeftRightIcon,
  CheckCircleIcon,
  DownloadIcon,
  KeyRoundIcon,
  LogInIcon,
  SearchIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { createServerClient } from '@/lib/supabase/server';

type AuditEventType =
  | 'REQUEST'
  | 'ISSUE'
  | 'RETURN'
  | 'ANOMALY'
  | 'HANDOVER'
  | 'LOGIN'
  | 'SETTINGS'
  | 'SIGNATURE';

type AuditEntry = {
  id: string;
  type: AuditEventType;
  actor: string;
  actorRole: string;
  description: string;
  keyCode?: string;
  timestamp: string;
};

const eventConfig: Record<
  AuditEventType,
  { icon: LucideIcon; label: string; iconClass: string }
> = {
  REQUEST: { icon: KeyRoundIcon, label: 'Request', iconClass: 'text-primary' },
  ISSUE: { icon: KeyRoundIcon, label: 'Issue', iconClass: 'text-primary' },
  RETURN: {
    icon: CheckCircleIcon,
    label: 'Return',
    iconClass: 'text-emerald-600',
  },
  ANOMALY: {
    icon: ShieldAlertIcon,
    label: 'Anomaly',
    iconClass: 'text-destructive',
  },
  HANDOVER: {
    icon: ArrowLeftRightIcon,
    label: 'Handover',
    iconClass: 'text-muted-foreground',
  },
  LOGIN: {
    icon: LogInIcon,
    label: 'Login',
    iconClass: 'text-muted-foreground',
  },
  SETTINGS: {
    icon: SettingsIcon,
    label: 'Settings change',
    iconClass: 'text-muted-foreground',
  },
  SIGNATURE: {
    icon: ShieldCheckIcon,
    label: 'Signature',
    iconClass: 'text-emerald-600',
  },
};

const typeChips: { label: string; type?: AuditEventType }[] = [
  { label: 'All types' },
  { label: 'Request', type: 'REQUEST' },
  { label: 'Issue', type: 'ISSUE' },
  { label: 'Return', type: 'RETURN' },
  { label: 'Anomaly', type: 'ANOMALY' },
  { label: 'Handover', type: 'HANDOVER' },
  { label: 'Login', type: 'LOGIN' },
  { label: 'Settings', type: 'SETTINGS' },
  { label: 'Signature', type: 'SIGNATURE' },
];

const zoneFilters = ['All zones', 'New Senate', 'Old Senate'];

const actorRoleClass: Record<string, string> = {
  CSO: 'bg-primary/10 text-primary',
  HOD: 'bg-amber-100 text-amber-700',
  Verifier: 'bg-blue-100 text-blue-700',
  Requester: 'bg-muted text-muted-foreground',
  System: 'bg-muted text-muted-foreground',
};

const ROLE_LABEL: Record<string, string> = {
  CSO: 'CSO',
  HOD: 'HOD',
  VERIFIER: 'Verifier',
  REQUESTER: 'Requester',
};

const EVENT_TYPE_MAP: Record<string, AuditEventType> = {
  key_issued: 'ISSUE',
  key_returned: 'RETURN',
  request_created: 'REQUEST',
  shift_handover_acknowledged: 'HANDOVER',
  user_provisioned: 'SETTINGS',
};

export default async function AuditLogPage() {
  const supabase = await createServerClient();

  const { data: auditRows } = await supabase
    .from('audit_log')
    .select(
      'id, event, actor_id, actor_role, target_type, target_id, payload, occurred_at'
    )
    .order('occurred_at', { ascending: false })
    .limit(50);

  const entries: AuditEntry[] = (auditRows ?? []).map(
    (e: Record<string, unknown>) => {
      const payload =
        typeof e.payload === 'object' && e.payload !== null
          ? (e.payload as Record<string, unknown>)
          : {};
      const eventName = e.event as string | undefined;
      const eventType: AuditEventType =
        EVENT_TYPE_MAP[eventName ?? ''] ?? 'SETTINGS';
      return {
        id: e.id as string,
        type: eventType,
        actor:
          (payload.actor_name as string | undefined) ??
          (e.actor_id as string).slice(0, 8),
        actorRole:
          ROLE_LABEL[e.actor_role as string] ?? (e.actor_role as string),
        description: eventName?.replace(/_/g, ' ') ?? 'Event',
        keyCode: payload.key_code as string | undefined,
        timestamp: new Date(e.occurred_at as string).toLocaleString('en-GB', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    }
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Audit Log</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Immutable record of every consequential event in SmartKey.
          </p>
        </div>
        <Button variant="outline">
          <DownloadIcon className="size-4" aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <SearchIcon
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search by user name, key code, or event ID"
              className="pl-9"
              aria-label="Search audit log"
            />
          </div>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Filter by zone"
          >
            {zoneFilters.map((zone, idx) => (
              <button
                key={zone}
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  idx === 0
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-foreground hover:bg-muted'
                }`}
                aria-pressed={idx === 0}
              >
                {zone}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Reset filters
          </button>
        </div>

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by event type"
        >
          {typeChips.map((chip, idx) => (
            <button
              key={chip.label}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                idx === 0
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
              aria-pressed={idx === 0}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Result list */}
      <div className="flex flex-col rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
        {entries.map((entry, idx) => {
          const cfg = eventConfig[entry.type];
          const Icon = cfg.icon;
          const roleCls =
            actorRoleClass[entry.actorRole] ?? 'bg-muted text-muted-foreground';
          return (
            <div
              key={entry.id}
              className={`flex items-start gap-3 px-4 py-3 ${idx !== entries.length - 1 ? 'border-b border-border' : ''}`}
            >
              <Icon
                className={`mt-0.5 size-4 shrink-0 ${cfg.iconClass}`}
                aria-label={cfg.label}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {entry.actor}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${roleCls}`}
                  >
                    {entry.actorRole}
                  </span>
                  {entry.keyCode && (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                      {entry.keyCode}
                    </code>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {entry.description}
                </p>
              </div>
              <time className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
                {entry.timestamp}
              </time>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Showing {entries.length} events
        </p>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled="true"
                className="pointer-events-none opacity-50"
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
