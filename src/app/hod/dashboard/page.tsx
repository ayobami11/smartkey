'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircleIcon,
  CalendarIcon,
  ChevronRightIcon,
  KeyRoundIcon,
} from 'lucide-react';

import { useRealtime } from '@/hooks/useRealtime';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

// Types

type PendingRequest = {
  id: string;
  requester: { full_name: string } | null;
  guest: { full_name: string } | null;
  key: { code: string } | null;
  requested_for: string;
  type: 'WEEKDAY' | 'WEEKEND';
};

type DeptKey = {
  id: string;
  code: string;
  room: string;
  zone: string;
  slots: boolean[];
};

// Helpers

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const filterTabs = ['All keys', 'Has vacant slot', 'Recently used'] as const;
type FilterTab = (typeof filterTabs)[number];

// Component

export default function HodDashboardPage() {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();
  const [fullName, setFullName] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptKeys, setDeptKeys] = useState<DeptKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All keys');

  const { data: pendingRequests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['requests', 'pending-weekend'],
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const res = await fetch('/api/requests/pending');
      if (!res.ok) return [];
      const json = await res.json();
      return (
        (json as { data?: { requests?: PendingRequest[] } }).data?.requests ??
        []
      );
    },
  });

  useRealtime({
    table: 'requests',
    filter: { column: 'type', value: 'WEEKEND' },
    onInsert: () =>
      queryClient.invalidateQueries({
        queryKey: ['requests', 'pending-weekend'],
      }),
    onUpdate: () =>
      queryClient.invalidateQueries({
        queryKey: ['requests', 'pending-weekend'],
      }),
  });

  const fetchKeys = async (
    supabase: ReturnType<typeof createBrowserClient>,
    deptId: string
  ) => {
    setLoadingKeys(true);
    const { data } = await supabase
      .from('keys')
      .select('id, code, zone, room_name, authorisations(profile_id)')
      .eq('department_id', deptId)
      .order('code', { ascending: true });

    setDeptKeys(
      (data ?? []).map((k: Record<string, unknown>) => {
        const auths = k.authorisations as Array<{ profile_id: string }> | null;
        const filledCount = auths?.length ?? 0;
        return {
          id: k.id as string,
          code: k.code as string,
          room: k.room_name as string,
          zone:
            (k.zone as string) === 'NEW_SENATE' ? 'New Senate' : 'Old Senate',
          slots: Array(3)
            .fill(false)
            .map((_, i) => i < filledCount) as boolean[],
        };
      })
    );
    setLoadingKeys(false);
  };

  useEffect(() => {
    const init = async () => {
      const supabase = createBrowserClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'full_name, department_id, department:departments!department_id(name)'
        )
        .eq('id', user.id)
        .single();

      if (profile) {
        setFullName((profile.full_name as string | null) ?? '');
        const dept = profile.department as { name: string } | null;
        setDeptName(dept?.name ?? '');

        const deptId = profile.department_id as string | null;
        if (deptId) {
          fetchKeys(supabase, deptId);
        }
      }
    };

    init();
  }, []);

  const filteredKeys =
    activeFilter === 'Has vacant slot'
      ? deptKeys.filter((k) => k.slots.some((s) => !s))
      : deptKeys;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {getGreeting()}
          {fullName ? `, ${fullName}` : ''}.
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {deptName || 'Loading…'}
        </p>
      </div>

      <div className="grid flex-1 items-start gap-6 lg:grid-cols-3">
        {/* Left — weekend requests panel */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Weekend Requests
            </h2>
            {!loadingRequests && pendingRequests.length > 0 && (
              <span className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
                {pendingRequests.length}
              </span>
            )}
          </div>

          {loadingRequests ? (
            <div className="flex flex-col gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No pending requests right now.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingRequests.slice(0, 3).map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {(req.requester?.full_name ?? req.guest?.full_name ?? '?')
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {req.requester?.full_name ??
                          req.guest?.full_name ??
                          'External requester'}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {req.key?.code ?? 'No key assigned'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {formatDate(req.requested_for)}
                  </div>
                  <Link
                    href="/hod/weekend-requests"
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Review
                    <ChevronRightIcon className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
              ))}
            </div>
          )}

          <Link
            href="/hod/weekend-requests"
            className="text-center text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            View all requests
          </Link>
        </div>

        {/* Right — department key grid */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Department Keys
            </h2>
            <div
              className="flex items-center gap-1 border-b border-border"
              role="tablist"
              aria-label="Filter keys"
            >
              {filterTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    activeFilter === tab
                      ? '-mb-px border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {loadingKeys ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : filteredKeys.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {deptKeys.length === 0
                  ? 'No keys assigned to your department yet. Contact the CSO.'
                  : 'No keys match this filter.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredKeys.map((key) => {
                const filledCount = key.slots.filter(Boolean).length;
                const allVacant = filledCount === 0;
                return (
                  <Link
                    key={key.id}
                    href={`/hod/keys/${key.id}`}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_4px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${allVacant ? 'bg-amber-500/10' : 'bg-primary/10'}`}
                        >
                          <KeyRoundIcon
                            className={`size-4 ${allVacant ? 'text-amber-500' : 'text-primary'}`}
                            aria-hidden="true"
                          />
                        </div>
                        <code className="font-mono text-sm font-semibold text-foreground">
                          {key.code}
                        </code>
                      </div>
                      {allVacant && (
                        <AlertCircleIcon
                          className="size-4 shrink-0 text-amber-500"
                          aria-label="No collectors authorised"
                        />
                      )}
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {key.room}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {key.zone}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center gap-1"
                        aria-label={`${filledCount} of 3 collectors authorised`}
                      >
                        {key.slots.map((filled, i) => (
                          <div
                            key={i}
                            className={`size-2.5 rounded-full ${
                              filled
                                ? 'bg-primary'
                                : 'border-2 border-dashed border-border'
                            }`}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {filledCount}/3 authorised
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
