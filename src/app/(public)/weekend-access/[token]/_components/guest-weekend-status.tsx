'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircleIcon,
  CalendarClockIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  KeyRoundIcon,
  MapPinIcon,
  RefreshCwIcon,
  XCircleIcon,
} from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CodeCountdown } from '@/app/requester/request/[requestId]/code/_components/code-countdown';
import {
  formatDateLong,
  formatDeadline,
  isTodayDate,
  secondsRemaining,
} from '@/lib/dates';

type GuestRequestStatus =
  | 'PENDING_HOD'
  | 'APPROVED'
  | 'CODE_ISSUED'
  | 'KEY_ISSUED'
  | 'KEY_RETURNED'
  | 'EXPIRED'
  | 'DECLINED'
  | 'CANCELLED';

type GuestStatusData = {
  full_name: string;
  status: GuestRequestStatus;
  requested_for: string;
  return_deadline: string | null;
  requested_room: string | null;
  key: { code: string; room_name: string } | null;
  code: string | null;
  code_expires_at: string | null;
  return_code: string | null;
  return_code_expires_at: string | null;
};

type GuestWeekendStatusProps = {
  token: string;
};

export const GuestWeekendStatus = ({ token }: GuestWeekendStatusProps) => {
  const [data, setData] = useState<GuestStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, forceUpdate] = useState(0);

  const [returnCode, setReturnCode] = useState<string | null>(null);
  const [returnCodeExpiresAt, setReturnCodeExpiresAt] = useState<string | null>(
    null
  );
  const [generatingReturn, setGeneratingReturn] = useState(false);
  const [generateReturnError, setGenerateReturnError] = useState<string | null>(
    null
  );

  const expiredFiredRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    const result = await apiFetch<GuestStatusData>(
      `/api/public/weekend-request/${token}`
    );
    setLoading(false);
    if (result.status === 404) {
      setNotFound(true);
      return;
    }
    if (result.error || !result.data) {
      setFetchError(result.error ?? 'Could not load your request.');
      return;
    }
    setData(result.data);
  }, [token]);

  useEffect(() => {
    void apiFetch<GuestStatusData>(`/api/public/weekend-request/${token}`).then(
      (result) => {
        setLoading(false);
        if (result.status === 404) {
          setNotFound(true);
          return;
        }
        if (result.error || !result.data) {
          setFetchError(result.error ?? 'Could not load your request.');
          return;
        }
        // Seed return-code state from server (handles page refreshes mid-return).
        if (
          result.data.status === 'KEY_ISSUED' &&
          result.data.return_code &&
          result.data.return_code_expires_at
        ) {
          setReturnCode(result.data.return_code);
          setReturnCodeExpiresAt(result.data.return_code_expires_at);
        }
        setData(result.data);
      }
    );
  }, [token]);

  // Refetch when the tab regains focus, so guests see Dean decisions promptly
  // without a realtime subscription.

  useEffect(() => {
    const handleFocus = () => {
      setFetchError(null);
      void fetchStatus();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchStatus]);

  useEffect(() => {
    if (!data?.code_expires_at) return;
    expiredFiredRef.current = false;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [data?.code_expires_at]);

  const countdown = data?.code_expires_at
    ? secondsRemaining(data.code_expires_at)
    : 0;

  // Auto-expire once the code lapses (mirrors the registered flow).
  // After the RPC, fetchStatus returns APPROVED and the APPROVED branch
  // renders the generate button — no separate "isExpiring" guard needed.

  useEffect(() => {
    if (
      data?.status === 'CODE_ISSUED' &&
      data.code_expires_at !== null &&
      secondsRemaining(data.code_expires_at) === 0 &&
      !expiredFiredRef.current
    ) {
      expiredFiredRef.current = true;
      void apiFetch(`/api/public/weekend-request/${token}/expire`, {
        method: 'POST',
      })
        .then(() => fetchStatus())
        .catch(() => {
          expiredFiredRef.current = false;
        });
    }
  }, [data?.status, data?.code_expires_at, countdown, token, fetchStatus]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    const result = await apiFetch(`/api/public/weekend-request/${token}/code`, {
      method: 'POST',
    });
    setGenerating(false);
    if (result.error) {
      setGenerateError(result.error);
      return;
    }
    await fetchStatus();
  };

  const handleCopy = async () => {
    if (!data?.code) return;
    await navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const returnCountdown = returnCodeExpiresAt
    ? secondsRemaining(returnCodeExpiresAt)
    : 0;
  const returnCodeExpired =
    returnCodeExpiresAt !== null && returnCountdown === 0;

  const handleGenerateReturnCode = async () => {
    setGeneratingReturn(true);
    setGenerateReturnError(null);
    const result = await apiFetch<{
      return_code: string;
      return_code_expires_at: string;
    }>(`/api/public/weekend-request/${token}/return-code`, { method: 'POST' });
    setGeneratingReturn(false);
    if (result.error || !result.data) {
      setGenerateReturnError(
        result.error ?? 'Could not generate a return code. Try again.'
      );
      return;
    }
    setReturnCode(result.data.return_code);
    setReturnCodeExpiresAt(result.data.return_code_expires_at);
  };

  if (loading) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }

  if (notFound) {
    return (
      <StatusCard
        tone="neutral"
        icon={XCircleIcon}
        title="Request not found"
        body="This link is invalid or has expired. Check the link in your email, or submit a new request."
        action={{ href: '/weekend-access', label: 'New request' }}
      />
    );
  }

  // Fetch error (page-level)
  if (fetchError || !data) {
    return (
      <div
        className="w-full max-w-sm rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
        role="alert"
      >
        <AlertCircleIcon
          className="mx-auto size-8 text-destructive"
          aria-hidden="true"
        />
        <p className="mt-3 font-medium text-foreground">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {fetchError ?? 'Could not load your request.'}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void fetchStatus()}
        >
          <RefreshCwIcon className="size-3.5" aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  const firstName = data.full_name.split(' ')[0];

  if (data.status === 'PENDING_HOD') {
    return (
      <Shell onRefresh={() => void fetchStatus()}>
        <StatusCard
          tone="warning"
          icon={ClockIcon}
          title="Awaiting approval"
          body={`Thanks, ${firstName}. Your request and letter are being reviewed. You'll be notified by email when a decision is made.`}
        />
        <RequestMeta
          requestedFor={data.requested_for}
          requestedRoom={data.requested_room}
        />
      </Shell>
    );
  }

  if (data.status === 'DECLINED') {
    return (
      <Shell onRefresh={() => void fetchStatus()}>
        <StatusCard
          tone="error"
          icon={XCircleIcon}
          title="Request declined"
          body="Your request was not approved. Contact the department directly if you believe this is an error."
        />
      </Shell>
    );
  }

  if (
    data.status === 'CANCELLED' ||
    data.status === 'EXPIRED' ||
    data.status === 'KEY_RETURNED'
  ) {
    const terminalCopy: Record<string, { title: string; body: string }> = {
      CANCELLED: {
        title: 'Request cancelled',
        body: 'This request is no longer active.',
      },
      EXPIRED: {
        title: 'Request expired',
        body: 'The collection code expired before the key was issued. Submit a new request if you still need access.',
      },
      KEY_RETURNED: {
        title: 'Key returned',
        body: 'This key has been returned. Thank you.',
      },
    };
    const copy = terminalCopy[data.status];
    return (
      <Shell onRefresh={() => void fetchStatus()}>
        <StatusCard
          tone="neutral"
          icon={data.status === 'KEY_RETURNED' ? CheckCircleIcon : XCircleIcon}
          title={copy.title}
          body={copy.body}
          action={
            data.status === 'EXPIRED'
              ? { href: '/weekend-access', label: 'New request' }
              : undefined
          }
        />
      </Shell>
    );
  }

  if (data.status === 'KEY_ISSUED') {
    const hasActiveReturnCode =
      returnCode !== null && returnCodeExpiresAt !== null && !returnCodeExpired;

    return (
      <Shell onRefresh={() => void fetchStatus()}>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center justify-center gap-2">
            <KeyRoundIcon
              className="size-5 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
            <p className="font-medium text-foreground">Key issued</p>
          </div>
          {data.key && (
            <p className="mt-1 text-sm text-muted-foreground">
              {data.key.code} · {data.key.room_name}
            </p>
          )}
          {data.return_deadline && (
            <p className="mt-2 text-sm text-muted-foreground">
              Return by{' '}
              <span className="font-medium text-foreground">
                {formatDeadline(data.return_deadline)}
              </span>
            </p>
          )}
        </div>

        {hasActiveReturnCode && returnCode && returnCodeExpiresAt ? (
          <Card className="border-primary/20 bg-primary/5" aria-live="polite">
            <div>
              <CardHeader className="pb-0 text-center">
                <CardDescription className="text-base">
                  Your return code
                </CardDescription>
              </CardHeader>
              <CodeCountdown
                countdown={returnCountdown}
                codeExpiresAt={returnCodeExpiresAt}
              />
            </div>
            <CardContent className="pb-6 pt-6 text-center">
              <p
                className="font-mono text-6xl font-semibold tracking-[0.3em] text-foreground"
                aria-label={`Return code: ${returnCode}`}
              >
                {returnCode}
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Read this to the security officer when you hand back the key.
              </p>
            </CardContent>
          </Card>
        ) : returnCodeExpired ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Your return code expired. Generate a new one.
            </p>
            {generateReturnError && (
              <p className="text-xs text-destructive" role="alert">
                {generateReturnError}
              </p>
            )}
            <Button
              onClick={() => void handleGenerateReturnCode()}
              disabled={generatingReturn}
              aria-busy={generatingReturn}
              className="w-full"
            >
              {generatingReturn ? 'Generating...' : 'Generate new return code'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              When you&rsquo;re ready to hand back the key, generate a 6-digit
              code and read it to the security officer.
            </p>
            {generateReturnError && (
              <p className="text-xs text-destructive" role="alert">
                {generateReturnError}
              </p>
            )}
            <Button
              onClick={() => void handleGenerateReturnCode()}
              disabled={generatingReturn}
              aria-busy={generatingReturn}
              className="w-full"
            >
              {generatingReturn ? 'Generating...' : 'Generate return code'}
            </Button>
          </div>
        )}
      </Shell>
    );
  }

  if (data.status === 'APPROVED') {
    const collectToday = isTodayDate(data.requested_for);
    return (
      <Shell onRefresh={() => void fetchStatus()}>
        <StatusCard
          tone="success"
          icon={CheckCircleIcon}
          title="Approved"
          body={
            collectToday
              ? 'Your request is approved. Generate your collection code now and present it at the security desk.'
              : `Your request is approved. Your collection code will be available on ${formatDateLong(
                  data.requested_for
                )}.`
          }
        />
        {data.key && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <span className="font-mono font-medium text-foreground">
              {data.key.code}
            </span>
            <span className="text-muted-foreground">
              {' '}
              · {data.key.room_name}
            </span>
          </div>
        )}
        {collectToday ? (
          <div className="flex flex-col gap-2">
            {generateError && (
              <p className="text-xs text-destructive" role="alert">
                {generateError}
              </p>
            )}
            <Button
              onClick={handleGenerate}
              disabled={generating}
              aria-busy={generating}
              className="w-full"
            >
              {generating ? 'Generating...' : 'Generate collection code'}
            </Button>
          </div>
        ) : (
          <RequestMeta
            requestedFor={data.requested_for}
            requestedRoom={data.requested_room}
          />
        )}
      </Shell>
    );
  }

  const isExpired = data.code_expires_at !== null && countdown === 0;

  return (
    <Shell onRefresh={() => void fetchStatus()}>
      {data.key && (
        <div className="text-center">
          <p className="font-medium text-foreground">{data.key.room_name}</p>
          <p className="font-mono text-sm text-muted-foreground">
            {data.key.code}
          </p>
        </div>
      )}

      {isExpired ? (
        <div
          className="rounded-lg border border-muted bg-muted/40 p-6 text-center"
          aria-live="polite"
        >
          <p className="font-medium text-foreground">Code expired</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Updating your session&hellip;
          </p>
        </div>
      ) : (
        <Card className="border-primary/20 bg-primary/5" aria-live="polite">
          <div>
            <CardHeader className="pb-0 text-center">
              <CardDescription className="text-base">
                Your collection code
              </CardDescription>
            </CardHeader>
            <CodeCountdown
              countdown={countdown}
              codeExpiresAt={data.code_expires_at}
            />
          </div>
          <CardContent className="pb-6 pt-6 text-center">
            <p
              className="font-mono text-6xl font-semibold tracking-[0.3em] text-foreground"
              aria-label={`Collection code: ${data.code}`}
            >
              {data.code}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Show this to the security officer at the desk.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={handleCopy}
              aria-label="Copy code to clipboard"
            >
              {copied ? (
                <CheckIcon className="size-3.5" aria-hidden="true" />
              ) : (
                <CopyIcon className="size-3.5" aria-hidden="true" />
              )}
              {copied ? 'Copied!' : 'Copy code'}
            </Button>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
};

type StatusTone = 'success' | 'warning' | 'error' | 'neutral';

const TONE_CLASSES: Record<
  StatusTone,
  { wrap: string; iconWrap: string; icon: string }
> = {
  success: {
    wrap: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
    iconWrap: 'bg-emerald-100 dark:bg-emerald-900/50',
    icon: 'text-emerald-700 dark:text-emerald-400',
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
    iconWrap: 'bg-amber-100 dark:bg-amber-900/50',
    icon: 'text-amber-700 dark:text-amber-400',
  },
  error: {
    wrap: 'border-destructive/30 bg-destructive/5',
    iconWrap: 'bg-destructive/10',
    icon: 'text-destructive',
  },
  neutral: {
    wrap: 'border-border bg-card',
    iconWrap: 'bg-muted',
    icon: 'text-muted-foreground',
  },
};

type StatusCardProps = {
  tone: StatusTone;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  body: string;
  action?: { href: string; label: string };
};

const StatusCard = ({
  tone,
  icon: Icon,
  title,
  body,
  action,
}: StatusCardProps) => {
  const t = TONE_CLASSES[tone];
  return (
    <div className={`rounded-lg border p-6 text-center ${t.wrap}`}>
      <div
        className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${t.iconWrap}`}
      >
        <Icon className={`size-6 ${t.icon}`} aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      {action && (
        <Button asChild variant="outline" size="sm" className="mt-4">
          <a href={action.href}>{action.label}</a>
        </Button>
      )}
    </div>
  );
};

const RequestMeta = ({
  requestedFor,
  requestedRoom,
}: {
  requestedFor: string;
  requestedRoom?: string | null;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
    <p className="flex items-center gap-1.5">
      <CalendarClockIcon className="size-4" aria-hidden="true" />
      {formatDateLong(requestedFor)}
    </p>
    {requestedRoom && (
      <p className="flex items-center gap-1.5 text-xs">
        <MapPinIcon className="size-3.5" aria-hidden="true" />
        Requested room:{' '}
        <span className="font-semibold text-foreground">{requestedRoom}</span>
      </p>
    )}
  </div>
);

const Shell = ({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh: () => void;
}) => (
  <div className="w-full max-w-sm space-y-5 text-center">
    {children}
    <Button size="sm" onClick={onRefresh} aria-label="Refresh request status">
      <RefreshCwIcon className="size-3.5" aria-hidden="true" />
      Refresh status
    </Button>
  </div>
);
