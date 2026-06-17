'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useRouter } from 'next/navigation';
import { InboxIcon, KeyRoundIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  weekdayRequestFormSchema,
  type WeekdayRequestFormInput,
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

type RequestStep = 'weekday_form' | 'submitting' | 'error';

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

// Component

export const AuthorizedKeys = () => {
  const router = useRouter();
  const connectionStatus = useConnectionStatus();
  const isOffline = connectionStatus === 'offline';

  // Dialog state
  const [weekdayOpen, setWeekdayOpen] = useState(false);
  const [step, setStep] = useState<RequestStep>('weekday_form');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const weekdayForm = useForm<WeekdayRequestFormInput>({
    resolver: zodResolver(weekdayRequestFormSchema),
    defaultValues: { return_deadline: defaultReturnDeadline() },
  });

  // Fetch authorized keys

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['requester', 'authorized-keys'],
    queryFn: async () => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { keys: [] as AuthorisedKey[], userId: null };

      const { data, error } = await supabase
        .from('authorisations')
        .select('key:keys!key_id(id, code, zone, room_name, status)')
        .eq('profile_id', user.id);

      // Generated types have Relationships:[] for authorisations, so the
      // nested select type resolves to SelectQueryError. The runtime query
      // is correct; cast through unknown until types are regenerated.
      if (error) throw new Error('Failed to load your authorised keys.');
      return {
        keys: (data ?? []) as unknown as AuthorisedKey[],
        userId: user.id,
      };
    },
    staleTime: 2 * 60_000,
  });

  const keys = data?.keys ?? [];
  const userId = data?.userId ?? null;

  // Overlay helpers

  const openWeekdaySheet = (keyId: string) => {
    setSelectedKeyId(keyId);
    weekdayForm.reset({ return_deadline: defaultReturnDeadline() });
    setSubmitError(null);
    setStep('weekday_form');
    setWeekdayOpen(true);
  };

  const resetSheet = () => {
    setWeekdayOpen(false);
    setSelectedKeyId('');
    weekdayForm.reset();
    setSubmitError(null);
    setStep('weekday_form');
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

  // Derived values

  const selectedKey = keys.find((k) => k.key.id === selectedKeyId)?.key;

  // Render

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Authorised keys</h2>

      {/* Loading */}
      {isLoading && (
        <div
          className="flex flex-col gap-3"
          aria-busy="true"
          aria-label="Loading your keys"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-18 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          <p className="font-medium">Failed to load your keys</p>
          <p className="mt-1 text-destructive/80">
            Failed to load your authorised keys. Check your connection.
          </p>
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
      {!isLoading && !isError && keys.length === 0 && (
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
      {!weekdayOpen && submitError && (
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

      {/* Key grid */}
      {!isLoading && !isError && keys.length > 0 && (
        <div className="flex flex-col gap-3">
          {keys.map((authorised) => {
            const { key } = authorised;
            const retired = key.status === 'RETIRED';
            return (
              <div
                key={key.id}
                className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div
                  className={`w-1 shrink-0 ${zoneStripe(key.zone)}`}
                  aria-hidden="true"
                />
                <div className="flex flex-1 items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {key.code}
                      </span>
                      {retired && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Retired
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {key.room_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {zoneLabel(key.zone)}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openWeekdaySheet(key.id)}
                          disabled={retired || isOffline}
                          aria-label={`Request key ${key.code} — ${key.room_name}`}
                          className={`shrink-0${isOffline && !retired ? ' pointer-events-none' : ''}`}
                        >
                          Request
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {isOffline && !retired && (
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

      {/* Weekday Request Sheet */}
      <Sheet
        open={weekdayOpen}
        onOpenChange={(open) => {
          if (!open) resetSheet();
        }}
      >
        <SheetContent side="right" className="flex flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle>Request a key</SheetTitle>
            <SheetDescription>
              Confirm the return deadline and submit your request.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-y-auto p-6">
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
                      <FieldLabel htmlFor="return-deadline">
                        Return by
                      </FieldLabel>
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
          </div>

          {/* Sticky footer */}
          {step === 'weekday_form' && (
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
                      form="weekday-form"
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
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
};
