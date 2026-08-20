'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import {
  AlertCircleIcon,
  CalendarClockIcon,
  CheckCircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FileWarningIcon,
  IdCardIcon,
  MapPinIcon,
  RefreshCwIcon,
  XCircleIcon,
} from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { formatDateLong } from '@/lib/dates';
import {
  hodWeekendDecisionFormSchema,
  type HodWeekendDecisionFormInput,
} from '@/lib/validation/schemas';

import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { GuestBadge } from '@/components/smartkey/guest-badge';

type AvailableKey = { id: string; code: string; room_name: string };

type DecisionStatusData = {
  request_id: string;
  status:
    | 'PENDING_HOD'
    | 'APPROVED'
    | 'CODE_ISSUED'
    | 'KEY_ISSUED'
    | 'KEY_RETURNED'
    | 'EXPIRED'
    | 'DECLINED'
    | 'CANCELLED';
  decidable: boolean;
  is_guest: boolean;
  requested_for: string;
  requester_name: string | null;
  requested_room: string | null;
  id_document_type: string | null;
  id_document_number: string | null;
  key: { code: string; room_name: string } | null;
  available_keys: AvailableKey[];
  letter_url: string | null;
  stamp_url: string | null;
};

type DecideResponse = {
  request_id: string;
  status: 'APPROVED' | 'DECLINED' | 'HELD_SIGNATURE_MISMATCH';
  mismatches?: { signature?: number; stamp?: number };
};

type DeanDecisionViewProps = {
  token: string;
};

// Neither letter_url nor stamp_url carries a stored MIME type — only the
// upload's original extension survives, baked into the storage path. Strip
// the signed URL's query string before checking it.
const isPdfUrl = (url: string): boolean =>
  url.split('?')[0].toLowerCase().endsWith('.pdf');

const TERMINAL_COPY: Record<string, { title: string; body: string }> = {
  APPROVED: {
    title: 'Already approved',
    body: 'This request has already been approved.',
  },
  DECLINED: {
    title: 'Already declined',
    body: 'This request has already been declined.',
  },
  EXPIRED: {
    title: 'Request expired',
    body: 'This request is no longer active.',
  },
  CANCELLED: {
    title: 'Request cancelled',
    body: 'The requester cancelled this request.',
  },
};

