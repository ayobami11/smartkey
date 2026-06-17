'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

type AvailableKey = {
  key: { id: string; code: string; room_name: string; status: string };
};

type WeekendStep = 'weekend_form' | 'submitting' | 'pending_hod';

// Props

type WeekendAccessSheetProps = {
  userId: string | null;
  isOffline: boolean;
  onSubmitted: () => void;
};

// Component

export const WeekendAccessSheet = ({
  userId,
  isOffline,
  onSubmitted,
}: WeekendAccessSheetProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WeekendStep>('weekend_form');
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [availableKeys, setAvailableKeys] = useState<AvailableKey[]>([]);

  const form = useForm<WeekendRequestFormInput>({
    resolver: zodResolver(weekendRequestFormSchema),
    defaultValues: { key_id: '', weekend_date: '', description: '' },
  });

  const selectedKey = availableKeys.find(
    (a) => a.key.id === selectedKeyId
  )?.key;

  const handleOpen = async () => {
    setStep('weekend_form');
    setSubmitError(null);
    setOpen(true);
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
      form.reset({ key_id: firstId, weekend_date: '', description: '' });
    } catch {
      setAvailableKeys([]);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSelectedKeyId('');
      setStep('weekend_form');
      setSubmitError(null);
      form.reset();
    }, 200);
  };

  const handleSubmit = async (values: WeekendRequestFormInput) => {
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
      onSubmitted();
      setStep('pending_hod');
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setStep('weekend_form');
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpen}
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

      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <SheetContent side="right" className="flex flex-col gap-0 p-0">
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
                onSubmit={form.handleSubmit(handleSubmit)}
                className="flex flex-col gap-5"
              >
                <Controller
                  name="key_id"
                  control={form.control}
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
                  control={form.control}
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
                  control={form.control}
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
                  {form.getValues('weekend_date') && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(
                        `${form.getValues('weekend_date')}T00:00:00`
                      ).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>

                <Button className="w-full" onClick={handleClose}>
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
    </>
  );
};
