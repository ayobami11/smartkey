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
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

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

const entries: AuditEntry[] = [
  {
    id: 'evt-001',
    type: 'LOGIN',
    actor: 'Officer Musa',
    actorRole: 'Verifier',
    description: 'Signed in at the start of Shift 3',
    timestamp: '2026-05-14 16:00',
  },
  {
    id: 'evt-002',
    type: 'HANDOVER',
    actor: 'Officer Musa',
    actorRole: 'Verifier',
    description: 'Shift handover acknowledged — 3 outstanding keys confirmed',
    timestamp: '2026-05-14 16:03',
  },
  {
    id: 'evt-003',
    type: 'REQUEST',
    actor: 'Dr. Emeka Bakare',
    actorRole: 'Requester',
    description: 'Requested key Senate-304 (New Senate Room 304)',
    keyCode: 'NS-304',
    timestamp: '2026-05-14 16:12',
  },
  {
    id: 'evt-004',
    type: 'ANOMALY',
    actor: 'System',
    actorRole: 'System',
    description:
      'High-risk flag on NS-304 — request submitted outside operational hours',
    keyCode: 'NS-304',
    timestamp: '2026-05-14 16:12',
  },
  {
    id: 'evt-005',
    type: 'ISSUE',
    actor: 'Officer Musa',
    actorRole: 'Verifier',
    description:
      'Issued key Senate-304 to Dr. Emeka Bakare — high-risk acknowledged',
    keyCode: 'NS-304',
    timestamp: '2026-05-14 16:14',
  },
  {
    id: 'evt-006',
    type: 'SIGNATURE',
    actor: 'System',
    actorRole: 'System',
    description:
      'Signature verified for HOD approval — Prof. Adeleke (match: 96.4%)',
    timestamp: '2026-05-14 15:47',
  },
  {
    id: 'evt-007',
    type: 'RETURN',
    actor: 'Officer Adeleke',
    actorRole: 'Verifier',
    description: 'Received returned key Senate-211 from Prof. Yetunde Bello',
    keyCode: 'NS-211',
    timestamp: '2026-05-14 15:33',
  },
  {
    id: 'evt-008',
    type: 'REQUEST',
    actor: 'Mrs. Chidinma Nwosu',
    actorRole: 'Requester',
    description: 'Requested key Old Senate-107 (Old Senate Room 107)',
    keyCode: 'OS-107',
    timestamp: '2026-05-14 14:55',
  },
  {
    id: 'evt-009',
    type: 'ISSUE',
    actor: 'Officer Ibrahim',
    actorRole: 'Verifier',
    description: 'Issued key Old Senate-107 to Mrs. Chidinma Nwosu',
    keyCode: 'OS-107',
    timestamp: '2026-05-14 14:57',
  },
  {
    id: 'evt-010',
    type: 'SETTINGS',
    actor: 'CSO Admin',
    actorRole: 'CSO',
    description: 'Updated return deadline to 17:30 (was 17:00)',
    timestamp: '2026-05-14 09:14',
  },
  {
    id: 'evt-011',
    type: 'LOGIN',
    actor: 'Officer Ibrahim',
    actorRole: 'Verifier',
    description: 'Signed in at the start of Shift 2',
    timestamp: '2026-05-14 08:00',
  },
  {
    id: 'evt-012',
    type: 'RETURN',
    actor: 'Officer Fashola',
    actorRole: 'Verifier',
    description: 'Received returned key Senate-118 from Dr. Okonkwo',
    keyCode: 'NS-118',
    timestamp: '2026-05-14 07:52',
  },
];

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

export default function AuditLogPage() {
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
          Showing 1–20 of 1,247 events
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
              <PaginationLink href="#">2</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">63</PaginationLink>
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