export const DeanDecisionView = ({ token }: DeanDecisionViewProps) => {
  const [data, setData] = useState<DecisionStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const form = useForm<HodWeekendDecisionFormInput>({
    resolver: zodResolver(hodWeekendDecisionFormSchema),
    defaultValues: { note: '', key_id: '', is_guest: false },
  });
  const [submitting, setSubmitting] = useState<'APPROVED' | 'DECLINED' | null>(
    null
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<DecideResponse | null>(null);

  const fetchStatus = async () => {
    const res = await apiFetch<DecisionStatusData>(
      `/api/public/dean-decision/${token}`
    );
    setLoading(false);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.error || !res.data) {
      setFetchError(res.error ?? 'Could not load this request.');
      return;
    }
    form.reset({ note: '', key_id: '', is_guest: res.data.is_guest });
    setData(res.data);
  };

  useEffect(() => {
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleDecide = async (
    decision: 'APPROVED' | 'DECLINED',
    values: HodWeekendDecisionFormInput
  ) => {
    setSubmitting(decision);
    setSubmitError(null);
    const res = await apiFetch<DecideResponse>(
      `/api/public/dean-decision/${token}`,
      {
        method: 'POST',
        body: {
          decision,
          note: values.note?.trim() || undefined,
          ...(data?.is_guest && decision === 'APPROVED'
            ? { key_id: values.key_id }
            : {}),
        },
      }
    );
    setSubmitting(null);
    if (res.status === 409) {
      // Someone else (e.g. the dashboard) already decided it — refetch to
      // show the real terminal state instead of a generic error.
      await fetchStatus();
      return;
    }
    if (res.error || !res.data) {
      setSubmitError(res.error ?? 'Something went wrong. Please try again.');
      return;
    }
    setResult(res.data);
  };

  if (loading) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <StatusCard
        tone="neutral"
        icon={XCircleIcon}
        title="Link not found"
        body="This link is invalid. If you still need to decide on a request, use the SmartKey dashboard."
      />
    );
  }

  if (fetchError || !data) {
    return (
      <div
        className="w-full max-w-sm rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
        role="alert"
      >
        <AlertCircleIcon
          className="mx-auto size-8 text-destructive"
          aria-hidden="true"
        />
        <p className="mt-3 font-medium text-foreground">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {fetchError ?? 'Could not load this request.'}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void fetchStatus()}
        >
          <RefreshCwIcon className="size-3.5" aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  // Just decided, this turn

  if (result) {
    if (result.status === 'HELD_SIGNATURE_MISMATCH') {
      return (
        <StatusCard
          tone="warning"
          icon={FileWarningIcon}
          title="Held for review"
          body="The submitted signature or stamp didn't match the one on file. This has been held and the CSO has been notified to review it."
        />
      );
    }
    return (
      <StatusCard
        tone={result.status === 'APPROVED' ? 'success' : 'neutral'}
        icon={result.status === 'APPROVED' ? CheckCircleIcon : XCircleIcon}
        title={result.status === 'APPROVED' ? 'Approved' : 'Declined'}
        body={`${data.requester_name ?? 'The requester'} has been notified by email.`}
      />
    );
  }

  // Already decided/expired before this page loaded

  if (!data.decidable) {
    const copy = TERMINAL_COPY[data.status] ?? {
      title: 'No longer pending',
      body: 'This request can no longer be decided here.',
    };
    return (
      <StatusCard
        tone={data.status === 'APPROVED' ? 'success' : 'neutral'}
        icon={data.status === 'APPROVED' ? CheckCircleIcon : XCircleIcon}
        title={copy.title}
        body={copy.body}
      />
    );
  }

  return (
    <div className="w-full max-w-sm space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900 dark:bg-amber-950/30">
        <div className="flex items-center justify-center gap-2">
          <ClockIcon
            className="size-5 text-amber-700 dark:text-amber-400"
            aria-hidden="true"
          />
          <p className="font-medium text-foreground">Weekend access request</p>
        </div>
        <p className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-sm text-muted-foreground">
          {data.requester_name ??
            (data.is_guest ? 'A visitor' : 'A staff member')}
          {data.is_guest && <GuestBadge label="External" showIcon />}
          {data.key ? ` — ${data.key.room_name} (${data.key.code})` : ''}
        </p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <CalendarClockIcon className="size-4" aria-hidden="true" />
          {formatDateLong(data.requested_for)}
        </p>
      </div>

      {data.is_guest && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
          {data.requested_room && (
            <div className="flex items-center gap-2">
              <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Requested room:{' '}
                <span className="font-medium text-foreground">
                  {data.requested_room}
                </span>
              </span>
            </div>
          )}
          {data.id_document_type && data.id_document_number && (
            <div className="flex items-center gap-2">
              <IdCardIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">
                  {data.id_document_type}:
                </span>{' '}
                <span className="font-mono">{data.id_document_number}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {(data.letter_url || data.stamp_url) && (
        <div className="flex flex-col gap-2">
          {data.letter_url && (
            <Attachment className="w-full">
              <AttachmentMedia
                variant={isPdfUrl(data.letter_url) ? 'icon' : 'image'}
              >
                {isPdfUrl(data.letter_url) ? (
                  <FileTextIcon aria-hidden="true" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.letter_url}
                    alt="Uploaded authorisation letter"
                  />
                )}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>Authorisation letter</AttachmentTitle>
                <AttachmentDescription className="flex items-center gap-1">
                  Tap to view
                  <ExternalLinkIcon className="size-3" aria-hidden="true" />
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentTrigger asChild>
                <a
                  href={data.letter_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open uploaded authorisation letter"
                />
              </AttachmentTrigger>
            </Attachment>
          )}
          {data.stamp_url && (
            <Attachment className="w-full">
              <AttachmentMedia
                variant={isPdfUrl(data.stamp_url) ? 'icon' : 'image'}
              >
                {isPdfUrl(data.stamp_url) ? (
                  <FileTextIcon aria-hidden="true" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.stamp_url} alt="Uploaded departmental stamp" />
                )}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>Departmental stamp</AttachmentTitle>
                <AttachmentDescription className="flex items-center gap-1">
                  Tap to view
                  <ExternalLinkIcon className="size-3" aria-hidden="true" />
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentTrigger asChild>
                <a
                  href={data.stamp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open uploaded departmental stamp"
                />
              </AttachmentTrigger>
            </Attachment>
          )}
        </div>
      )}

      {data.is_guest && (
        <Controller
          name="key_id"
          control={form.control}
          render={({ field, fieldState }) => {
            const selectedKey = data.available_keys.find(
              (k) => k.id === field.value
            );
            return (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assign-key">
                  Assign a key (required to approve)
                </Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="assign-key"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  >
                    {selectedKey ? (
                      <span className="flex items-center gap-1.5 overflow-hidden">
                        <span className="shrink-0 font-mono font-medium">
                          {selectedKey.code}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          ·
                        </span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {selectedKey.room_name}
                        </span>
                      </span>
                    ) : (
                      <SelectValue placeholder="Select a key" />
                    )}
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {data.available_keys.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        <div className="flex w-full min-w-0 flex-col gap-0.5">
                          <span className="truncate font-mono text-sm font-medium">
                            {k.code}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {k.room_name}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {data.available_keys.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No keys available in this unit — use the SmartKey dashboard
                    instead.
                  </p>
                )}
                {fieldState.invalid && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldState.error?.message}
                  </p>
                )}
              </div>
            );
          }}
        />
      )}

      <Controller
        name="note"
        control={form.control}
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decision-note">Note (optional)</Label>
            <Textarea
              id="decision-note"
              placeholder="Add a note for the requester, e.g. a reason for declining"
              rows={5}
              className="max-h-40 resize-none overflow-y-auto text-sm"
              {...field}
            />
          </div>
        )}
      />

      {submitError && (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          onClick={form.handleSubmit((values) =>
            handleDecide('APPROVED', values)
          )}
          disabled={submitting !== null}
          aria-busy={submitting === 'APPROVED'}
          className="w-full"
        >
          {submitting === 'APPROVED' ? 'Approving…' : 'Approve'}
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleDecide('DECLINED', form.getValues())}
          disabled={submitting !== null}
          aria-busy={submitting === 'DECLINED'}
          className="w-full"
        >
          {submitting === 'DECLINED' ? 'Declining…' : 'Decline'}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        You can also review this from your SmartKey dashboard.
      </p>
    </div>
  );
};

type StatusTone = 'success' | 'warning' | 'error' | 'neutral';

const TONE_CLASSES: Record<
  StatusTone,
  { wrap: string; iconWrap: string; icon: string }
> = {
  success: {
    wrap: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
    iconWrap: 'bg-emerald-100 dark:bg-emerald-900/50',
    icon: 'text-emerald-700 dark:text-emerald-400',
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
    iconWrap: 'bg-amber-100 dark:bg-amber-900/50',
    icon: 'text-amber-700 dark:text-amber-400',
  },
  error: {
    wrap: 'border-destructive/30 bg-destructive/5',
    iconWrap: 'bg-destructive/10',
    icon: 'text-destructive',
  },
  neutral: {
    wrap: 'border-border bg-card',
    iconWrap: 'bg-muted',
    icon: 'text-muted-foreground',
  },
};

type StatusCardProps = {
  tone: StatusTone;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  body: string;
};

const StatusCard = ({ tone, icon: Icon, title, body }: StatusCardProps) => {
  const t = TONE_CLASSES[tone];
  return (
    <div
      className={`w-full max-w-sm rounded-lg border p-6 text-center ${t.wrap}`}
    >
      <div
        className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${t.iconWrap}`}
      >
        <Icon className={`size-6 ${t.icon}`} aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
};
