'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { InboxIcon, KeyRoundIcon } from 'lucide-react';

import { useRealtime } from '@/hooks/useRealtime';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';

// Types

type OutstandingKey = {
  id: string;
  key: { code: string; room_name: string; zone: string } | null;
  requester: { id: string; full_name: string; photo_url: string | null } | null;
  issued_at: string;
  return_deadline: string;
  status: 'KEY_ISSUED' | 'KEY_OVERDUE';
};

type ReturnStep = 'confirm' | 'returning' | 'success';
type ReturnMode = 'code' | 'override';

// Helpers

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDeadline = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? `Today ${formatTime(iso)}`
    : date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const relativeTime = (iso: string) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff === 1) return '1 min ago';
  if (diff < 60) return `${diff} min ago`;
  const hours = Math.floor(diff / 60);
  return hours === 1 ? '1 hr ago' : `${hours} hrs ago`;
};

// Component

export const OutstandingKeys = () => {
  const status = useConnectionStatus();
  const isOffline = status === 'offline';
  const queryClient = useQueryClient();

  // Return Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<OutstandingKey | null>(null);
  const [returnStep, setReturnStep] = useState<ReturnStep>('confirm');
  const [returnMode, setReturnMode] = useState<ReturnMode>('code');
  const [code, setCode] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [verified, setVerified] = useState(true);
  const [returnError, setReturnError] = useState<string | null>(null);

  // Fetch outstanding keys via TanStack Query

  const {
    data: keys = [],
    isLoading: loading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['keys', 'outstanding'],
    queryFn: async () => {
      const res = await fetch('/api/keys/out');
      const json = await res.json();
      if (!res.ok)
        throw new Error(
          (json as { error?: string }).error ??
            'Failed to load outstanding keys.'
        );
      return (
        (json as { data?: { outstanding?: OutstandingKey[] } }).data
          ?.outstanding ?? []
      );
    },
  });

  // Live updates — requests drive issued/returned transitions; keys drive overdue

  useRealtime({
    table: 'requests',
    onInsert: (payload) => {
      const row = payload.new as { status?: string };
      if (row.status === 'KEY_ISSUED')
        queryClient.invalidateQueries({ queryKey: ['keys', 'outstanding'] });
    },
    onUpdate: (payload) => {
      const row = payload.new as { status?: string };
      if (
        ['KEY_ISSUED', 'KEY_OVERDUE', 'KEY_RETURNED'].includes(row.status ?? '')
      )
        queryClient.invalidateQueries({ queryKey: ['keys', 'outstanding'] });
    },
  });

  useRealtime({
    table: 'keys',
    onUpdate: (payload) => {
      const row = payload.new as { status?: string };
      if (row.status === 'OVERDUE' || row.status === 'AVAILABLE')
        queryClient.invalidateQueries({ queryKey: ['keys', 'outstanding'] });
    },
  });

  // Sheet helpers

  const openReturnSheet = (key: OutstandingKey) => {
    setSelectedKey(key);
    setReturnStep('confirm');
    setReturnMode('code');
    setCode('');
    setOverrideReason('');
    setVerified(true);
    setReturnError(null);
    setSheetOpen(true);
  };

  const handleSheetClose = () => {
    setSheetOpen(false);
    setSelectedKey(null);
    setReturnStep('confirm');
    setReturnMode('code');
    setCode('');
    setOverrideReason('');
    setReturnError(null);
  };

  const switchMode = (mode: ReturnMode) => {
    setReturnMode(mode);
    setReturnError(null);
  };

  const handleMarkReturned = async () => {
    if (!selectedKey) return;
    if (returnMode === 'code' && code.length !== 6) {
      setReturnError('Enter the 6-digit return code.');
      return;
    }
    if (returnMode === 'override' && overrideReason.trim().length < 3) {
      setReturnError('Give a brief reason.');
      return;
    }
    setReturnStep('returning');
    setReturnError(null);
    try {
      const res = await fetch('/api/keys/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: selectedKey.id,
          ...(returnMode === 'code'
            ? { code }
            : { override_reason: overrideReason.trim() }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReturnError(
          (json as { error?: string }).error ??
            'Failed to mark key as returned. Please try again.'
        );
        setReturnStep('confirm');
        return;
      }
      setVerified(
        Boolean((json as { data?: { verified?: boolean } }).data?.verified)
      );
      queryClient.invalidateQueries({ queryKey: ['keys', 'outstanding'] });
      setReturnStep('success');
    } catch {
      setReturnError('Network error. Check your connection and try again.');
      setReturnStep('confirm');
    }
  };

  const confirmDisabled =
    isOffline ||
    returnStep === 'returning' ||
    (returnMode === 'code'
      ? code.length !== 6
      : overrideReason.trim().length < 3);

  // Render

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">
        Outstanding keys
      </h2>

      {/* Loading */}
      {loading && (
        <div
          className="flex flex-col gap-3"
          aria-busy="true"
          aria-label="Loading outstanding keys"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && fetchError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          <p className="font-medium">Failed to load outstanding keys</p>
          <p className="mt-1 text-destructive/80">{fetchError.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !fetchError && keys.length === 0 && (
        <Empty className="border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No keys are currently issued</EmptyTitle>
            <EmptyDescription>
              Keys that have been issued will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Key rows */}
      {!loading && !fetchError && keys.length > 0 && (
        <div className="flex flex-col gap-3">
          {keys.map((item) => {
            const isOverdue = item.status === 'KEY_OVERDUE';
            const stripe = isOverdue ? 'bg-destructive' : 'bg-emerald-500';
            return (
              <div
                key={item.id}
                className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div className={`w-1 shrink-0 ${stripe}`} aria-hidden="true" />
                <div className="flex flex-1 items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {item.key?.code}
                      </span>
                      {isOverdue && (
                        <span
                          className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                          aria-label="Key is overdue"
                        >
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.key?.room_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.requester?.full_name ?? '—'} · issued{' '}
                      {relativeTime(item.issued_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Return by{' '}
                      <span
                        className={
                          isOverdue
                            ? 'font-medium text-destructive'
                            : 'font-medium'
                        }
                      >
                        {formatDeadline(item.return_deadline)}
                      </span>
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          className={`shrink-0${isOffline ? ' pointer-events-none' : ''}`}
                          onClick={() => openReturnSheet(item)}
                          disabled={isOffline}
                          aria-label={`Mark ${item.key?.code ?? 'key'} as returned`}
                        >
                          Return
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
              </div>
            );
          })}
        </div>
      )}

      {/* Return Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) handleSheetClose();
        }}
      >
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle>Mark key as returned</SheetTitle>
            <SheetDescription>
              Confirm the return with the code the requester generated.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
            {selectedKey && returnStep !== 'success' && (
              <>
                {/* Key details */}
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <KeyRoundIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    Key details
                  </div>
                  <p className="mt-2 font-mono text-sm font-medium text-foreground">
                    {selectedKey.key?.code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedKey.key?.room_name}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Issued to{' '}
                    <span className="font-medium text-foreground">
                      {selectedKey.requester?.full_name ?? '—'}
                    </span>{' '}
                    at {formatTime(selectedKey.issued_at)}
                  </p>
                  {selectedKey.status === 'KEY_OVERDUE' && (
                    <p className="mt-1 text-xs font-medium text-destructive">
                      This key is overdue (deadline:{' '}
                      {formatDeadline(selectedKey.return_deadline)})
                    </p>
                  )}
                </div>

                {/* Verification — code entry (default) or flagged override */}
                {returnMode === 'code' ? (
                  <div className="flex flex-col gap-3">
                    <Label htmlFor="return-code-input">Return code</Label>
                    <p className="text-xs text-muted-foreground">
                      Ask {selectedKey.requester?.full_name ?? 'the requester'}{' '}
                      for the 6-digit return code shown on their dashboard.
                    </p>
                    <InputOTP
                      id="return-code-input"
                      maxLength={6}
                      pattern={REGEXP_ONLY_DIGITS}
                      value={code}
                      onChange={setCode}
                      disabled={returnStep === 'returning'}
                      autoComplete="one-time-code"
                      aria-label="Return code"
                    >
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot
                            key={i}
                            index={i}
                            className="size-12 font-mono text-base"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                    <button
                      type="button"
                      onClick={() => switchMode('override')}
                      className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Requester can&rsquo;t provide a code?
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Label htmlFor="override-reason">
                      Reason for returning without a code
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      This is recorded as an unverified return and raised to the
                      CSO for review.
                    </p>
                    <Textarea
                      id="override-reason"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="e.g. Requester lost their phone; a colleague returned the key."
                      disabled={returnStep === 'returning'}
                      rows={3}
                    />
                    <button
                      type="button"
                      onClick={() => switchMode('code')}
                      className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Enter a code instead
                    </button>
                  </div>
                )}

                {returnError && (
                  <p className="text-xs text-destructive" role="alert">
                    {returnError}
                  </p>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full">
                      <Button
                        className="w-full"
                        onClick={handleMarkReturned}
                        disabled={confirmDisabled}
                        aria-busy={returnStep === 'returning'}
                        style={
                          isOffline ? { pointerEvents: 'none' } : undefined
                        }
                      >
                        {returnStep === 'returning'
                          ? 'Marking returned…'
                          : returnMode === 'code'
                            ? 'Confirm return'
                            : 'Return without code'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {isOffline && (
                    <TooltipContent>
                      Available again when you reconnect.
                    </TooltipContent>
                  )}
                </Tooltip>
              </>
            )}

            {/* Success */}
            {returnStep === 'success' && selectedKey && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                  <KeyRoundIcon
                    className="size-5 text-emerald-600"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Returned successfully
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {`Key ${selectedKey.key?.code ?? '—'} returned by ${selectedKey.requester?.full_name ?? '—'} at ${formatTime(new Date().toISOString())}.`}
                  </p>
                </div>

                {/* Persistent confirmation card */}
                <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-left dark:border-emerald-900 dark:bg-emerald-950/30">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Returned
                  </p>
                  <p className="mt-1.5 font-mono text-sm font-medium text-foreground">
                    {selectedKey.key?.code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedKey.key?.room_name}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedKey.requester?.full_name ?? '—'}
                  </p>
                </div>

                {!verified && (
                  <div
                    className="w-full rounded-lg border border-amber-300 bg-amber-50 p-4 text-left dark:border-amber-900 dark:bg-amber-950/30"
                    role="status"
                  >
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Unverified return
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Returned without a requester code. The CSO has been
                      alerted for review.
                    </p>
                  </div>
                )}

                <Button className="mt-2 w-full" onClick={handleSheetClose}>
                  Done
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
};
