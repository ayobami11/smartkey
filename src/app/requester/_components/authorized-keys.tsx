'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useRouter } from 'next/navigation';
import { CalendarIcon, InboxIcon, KeyRoundIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
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
  weekdayRequestFormSchema,
  weekendRequestFormSchema,
  type WeekdayRequestFormInput,
  type WeekendRequestFormInput,
} from '@/lib/validation/schemas';

// Types

type AuthorisedKey = {
  key: {
    id: string;
    code: string;
    zone: string;
    room_name: string;
    status: string;
  };
};

type RequestStep =
  | 'weekday_form'
  | 'weekend_form'
  | 'submitting'
  | 'pending_hod'
  | 'error';

// Helpers

const defaultReturnDeadline = () => {
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  // If already past 17:00, default to tomorrow
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
};

const zoneLabel = (zone: string) =>
  zone === 'NEW_SENATE' ? 'New Senate' : 'Old Senate';

const zoneStripe = (zone: string) =>
  zone === 'NEW_SENATE' ? 'bg-primary' : 'bg-blue-500';

// KeyTile

const KeyTile = ({
  authorised,
  onClick,
}: {
  authorised: AuthorisedKey;
  onClick: () => void;
}) => {
  const { key } = authorised;
  const retired = key.status === 'RETIRED';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={retired}
      aria-label={`Request key ${key.code} — ${key.room_name}`}
      className={`group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-[0_2px_4px_rgba(15,23,42,0.06)] transition-shadow ${
        retired
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
      }`}
    >
      {/* Zone colour stripe at top */}
      <div
        className={`h-1 w-full ${zoneStripe(key.zone)}`}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-1 p-4">
        <span className="text-xs font-medium text-muted-foreground">
          {zoneLabel(key.zone)}
        </span>
        <span className="truncate text-sm font-medium text-foreground">
          {key.room_name}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {key.code}
        </span>
        {retired && (
          <span className="mt-1 w-fit rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Retired
          </span>
        )}
      </div>
    </button>
  );
};

// Component

