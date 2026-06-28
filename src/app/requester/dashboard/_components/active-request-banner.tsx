'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { XCircleIcon } from 'lucide-react';

import { useRealtime } from '@/hooks/use-realtime';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { apiFetch } from '@/lib/api';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatCountdown, secondsRemaining } from '@/lib/dates';

// Types

type ActiveRequest = {
  id: string;
  status: 'CODE_ISSUED';
  code: string | null;
  code_expires_at: string | null;
  key: { code: string; room_name: string } | null;
};

// Component

export const ActiveRequestBanner = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();
  const isOffline = connectionStatus === 'offline';
  const [userId, setUserId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards the auto-expire call so it fires once per request, not every tick.
  const expiredFiredRef = useRef<string | null>(null);

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
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('requests')
        .select(
          'id, status, code, code_expires_at, key:keys!key_id(code, room_name)'
        )
        .eq('requester_id', userId!)
        .in('status', ['CODE_ISSUED'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as ActiveRequest | null) ?? null;
    },
  });

  const activeExpiry =
    request?.status === 'CODE_ISSUED' ? request.code_expires_at : null;

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

  // Countdown timer — tick drives re-renders; countdown is derived each render

  useEffect(() => {
    if (!activeExpiry) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeExpiry]);

  const countdown = activeExpiry ? secondsRemaining(activeExpiry) : 0;

  // Auto-expire: once a collection code lapses, close the request server-side
  // so the requester never has to manually cancel a dead code. The countdown
  // dependency re-evaluates this each tick; the timestamp gate avoids firing on
  // the initial countdown=0 before the timer has computed the real remaining
  // time. Best-effort — the verifier already rejects an expired code, and the
  // server only acts on a genuinely-expired request.
  useEffect(() => {
    if (
      request?.status === 'CODE_ISSUED' &&
      request.code_expires_at !== null &&
      secondsRemaining(request.code_expires_at) === 0 &&
      expiredFiredRef.current !== request.id
    ) {
      expiredFiredRef.current = request.id;
      void apiFetch('/api/requests/expire', {
        method: 'POST',
        body: { request_id: request.id },
      }).then((result) => {
        if (!result.error) {
          queryClient.invalidateQueries({
            queryKey: ['active-request', userId],
          });
        } else {
          expiredFiredRef.current = null;
        }
      });
    }
  }, [
    request?.id,
    request?.status,
    request?.code_expires_at,
    tick,
    queryClient,
    userId,
  ]);

  // Cancel

  const handleCancel = async () => {
    if (!request) return;
    setCancelling(true);
    await apiFetch('/api/requests/cancel', {
      method: 'POST',
      body: { request_id: request.id },
    });
    queryClient.invalidateQueries({ queryKey: ['active-request', userId] });
    setCancelling(false);
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

  return (
    <div
      className={`rounded-lg border p-5 ${
        isExpired
          ? 'border-muted bg-muted/40'
          : 'border-primary/20 bg-primary/5'
      }`}
      aria-live="polite"
      aria-label={
        isExpired ? 'Your collection code has expired' : 'Your collection code'
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
          This code has expired. Request a new one to continue.
        </p>
      ) : (
        <p
          className="mt-3 font-mono text-5xl font-semibold tracking-[0.3em] text-foreground"
          aria-label={`Collection code: ${request.code}`}
        >
          {request.code}
        </p>
      )}

      {!isExpired && (
        <div className="mt-4 flex items-center gap-2">
          <p className="flex-1 text-xs text-muted-foreground">
            Show this to the security officer at the desk.
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={cancelling || isOffline}
                  aria-busy={cancelling}
                  className={`shrink-0 gap-1.5${isOffline ? ' pointer-events-none' : ''}`}
                >
                  <XCircleIcon className="size-3.5" aria-hidden="true" />
                  {cancelling ? 'Cancelling...' : 'Cancel request'}
                </Button>
              </span>
            </TooltipTrigger>
            {isOffline && (
              <TooltipContent>
                Available again when you reconnect.
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      )}
    </div>
  );
};
