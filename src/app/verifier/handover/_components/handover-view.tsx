'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeftRightIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  KeyRoundIcon,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';

// Types

type Shift = {
  id: string;
  shift_number: number;
  started_at: string;
  primary_officer: { full_name: string; institutional_email: string };
};

type OutstandingKey = {
  id: string;
  key: { code: string; room_name: string; zone: string };
  requester: { id: string; full_name: string; photo_url: string | null };
  issued_at: string;
  return_deadline: string;
  status: 'KEY_ISSUED' | 'KEY_OVERDUE';
};

type PageStep = 'loading' | 'ready' | 'success' | 'error';

// Helpers

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

// Component

export const HandoverView = () => {
  const connectionStatus = useConnectionStatus();
  const isOffline = connectionStatus === 'offline';
  const [step, setStep] = useState<PageStep>('loading');
  const [shift, setShift] = useState<Shift | null>(null);
  const [outstandingKeys, setOutstandingKeys] = useState<OutstandingKey[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Which keys the officer has manually ticked
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [handoverRef, setHandoverRef] = useState<string | null>(null);

  const allAcknowledged =
    outstandingKeys.length > 0 &&
    outstandingKeys.every((k) => acknowledged.has(k.id));

  // Fetch

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setStep('loading');
    setFetchError(null);
    try {
      const [shiftRes, keysRes] = await Promise.all([
        fetch('/api/shifts/current'),
        fetch('/api/keys/out'),
      ]);

      if (!shiftRes.ok) {
        const json = await shiftRes.json().catch(() => ({}));
        setFetchError(
          (json as { error?: string }).error ??
            'Failed to load shift information.'
        );
        setStep('error');
        return;
      }

      const shiftJson = await shiftRes.json();
      setShift((shiftJson as { data?: { shift?: Shift } }).data?.shift ?? null);

      // Keys are best-effort — not critical if this fails
      if (keysRes.ok) {
        const keysJson = await keysRes.json();
        setOutstandingKeys(
          (keysJson as { data?: { outstanding?: OutstandingKey[] } }).data
            ?.outstanding ?? []
        );
      }

      setStep('ready');
    } catch {
      setFetchError('Network error. Check your connection and try again.');
      setStep('error');
    }
  };

  // Handlers

  const toggleKey = (id: string) => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const submitHandover = async (bulk: boolean) => {
    if (!shift) return;
    setSubmitting(true);
    setSubmitError(null);
    const keyIds = bulk
      ? outstandingKeys.map((k) => k.id)
      : Array.from(acknowledged);
    try {
      const res = await fetch('/api/shifts/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outgoing_shift_id: shift.id,
          key_ids: keyIds,
          bulk,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          (json as { error?: string }).error ??
            'Failed to complete handover. Please try again.'
        );
        return;
      }
      const count = (json as { data?: { acknowledged_count?: number } }).data
        ?.acknowledged_count;
      setHandoverRef(count !== undefined ? String(count) : null);
      setStep('success');
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Render

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Page heading */}
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
          <ArrowLeftRightIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            Shift handover
          </h1>
          <p className="text-xs text-muted-foreground">
            Acknowledge all outstanding keys before your shift begins.
          </p>
        </div>
      </div>

      {/* Loading */}
      {step === 'loading' && (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          <p className="font-medium">Failed to load handover information</p>
          <p className="mt-1 text-destructive/80">{fetchError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={fetchData}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Success */}
      {step === 'success' && (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <CheckCircleIcon
            className="size-10 text-emerald-600"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium text-foreground">Handover complete</p>
            {handoverRef !== null && (
              <p className="mt-1 text-sm text-muted-foreground">
                {handoverRef === '0'
                  ? 'No outstanding keys to acknowledge.'
                  : `${handoverRef} key${Number(handoverRef) !== 1 ? 's' : ''} acknowledged.`}
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              Your shift has begun. The dashboard is now active.
            </p>
          </div>
        </div>
      )}

      {/* Ready state */}
      {step === 'ready' && (
        <div className="flex flex-col gap-6">
          {/* Outgoing shift summary */}
          {shift && (
            <div className="rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-medium text-muted-foreground">
                Outgoing shift
              </p>
              <p className="mt-1.5 text-sm font-medium text-foreground">
                Shift {shift.shift_number} — {shift.primary_officer.full_name}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Started {formatDate(shift.started_at)} at{' '}
                {formatTime(shift.started_at)}
              </p>
            </div>
          )}

          {/* Outstanding keys checklist */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Outstanding keys
                {outstandingKeys.length > 0 && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    ({acknowledged.size}/{outstandingKeys.length})
                  </span>
                )}
              </h2>
            </div>

            {outstandingKeys.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-5">
                <ClipboardListIcon
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground">
                  No keys are currently outstanding.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {outstandingKeys.map((item) => {
                  const isOverdue = item.status === 'KEY_OVERDUE';
                  const isChecked = acknowledged.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-4 overflow-hidden rounded-lg border bg-card p-4 transition-colors ${
                        isChecked
                          ? 'border-emerald-200 dark:border-emerald-900'
                          : 'border-border'
                      }`}
                    >
                      <Checkbox
                        id={`key-${item.id}`}
                        checked={isChecked}
                        onCheckedChange={() => toggleKey(item.id)}
                        disabled={submitting || isOffline}
                        aria-label={`Acknowledge key ${item.key.code}`}
                      />
                      <Label
                        htmlFor={`key-${item.id}`}
                        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-foreground">
                            {item.key.code}
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
                        <span className="truncate text-xs text-muted-foreground">
                          {item.key.room_name} · {item.requester.full_name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          Issued {formatTime(item.issued_at)}
                        </span>
                      </Label>
                      <KeyRoundIcon
                        className={`size-4 shrink-0 ${
                          isChecked
                            ? 'text-emerald-600'
                            : 'text-muted-foreground'
                        }`}
                        aria-hidden="true"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {submitError && (
            <p className="text-xs text-destructive" role="alert">
              {submitError}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {/* Per-key acknowledge (when some are checked) */}
            {outstandingKeys.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <Button
                      onClick={() => submitHandover(false)}
                      disabled={isOffline || !allAcknowledged || submitting}
                      aria-busy={submitting}
                      className="w-full"
                      style={isOffline ? { pointerEvents: 'none' } : undefined}
                    >
                      {submitting
                        ? 'Completing handover…'
                        : `Acknowledge ${outstandingKeys.length} key${outstandingKeys.length !== 1 ? 's' : ''}`}
                    </Button>
                  </span>
                </TooltipTrigger>
                {isOffline && (
                  <TooltipContent>
                    Available again when you reconnect.
                  </TooltipContent>
                )}
              </Tooltip>
            )}

            {/* Bulk acknowledge — always available, requires confirmation dialog */}
            {outstandingKeys.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={isOffline || submitting}
                    className={`w-full${isOffline ? ' pointer-events-none' : ''}`}
                  >
                    Bulk acknowledge all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Bulk acknowledge all keys?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      You are confirming responsibility for{' '}
                      {outstandingKeys.length} outstanding{' '}
                      {outstandingKeys.length === 1 ? 'key' : 'keys'} without
                      reviewing each one individually. This is logged with your
                      identity and cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => submitHandover(true)}>
                      Confirm bulk acknowledge
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* No outstanding keys — complete handover directly */}
            {outstandingKeys.length === 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <Button
                      onClick={() => submitHandover(false)}
                      disabled={isOffline || submitting}
                      aria-busy={submitting}
                      style={isOffline ? { pointerEvents: 'none' } : undefined}
                    >
                      {submitting
                        ? 'Completing handover…'
                        : 'Complete handover'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {isOffline && (
                  <TooltipContent>
                    Available again when you reconnect.
                  </TooltipContent>
                )}
              </Tooltip>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
