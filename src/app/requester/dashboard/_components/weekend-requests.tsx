'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClockIcon,
  CalendarOffIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useRealtime } from '@/hooks/use-realtime';
import { useConnectionStatus } from '@/hooks/use-connection-status';
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

import { WeekendAccessSheet } from '@/app/requester/dashboard/_components/weekend-access-sheet';

// Types

type WeekendStatus = 'PENDING_HOD' | 'APPROVED' | 'DECLINED';

type WeekendRequest = {
  id: string;
  status: WeekendStatus;
  requested_for: string;
  key: { code: string; room_name: string } | null;
};

// Constants

const STATUS_CONFIG: Record<
  WeekendStatus,
  { icon: LucideIcon; label: string; className: string; stripe: string }
> = {
  PENDING_HOD: {
    icon: ClockIcon,
    label: 'Awaiting approval',
    className: 'bg-amber-100 text-amber-700',
    stripe: 'bg-amber-400',
  },
  APPROVED: {
    icon: CheckCircleIcon,
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-700',
    stripe: 'bg-emerald-500',
  },
  DECLINED: {
    icon: XCircleIcon,
    label: 'Declined',
    className: 'bg-destructive/10 text-destructive',
    stripe: 'bg-destructive',
  },
};

// Helpers

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

const isToday = (isoDate: string) => isoDate === localDate(new Date());

const formatDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

// Component

export const WeekendRequests = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();
  const isOffline = connectionStatus === 'offline';

  const [userId, setUserId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<{
    id: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    createBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) setUserId(user.id);
      });
  }, []);

  const { data: requests = [], isLoading: loading } = useQuery({
    queryKey: ['weekend-requests', userId],
    enabled: !!userId,
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('requests')
        .select('id, status, requested_for, key:keys!key_id(code, room_name)')
        .eq('requester_id', userId!)
        .eq('type', 'WEEKEND')
        .in('status', ['PENDING_HOD', 'APPROVED', 'DECLINED'])
        .order('requested_for', { ascending: true });
      return (data as WeekendRequest[] | null) ?? [];
    },
  });

  useRealtime({
    table: 'requests',
    onInsert: (payload) => {
      const row = payload.new as { requester_id?: string };
      if (row.requester_id === userId) {
        queryClient.invalidateQueries({
          queryKey: ['weekend-requests', userId],
        });
      }
    },
    onUpdate: (payload) => {
      const row = payload.new as { requester_id?: string };
      if (row.requester_id === userId) {
        queryClient.invalidateQueries({
          queryKey: ['weekend-requests', userId],
        });
      }
    },
  });

  const handleGenerate = async (requestId: string) => {
    setGeneratingId(requestId);
    setErrorId(null);
    try {
      const res = await fetch('/api/requests/weekend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorId({
          id: requestId,
          message:
            (json as { error?: string }).error ??
            'Could not generate a code. Please try again.',
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['weekend-requests', userId] });
      queryClient.invalidateQueries({ queryKey: ['active-request', userId] });
      router.push(`/requester/request/${requestId}/code`);
    } catch {
      setErrorId({
        id: requestId,
        message: 'Network error. Check your connection and try again.',
      });
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Weekend requests">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Weekend requests
        </h2>
        <WeekendAccessSheet
          userId={userId}
          isOffline={isOffline}
          onSubmitted={() =>
            queryClient.invalidateQueries({
              queryKey: ['weekend-requests', userId],
            })
          }
        />
      </div>

      {/* Loading */}
      {loading && (
        <div
          className="flex flex-col gap-3"
          aria-busy="true"
          aria-label="Loading weekend requests"
        >
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-18 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && requests.length === 0 && (
        <Empty className="border border-border bg-card">
          <EmptyMedia variant="icon">
            <CalendarOffIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>No weekend requests</EmptyTitle>
            <EmptyDescription>
              Weekend access requests you submit will appear here.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      )}

      {/* Request cards */}
      {!loading && requests.length > 0 && (
        <div className="flex flex-col gap-3">
          {requests.map((req) => {
            const cfg = STATUS_CONFIG[req.status];
            const StatusIcon = cfg.icon;
            const collectToday =
              req.status === 'APPROVED' && isToday(req.requested_for);
            const approvedFuture =
              req.status === 'APPROVED' && !isToday(req.requested_for);

            return (
              <div
                key={req.id}
                className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div
                  className={`w-1 shrink-0 ${cfg.stripe}`}
                  aria-hidden="true"
                />
                <div className="flex flex-1 items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {req.key?.code ?? '—'}
                      </span>
                      <span
                        className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.className}`}
                      >
                        <StatusIcon className="size-3" aria-hidden="true" />
                        {cfg.label}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {req.key?.room_name ?? ''}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClockIcon
                        className="size-3"
                        aria-hidden="true"
                      />
                      {formatDate(req.requested_for)}
                    </p>
                    {errorId?.id === req.id && (
                      <p className="text-xs text-destructive" role="alert">
                        {errorId.message}
                      </p>
                    )}
                  </div>

                  {collectToday && (
                    <Button
                      size="sm"
                      onClick={() => handleGenerate(req.id)}
                      disabled={generatingId === req.id || isOffline}
                      aria-busy={generatingId === req.id}
                      className="shrink-0"
                    >
                      {generatingId === req.id ? 'Generating...' : 'Get code'}
                    </Button>
                  )}
                  {approvedFuture && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(req.requested_for)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
