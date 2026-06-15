'use client';

import { useState } from 'react';

import { useDebounce } from '@/hooks/useDebounce';
import {
  ArrowLeftRightIcon,
  CheckCircleIcon,
  CirclePlusIcon,
  KeyRoundIcon,
  LogInIcon,
  SearchIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  type ColumnDef,
  type PaginationState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';

import { createBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Types

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
  department?: string;
  description: string;
  keyCode?: string;
  timestamp: string;
};

// Constants

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

const ACTOR_ROLE_CLASS: Record<string, string> = {
  CSO: 'bg-primary/10 text-primary',
  HOD: 'bg-amber-100 text-amber-700',
  Verifier: 'bg-blue-100 text-blue-700',
  VERIFIER: 'bg-blue-100 text-blue-700',
  Requester: 'bg-muted text-muted-foreground',
  REQUESTER: 'bg-muted text-muted-foreground',
  System: 'bg-muted text-muted-foreground',
};

const ROLE_LABEL: Record<string, string> = {
  CSO: 'CSO',
  HOD: 'HOD',
  VERIFIER: 'Verifier',
  REQUESTER: 'Requester',
};

const EVENT_TYPE_MAP: Record<string, AuditEventType> = {
  REQUEST_CREATED: 'REQUEST',
  REQUEST_CANCELLED: 'REQUEST',
  REQUEST_EXPIRED: 'REQUEST',
  CODE_ISSUED: 'REQUEST',
  REQUEST_APPROVED_CSO: 'REQUEST',
  REQUEST_DECLINED_CSO: 'REQUEST',
  HOD_APPROVED: 'REQUEST',
  HOD_DECLINED: 'REQUEST',
  KEY_ISSUED: 'ISSUE',
  KEY_RETURNED: 'RETURN',
  KEY_OVERDUE: 'ANOMALY',
  HANDOVER_KEY_ACKNOWLEDGED: 'HANDOVER',
  USER_PROVISIONED: 'SETTINGS',
  USER_DEACTIVATED: 'SETTINGS',
  PASSWORD_CHANGED: 'SETTINGS',
  SHIFT_REPORT_INITIATED: 'SETTINGS',
  REPORT_COMMENT_ADDED: 'SETTINGS',
  SIGNATURE_MISMATCH: 'SIGNATURE',
  LOGIN_SUCCEEDED: 'LOGIN',
};

const TYPE_TO_EVENTS: Partial<Record<AuditEventType, string[]>> = {
  REQUEST: [
    'REQUEST_CREATED',
    'REQUEST_CANCELLED',
    'REQUEST_EXPIRED',
    'CODE_ISSUED',
    'REQUEST_APPROVED_CSO',
    'REQUEST_DECLINED_CSO',
    'HOD_APPROVED',
    'HOD_DECLINED',
  ],
  ISSUE: ['KEY_ISSUED'],
  RETURN: ['KEY_RETURNED'],
  ANOMALY: ['KEY_OVERDUE'],
  HANDOVER: ['HANDOVER_KEY_ACKNOWLEDGED'],
  SETTINGS: ['USER_PROVISIONED', 'USER_DEACTIVATED', 'PASSWORD_CHANGED'],
  SIGNATURE: ['SIGNATURE_MISMATCH'],
  LOGIN: ['LOGIN_SUCCEEDED'],
};

const TYPE_CHIPS: { label: string; type?: AuditEventType }[] = [
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

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'CSO', label: 'CSO' },
  { value: 'HOD', label: 'HOD' },
  { value: 'VERIFIER', label: 'Verifier' },
  { value: 'REQUESTER', label: 'Requester' },
];

// Helpers

