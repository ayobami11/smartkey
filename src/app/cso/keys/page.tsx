'use client';

import { useState } from 'react';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createBrowserClient } from '@/lib/supabase/client';

import {
  type Key,
  type KeyStatus,
  type KeyZone,
} from '@/app/cso/keys/_components/key-card';
import { KeyCards } from '@/app/cso/keys/_components/key-cards';
import { KeysEmpty } from '@/app/cso/keys/_components/keys-empty';
import { MarkKeyLostDialog } from '@/app/cso/keys/_components/mark-key-lost-dialog';
import {
  OutstandingKeys,
  type OutstandingKey,
} from '@/app/cso/keys/_components/outstanding-keys';

// Types

type ActiveTab =
  | 'All'
  | 'NEW_SENATE'
  | 'OLD_SENATE'
  | 'Outstanding'
  | 'Retired';

// Constants

const tabs: { label: string; value: ActiveTab }[] = [
  { label: 'All', value: 'All' },
  { label: 'New Senate', value: 'NEW_SENATE' },
  { label: 'Old Senate', value: 'OLD_SENATE' },
  { label: 'Outstanding', value: 'Outstanding' },
  { label: 'Retired', value: 'Retired' },
];

// Component

export default function KeyInventoryPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('All');
  const [search, setSearch] = useState('');
  const [lostTarget, setLostTarget] = useState<{
    id: string;
    code: string;
  } | null>(null);

  // Keys inventory query

  const {
    data: keys = [],
    isLoading: keysLoading,
    isError: keysError,
    error: keysErrorObj,
    refetch: refetchKeys,
  } = useQuery<Key[]>({
    queryKey: ['cso', 'keys'],
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('keys')
        .select(
          'id, code, zone, room_name, status, department:departments!department_id(name, hod:profiles!hod_id(full_name, status))'
        )
        .order('code', { ascending: true });

      if (error) throw new Error('Failed to load key inventory.');

      return (data ?? []).map((k: Record<string, unknown>) => {
        const dept = k.department as Record<string, unknown> | null;
        const hod = dept?.hod as Record<string, unknown> | null;
        return {
          id: k.id as string,
          code: k.code as string,
          zone: k.zone as KeyZone,
          room: k.room_name as string,
          department: (dept?.name as string | undefined) ?? '—',
          hod: (hod?.full_name as string | undefined) ?? '—',
          hodPending: hod?.status === 'PENDING_ACTIVATION',
          status: k.status as KeyStatus,
        };
      });
    },
    staleTime: 5 * 60_000,
  });

  // Outstanding keys query — only fetches when the Outstanding tab is active

  const {
    data: outstandingKeys = [],
    isLoading: outstandingLoading,
    isError: outstandingIsError,
    error: outstandingErrorObj,
    refetch: refetchOutstanding,
  } = useQuery<OutstandingKey[]>({
    queryKey: ['cso', 'keys', 'outstanding'],
    queryFn: async () => {
      const res = await fetch('/api/keys/out');
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error ?? 'Failed to load outstanding keys.');
      const raw =
        (json as { data?: { outstanding?: Record<string, unknown>[] } }).data
          ?.outstanding ?? [];
      return raw.map((item) => {
        const key = item.key as {
          id: string;
          code: string;
          room_name: string;
          zone: string;
        } | null;
        const requester = item.requester as { full_name: string } | null;
        return {
          requestId: item.id as string,
          keyId: key?.id ?? '',
          keyCode: key?.code ?? '—',
          roomName: key?.room_name ?? '—',
          zone: key?.zone ?? '—',
          requesterName: requester?.full_name ?? '—',
          issuedAt: item.issued_at as string,
          returnDeadline: item.return_deadline as string,
          isOverdue: new Date() > new Date(item.return_deadline as string),
        };
      });
    },
    enabled: activeTab === 'Outstanding',
    staleTime: 30_000,
  });

  // Computed

  const query = search.trim().toLowerCase();

  const tabFiltered =
    activeTab === 'All'
      ? keys
      : activeTab === 'Retired'
        ? keys.filter((k) => k.status === 'RETIRED')
        : keys.filter((k) => k.zone === activeTab);

  const filtered = query
    ? tabFiltered.filter(
        (k) =>
          k.code.toLowerCase().includes(query) ||
          k.room.toLowerCase().includes(query) ||
          k.department.toLowerCase().includes(query) ||
          k.hod.toLowerCase().includes(query)
      )
    : tabFiltered;

  const outstandingFiltered = query
    ? outstandingKeys.filter(
        (item) =>
          item.keyCode.toLowerCase().includes(query) ||
          item.roomName.toLowerCase().includes(query) ||
          item.requesterName.toLowerCase().includes(query)
      )
    : outstandingKeys;

  // Render

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Key Inventory
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Master inventory of all keys across both Senate zones.
          </p>
        </div>
        <Button>
          <PlusIcon className="size-4" aria-hidden="true" />
          Add key
        </Button>
      </div>

      {/* Zone tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ActiveTab)}
      >
        <TabsList
          variant="line"
          aria-label="Filter by zone"
          className="h-auto w-fit justify-start rounded-none border-b border-border bg-transparent p-0"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none px-4 py-2 text-sm font-medium data-active:text-primary after:bg-primary"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative max-w-md">
        <SearchIcon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by key code, room, department, or HOD…"
          className="pl-9"
          aria-label="Search keys"
        />
      </div>

      {/* Loading */}
      {keysLoading && activeTab !== 'Outstanding' && (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Loading keys"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {keysError && activeTab !== 'Outstanding' && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive">
            Failed to load key inventory
          </p>
          {keysErrorObj instanceof Error && (
            <p className="mt-1 text-xs text-destructive/80">
              {keysErrorObj.message}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => refetchKeys()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Outstanding tab */}
      {activeTab === 'Outstanding' && (
        <OutstandingKeys
          items={outstandingFiltered}
          isLoading={outstandingLoading}
          isError={outstandingIsError}
          error={outstandingErrorObj}
          onRetry={() => refetchOutstanding()}
          onMarkLost={setLostTarget}
        />
      )}

      {/* Content */}
      {!keysLoading &&
        !keysError &&
        activeTab !== 'Outstanding' &&
        (filtered.length === 0 ? (
          <KeysEmpty
            title="No keys found"
            description="No keys match the selected filter."
          />
        ) : (
          <KeyCards keys={filtered} onMarkLost={setLostTarget} />
        ))}

      {/* Mark as lost Dialog */}
      <MarkKeyLostDialog
        target={lostTarget}
        onClose={() => setLostTarget(null)}
        onMarked={() => {
          refetchKeys();
          refetchOutstanding();
        }}
      />
    </div>
  );
}
