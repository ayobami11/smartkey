'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, XCircleIcon } from 'lucide-react';

import { useRealtime } from '@/hooks/useRealtime';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

// Types

type ActiveRequest = {
  id: string;
  status: 'CODE_ISSUED' | 'KEY_ISSUED';
  code: string | null;
  code_expires_at: string | null;
  return_deadline: string | null;
  key: { code: string; room_name: string } | null;
};

// Helpers

const formatDeadline = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? `today at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const secondsRemaining = (isoExpiry: string) =>
  Math.max(0, Math.floor((new Date(isoExpiry).getTime() - Date.now()) / 1000));

const formatCountdown = (seconds: number) => {
  if (seconds >= 86400) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    return `${d}d ${h}h`;
  }
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// Component

export const ActiveRequestBanner = () => {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resolve user ID once on mount

  useEffect(() => {
    createBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) setUserId(user.id);
      });
  }, []);

  // Fetch active request via TanStack Query

  const { data: request = null, isLoading: loading } = useQuery({
    queryKey: ['active-request', userId],
    enabled: !!userId,
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('requests')
        .select(
          'id, status, code, code_expires_at, return_deadline, key:keys!key_id(code, room_name)'
        )
        .eq('requester_id', userId!)
        .in('status', ['CODE_ISSUED', 'KEY_ISSUED'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as ActiveRequest | null) ?? null;
    },
  });

  // Real-time subscription — no server-side filter; check requester_id client-side

  useRealtime({
    table: 'requests',
    onInsert: (payload) => {
      // Weekday requests start as CODE_ISSUED — an INSERT, not an UPDATE
      const row = payload.new as { requester_id?: string };
      if (row.requester_id === userId) {
        queryClient.invalidateQueries({ queryKey: ['active-request', userId] });
      }
    },
    onUpdate: (payload) => {
      const row = payload.new as { requester_id?: string };
      if (row.requester_id === userId) {
        queryClient.invalidateQueries({ queryKey: ['active-request', userId] });
      }
    },
  });

  // Countdown timer

  useEffect(() => {
    if (!request?.code_expires_at) return;
    setCountdown(secondsRemaining(request.code_expires_at));
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [request?.code_expires_at]);

  // Cancel

  const handleCancel = async () => {
    if (!request) return;
    setCancelling(true);
    try {
      await fetch('/api/requests/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: request.id }),
      });
      queryClient.invalidateQueries({ queryKey: ['active-request', userId] });
    } catch {
      // fail silently — user can retry
    } finally {
      setCancelling(false);
    }
  };

  // Render

  if (loading) {
    return <Skeleton className="h-24 rounded-lg" />;
  }

  if (!request) return null;

  const isExpired =
    request.status === 'CODE_ISSUED' &&
    request.code_expires_at !== null &&
    countdown === 0;

  // CODE_ISSUED — show the collection code
  if (request.status === 'CODE_ISSUED') {
    return (
      <div
        className={`rounded-lg border p-5 ${
          isExpired
            ? 'border-muted bg-muted/40'
            : 'border-primary/20 bg-primary/5'
        }`}
        aria-live="polite"
        aria-label={
          isExpired
            ? 'Your collection code has expired'
            : 'Your collection code'
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              {isExpired ? 'Code expired' : 'Your collection code'}
            </p>
            {request.key && (
              <p className="text-xs text-muted-foreground">
                {request.key.code} · {request.key.room_name}
              </p>
            )}
          </div>
          {!isExpired && request.code_expires_at && (
            <span
              className="shrink-0 font-mono text-xs text-muted-foreground"
              aria-label={`Expires in ${formatCountdown(countdown)}`}
            >
              {formatCountdown(countdown)}
            </span>
          )}
        </div>

        {isExpired ? (
          <p className="mt-2 text-sm text-muted-foreground">
            This code has expired. Cancel this request and submit a new one to
            continue.
          </p>
        ) : (
          <p
            className="mt-3 font-mono text-5xl font-semibold tracking-[0.3em] text-foreground"
            aria-label={`Collection code: ${request.code}`}
          >
            {request.code}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {!isExpired && (
            <p className="flex-1 text-xs text-muted-foreground">
              Show this to the security officer at the desk.
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={cancelling}
            aria-busy={cancelling}
            className="shrink-0 gap-1.5"
          >
            <XCircleIcon className="size-3.5" aria-hidden="true" />
            {cancelling ? 'Cancelling…' : 'Cancel request'}
          </Button>
        </div>
      </div>
    );
  }

  // KEY_ISSUED — show return deadline
  return (
    <div
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30"
      aria-label="Key issued"
    >
      <div className="flex items-center gap-2">
        <KeyRoundIcon
          className="size-4 shrink-0 text-emerald-600"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-foreground">
          Key issued
          {request.key
            ? ` — ${request.key.code} (${request.key.room_name})`
            : ''}
        </p>
      </div>
      {request.return_deadline && (
        <p className="mt-1 text-xs text-muted-foreground">
          Return by{' '}
          <span className="font-medium text-foreground">
            {formatDeadline(request.return_deadline)}
          </span>
        </p>
      )}
    </div>
  );
};
