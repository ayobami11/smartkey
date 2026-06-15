'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CalendarClockIcon,
  CalendarIcon,
  CalendarOffIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useRealtime } from '@/hooks/useRealtime';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  weekendRequestFormSchema,
  type WeekendRequestFormInput,
} from '@/lib/validation/schemas';

// Types

type WeekendStatus = 'PENDING_HOD' | 'APPROVED' | 'DECLINED';

type WeekendRequest = {
  id: string;
  status: WeekendStatus;
  requested_for: string;
  key: { code: string; room_name: string } | null;
};

type AvailableKey = {
  key: { id: string; code: string; room_name: string; status: string };
};

type WeekendStep = 'weekend_form' | 'submitting' | 'pending_hod';

// Constants

const STATUS_CONFIG: Record<
  WeekendStatus,
  { icon: LucideIcon; label: string; className: string; stripe: string }
> = {
  PENDING_HOD: {
    icon: ClockIcon,
    label: 'Awaiting HOD approval',
    className: 'bg-amber-100 text-amber-700',
    stripe: 'bg-amber-400',
  },
  APPROVED: {
    icon: CheckCircleIcon,
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-700',
    stripe: 'bg-emerald-500',
  },
  DECLINED: {
    icon: XCircleIcon,
    label: 'Declined',
    className: 'bg-destructive/10 text-destructive',
    stripe: 'bg-destructive',
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

export const WeekendRequests = () => {
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

  // Weekend request form state
  const [weekendOpen, setWeekendOpen] = useState(false);
  const [step, setStep] = useState<WeekendStep>('weekend_form');
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [availableKeys, setAvailableKeys] = useState<AvailableKey[]>([]);

  const weekendForm = useForm<WeekendRequestFormInput>({
    resolver: zodResolver(weekendRequestFormSchema),
    defaultValues: { key_id: '', weekend_date: '', description: '' },
  });

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

  // Weekend request form handlers

  const openWeekendSheet = async () => {
    setStep('weekend_form');
    setSubmitError(null);
    setWeekendOpen(true);
    try {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('authorisations')
        .select('key:keys!key_id(id, code, room_name, status)')
        .eq('profile_id', userId!);
      const keys = ((data ?? []) as unknown as AvailableKey[]).filter(
        (a) => a.key.status !== 'RETIRED'
      );
      setAvailableKeys(keys);
      const firstId = keys[0]?.key.id ?? '';
      setSelectedKeyId(firstId);
      weekendForm.reset({ key_id: firstId, weekend_date: '', description: '' });
    } catch {
      setAvailableKeys([]);
    }
  };

  const closeWeekendSheet = () => {
    setWeekendOpen(false);
    setTimeout(() => {
      setSelectedKeyId('');
      setStep('weekend_form');
      setSubmitError(null);
      weekendForm.reset();
    }, 200);
  };

  const handleWeekendSubmit = async (values: WeekendRequestFormInput) => {
    setStep('submitting');
    setSubmitError(null);
    try {
      const res = await fetch('/api/requests/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key_id: values.key_id,
          type: 'WEEKEND',
          return_deadline: new Date(
            `${values.weekend_date}T23:59:00`
          ).toISOString(),
          weekend_date: values.weekend_date,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          (json as { error?: string }).error ?? 'Failed to submit request.'
        );
        setStep('weekend_form');
        return;
      }
      const data = (json as { data?: { request_id: string } }).data;
      if (!data) {
        setSubmitError('Unexpected server response. Please try again.');
        setStep('weekend_form');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['weekend-requests', userId] });
      setStep('pending_hod');
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setStep('weekend_form');
    }
  };

  // Collection code handler

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

  // Derived values

  const selectedKey = availableKeys.find(
    (a) => a.key.id === selectedKeyId
  )?.key;

  // Render

  return (
    <section className="flex flex-col gap-4" aria-label="Weekend requests">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Weekend requests
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                onClick={openWeekendSheet}
                disabled={!userId || isOffline}
                aria-label="Request weekend access"
                className={isOffline ? 'pointer-events-none' : ''}
              >
                <CalendarIcon className="size-3.5" aria-hidden="true" />
                Weekend access
              </Button>
            </span>
          </TooltipTrigger>
          {isOffline && (
            <TooltipContent>Available again when you reconnect.</TooltipContent>
          )}
        </Tooltip>
      </div>

      {/* Loading */}
      {loading && (
        <div
          className="flex flex-col gap-3"
          aria-busy="true"
          aria-label="Loading weekend requests"
        >
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-18 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && requests.length === 0 && (
        <Empty className="border border-border bg-card">
          <EmptyMedia variant="icon">
            <CalendarOffIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>No weekend requests</EmptyTitle>
            <EmptyDescription>
              Weekend access requests you submit will appear here.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      )}

      {/* Request cards */}
      {!loading && requests.length > 0 && (
        <div className="flex flex-col gap-3">
          {requests.map((req) => {
            const cfg = STATUS_CONFIG[req.status];
            const StatusIcon = cfg.icon;
            const collectToday =
              req.status === 'APPROVED' && isToday(req.requested_for);
            const approvedFuture =
              req.status === 'APPROVED' && !isToday(req.requested_for);

            return (
              <div
                key={req.id}
                className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div
                  className={`w-1 shrink-0 ${cfg.stripe}`}
                  aria-hidden="true"
                />
                <div className="flex flex-1 items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {req.key?.code ?? '—'}
                      </span>
                      <span
                        className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.className}`}
                      >
                        <StatusIcon className="size-3" aria-hidden="true" />
                        {cfg.label}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {req.key?.room_name ?? ''}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClockIcon
                        className="size-3"
                        aria-hidden="true"
                      />
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
                      {generatingId === req.id ? 'Generating…' : 'Get code'}
                    </Button>
                  )}
                  {approvedFuture && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(req.requested_for)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Weekend access sheet */}
      <Sheet
        open={weekendOpen}
        onOpenChange={(open) => {
          if (!open) closeWeekendSheet();
        }}
      >
        <SheetContent side="bottom" className="flex flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle>Request weekend access</SheetTitle>
            <SheetDescription>
              {step === 'pending_hod'
                ? 'Your HOD will be notified to approve this request.'
                : 'Select a key, choose a date, and describe your reason.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-y-auto p-6">
            {/* Form */}
            {step === 'weekend_form' && (
              <form
                id="weekend-form"
                onSubmit={weekendForm.handleSubmit(handleWeekendSubmit)}
                className="flex flex-col gap-5"
              >
                <Controller
                  name="key_id"
                  control={weekendForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="weekend-key">Key</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          setSelectedKeyId(val);
                        }}
                      >
                        <SelectTrigger id="weekend-key">
                          <SelectValue placeholder="Select a key…" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableKeys.map((a) => (
                            <SelectItem key={a.key.id} value={a.key.id}>
                              <span className="font-mono">{a.key.code}</span>
                              <span className="ml-2 text-muted-foreground">
                                — {a.key.room_name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="weekend_date"
                  control={weekendForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="weekend-date">
                        Weekend date
                      </FieldLabel>
                      <Input
                        id="weekend-date"
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        {...field}
                      />
                      {!fieldState.error && (
                        <p className="text-xs text-muted-foreground">
                          Must be a Saturday or Sunday.
                        </p>
                      )}
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="description"
                  control={weekendForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="weekend-desc">
                        Reason for access
                      </FieldLabel>
                      <Textarea
                        id="weekend-desc"
                        placeholder="Describe the work you need to carry out…"
                        rows={4}
                        aria-required="true"
                        className="resize-none"
                        {...field}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </form>
            )}

            {/* Submitting */}
            {step === 'submitting' && (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Submitting request…
                </p>
              </div>
            )}

            {/* Pending HOD approval */}
            {step === 'pending_hod' && (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
                  <CalendarIcon
                    className="size-6 text-amber-600"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Waiting for approval
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your HOD will review and approve or decline this request.
                    {"You'll"} be notified by email when they decide.
                  </p>
                </div>

                <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Weekend request submitted
                  </p>
                  {selectedKey && (
                    <>
                      <p className="mt-1.5 font-mono text-sm font-medium text-foreground">
                        {selectedKey.code}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedKey.room_name}
                      </p>
                    </>
                  )}
                  {weekendForm.getValues('weekend_date') && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(
                        `${weekendForm.getValues('weekend_date')}T00:00:00`
                      ).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>

                <Button className="w-full" onClick={closeWeekendSheet}>
                  Done
                </Button>
              </div>
            )}
          </div>

          {/* Sticky footer */}
          {step === 'weekend_form' && (
            <div className="border-t border-border p-6 pt-4">
              {submitError && (
                <p className="mb-3 text-xs text-destructive" role="alert">
                  {submitError}
                </p>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <Button
                      type="submit"
                      form="weekend-form"
                      className="w-full"
                      disabled={isOffline}
                      style={isOffline ? { pointerEvents: 'none' } : undefined}
                    >
                      Submit request
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
        </SheetContent>
      </Sheet>
    </section>
  );
};
