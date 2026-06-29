'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircleIcon, ClipboardListIcon, KeyRoundIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { apiFetch } from '@/lib/api';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { formatDate, formatTime } from '@/lib/dates';

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
  requester: { id: string; full_name: string; photo_url: string | null } | null;
  issued_at: string;
  return_deadline: string;
  status: 'KEY_ISSUED' | 'KEY_OVERDUE';
};

type PageStep = 'loading' | 'ready' | 'success' | 'error';

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

  const someAcknowledged = acknowledged.size > 0 && !allAcknowledged;

  const selectAllChecked: boolean | 'indeterminate' = allAcknowledged
    ? true
    : someAcknowledged
      ? 'indeterminate'
      : false;

  // Fetch

  const fetchData = async () => {
    setStep('loading');
    setFetchError(null);
    const [shiftResult, keysResult] = await Promise.all([
      apiFetch<{ shift: Shift }>('/api/shifts/current'),
      apiFetch<{ outstanding: OutstandingKey[] }>('/api/keys/out'),
    ]);
    if (shiftResult.error) {
      setFetchError(shiftResult.error);
      setStep('error');
      return;
    }
    setShift(shiftResult.data?.shift ?? null);
    if (!keysResult.error && keysResult.data) {
      setOutstandingKeys(keysResult.data.outstanding ?? []);
    }
    setStep('ready');
  };

  useEffect(() => {
    void Promise.all([
      apiFetch<{ shift: Shift }>('/api/shifts/current'),
      apiFetch<{ outstanding: OutstandingKey[] }>('/api/keys/out'),
    ]).then(([shiftResult, keysResult]) => {
      if (shiftResult.error) {
        setFetchError(shiftResult.error);
        setStep('error');
        return;
      }
      setShift(shiftResult.data?.shift ?? null);
      if (!keysResult.error && keysResult.data) {
        setOutstandingKeys(keysResult.data.outstanding ?? []);
      }
      setStep('ready');
    });
  }, []);

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

  const toggleAll = () => {
    if (allAcknowledged) {
      setAcknowledged(new Set());
    } else {
      setAcknowledged(new Set(outstandingKeys.map((k) => k.id)));
    }
  };

  const submitHandover = async () => {
    if (!shift) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await apiFetch<{ acknowledged_count: number }>(
      '/api/shifts/handover',
      {
        method: 'POST',
        body: {
          outgoing_shift_id: shift.id,
          key_ids: Array.from(acknowledged),
          bulk: false,
        },
      }
    );
    setSubmitting(false);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    const count = result.data?.acknowledged_count;
    setHandoverRef(count !== undefined ? String(count) : null);
    setStep('success');
  };

  // Render

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Shift handover
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Acknowledge all outstanding keys before your shift begins.
        </p>
      </div>

      {/* Loading */}
      {step === 'loading' && (
        <div
          className="flex flex-col gap-4"
          aria-busy="true"
          aria-label="Loading handover information"
        >
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-5"
          role="alert"
        >
          <p className="text-sm font-semibold text-destructive">
            Failed to load handover information
          </p>
          <p className="mt-1 text-sm text-destructive/80">{fetchError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => void fetchData()}
          >
            Try again
          </Button>
        </div>
      )}

      {/* Success */}
      {step === 'success' && (
        <div className="flex flex-col items-center gap-6 rounded-lg border border-emerald-200 bg-emerald-50/80 p-10 text-center dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <CheckCircleIcon
              className="size-8 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Handover complete
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              Your shift has begun
            </p>
            {handoverRef !== null && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {handoverRef === '0'
                  ? 'No outstanding keys to acknowledge.'
                  : `${handoverRef} key${Number(handoverRef) !== 1 ? 's' : ''} acknowledged and recorded.`}
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              The dashboard is now active.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/verifier">Go to dashboard</Link>
          </Button>
        </div>
      )}

      {/* Ready state */}
      {step === 'ready' && (
        <div className="flex flex-col gap-6">
          {/* Outgoing shift summary */}
          {shift && (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
              <div className="border-b border-border bg-muted/50 px-5 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Outgoing shift
                </p>
              </div>
              <div className="flex items-center gap-4 p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-bold text-primary">
                    {shift.shift_number}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {shift.primary_officer.full_name}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    Shift {shift.shift_number} · {formatDate(shift.started_at)}{' '}
                    · {formatTime(shift.started_at)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Outstanding keys checklist */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Outstanding keys
              </h2>
              {outstandingKeys.length > 0 && (
                <span
                  className={`rounded-full px-2.5 py-1 font-mono text-xs font-semibold tabular-nums ${
                    allAcknowledged
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}
                  aria-live="polite"
                  aria-label={`${acknowledged.size} of ${outstandingKeys.length} keys acknowledged`}
                >
                  {acknowledged.size}/{outstandingKeys.length}
                </span>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
              {outstandingKeys.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <ClipboardListIcon
                      className="size-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No keys are currently outstanding.
                  </p>
                </div>
              ) : (
                <>
                  {/* Select-all header row */}
                  <div className="flex items-center gap-4 border-b border-border px-5 py-3">
                    <Checkbox
                      id="select-all-keys"
                      checked={selectAllChecked}
                      onCheckedChange={toggleAll}
                      disabled={submitting || isOffline}
                      aria-label="Select all keys"
                    />
                    <Label
                      htmlFor="select-all-keys"
                      className="cursor-pointer text-xs font-medium text-muted-foreground"
                    >
                      Mark all keys as acknowledged
                    </Label>
                  </div>

                  {outstandingKeys.map((item, idx) => {
                    const isOverdue = item.status === 'KEY_OVERDUE';
                    const isChecked = acknowledged.has(item.id);
                    const zoneLabel =
                      item.key.zone === 'NEW_SENATE'
                        ? 'New Senate'
                        : 'Old Senate';
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-4 px-5 py-4 transition-colors duration-150 ${
                          idx > 0 ? 'border-t border-border' : ''
                        } ${
                          isChecked
                            ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
                            : isOverdue
                              ? 'bg-destructive/[0.03] dark:bg-destructive/[0.05]'
                              : ''
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
                          className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-foreground">
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
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {item.key.room_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.requester?.full_name ?? 'External guest'}
                          </p>
                        </Label>

                        <div className="shrink-0 text-right">
                          <p className="font-mono text-xs font-medium tabular-nums text-foreground">
                            {formatTime(item.issued_at)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {zoneLabel}
                          </p>
                        </div>

                        {isChecked ? (
                          <CheckCircleIcon
                            className="size-5 shrink-0 text-emerald-500"
                            aria-hidden="true"
                          />
                        ) : (
                          <KeyRoundIcon
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {submitError && (
            <p className="text-xs text-destructive" role="alert">
              {submitError}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            {/* Per-key acknowledge — enabled only when all are checked */}
            {outstandingKeys.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <Button
                      onClick={() => submitHandover()}
                      disabled={isOffline || !allAcknowledged || submitting}
                      aria-busy={submitting}
                      className={`w-full${isOffline ? ' pointer-events-none' : ''}`}
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

            {/* No outstanding keys — complete handover directly */}
            {outstandingKeys.length === 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <Button
                      onClick={() => submitHandover()}
                      disabled={isOffline || submitting}
                      aria-busy={submitting}
                      className={`w-full${isOffline ? ' pointer-events-none' : ''}`}
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
