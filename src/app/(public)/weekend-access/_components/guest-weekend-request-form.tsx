'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CalendarCheckIcon,
  CheckCircleIcon,
  ClipboardCopyIcon,
  CloudUploadIcon,
  FileTextIcon,
  RefreshCwIcon,
} from 'lucide-react';

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
  guestWeekendRequestFormSchema,
  type GuestWeekendRequestFormInput,
} from '@/lib/validation/schemas';

// Types

type DepartmentOption = { id: string; name: string };

type GuestWeekendRequestFormProps = {
  departments: DepartmentOption[];
};

const MAX_LETTER_BYTES = 5 * 1024 * 1024;
const ACCEPTED_LETTER_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// Helpers

const todayIso = () => new Date().toISOString().slice(0, 10);

// Component

export const GuestWeekendRequestForm = ({
  departments,
}: GuestWeekendRequestFormProps) => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [letter, setLetter] = useState<File | null>(null);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<GuestWeekendRequestFormInput>({
    resolver: zodResolver(guestWeekendRequestFormSchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      id_document_type: undefined,
      id_document_number: '',
      requested_room: '',
      department_id: '',
      weekend_date: '',
    },
  });
  const { isSubmitting } = form.formState;

  const validateLetter = (file: File): string | null => {
    if (!ACCEPTED_LETTER_TYPES.includes(file.type)) {
      return 'Upload a PDF, JPG, or PNG file.';
    }
    if (file.size > MAX_LETTER_BYTES) {
      return 'File must be 5 MB or smaller.';
    }
    return null;
  };

  const handleLetterChange = (file: File | undefined) => {
    if (!file) return;
    const error = validateLetter(file);
    if (error) {
      setLetter(null);
      setLetterError(error);
      return;
    }
    setLetter(file);
    setLetterError(null);
  };

  const handleRemoveLetter = () => {
    setLetter(null);
    setLetterError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (values: GuestWeekendRequestFormInput) => {
    setSubmitError(null);
    if (!letter) {
      setLetterError('The Dean authorisation letter is required.');
      return;
    }

    const formData = new FormData();
    formData.append('full_name', values.full_name);
    formData.append('email', values.email);
    if (values.phone) formData.append('phone', values.phone);
    formData.append('id_document_type', values.id_document_type);
    formData.append('id_document_number', values.id_document_number);
    formData.append('requested_room', values.requested_room);
    formData.append('department_id', values.department_id);
    formData.append('weekend_date', values.weekend_date);
    formData.append(
      'return_deadline',
      new Date(`${values.weekend_date}T23:59:00`).toISOString()
    );
    formData.append('letter', letter);

    try {
      const res = await fetch('/api/public/weekend-request', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          (json as { error?: string }).error ??
            'Could not submit your request. Please try again.'
        );
        return;
      }
      const data = (json as { data?: { access_token: string } }).data;
      if (!data?.access_token) {
        setSubmitError('Unexpected server response. Please try again.');
        return;
      }
      setAccessToken(data.access_token);
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
    }
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
            <button
              type="button"
              onClick={handleCopyLink}
              aria-label="Copy status link to clipboard"
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ClipboardCopyIcon className="size-4" aria-hidden="true" />
            </button>
          </div>
          {copied && (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              Copied!
            </p>
          )}
        </div>

        <Button
          className="mt-4 w-full"
          onClick={() => router.push(`/weekend-access/${accessToken}`)}
        >
          View request status
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
                <SelectValue placeholder="Select an ID type..." />
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
        name="department_id"
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
                The HOD or CSO of this department will review your request.
              </p>
            )}
            {noDepartments && (
              <p className="text-xs text-destructive" role="alert">
                We could not load faculties and groups. Refresh the page, or
                contact the CSO if this persists.
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

      {/* Letter upload */}
      <Field data-invalid={!!letterError}>
        <FieldLabel htmlFor="guest-letter-trigger">
          Dean authorisation letter
        </FieldLabel>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="sr-only"
          aria-label="Dean authorisation letter file"
          onChange={(e) => handleLetterChange(e.target.files?.[0])}
        />
        {!letter ? (
          <button
            id="guest-letter-trigger"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CloudUploadIcon
              className="size-7 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Click to upload the signed letter
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                PDF, PNG, or JPG · max 5 MB
              </p>
            </div>
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileTextIcon
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="truncate text-sm text-foreground">
                {letter.name}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRemoveLetter}
              className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <RefreshCwIcon className="size-3.5" aria-hidden="true" />
              Replace
            </button>
          </div>
        )}
        {letterError && (
          <p className="text-xs text-destructive" role="alert">
            {letterError}
          </p>
        )}
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
        <CalendarCheckIcon className="size-4" aria-hidden="true" />
        {isSubmitting ? 'Submitting...' : 'Request weekend access'}
      </Button>
    </form>
  );
};
