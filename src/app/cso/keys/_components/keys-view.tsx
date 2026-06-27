'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { useMediaQuery } from '@/hooks/use-media-query';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
} from '@/components/ui/combobox';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/api';
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

type Department = { id: string; name: string };

// Constants

const ALL_DEPTS_VALUE = 'All units';

const tabs: { label: string; value: ActiveTab }[] = [
  { label: 'All', value: 'All' },
  { label: 'New Senate', value: 'NEW_SENATE' },
  { label: 'Old Senate', value: 'OLD_SENATE' },
  { label: 'Outstanding', value: 'Outstanding' },
  { label: 'Retired', value: 'Retired' },
];

// Component

export const KeysView = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('All');
  const [search, setSearch] = useState('');
  const [selectedDeptName, setSelectedDeptName] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [lostTarget, setLostTarget] = useState<{
    id: string;
    code: string;
  } | null>(null);

  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Fetch departments for filter
  useEffect(() => {
    apiFetch<{ units: Department[] }>('/api/admin/units').then((result) => {
      if (result.data) setDepartments(result.data.units ?? []);
    });
  }, []);

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
          'id, code, zone, room_name, status, key_count, department:units!unit_id(name)'
        )
        .order('code', { ascending: true });

      if (error) throw new Error('Failed to load key inventory.');

      return (data ?? []).map((k: Record<string, unknown>) => {
        const dept = k.department as Record<string, unknown> | null;
        return {
          id: k.id as string,
          code: k.code as string,
          zone: k.zone as KeyZone,
          room: k.room_name as string,
          department: (dept?.name as string | undefined) ?? '—',
          status: k.status as KeyStatus,
          key_count: (k.key_count as number | undefined) ?? 1,
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
      const result = await apiFetch<{
        outstanding: Record<string, unknown>[];
      }>('/api/keys/out');
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load outstanding keys.');
      return result.data.outstanding.map((item) => {
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
          k.department.toLowerCase().includes(query)
      )
    : tabFiltered;

  const deptFiltered = !selectedDeptName
    ? filtered
    : filtered.filter((k) => k.department === selectedDeptName);

  const outstandingFiltered = (() => {
    let items = query
      ? outstandingKeys.filter(
          (item) =>
            item.keyCode.toLowerCase().includes(query) ||
            item.roomName.toLowerCase().includes(query) ||
            item.requesterName.toLowerCase().includes(query)
        )
      : outstandingKeys;

    if (selectedDeptName) {
      const deptKeyIds = new Set(
        keys.filter((k) => k.department === selectedDeptName).map((k) => k.id)
      );
      items = items.filter((item) => deptKeyIds.has(item.keyId));
    }

    return items;
  })();

  const isFiltering = inputValue.trim() !== '';
  const lowerInput = inputValue.toLowerCase().trim();
  const deptSuggestions = isFiltering
    ? departments.filter((d) => d.name.toLowerCase().includes(lowerInput))
    : departments;

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

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ActiveTab)}
        orientation={isDesktop ? 'vertical' : 'horizontal'}
        className="flex-1 gap-6 lg:gap-8"
      >
        <TabsList
          variant="line"
          aria-label="Filter by zone"
          className="lg:w-48 lg:shrink-0"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="px-4 py-2 data-active:text-primary! lg:data-active:bg-primary/10! after:bg-primary lg:after:hidden"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Separator orientation="vertical" className="hidden lg:block" />
        <div className="flex flex-1 flex-col gap-6">
          {/* Search + department filter */}
          <div className="flex flex-wrap items-center gap-3">
            <InputGroup className="flex-1">
              <InputGroupInput
                type="search"
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearch(e.target.value)
                }
                placeholder="Search by key code, room or unit"
                aria-label="Search keys"
              />
              <InputGroupAddon align="inline-start">
                <SearchIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </InputGroupAddon>
            </InputGroup>

            <Combobox
              items={[ALL_DEPTS_VALUE, ...departments.map((d) => d.name)]}
              value={selectedDeptName}
              onValueChange={(name) => {
                const n = name as string | null;
                setSelectedDeptName(!n || n === ALL_DEPTS_VALUE ? null : n);
              }}
              onOpenChange={(open) => {
                if (!open) setInputValue('');
              }}
            >
              <ComboboxInput
                placeholder="All units"
                aria-label="Filter by unit"
                showClear={!!selectedDeptName}
                className="w-64"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setInputValue(e.target.value)
                }
              />
              <ComboboxContent>
                <ComboboxList>
                  {!isFiltering && (
                    <>
                      <ComboboxItem value={ALL_DEPTS_VALUE}>
                        All units
                      </ComboboxItem>
                      {departments.length > 0 && <ComboboxSeparator />}
                    </>
                  )}
                  {deptSuggestions.length === 0 ? (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                      No units found.
                    </p>
                  ) : (
                    deptSuggestions.map((d) => (
                      <ComboboxItem key={d.id} value={d.name}>
                        {d.name}
                      </ComboboxItem>
                    ))
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {/* Outstanding */}
          <TabsContent value="Outstanding">
            <OutstandingKeys
              items={outstandingFiltered}
              isLoading={outstandingLoading}
              isError={outstandingIsError}
              error={outstandingErrorObj}
              onRetry={() => refetchOutstanding()}
              onMarkLost={setLostTarget}
            />
          </TabsContent>

          {/* All / zone / Retired */}
          {tabs
            .filter((t) => t.value !== 'Outstanding')
            .map((t) => (
              <TabsContent key={t.value} value={t.value}>
                {keysLoading && (
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
                {keysError && (
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
                {!keysLoading &&
                  !keysError &&
                  (deptFiltered.length === 0 ? (
                    <KeysEmpty
                      title="No keys found"
                      description="No keys match the selected filter."
                    />
                  ) : (
                    <KeyCards keys={deptFiltered} onMarkLost={setLostTarget} />
                  ))}
              </TabsContent>
            ))}
        </div>
      </Tabs>

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
};
