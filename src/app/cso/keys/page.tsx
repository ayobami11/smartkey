'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircleIcon,
  ClockIcon,
  EllipsisIcon,
  KeyRoundIcon,
  PlusIcon,
  SearchIcon,
  XCircleIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { createBrowserClient } from '@/lib/supabase/client';

// Types

type KeyStatus = 'AVAILABLE' | 'ISSUED' | 'OVERDUE' | 'RETIRED';
type KeyZone = 'NEW_SENATE' | 'OLD_SENATE';
type ActiveTab =
  | 'All'
  | 'NEW_SENATE'
  | 'OLD_SENATE'
  | 'Outstanding'
  | 'Retired';

type OutstandingKey = {
  requestId: string;
  keyId: string;
  keyCode: string;
  roomName: string;
  zone: string;
  requesterName: string;
  issuedAt: string;
  returnDeadline: string;
  isOverdue: boolean;
};

type Key = {
  id: string;
  code: string;
  zone: KeyZone;
  room: string;
  department: string;
  hod: string;
  hodPending: boolean;
  status: KeyStatus;
};

// Constants

const statusConfig: Record<KeyStatus, { label: string; cls: string }> = {
  AVAILABLE: { label: 'Available', cls: 'bg-emerald-100 text-emerald-700' },
  ISSUED: { label: 'Issued', cls: 'bg-primary/10 text-primary' },
  OVERDUE: { label: 'Overdue', cls: 'bg-destructive/10 text-destructive' },
  RETIRED: { label: 'Retired', cls: 'bg-muted text-muted-foreground' },
};

const tabs: { label: string; value: ActiveTab }[] = [
  { label: 'All', value: 'All' },
  { label: 'New Senate', value: 'NEW_SENATE' },
  { label: 'Old Senate', value: 'OLD_SENATE' },
  { label: 'Outstanding', value: 'Outstanding' },
  { label: 'Retired', value: 'Retired' },
];

// Component

