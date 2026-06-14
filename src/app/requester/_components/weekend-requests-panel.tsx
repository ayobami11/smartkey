'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClockIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useRealtime } from '@/hooks/useRealtime';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

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
  { icon: LucideIcon; label: string; className: string }
> = {
  PENDING_HOD: {
    icon: ClockIcon,
    label: 'Awaiting HOD approval',
    className: 'bg-amber-100 text-amber-700',
  },
  APPROVED: {
    icon: CheckCircleIcon,
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-700',
  },
  DECLINED: {
    icon: XCircleIcon,
    label: 'Declined',
    className: 'bg-destructive/10 text-destructive',
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

export const WeekendRequestsPanel = () => {
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

  if (loading) {
    return <Skeleton className="h-24 rounded-lg" />;
  }

  // Hide the panel entirely when there's nothing to show.
  if (requests.length === 0) return null;

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
      aria-label="Weekend requests"
    >
      <h2 className="text-sm font-semibold text-foreground">
        Weekend requests
      </h2>

      <ul className="flex flex-col divide-y divide-border">
        {requests.map((req) => {
          const cfg = STATUS_CONFIG[req.status];
          const StatusIcon = cfg.icon;
          const collectToday =
            req.status === 'APPROVED' && isToday(req.requested_for);
          const approvedFuture =
            req.status === 'APPROVED' && !isToday(req.requested_for);

          return (
            <li
              key={req.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {req.key ? `${req.key.code} · ${req.key.room_name}` : 'Key'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.className}`}
                  >
                    <StatusIcon className="size-3" aria-hidden="true" />
                    {cfg.label}
                  </span>
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClockIcon className="size-3" aria-hidden="true" />
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
                  {generatingId === req.id
                    ? 'Generating…'
                    : 'Get collection code'}
                </Button>
              )}
              {approvedFuture && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Collect on {formatDate(req.requested_for)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
