'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircleIcon, CheckIcon, CopyIcon } from 'lucide-react';

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
  ID_DOCUMENT_TYPES,
  LETTER_ACCEPTED_MIME_TYPES,
  guestWeekendRequestFormSchema,
  type GuestWeekendRequestFormInput,
} from '@/lib/validation/schemas';
import { apiFetch } from '@/lib/api';
import { AuthorizationLetterUpload } from '@/app/(public)/weekend-access/_components/authorization-letter-upload';

// Types

type DepartmentOption = { id: string; name: string };

type GuestWeekendRequestFormProps = {
  departments: DepartmentOption[];
};

// Helpers

const todayIso = () => new Date().toISOString().slice(0, 10);

// Component

export const GuestWeekendRequestForm = ({
  departments,
}: GuestWeekendRequestFormProps) => {
  const router = useRouter();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const letterInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<GuestWeekendRequestFormInput>({
    resolver: zodResolver(guestWeekendRequestFormSchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      id_document_type: undefined,
      id_document_number: '',
      requested_room: '',
      unit_id: '',
      weekend_date: '',
    },
  });
  const { isSubmitting } = form.formState;

  const { ref: letterRegRef, ...letterRegProps } = form.register('letter');
  const letterFiles = form.watch('letter') as FileList | undefined;
  const letterFile = letterFiles?.[0] ?? null;

  const handleSubmit = async (values: GuestWeekendRequestFormInput) => {
    setSubmitError(null);

    const formData = new FormData();
    formData.append('full_name', values.full_name);
    formData.append('email', values.email);
    if (values.phone) formData.append('phone', values.phone);
    formData.append('id_document_type', values.id_document_type);
    formData.append('id_document_number', values.id_document_number);
    formData.append('requested_room', values.requested_room);
    formData.append('department_id', values.unit_id);
    formData.append('weekend_date', values.weekend_date);
    formData.append(
      'return_deadline',
      new Date(`${values.weekend_date}T23:59:00`).toISOString()
    );
    formData.append('letter', (values.letter as FileList)[0]);

    const result = await apiFetch<{ access_token: string }>(
      '/api/public/weekend-request',
      { method: 'POST', body: formData }
    );
    if (result.error || !result.data) {
      setSubmitError(
        result.error ?? 'Could not submit your request. Please try again.'
      );
      return;
    }
    setAccessToken(result.data.access_token);
  };

  // Success confirmation

  if (accessToken) {
    const statusUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/weekend-access/${accessToken}`;

    const handleCopyLink = async () => {
      await navigator.clipboard.writeText(statusUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
          <CheckCircleIcon
            className="size-6 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
        </div>
        <h2 className="text-center text-lg font-semibold text-foreground">
          Request submitted
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          We&apos;ve emailed you a link to track your request. You can also save
          or copy it below — you&apos;ll need it to collect your code on the
          day.
        </p>

        {/* Status link — copyable fallback in case email is delayed */}
        <div className="mt-4 rounded-md border border-emerald-200 bg-white p-3 dark:border-emerald-800 dark:bg-emerald-950/50">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Your status link
          </p>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
              {statusUrl}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCopyLink}
              aria-label="Copy status link to clipboard"
              className="shrink-0 size-7 text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <CheckIcon className="size-4" aria-hidden="true" />
              ) : (
                <CopyIcon className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          {copied && (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              Copied!
            </p>
          )}
        </div>

        <Button className="mt-4 w-full" asChild>
          <Link
            href={`/weekend-access/${accessToken}`}
            className="w-full"
            target="_blank"
          >
            View request status
          </Link>
        </Button>
      </div>
    );
  }

  // Empty state — no departments could be loaded

  const noDepartments = departments.length === 0;

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
    >
      <Controller
        name="full_name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="guest-full-name">Full name</FieldLabel>
            <Input
              id="guest-full-name"
              autoComplete="name"
              aria-invalid={fieldState.invalid}
              {...field}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="guest-email">Email</FieldLabel>
            <Input
              id="guest-email"
              type="email"
              autoComplete="email"
              aria-invalid={fieldState.invalid}
              {...field}
            />
            {!fieldState.error && (
              <p className="text-xs text-muted-foreground">
                Your status link and code are sent here.
              </p>
            )}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="phone"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="guest-phone">
              Phone{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </FieldLabel>
            <Input
              id="guest-phone"
              type="tel"
              autoComplete="tel"
              aria-invalid={fieldState.invalid}
              {...field}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="id_document_type"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="guest-id-type">ID document type</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="guest-id-type"
                aria-invalid={fieldState.invalid}
              >
                <SelectValue placeholder="Select an ID type" />
              </SelectTrigger>
              <SelectContent>
                {ID_DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!fieldState.error && (
              <p className="text-xs text-muted-foreground">
                Bring this document to the desk so the officer can verify your
                identity.
              </p>
            )}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="id_document_number"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="guest-id-number">
              ID document number
            </FieldLabel>
            <Input
              id="guest-id-number"
              aria-invalid={fieldState.invalid}
              {...field}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="requested_room"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="guest-requested-room">
              Requested Room
            </FieldLabel>
            <Input
              id="guest-requested-room"
              placeholder="e.g. Lab 102, Server Room"
              aria-invalid={fieldState.invalid}
              {...field}
            />
            {!fieldState.error && (
              <p className="text-xs text-muted-foreground">
                Enter the name or number of the room you need access to.
              </p>
            )}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="unit_id"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="guest-department">Unit</FieldLabel>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={noDepartments}
            >
              <SelectTrigger
                id="guest-department"
                aria-invalid={fieldState.invalid}
              >
                <SelectValue
                  placeholder={
                    noDepartments ? 'No units available' : 'Select a unit'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!fieldState.error && !noDepartments && (
              <p className="text-xs text-muted-foreground">
                The head of this unit will review your request.
              </p>
            )}
            {noDepartments && (
              <p className="text-xs text-destructive" role="alert">
                We could not load units. Refresh the page, or contact the CSO if
                this persists.
              </p>
            )}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="weekend_date"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="guest-weekend-date">Weekend date</FieldLabel>
            <Input
              id="guest-weekend-date"
              type="date"
              min={todayIso()}
              aria-invalid={fieldState.invalid}
              {...field}
            />
            {!fieldState.error && (
              <p className="text-xs text-muted-foreground">
                Choose the Saturday or Sunday you need access.
              </p>
            )}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      {/* Letter upload — native file input registered with RHF; UI is presentational */}
      <input
        type="file"
        className="sr-only"
        accept={LETTER_ACCEPTED_MIME_TYPES.join(',')}
        aria-label="Authorization letter file"
        {...letterRegProps}
        ref={(el) => {
          letterRegRef(el);
          letterInputRef.current = el;
        }}
      />
      <Field data-invalid={!!form.formState.errors.letter}>
        <FieldLabel htmlFor="guest-letter-trigger">
          Authorization letter
        </FieldLabel>
        <AuthorizationLetterUpload
          id="guest-letter-trigger"
          file={letterFile}
          onPickClick={() => letterInputRef.current?.click()}
          onRemove={() => {
            form.setValue('letter', undefined as unknown as FileList, {
              shouldValidate: true,
            });
            if (letterInputRef.current) letterInputRef.current.value = '';
          }}
          error={
            form.formState.errors.letter as { message?: string } | undefined
          }
          invalid={!!form.formState.errors.letter}
        />
      </Field>

      {submitError && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <p>{submitError}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting || noDepartments}
        aria-busy={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? 'Submitting...' : 'Request weekend access'}
      </Button>
    </form>
  );
};