export default function KeyInventoryPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('All');
  const [search, setSearch] = useState('');
  const [outstandingKeys, setOutstandingKeys] = useState<OutstandingKey[]>([]);
  const [outstandingState, setOutstandingState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [outstandingError, setOutstandingError] = useState<string | null>(null);
  const [lostTarget, setLostTarget] = useState<{
    id: string;
    code: string;
  } | null>(null);
  const [lostNote, setLostNote] = useState('');
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  // Fetch

  const fetchKeys = async () => {
    setLoadState('loading');
    setFetchError(null);
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from('keys')
      .select(
        'id, code, zone, room_name, status, department:departments!department_id(name, hod:profiles!hod_id(full_name, status))'
      )
      .order('code', { ascending: true });

    if (error) {
      setFetchError('Failed to load key inventory.');
      setLoadState('error');
      return;
    }

    setKeys(
      (data ?? []).map((k: Record<string, unknown>) => {
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
      })
    );
    setLoadState('ready');
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  useEffect(() => {
    if (activeTab !== 'Outstanding') return;
    if (outstandingState !== 'idle') return;
    const fetchOutstanding = async () => {
      setOutstandingState('loading');
      setOutstandingError(null);
      try {
        const res = await fetch('/api/keys/out');
        const json = await res.json();
        if (!res.ok) {
          setOutstandingError(
            (json as { error?: string }).error ??
              'Failed to load outstanding keys.'
          );
          setOutstandingState('error');
          return;
        }
        const raw =
          (json as { data?: { outstanding?: Record<string, unknown>[] } }).data
            ?.outstanding ?? [];
        setOutstandingKeys(
          raw.map((item) => {
            const key = item.key as {
              id: string;
              code: string;
              room_name: string;
              zone: string;
            } | null;
            const requester = item.requester as {
              full_name: string;
            } | null;
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
          })
        );
        setOutstandingState('ready');
      } catch {
        setOutstandingError(
          'Network error. Check your connection and try again.'
        );
        setOutstandingState('error');
      }
    };
    fetchOutstanding();
  }, [activeTab, outstandingState]);

  // Mark as lost

  const handleMarkLost = async () => {
    if (!lostTarget) return;
    setMarking(true);
    setMarkError(null);
    try {
      const res = await fetch('/api/keys/mark-lost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: lostTarget.id, note: lostNote }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMarkError(json.error ?? 'Failed to mark key as lost.');
        return;
      }
      setKeys((prev) =>
        prev.map((k) =>
          k.id === lostTarget.id ? { ...k, status: 'RETIRED' as KeyStatus } : k
        )
      );
      setLostTarget(null);
      setLostNote('');
    } catch {
      setMarkError('Something went wrong. Check your connection.');
    } finally {
      setMarking(false);
    }
  };

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
      <div
        className="flex items-center gap-1 border-b border-border"
        role="tablist"
        aria-label="Filter by zone"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              activeTab === tab.value
                ? '-mb-px border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
      {loadState === 'loading' && activeTab !== 'Outstanding' && (
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
      {loadState === 'error' && activeTab !== 'Outstanding' && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive">
            Failed to load key inventory
          </p>
          {fetchError && (
            <p className="mt-1 text-xs text-destructive/80">{fetchError}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={fetchKeys}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Outstanding tab */}
      {activeTab === 'Outstanding' && (
        <>
          {outstandingState === 'loading' && (
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          )}

          {outstandingState === 'error' && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
              role="alert"
            >
              <p className="text-sm font-medium text-destructive">
                Failed to load outstanding keys
              </p>
              {outstandingError && (
                <p className="mt-1 text-xs text-destructive/80">
                  {outstandingError}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setOutstandingState('idle')}
              >
                Retry
              </Button>
            </div>
          )}

          {outstandingState === 'ready' && (
            <>
              {outstandingFiltered.length === 0 ? (
                <Empty className="border border-border bg-card">
                  <EmptyMedia variant="icon">
                    <KeyRoundIcon
                      className="size-8 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </EmptyMedia>
                  <EmptyContent>
                    <EmptyTitle>No keys currently issued</EmptyTitle>
                    <EmptyDescription>
                      All keys have been returned.
                    </EmptyDescription>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {outstandingFiltered.map((item) => (
                    <div
                      key={item.requestId}
                      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <KeyRoundIcon
                              className="size-4 text-primary"
                              aria-hidden="true"
                            />
                          </div>
                          <code className="font-mono text-base font-semibold text-foreground">
                            {item.keyCode}
                          </code>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              aria-label={`More actions for ${item.keyCode}`}
                            >
                              <EllipsisIcon
                                className="size-4 text-muted-foreground"
                                aria-hidden="true"
                              />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setLostTarget({
                                  id: item.keyId,
                                  code: item.keyCode,
                                });
                                setLostNote('');
                                setMarkError(null);
                              }}
                            >
                              <XCircleIcon
                                className="size-4"
                                aria-hidden="true"
                              />
                              Mark as lost
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {item.roomName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.requesterName}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ClockIcon className="size-3.5" aria-hidden="true" />
                          {new Date(item.issuedAt).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · Due{' '}
                          {new Date(item.returnDeadline).toLocaleTimeString(
                            'en-GB',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </span>
                      </div>

                      <span
                        className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          item.isOverdue
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-primary/10 text-primary'
                        }`}
                        aria-label={`Status: ${item.isOverdue ? 'Overdue' : 'Issued'}`}
                      >
                        {item.isOverdue && (
                          <AlertCircleIcon
                            className="size-3.5"
                            aria-hidden="true"
                          />
                        )}
                        {item.isOverdue ? 'Overdue' : 'Issued'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Content */}
      {loadState === 'ready' && activeTab !== 'Outstanding' && (
        <>
          {filtered.length === 0 ? (
            <Empty className="border border-border bg-card">
              <EmptyMedia variant="icon">
                <KeyRoundIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
              </EmptyMedia>
              <EmptyContent>
                <EmptyTitle>No keys found</EmptyTitle>
                <EmptyDescription>
                  No keys match the selected filter.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((key) => {
                const statusCfg = statusConfig[key.status];
                return (
                  <div
                    key={key.id}
                    className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <KeyRoundIcon
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                        </div>
                        <code className="font-mono text-base font-semibold text-foreground">
                          {key.code}
                        </code>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            aria-label={`More actions for ${key.code}`}
                          >
                            <EllipsisIcon
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {key.status !== 'RETIRED' && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setLostTarget({ id: key.id, code: key.code });
                                setLostNote('');
                                setMarkError(null);
                              }}
                            >
                              <XCircleIcon
                                className="size-4"
                                aria-hidden="true"
                              />
                              Mark as lost
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {key.room}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {key.department}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {key.hod}
                        {key.hodPending && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                            aria-label="HOD has not activated their account yet"
                          >
                            <ClockIcon className="size-3" aria-hidden="true" />
                            Pending activation
                          </span>
                        )}
                      </span>
                    </div>

                    <span
                      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusCfg.cls}`}
                      aria-label={`Status: ${statusCfg.label}`}
                    >
                      {statusCfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Mark as lost Dialog */}
      <Dialog
        open={lostTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLostTarget(null);
            setLostNote('');
            setMarkError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark key {lostTarget?.code} as lost</DialogTitle>
            <DialogDescription>
              This will retire the key and open a HIGH-severity incident. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="lost-note">
                Loss note <span aria-hidden="true">*</span>
              </Label>
              <Textarea
                id="lost-note"
                value={lostNote}
                onChange={(e) => setLostNote(e.target.value)}
                placeholder="Describe when and how the key went missing…"
                rows={4}
                aria-required="true"
              />
            </div>
            {markError && (
              <p className="text-sm text-destructive" role="alert">
                {markError}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={!lostNote.trim() || marking}
              aria-busy={marking}
              onClick={handleMarkLost}
            >
              {marking ? 'Marking…' : 'Confirm — mark as lost'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