export const AuthorizedKeys = () => {
  const router = useRouter();
  const connectionStatus = useConnectionStatus();
  const isOffline = connectionStatus === 'offline';
  const [keys, setKeys] = useState<AuthorisedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Dialog / Sheet state
  const [weekdayOpen, setWeekdayOpen] = useState(false);
  const [weekendOpen, setWeekendOpen] = useState(false);
  const [step, setStep] = useState<RequestStep>('weekday_form');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const weekdayForm = useForm<WeekdayRequestFormInput>({
    resolver: zodResolver(weekdayRequestFormSchema),
    defaultValues: { return_deadline: defaultReturnDeadline() },
  });

  const weekendForm = useForm<WeekendRequestFormInput>({
    resolver: zodResolver(weekendRequestFormSchema),
    defaultValues: { key_id: '', weekend_date: '', description: '' },
  });

  // Fetch authorized keys

  const fetchKeys = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setFetchError(null);

      const { data, error } = await supabase
        .from('authorisations')
        .select('key:keys!key_id(id, code, zone, room_name, status)')
        .eq('profile_id', user.id);

      if (error) {
        setFetchError('Failed to load your authorised keys.');
      } else {
        // Generated types have Relationships:[] for authorisations, so the
        // nested select type resolves to SelectQueryError. The runtime query
        // is correct; cast through unknown until types are regenerated.
        setKeys((data ?? []) as unknown as AuthorisedKey[]);
      }
    } catch {
      setFetchError(
        'Failed to load your authorised keys. Check your connection.'
      );
    } finally {
      setLoading(false);
    }
  }, []); // setState setters are stable refs — no deps needed

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // Overlay helpers

  const openWeekdaySheet = (keyId: string) => {
    setSelectedKeyId(keyId);
    weekdayForm.reset({ return_deadline: defaultReturnDeadline() });
    setSubmitError(null);
    setStep('weekday_form');
    setWeekdayOpen(true);
  };

  const openWeekendSheet = () => {
    const firstActiveKeyId =
      keys.find((k) => k.key.status !== 'RETIRED')?.key.id ?? '';
    setSelectedKeyId(firstActiveKeyId);
    weekendForm.reset({
      key_id: firstActiveKeyId,
      weekend_date: '',
      description: '',
    });
    setSubmitError(null);
    setStep('weekend_form');
    setWeekendOpen(true);
  };

  const resetSheet = () => {
    setWeekdayOpen(false);
    setWeekendOpen(false);
    setSelectedKeyId('');
    weekdayForm.reset();
    setSubmitError(null);
    setStep('weekday_form');
    weekendForm.reset();
  };

  // Submit weekday request

  const handleWeekdaySubmit = async (values: WeekdayRequestFormInput) => {
    setStep('submitting');
    setSubmitError(null);

    try {
      const res = await fetch('/api/requests/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key_id: selectedKeyId,
          type: 'WEEKDAY',
          return_deadline: new Date(values.return_deadline).toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (json as { error?: string }).error ?? 'Failed to submit request.';
        if (res.status === 409) {
          // Close the dialog so the existing active request is visible in the banner
          setWeekdayOpen(false);
          setSubmitError(msg);
        } else {
          setSubmitError(msg);
          setStep('weekday_form');
        }
        return;
      }
      const data = (json as { data?: { request_id: string } }).data;
      if (!data) {
        setSubmitError('Unexpected server response. Please try again.');
        setStep('weekday_form');
        return;
      }
      setWeekdayOpen(false);
      router.push(`/requester/request/${data.request_id}/code`);
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setStep('weekday_form');
    }
  };

  // Submit weekend request

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
      setStep('pending_hod');
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setStep('weekend_form');
    }
  };

  // Derived values

  const selectedKey = keys.find((k) => k.key.id === selectedKeyId)?.key;
  const activeKeys = keys.filter((k) => k.key.status !== 'RETIRED');

  // Render

  return (
    <section className="flex flex-col gap-4">
      {/* Loading */}
      {loading && (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          aria-busy="true"
          aria-label="Loading your keys"
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && fetchError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          <p className="font-medium">Failed to load your keys</p>
          <p className="mt-1 text-destructive/80">{fetchError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => {
              setLoading(true);
              setFetchError(null);
              void fetchKeys();
            }}
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
            <EmptyTitle>No keys authorised</EmptyTitle>
            <EmptyDescription>
              Your HOD has not authorised any keys for you yet. Reach out to
              your department&#39;s HOD.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Conflict / submit error (shown outside the dialog after it closes) */}
      {!weekdayOpen && !weekendOpen && submitError && (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
          role="alert"
        >
          <p>{submitError}</p>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            aria-label="Dismiss"
            className="shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Key grid + weekend CTA */}
      {!loading && !fetchError && keys.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Your authorised keys
            </h2>
            {activeKeys.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={openWeekendSheet}
                aria-label="Request weekend access"
              >
                <CalendarIcon className="size-3.5" aria-hidden="true" />
                Weekend access
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {keys.map((authorised) => (
              <KeyTile
                key={authorised.key.id}
                authorised={authorised}
                onClick={() => openWeekdaySheet(authorised.key.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Weekday Request Dialog */}
      <Dialog
        open={weekdayOpen}
        onOpenChange={(open) => {
          if (!open) resetSheet();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request a key</DialogTitle>
            <DialogDescription>
              Confirm the return deadline and submit your request.
            </DialogDescription>
          </DialogHeader>

          {/* Weekday form */}
          {step === 'weekday_form' && selectedKey && (
            <form
              id="weekday-form"
              onSubmit={weekdayForm.handleSubmit(handleWeekdaySubmit)}
              className="flex flex-col gap-5"
            >
              {/* Key context */}
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <KeyRoundIcon className="size-3.5" aria-hidden="true" />
                  Key
                </div>
                <p className="mt-1.5 font-mono text-sm font-medium text-foreground">
                  {selectedKey.code}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedKey.room_name} · {zoneLabel(selectedKey.zone)}
                </p>
              </div>

              {/* Return deadline */}
              <Controller
                name="return_deadline"
                control={weekdayForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="return-deadline">Return by</FieldLabel>
                    <Input
                      id="return-deadline"
                      type="datetime-local"
                      {...field}
                    />
                    {!fieldState.error && (
                      <p className="text-xs text-muted-foreground">
                        Defaults to today at 4PM (end of business day).
                      </p>
                    )}
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              {submitError && (
                <p className="text-xs text-destructive" role="alert">
                  {submitError}
                </p>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!userId || isOffline}
                      style={isOffline ? { pointerEvents: 'none' } : undefined}
                    >
                      Request key
                    </Button>
                  </span>
                </TooltipTrigger>
                {isOffline && (
                  <TooltipContent>
                    Available again when you reconnect.
                  </TooltipContent>
                )}
              </Tooltip>
            </form>
          )}

          {/* Submitting */}
          {step === 'submitting' && weekdayOpen && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                Submitting request…
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Weekend Request Sheet */}
      <Sheet
        open={weekendOpen}
        onOpenChange={(open) => {
          if (!open) resetSheet();
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
            {/* Weekend form */}
            {step === 'weekend_form' && (
              <form
                id="weekend-form"
                onSubmit={weekendForm.handleSubmit(handleWeekendSubmit)}
                className="flex flex-col gap-5"
              >
                {/* Key selector */}
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
                          {activeKeys.map((a) => (
                            <SelectItem key={a.key.id} value={a.key.id}>
                              <span className="font-mono">{a.key.code}</span>
                              <span className="ml-2 text-muted-foreground">
                                — {a.key.room_name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />

                {/* Weekend date */}
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
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />

                {/* Description */}
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
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </form>
            )}

            {/* Submitting */}
            {step === 'submitting' && weekendOpen && (
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

                {/* Confirmation card */}
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

                <Button className="w-full" onClick={resetSheet}>
                  Done
                </Button>
              </div>
            )}
          </div>

          {/* Sticky footer — weekend form submit */}
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
