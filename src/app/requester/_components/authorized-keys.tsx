'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarIcon,
  CheckCircleIcon,
  InboxIcon,
  KeyRoundIcon,
  XCircleIcon,
} from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { createBrowserClient } from '@/lib/supabase/client';
import {
  weekendRequestFormSchema,
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
  | 'code'
  | 'pending_hod'
  | 'error';

type SubmitResult = {
  request_id: string;
  code?: string;
  code_expires_at?: string;
  risk_tier?: string;
  status?: string;
};

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

const secondsRemaining = (isoExpiry: string) =>
  Math.max(0, Math.floor((new Date(isoExpiry).getTime() - Date.now()) / 1000));

const formatCountdown = (seconds: number) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
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
  const [keys, setKeys] = useState<AuthorisedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<RequestStep>('weekday_form');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [returnDeadline, setReturnDeadline] = useState(defaultReturnDeadline());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Countdown timer

  useEffect(() => {
    if (!result?.code_expires_at) return;
    // Initial countdown is set in handleSubmit when the result arrives so we
    // avoid a synchronous setState inside this effect body.
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [result?.code_expires_at]);

  // Sheet helpers

  const openWeekdaySheet = (keyId: string) => {
    setSelectedKeyId(keyId);
    setReturnDeadline(defaultReturnDeadline());
    setSubmitError(null);
    setResult(null);
    setStep('weekday_form');
    setSheetOpen(true);
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
    setResult(null);
    setStep('weekend_form');
    setSheetOpen(true);
  };

  const resetSheet = () => {
    setSheetOpen(false);
    setSelectedKeyId('');
    setReturnDeadline(defaultReturnDeadline());
    setSubmitError(null);
    setResult(null);
    setStep('weekday_form');
    setCancelling(false);
    weekendForm.reset();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // Submit weekday request

  const handleSubmit = async () => {
    setStep('submitting');
    setSubmitError(null);

    try {
      const res = await fetch('/api/requests/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key_id: selectedKeyId,
          type: 'WEEKDAY',
          return_deadline: new Date(returnDeadline).toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          (json as { error?: string }).error ?? 'Failed to submit request.'
        );
        setStep('weekday_form');
        return;
      }
      const data = (json as { data?: SubmitResult }).data;
      if (!data) {
        setSubmitError('Unexpected server response. Please try again.');
        setStep('weekday_form');
        return;
      }
      setResult(data);
      // Initialise countdown here (not in useEffect) to avoid sync setState in effect
      if (data.code_expires_at) {
        setCountdown(secondsRemaining(data.code_expires_at));
      }
      setStep('code');
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
      const data = (json as { data?: SubmitResult }).data;
      if (!data) {
        setSubmitError('Unexpected server response. Please try again.');
        setStep('weekend_form');
        return;
      }
      setResult(data);
      setStep('pending_hod');
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setStep('weekend_form');
    }
  };

  // Cancel request

  const handleCancel = async () => {
    if (!result?.request_id) return;
    setCancelling(true);
    try {
      await fetch('/api/requests/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: result.request_id }),
      });
      resetSheet();
    } catch {
      setCancelling(false);
    }
  };

  // Derived values

  const selectedKey = keys.find((k) => k.key.id === selectedKeyId)?.key;
  const activeKeys = keys.filter((k) => k.key.status !== 'RETIRED');
  const isExpired =
    step === 'code' && result?.code_expires_at !== undefined && countdown === 0;

  const weekdayCanSubmit =
    selectedKeyId !== '' && returnDeadline !== '' && userId !== null;

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

      {/* Request Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) resetSheet();
        }}
      >
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle>
              {step === 'weekend_form' || step === 'pending_hod'
                ? 'Request weekend access'
                : 'Request a key'}
            </SheetTitle>
            <SheetDescription>
              {step === 'code'
                ? 'Show this code to the security officer at the desk.'
                : step === 'pending_hod'
                  ? 'Your HOD will be notified to approve this request.'
                  : step === 'weekend_form'
                    ? 'Select a key, choose a date, and describe your reason.'
                    : 'Confirm the return deadline and submit your request.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-y-auto p-6">
            {/* Weekday form */}
            {step === 'weekday_form' && selectedKey && (
              <div className="flex flex-col gap-5">
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor="return-deadline">Return by</Label>
                  <Input
                    id="return-deadline"
                    type="datetime-local"
                    value={returnDeadline}
                    onChange={(e) => setReturnDeadline(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Defaults to today at 17:00 (end of business day).
                  </p>
                </div>

                {submitError && (
                  <p className="text-xs text-destructive" role="alert">
                    {submitError}
                  </p>
                )}

                <Button
                  className="w-full"
                  disabled={!weekdayCanSubmit}
                  onClick={handleSubmit}
                >
                  Request key
                </Button>
              </div>
            )}

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
            {step === 'submitting' && (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Submitting request…
                </p>
              </div>
            )}

            {/* Code step */}
            {step === 'code' && result && (
              <div className="flex flex-col items-center gap-4 text-center">
                <CheckCircleIcon
                  className="size-10 text-emerald-600"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium text-foreground">
                    Request submitted
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Show this code to the security officer at the desk.
                  </p>
                </div>

                {/* Code display */}
                {isExpired ? (
                  <div className="w-full rounded-lg border border-muted bg-muted/40 p-6 text-center">
                    <p className="text-sm font-medium text-muted-foreground">
                      Code expired
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cancel this request and submit a new one to continue.
                    </p>
                  </div>
                ) : (
                  <div className="w-full rounded-lg border border-primary/20 bg-primary/5 p-6 text-center">
                    {selectedKey && (
                      <p className="mb-3 text-xs text-muted-foreground">
                        {selectedKey.code} · {selectedKey.room_name}
                      </p>
                    )}
                    <p
                      className="font-mono text-5xl font-semibold tracking-[0.3em] text-foreground"
                      aria-label={`Collection code: ${result.code}`}
                    >
                      {result.code}
                    </p>
                    {result.code_expires_at && (
                      <p
                        className="mt-3 font-mono text-sm text-muted-foreground"
                        aria-live="polite"
                        aria-label={`Expires in ${formatCountdown(countdown)}`}
                      >
                        Expires in {formatCountdown(countdown)}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex w-full flex-col gap-2">
                  <Button
                    variant="outline"
                    className="w-full gap-1.5 text-destructive hover:bg-destructive/10"
                    onClick={handleCancel}
                    disabled={cancelling}
                    aria-busy={cancelling}
                  >
                    <XCircleIcon className="size-3.5" aria-hidden="true" />
                    {cancelling ? 'Cancelling…' : 'Cancel request'}
                  </Button>
                  <Button className="w-full" onClick={resetSheet}>
                    Done
                  </Button>
                </div>
              </div>
            )}

            {/* Pending HOD approval */}
            {step === 'pending_hod' && result && (
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
              <Button type="submit" form="weekend-form" className="w-full">
                Submit request
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
};
