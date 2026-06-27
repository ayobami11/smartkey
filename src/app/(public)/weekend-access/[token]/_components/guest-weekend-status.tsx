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

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// Types

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
};

type GuestWeekendStatusProps = {
  token: string;
};

// Helpers

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

const isToday = (isoDate: string) => isoDate === localDate(new Date());

const formatDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const formatDeadline = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const secondsRemaining = (isoExpiry: string) =>
  Math.max(0, Math.floor((new Date(isoExpiry).getTime() - Date.now()) / 1000));

const formatCountdown = (seconds: number) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// Component

export const GuestWeekendStatus = ({ token }: GuestWeekendStatusProps) => {
  const [data, setData] = useState<GuestStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, forceUpdate] = useState(0);

  const expiredFiredRef = useRef(false);

  // Fetch status

  const fetchStatus = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await fetch(`/api/public/weekend-request/${token}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFetchError(
          (json as { error?: string }).error ?? 'Could not load your request.'
        );
        return;
      }
      const payload = (json as { data?: GuestStatusData }).data;
      if (!payload) {
        setFetchError('Unexpected server response. Please try again.');
        return;
      }
      setData(payload);
    } catch {
      setFetchError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Refetch when the tab regains focus, so guests see Dean decisions promptly
  // without a realtime subscription.

  useEffect(() => {
    const handleFocus = () => void fetchStatus();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchStatus]);

  // Countdown ticker for an active code

  useEffect(() => {
    if (!data?.code_expires_at) return;
    expiredFiredRef.current = false;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [data?.code_expires_at]);

  const countdown = data?.code_expires_at
    ? secondsRemaining(data.code_expires_at)
    : 0;

  // Auto-expire once the code lapses (mirrors the registered flow)

  useEffect(() => {
    if (
      data?.status === 'CODE_ISSUED' &&
      data.code_expires_at !== null &&
      secondsRemaining(data.code_expires_at) === 0 &&
      !expiredFiredRef.current
    ) {
      expiredFiredRef.current = true;
      void fetch(`/api/public/weekend-request/${token}/expire`, {
        method: 'POST',
      })
        .then(() => fetchStatus())
        .catch(() => {
          expiredFiredRef.current = false;
        });
    }
  }, [data?.status, data?.code_expires_at, countdown, token, fetchStatus]);

  // Generate / mint a collection code

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/public/weekend-request/${token}/code`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenerateError(
          (json as { error?: string }).error ??
            'Could not generate a code. Please try again.'
        );
        return;
      }
      await fetchStatus();
    } catch {
      setGenerateError('Network error. Check your connection and try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!data?.code) return;
    await navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Loading

  if (loading) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }

  // Not found

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

  // PENDING_Dean

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

  // DECLINED

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

  // CANCELLED / EXPIRED / KEY_RETURNED — terminal

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

  // KEY_ISSUED

  if (data.status === 'KEY_ISSUED') {
    return (
      <Shell onRefresh={() => void fetchStatus()}>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
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
            <p className="mt-3 text-sm text-muted-foreground">
              Return by{' '}
              <span className="font-medium text-foreground">
                {formatDeadline(data.return_deadline)}
              </span>
            </p>
          )}
        </div>
      </Shell>
    );
  }

  // APPROVED

  if (data.status === 'APPROVED') {
    const collectToday = isToday(data.requested_for);
    return (
      <Shell onRefresh={() => void fetchStatus()}>
        <StatusCard
          tone="success"
          icon={CheckCircleIcon}
          title="Approved"
          body={
            collectToday
              ? 'Your request is approved. Generate your collection code now and present it at the security desk.'
              : `Your request is approved. Your collection code will be available on ${formatDate(
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

  // CODE_ISSUED

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
              This code has expired. Generate a new one to continue.
            </p>
            {generateError && (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {generateError}
              </p>
            )}
            <Button
              className="mt-4"
              onClick={handleGenerate}
              disabled={generating}
              aria-busy={generating}
            >
              {generating ? 'Generating...' : 'Generate a new code'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-muted-foreground">
              Your collection code
            </p>
            {data.code_expires_at && (
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
            <p
              className="mt-4 font-mono text-6xl font-semibold tracking-[0.3em] text-foreground"
              aria-label={`Collection code: ${data.code}`}
            >
              {data.code}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
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
          </>
        )}
      </div>
    </Shell>
  );
};

// Sub-components

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
      {formatDate(requestedFor)}
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
