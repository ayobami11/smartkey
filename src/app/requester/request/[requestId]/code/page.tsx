'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircleIcon,
  ClipboardCopyIcon,
  ClockIcon,
  KeyRoundIcon,
  XCircleIcon,
} from 'lucide-react';

import { useRealtime } from '@/hooks/useRealtime';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

// Types

type RequestDetail = {
  id: string;
  status:
    | 'CODE_ISSUED'
    | 'KEY_ISSUED'
    | 'KEY_RETURNED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'DECLINED'
    | 'PENDING_HOD';
  code: string | null;
  code_expires_at: string | null;
  return_deadline: string | null;
  key: { code: string; room_name: string; zone: string } | null;
};

// Helpers

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

const statusMessage: Record<string, string> = {
  KEY_RETURNED: 'This key has already been returned. Thank you!',
  CANCELLED: 'This request was cancelled.',
  DECLINED: 'This request was declined by your HOD.',
  PENDING_HOD: 'This request is awaiting HOD approval.',
  EXPIRED: 'This request has expired.',
};

// Component

export default function CodeDisplayPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const queryClient = useQueryClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);
  const [copied, setCopied] = useState(false);

  // Resolve user ID once on mount

  useEffect(() => {
    createBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) setUserId(user.id);
      });
  }, []);

  // Fetch request via TanStack Query

  const { data: request = null, isLoading: loading } = useQuery({
    queryKey: ['request', requestId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('requests')
        .select(
          'id, status, code, code_expires_at, return_deadline, key:keys!key_id(code, room_name, zone)'
        )
        .eq('id', requestId)
        .eq('requester_id', userId!)
        .maybeSingle();
      return (data as RequestDetail | null) ?? null;
    },
  });

  const notFound = !loading && request === null && !!userId;

  // Real-time subscription — check request ID and requester ID client-side

  useRealtime({
    table: 'requests',
    onUpdate: (payload) => {
      const row = payload.new as { id?: string; requester_id?: string };
      if (row.id === requestId && row.requester_id === userId) {
        queryClient.invalidateQueries({
          queryKey: ['request', requestId, userId],
        });
      }
    },
  });

  // Countdown timer — re-renders every second; countdown derived from expiry

  useEffect(() => {
    if (!request?.code_expires_at) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [request?.code_expires_at]);

  const countdown = request?.code_expires_at
    ? secondsRemaining(request.code_expires_at)
    : 0;

  // Auto-expire: close the request server-side once the code lapses, so the
  // requester doesn't have to manually cancel a dead code. Fires once per
  // request; best-effort.
  const expiredFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      request?.status === 'CODE_ISSUED' &&
      request.code_expires_at !== null &&
      secondsRemaining(request.code_expires_at) === 0 &&
      expiredFiredRef.current !== request.id
    ) {
      expiredFiredRef.current = request.id;
      void fetch('/api/requests/expire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: request.id }),
      })
        .then(() => {
          queryClient.invalidateQueries({
            queryKey: ['request', requestId, userId],
          });
        })
        .catch(() => {
          expiredFiredRef.current = null;
        });
    }
  }, [
    request?.id,
    request?.status,
    request?.code_expires_at,
    countdown,
    queryClient,
    requestId,
    userId,
  ]);

  // Copy to clipboard

  const handleCopy = async () => {
    if (!request?.code) return;
    await navigator.clipboard.writeText(request.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <XCircleIcon
          className="size-12 text-muted-foreground"
          aria-hidden="true"
        />
        <div>
          <p className="font-medium text-foreground">Request not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been cancelled or does not belong to your account.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/requester/dashboard">Back to dashboard</a>
        </Button>
      </div>
    );
  }

  if (!request) return null;

  const isExpired =
    request.status === 'CODE_ISSUED' &&
    request.code_expires_at !== null &&
    countdown === 0;

  // KEY_ISSUED

  if (request.status === 'KEY_ISSUED') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <div className="w-full max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center justify-center gap-2">
            <KeyRoundIcon
              className="size-5 text-emerald-600"
              aria-hidden="true"
            />
            <p className="font-medium text-foreground">Key issued</p>
          </div>
          {request.key && (
            <p className="mt-1 text-sm text-muted-foreground">
              {request.key.code} · {request.key.room_name}
            </p>
          )}
          {request.return_deadline && (
            <p className="mt-3 text-sm text-muted-foreground">
              Return by{' '}
              <span className="font-medium text-foreground">
                {formatDeadline(request.return_deadline)}
              </span>
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/requester/dashboard">Back to dashboard</a>
        </Button>
      </div>
    );
  }

  // Non-active statuses

  if (request.status !== 'CODE_ISSUED') {
    const msg =
      statusMessage[request.status] ?? 'This request is no longer active.';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <XCircleIcon
          className="size-12 text-muted-foreground"
          aria-hidden="true"
        />
        <div>
          <p className="font-medium text-foreground">{msg}</p>
          {request.key && (
            <p className="mt-1 text-sm text-muted-foreground">
              {request.key.code} · {request.key.room_name}
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/requester/dashboard">Back to dashboard</a>
        </Button>
      </div>
    );
  }

  // CODE_ISSUED

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Key context */}
        {request.key && (
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {request.key.zone.replace('_', ' ')}
            </p>
            <p className="mt-0.5 font-medium text-foreground">
              {request.key.room_name}
            </p>
            <p className="font-mono text-sm text-muted-foreground">
              {request.key.code}
            </p>
          </div>
        )}

        {/* Code card */}
        <div
          className={`rounded-lg border p-6 text-center ${
            isExpired
              ? 'border-muted bg-muted/40'
              : 'border-primary/20 bg-primary/5'
          }`}
          aria-live="polite"
        >
          {isExpired ? (
            <>
              <p className="font-medium text-foreground">Code expired</p>
              <p className="mt-2 text-sm text-muted-foreground">
                This code has expired. Request a new one to continue.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground">
                Your collection code
              </p>

              {/* Countdown */}
              {request.code_expires_at && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <ClockIcon className="size-3.5" aria-hidden="true" />
                  <span
                    className="font-mono"
                    aria-label={`Expires in ${formatCountdown(countdown)}`}
                  >
                    {formatCountdown(countdown)}
                  </span>
                </div>
              )}

              {/* Code */}
              <p
                className="mt-4 font-mono text-6xl font-semibold tracking-[0.3em] text-foreground"
                aria-label={`Collection code: ${request.code}`}
              >
                {request.code}
              </p>

              <p className="mt-4 text-xs text-muted-foreground">
                Show this to the security officer at the desk.
              </p>

              {/* Copy button */}
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={handleCopy}
                aria-label="Copy code to clipboard"
              >
                <ClipboardCopyIcon className="size-3.5" aria-hidden="true" />
                {copied ? 'Copied!' : 'Copy code'}
              </Button>
            </>
          )}
        </div>

        {/* Confirmation icon */}
        {!isExpired && (
          <div className="flex items-center justify-center gap-2 text-emerald-600">
            <CheckCircleIcon className="size-4" aria-hidden="true" />
            <p className="text-sm font-medium">Request approved</p>
          </div>
        )}

        <Button asChild variant="ghost" size="sm" className="w-full">
          <a href="/requester/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </div>
  );
}