function mapRow(e: Record<string, unknown>): AuditEntry {
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
      (e.actor_name as string | undefined) ??
      (payload.actor_name as string | undefined) ??
      'Unknown actor',
    actorRole: ROLE_LABEL[e.actor_role as string] ?? (e.actor_role as string),
    department: (e.actor_department as string | undefined) ?? undefined,
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

function buildPageNumbers(
  current: number,
  total: number
): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);

  const pages = new Set<number>([
    0,
    total - 1,
    current,
    ...(current > 0 ? [current - 1] : []),
    ...(current < total - 1 ? [current + 1] : []),
  ]);

  const sorted = Array.from(pages).sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1]! - sorted[i]! > 1) {
      result.push('ellipsis');
    }
  }
  return result;
}

// Column definitions

const columns: ColumnDef<AuditEntry>[] = [
  {
    id: 'type',
    cell: ({ row }) => {
      const cfg = eventConfig[row.original.type];
      const Icon = cfg.icon;
      return (
        <Icon
          className={`mt-0.5 size-4 shrink-0 ${cfg.iconClass}`}
          aria-label={cfg.label}
        />
      );
    },
  },
  {
    id: 'actor',
    header: 'Actor',
    cell: ({ row }) => (
      <span className="text-sm font-medium text-foreground">
        {row.original.actor}
      </span>
    ),
  },
  {
    id: 'actorRole',
    header: 'Role',
    cell: ({ row }) => {
      const roleCls =
        ACTOR_ROLE_CLASS[row.original.actorRole] ??
        'bg-muted text-muted-foreground';
      return (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${roleCls}`}
          aria-label={`Role: ${row.original.actorRole}`}
        >
          {row.original.actorRole}
        </span>
      );
    },
  },
  {
    id: 'department',
    header: 'Department',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.department ?? '—'}
      </span>
    ),
  },
  {
    id: 'description',
    header: 'Event',
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {row.original.description}
        </p>
        {row.original.keyCode && (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {row.original.keyCode}
          </code>
        )}
      </div>
    ),
  },
  {
    id: 'timestamp',
    header: 'Time',
    cell: ({ row }) => (
      <time className="shrink-0 font-mono text-xs text-muted-foreground">
        {row.original.timestamp}
      </time>
    ),
  },
];

// Component

export const AuditTable = () => {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [typeFilter, setTypeFilter] = useState<AuditEventType[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);

  const { pageIndex, pageSize } = pagination;

  // Shared filter key — used by both queries so they stay in sync.
  const filterKey = { typeFilter, debouncedSearch, roleFilter };

  // Derive mapped events once so both queries use the same value.
  const mappedEvents =
    typeFilter.length > 0
      ? typeFilter.flatMap((t) => TYPE_TO_EVENTS[t] ?? [])
      : [];
  const earlyEmpty = typeFilter.length > 0 && mappedEvents.length === 0;

  // Count query — re-runs only when filters change, not on page navigation.
  const { data: countData } = useQuery({
    queryKey: ['audit', 'log', 'count', filterKey],
    queryFn: async () => {
      if (earlyEmpty) return 0;
      const supabase = createBrowserClient();
      let q = supabase
        .from('audit_log')
        .select('*', { count: 'exact', head: true });
      if (mappedEvents.length > 0) q = q.in('event', mappedEvents);
      if (debouncedSearch.trim()) {
        const term = `%${debouncedSearch.trim()}%`;
        q = q.or(`event.ilike.${term},actor_name.ilike.${term}`);
      }
      if (roleFilter.length > 0)
        q = q.in(
          'actor_role',
          roleFilter as ('CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER')[]
        );
      const { count, error } = await q;
      if (error) throw new Error('Failed to count audit log.');
      return count ?? 0;
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  // Data query — re-runs on page navigation AND filter changes.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit', 'log', 'rows', { ...filterKey, pageIndex, pageSize }],
    queryFn: async () => {
      if (earlyEmpty) return [];
      const supabase = createBrowserClient();
      const from = pageIndex * pageSize;
      const to = (pageIndex + 1) * pageSize - 1;
      let q = supabase
        .from('audit_log')
        .select(
          'id, event, actor_id, actor_role, actor_name, actor_department, payload, occurred_at'
        )
        .order('occurred_at', { ascending: false })
        .range(from, to);
      if (mappedEvents.length > 0) q = q.in('event', mappedEvents);
      if (debouncedSearch.trim()) {
        const term = `%${debouncedSearch.trim()}%`;
        q = q.or(`event.ilike.${term},actor_name.ilike.${term}`);
      }
      if (roleFilter.length > 0)
        q = q.in(
          'actor_role',
          roleFilter as ('CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER')[]
        );
      const { data, error } = await q;
      if (error) throw new Error('Failed to load audit log.');
      return (data ?? []).map((e) => mapRow(e as Record<string, unknown>));
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const table = useReactTable({
    data: data ?? [],
    columns,
    rowCount: countData ?? 0,
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleTypeToggle = (type: AuditEventType) => {
    setTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    table.setPageIndex(0);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    table.setPageIndex(0);
  };

  const handleRoleToggle = (value: string) => {
    setRoleFilter((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    );
    table.setPageIndex(0);
  };

  return (
    <div className="flex flex-col gap-4">
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
              placeholder="Search by event or actor name"
              className="pl-9"
              aria-label="Search audit log by event or actor name"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-dashed"
              >
                <CirclePlusIcon className="size-3.5" aria-hidden="true" />
                Role
                {roleFilter.length > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {roleFilter.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel>Filter by role</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ROLE_OPTIONS.map((opt) => (
                <DropdownMenuCheckboxItem
                  key={opt.value}
                  checked={roleFilter.includes(opt.value)}
                  onCheckedChange={() => handleRoleToggle(opt.value)}
                >
                  {opt.label}
                </DropdownMenuCheckboxItem>
              ))}
              {roleFilter.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setRoleFilter([]);
                      table.setPageIndex(0);
                    }}
                    className="text-muted-foreground"
                  >
                    Clear filter
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-dashed"
              >
                <CirclePlusIcon className="size-3.5" aria-hidden="true" />
                Event
                {typeFilter.length > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {typeFilter.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Filter by event type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {TYPE_CHIPS.filter((c) => c.type !== undefined).map((chip) => (
                <DropdownMenuCheckboxItem
                  key={chip.label}
                  checked={typeFilter.includes(chip.type!)}
                  onCheckedChange={() => handleTypeToggle(chip.type!)}
                >
                  {chip.label}
                </DropdownMenuCheckboxItem>
              ))}
              {typeFilter.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setTypeFilter([]);
                      table.setPageIndex(0);
                    }}
                    className="text-muted-foreground"
                  >
                    Clear filter
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">Failed to load audit log.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && (
        <div className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    No events match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !isError && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => {
                table.setPageSize(Number(v));
                table.setPageIndex(0);
              }}
            >
              <SelectTrigger className="h-8 w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={(e) => {
                    e.preventDefault();
                    table.previousPage();
                  }}
                  aria-disabled={!table.getCanPreviousPage()}
                  className={
                    !table.getCanPreviousPage()
                      ? 'pointer-events-none opacity-50'
                      : ''
                  }
                />
              </PaginationItem>

              {buildPageNumbers(
                table.getState().pagination.pageIndex,
                table.getPageCount()
              ).map((item, idx) =>
                item === 'ellipsis' ? (
                  <PaginationItem key={`e-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <PaginationLink
                      isActive={item === table.getState().pagination.pageIndex}
                      onClick={(e) => {
                        e.preventDefault();
                        table.setPageIndex(item);
                      }}
                    >
                      {item + 1}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <PaginationNext
                  onClick={(e) => {
                    e.preventDefault();
                    table.nextPage();
                  }}
                  aria-disabled={!table.getCanNextPage()}
                  className={
                    !table.getCanNextPage()
                      ? 'pointer-events-none opacity-50'
                      : ''
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
};
