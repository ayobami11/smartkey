'use client';

import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarIcon } from 'lucide-react';

import { AuthorizationLetterUpload } from '@/app/(public)/weekend-access/_components/authorization-letter-upload';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { apiFetch } from '@/lib/api';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  LETTER_MAX_BYTES,
  weekendRequestFormSchema,
  type WeekendRequestFormInput,
} from '@/lib/validation/schemas';

type AvailableKey = {
  key: { id: string; code: string; room_name: string; status: string };
};

type WeekendStep = 'weekend_form' | 'submitting' | 'pending_hod';

const FALLBACK_RETURN_DEADLINE_TIME = '17:00';

// Props

type WeekendAccessSheetProps = {
  userId: string | null;
  isOffline: boolean;
  onSubmitted: () => void;
};

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
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [returnDeadlineTime, setReturnDeadlineTime] = useState(
    FALLBACK_RETURN_DEADLINE_TIME
  );
  const letterInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

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
      const [{ data }, configResult] = await Promise.all([
        supabase
          .from('authorisations')
          .select('key:keys!key_id(id, code, room_name, status)')
          .eq('profile_id', userId!),
        supabase
          .from('operational_config')
          .select('return_deadline_time')
          .single(),
      ]);
      if (configResult.data) {
        setReturnDeadlineTime(
          configResult.data.return_deadline_time.slice(0, 5)
        );
      }
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
      setLetterFile(null);
      setStampFile(null);
      form.reset();
    }, 200);
  };

  const handleSubmit = async (values: WeekendRequestFormInput) => {
    setStep('submitting');
    setSubmitError(null);

    const supabase = createBrowserClient();

    const uploadToWeekendLetters = async (file: File) => {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('weekend-letters')
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('weekend-letters')
        .getPublicUrl(path);
      return urlData.publicUrl;
    };

    let letterUrl: string | undefined;
    let stampUrl: string | undefined;

    if (letterFile) {
      try {
        letterUrl = await uploadToWeekendLetters(letterFile);
      } catch {
        setSubmitError('Failed to upload signature image. Try again.');
        setStep('weekend_form');
        return;
      }
    }

    if (stampFile) {
      try {
        stampUrl = await uploadToWeekendLetters(stampFile);
      } catch {
        setSubmitError('Failed to upload stamp image. Try again.');
        setStep('weekend_form');
        return;
      }
    }

    const result = await apiFetch<{ request_id: string }>(
      '/api/requests/submit',
      {
        method: 'POST',
        body: {
          key_id: values.key_id,
          type: 'WEEKEND',
          return_deadline: new Date(
            `${values.weekend_date}T${returnDeadlineTime}:00`
          ).toISOString(),
          weekend_date: values.weekend_date,
          ...(letterUrl ? { letter_url: letterUrl } : {}),
          ...(stampUrl ? { stamp_url: stampUrl } : {}),
        },
      }
    );
    if (result.error || !result.data) {
      setSubmitError(result.error ?? 'Failed to submit request.');
      setStep('weekend_form');
      return;
    }
    onSubmitted();
    setStep('pending_hod');
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
                ? 'Your request has been submitted and is awaiting approval.'
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
                        <SelectTrigger id="weekend-key" className="w-full">
                          <SelectValue placeholder="Select a key" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableKeys.map((a) => (
                            <SelectItem key={a.key.id} value={a.key.id}>
                              <span className="flex min-w-0 items-center gap-1">
                                <span className="shrink-0 font-mono">
                                  {a.key.code}
                                </span>
                                <span className="truncate text-muted-foreground">
                                  — {a.key.room_name}
                                </span>
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
                        placeholder="Describe the work you need to carry out..."
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

                {/* Hidden file input — triggered by AuthorizationLetterUpload */}
                <input
                  ref={letterInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="sr-only"
                  aria-hidden="true"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > LETTER_MAX_BYTES) {
                      setSubmitError(
                        'Signature image must be 5 MB or smaller.'
                      );
                      e.target.value = '';
                      return;
                    }
                    setSubmitError(null);
                    setLetterFile(file);
                  }}
                />

                <Field>
                  <FieldLabel htmlFor="weekend-sig">
                    Dean&apos;s signature{' '}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </FieldLabel>
                  <AuthorizationLetterUpload
                    id="weekend-sig"
                    file={letterFile}
                    onPickClick={() => letterInputRef.current?.click()}
                    onRemove={() => {
                      setLetterFile(null);
                      if (letterInputRef.current)
                        letterInputRef.current.value = '';
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Upload a close-up photo of the Dean&apos;s signature from
                    the authorisation memo. Enables automatic verification. PNG
                    or JPG only.
                  </p>
                </Field>

                {/* Hidden file input — triggered by AuthorizationLetterUpload */}
                <input
                  ref={stampInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="sr-only"
                  aria-hidden="true"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > LETTER_MAX_BYTES) {
                      setSubmitError('Stamp image must be 5 MB or smaller.');
                      e.target.value = '';
                      return;
                    }
                    setSubmitError(null);
                    setStampFile(file);
                  }}
                />

                <Field>
                  <FieldLabel htmlFor="weekend-stamp">
                    Dean&apos;s stamp{' '}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </FieldLabel>
                  <AuthorizationLetterUpload
                    id="weekend-stamp"
                    file={stampFile}
                    onPickClick={() => stampInputRef.current?.click()}
                    onRemove={() => {
                      setStampFile(null);
                      if (stampInputRef.current)
                        stampInputRef.current.value = '';
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Upload a close-up photo of the departmental stamp from the
                    authorisation memo. Enables automatic verification. PNG or
                    JPG only.
                  </p>
                </Field>
              </form>
            )}

            {/* Submitting */}
            {step === 'submitting' && (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Submitting request...
                </p>
              </div>
            )}

            {/* Pending HOD approval */}
            {step === 'pending_hod' && (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                  <CalendarIcon
                    className="size-10 text-amber-500"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-medium text-foreground">
                      Waiting for approval
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your request will be reviewed and you&apos;ll be notified
                      by email once a decision is made.
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

                  <Button variant="outline" size="sm" onClick={handleClose}>
                    Done
                  </Button>
                </CardContent>
              </Card>
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
