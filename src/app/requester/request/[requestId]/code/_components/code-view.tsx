'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, KeyRoundIcon, XCircleIcon } from 'lucide-react';

import { useRealtime } from '@/hooks/use-realtime';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { CodeCountdown } from '@/app/requester/request/[requestId]/code/_components/code-countdown';
import { CodeSkeleton } from '@/app/requester/request/[requestId]/code/_components/code-skeleton';
import { createBrowserClient } from '@/lib/supabase/client';

type RequestDetail = {
  id: string;
  status:
    | 'CODE_ISSUED'
    | 'KEY_ISSUED'
    | 'KEY_RETURNED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'DECLINED'
    | 'PENDING_HOD'
    | 'APPROVED';
  code: string | null;
  code_expires_at: string | null;
  return_deadline: string | null;
  key: { code: string; room_name: string; zone: string } | null;
};

const secondsRemaining = (isoExpiry: string) =>
  Math.max(0, Math.floor((new Date(isoExpiry).getTime() - Date.now()) / 1000));

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
  DECLINED: 'This request was declined by your Dean.',
  PENDING_HOD: 'This request is awaiting approval.',
  EXPIRED: 'This request has expired.',
};

export const CodeView = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();

  const [userId, setUserId] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    createBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) setUserId(user.id);
      });
  }, []);

  const { data: request = null, isLoading: loading } = useQuery({
    queryKey: ['request', requestId, userId],
    enabled: !!userId,
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
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

  // Generate a fresh weekend code (only reachable when status = APPROVED,
  // i.e. after a weekend code rolled back from expired).
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch('/api/requests/weekend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setGenerateError(json.error ?? 'Could not generate a new code.');
        return;
      }
      queryClient.invalidateQueries({
        queryKey: ['request', requestId, userId],
      });
    } catch {
      setGenerateError('Could not generate a new code. Try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return <CodeSkeleton />;
  }

  if (notFound) {
    return (
      <div className="flex flex-1 overflow-y-auto items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <XCircleIcon
              className="size-10 text-muted-foreground"
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
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!request) return null;

  const isExpired =
    request.status === 'CODE_ISSUED' &&
    request.code_expires_at !== null &&
    countdown === 0;

  if (request.status === 'KEY_ISSUED') {
    return (
      <div className="flex flex-1 overflow-y-auto flex-col items-center justify-center gap-4 p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <KeyRoundIcon
              className="size-10 text-emerald-500"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium text-foreground">Key issued</p>
              {request.key && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {request.key.code} · {request.key.room_name}
                </p>
              )}
              {request.return_deadline && (
                <p className="mt-2 text-sm text-muted-foreground">
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
          </CardContent>
        </Card>
      </div>
    );
  }

  if (request.status === 'APPROVED') {
    return (
      <div className="flex flex-1 overflow-y-auto flex-col items-center justify-center gap-4 p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            {request.key && (
              <p className="text-sm text-muted-foreground">
                {request.key.code} · {request.key.room_name}
              </p>
            )}
            <div>
              <p className="font-medium text-foreground">Code expired</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your 10-minute code has expired. Generate a new one when you are
                ready to collect.
              </p>
            </div>
            {generateError && (
              <p className="text-xs text-destructive" role="alert">
                {generateError}
              </p>
            )}
            <Button
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
              aria-busy={isGenerating}
              className="w-full"
            >
              {isGenerating ? 'Generating...' : 'Generate new code'}
            </Button>
            <Button asChild variant="ghost" size="sm" className="w-full">
              <a href="/requester/dashboard">Back to dashboard</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (request.status !== 'CODE_ISSUED' || isExpired) {
    const statusKey = isExpired ? 'EXPIRED' : request.status;
    const msg = statusMessage[statusKey] ?? 'This request is no longer active.';
    return (
      <div className="flex flex-1 overflow-y-auto flex-col items-center justify-center gap-4 p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <XCircleIcon
              className="size-10 text-muted-foreground"
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
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-y-auto flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        {request.key && (
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {request.key.zone.replace(/_/g, ' ')}
            </p>
            <p className="mt-0.5 font-medium text-foreground">
              {request.key.room_name}
            </p>
            <p className="font-mono text-sm text-muted-foreground">
              {request.key.code}
            </p>
          </div>
        )}

        <Card className="border-primary/20 bg-primary/5" aria-live="polite">
          <div>
            <CardHeader className="pb-0 text-center">
              <CardDescription className="text-base">
                Your collection code
              </CardDescription>
            </CardHeader>
            <CodeCountdown
              countdown={countdown}
              codeExpiresAt={request.code_expires_at}
            />
          </div>

          <CardContent className="pb-6 pt-6 text-center">
            <p
              className="font-mono text-6xl font-semibold tracking-[0.3em] text-foreground"
              aria-label={`Collection code: ${request.code}`}
            >
              {request.code}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Show this code to the security officer at the desk.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Badge className="gap-1.5 border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
            <CheckCircleIcon className="size-3.5" aria-hidden="true" />
            Request approved
          </Badge>
        </div>

        <Button asChild variant="ghost" size="sm" className="w-full">
          <a href="/requester/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </div>
  );
};
