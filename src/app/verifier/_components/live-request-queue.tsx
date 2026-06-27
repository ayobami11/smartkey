'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { InboxIcon, KeyRoundIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RiskAcknowledgement,
  RiskTierBadge,
} from '@/components/smartkey/risk-tier-badge';
import { useRealtime } from '@/hooks/use-realtime';
import { apiFetch } from '@/lib/api';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  issueKeyFormSchema,
  type IssueKeyFormInput,
} from '@/lib/validation/schemas';
import type { RiskFactor, RiskTier } from '@/lib/ai/risk/types';

// Types

type QueueRequest = {
  id: string;
  type: 'WEEKDAY' | 'WEEKEND';
  status: 'CODE_ISSUED';
  requested_for: string;
  risk_tier: RiskTier;
  risk_factors: RiskFactor[];
  created_at: string;
  requester: { id: string; full_name: string; photo_url: string | null } | null;
  guest: { id: string; full_name: string } | null;
  key: { id: string; code: string; room_name: string; zone: string } | null;
};

type IssueResult = {
  request_id: string;
  // For an external (non-registered) guest, `is_guest` is true and the requester
  // block carries the declared ID document instead of a passport photo, so the
  // desk verifies the physical ID.
  is_guest: boolean;
  requester: {
    full_name: string | null;
    photo_url: string | null;
    id_document_type?: string | null;
    id_document_number?: string | null;
  };
  key: {
    code: string | null;
    room_name: string | null;
    key_count?: number | null;
  };
  issued_at: string;
};

type SheetStep = 'code' | 'success';

// Helpers

const relativeTime = (iso: string) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff === 1) return '1 min ago';
  return `${diff} min ago`;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

// Component

export const LiveRequestQueue = () => {
  const status = useConnectionStatus();
  const isOffline = status === 'offline';
  const [requests, setRequests] = useState<QueueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const issueForm = useForm<IssueKeyFormInput>({
    resolver: zodResolver(issueKeyFormSchema),
    defaultValues: { verification_code: '' },
  });

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<SheetStep>('code');
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueResult, setIssueResult] = useState<IssueResult | null>(null);
  // The queue card that triggered the sheet (for context in code step)
  const [contextRequest, setContextRequest] = useState<QueueRequest | null>(
    null
  );
  const [acknowledged, setAcknowledged] = useState(false);

  // Init

  const fetchQueue = async () => {
    const result = await apiFetch<{ requests: QueueRequest[] }>(
      '/api/requests/live-queue'
    );
    setLoading(false);
    if (result.error) {
      setFetchError(result.error);
      return;
    }
    setRequests(result.data?.requests ?? []);
  };

  const fetchSingleRequest = async (id: string, mode: 'prepend' | 'upsert') => {
    const result = await apiFetch<{ request: QueueRequest }>(
      `/api/requests/live-queue?id=${id}`
    );
    const item = result.data?.request;
    if (!item) return;
    setRequests((prev) => {
      const without = prev.filter((r) => r.id !== item.id);
      return mode === 'prepend' ? [item, ...without] : [...without, item];
    });
  };

  useEffect(() => {
    void apiFetch<{ requests: QueueRequest[] }>(
      '/api/requests/live-queue'
    ).then((result) => {
      setLoading(false);
      if (result.error) {
        setFetchError(result.error);
        return;
      }
      setRequests(result.data?.requests ?? []);
    });
  }, []);

  useRealtime<{ id: string; status: string }>({
    table: 'requests',
    onInsert: (payload) => {
      const row = payload.new as { id: string; status: string };
      if (row.status === 'CODE_ISSUED') fetchSingleRequest(row.id, 'prepend');
    },
    onUpdate: (payload) => {
      const row = payload.new as { id: string; status: string };
      if (row.status === 'CODE_ISSUED') {
        fetchSingleRequest(row.id, 'upsert');
      } else {
        setRequests((prev) => prev.filter((r) => r.id !== row.id));
      }
    },
  });

  // Sheet helpers

  const openSheet = (req?: QueueRequest) => {
    setContextRequest(req ?? null);
    issueForm.reset();
    setSheetStep('code');
    setIssueError(null);
    setIssueResult(null);
    setIssuing(false);
    setAcknowledged(false);
    setSheetOpen(true);
  };

  const handleSheetClose = () => {
    setSheetOpen(false);
    setContextRequest(null);
    issueForm.reset();
    setSheetStep('code');
    setIssueError(null);
    setIssueResult(null);
    setIssuing(false);
    setAcknowledged(false);
  };

  const handleIssue = issueForm.handleSubmit(async (values) => {
    setIssuing(true);
    setIssueError(null);
    const result = await apiFetch<IssueResult>('/api/requests/collect', {
      method: 'POST',
      body: { code: values.verification_code },
    });
    setIssuing(false);
    if (result.error) {
      const msg =
        result.status === 404
          ? 'Code not recognised or expired. Ask the requester to verify, or request a new code.'
          : result.error;
      setIssueError(msg);
      return;
    }
    if (!result.data) {
      setIssueError('Unexpected response from server. Please try again.');
      return;
    }
    setIssueResult(result.data);
    issueForm.reset();
    setRequests((prev) => prev.filter((r) => r.id !== result.data!.request_id));
    setSheetStep('success');
  });

  // Render

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">
        Pending requests
      </h2>

      {/* Loading */}
      {loading && (
        <div
          className="flex flex-col gap-3"
          aria-busy="true"
          aria-label="Loading pending requests"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && fetchError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          <p className="font-medium">Failed to load queue</p>
          <p className="mt-1 text-destructive/80">{fetchError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => {
              setLoading(true);
              setFetchError(null);
              void fetchQueue();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !fetchError && requests.length === 0 && (
        <Empty className="border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No pending requests</EmptyTitle>
            <EmptyDescription>
              New ones will appear here as they arrive.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Queue cards */}
      {!loading && !fetchError && requests.length > 0 && (
        <div className="flex flex-col gap-3" aria-live="polite">
          {requests.map((req) => {
            const stripeClass =
              req.risk_tier === 'HIGH'
                ? 'bg-destructive'
                : req.risk_tier === 'MEDIUM'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500';
            return (
              <div
                key={req.id}
                className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div
                  className={`w-1 shrink-0 ${stripeClass}`}
                  aria-hidden="true"
                />
                <div className="flex flex-1 items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {req.key?.code ?? '—'}
                      </span>
                      <RiskTierBadge
                        tier={req.risk_tier}
                        factors={req.risk_factors}
                      />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Requested by:
                      </span>{' '}
                      {req.requester?.full_name ?? req.guest?.full_name ?? '—'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {req.key?.room_name ?? ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {relativeTime(req.created_at)}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openSheet(req)}
                          disabled={isOffline}
                          aria-label={`Issue key for ${req.requester?.full_name ?? req.guest?.full_name ?? 'requester'}`}
                          className={
                            isOffline ? 'pointer-events-none' : undefined
                          }
                        >
                          Issue
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
              </div>
            );
          })}
        </div>
      )}

      {/* Issue Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) handleSheetClose();
        }}
      >
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle className="text-lg">Issue a key</SheetTitle>
            <SheetDescription className="text-base">
              {sheetStep === 'code'
                ? 'Ask the requester for the 6-digit code from their email.'
                : 'Key issued successfully.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-y-auto p-6">
            {/* Context card (if opened from queue card) */}
            {sheetStep === 'code' && contextRequest && (
              <div className="mb-6 rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <KeyRoundIcon
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  Request context
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">
                    {contextRequest.requester?.full_name ??
                      contextRequest.guest?.full_name ??
                      '—'}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {contextRequest.key?.code} · {contextRequest.key?.room_name}
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    <RiskTierBadge
                      tier={contextRequest.risk_tier}
                      factors={contextRequest.risk_factors}
                    />
                    {contextRequest.risk_tier === 'HIGH' && (
                      <RiskAcknowledgement
                        acknowledged={acknowledged}
                        onAcknowledge={setAcknowledged}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Code entry step */}
            {sheetStep === 'code' && (
              <div className="flex flex-col items-center gap-6">
                <Controller
                  name="verification_code"
                  control={issueForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <div className="flex flex-col items-start gap-3">
                        <FieldLabel htmlFor="verification-code-input">
                          Verification code
                        </FieldLabel>
                        <InputOTP
                          id="verification-code-input"
                          maxLength={6}
                          pattern={REGEXP_ONLY_DIGITS}
                          value={field.value}
                          onChange={field.onChange}
                          disabled={issuing}
                          autoComplete="one-time-code"
                          aria-label="Verification code"
                          aria-invalid={fieldState.invalid}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot
                              index={0}
                              className="size-12 text-base font-mono"
                            />
                            <InputOTPSlot
                              index={1}
                              className="size-12 text-base font-mono"
                            />
                            <InputOTPSlot
                              index={2}
                              className="size-12 text-base font-mono"
                            />
                            <InputOTPSlot
                              index={3}
                              className="size-12 text-base font-mono"
                            />
                            <InputOTPSlot
                              index={4}
                              className="size-12 text-base font-mono"
                            />
                            <InputOTPSlot
                              index={5}
                              className="size-12 text-base font-mono"
                            />
                          </InputOTPGroup>
                        </InputOTP>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </div>
                    </Field>
                  )}
                />

                {issueError && (
                  <p
                    className="text-center text-xs text-destructive"
                    role="alert"
                  >
                    {issueError}
                  </p>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full">
                      <Button
                        className="w-full"
                        disabled={
                          isOffline ||
                          issuing ||
                          (contextRequest?.risk_tier === 'HIGH' &&
                            !acknowledged)
                        }
                        onClick={handleIssue}
                        aria-busy={issuing}
                        style={
                          isOffline ? { pointerEvents: 'none' } : undefined
                        }
                      >
                        {issuing ? 'Issuing...' : 'Issue key'}
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

            {/* Success step */}
            {sheetStep === 'success' && issueResult && (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                  <KeyRoundIcon
                    className="size-10 text-emerald-500"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-medium text-foreground">Key issued</p>
                    {issueResult.key.code && issueResult.key.room_name && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {issueResult.key.code} · {issueResult.key.room_name}
                      </p>
                    )}
                    {(issueResult.key.key_count ?? 1) > 1 && (
                      <p className="mt-1 text-sm font-medium text-foreground">
                        Keys on bunch: {issueResult.key.key_count}
                      </p>
                    )}
                    {!issueResult.is_guest &&
                      issueResult.requester.full_name && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Issued to{' '}
                          <span className="font-medium text-foreground">
                            {issueResult.requester.full_name}
                          </span>{' '}
                          at{' '}
                          <span className="font-medium text-foreground">
                            {formatTime(issueResult.issued_at)}
                          </span>
                        </p>
                      )}
                    {issueResult.is_guest && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Issued at{' '}
                        <span className="font-medium text-foreground">
                          {formatTime(issueResult.issued_at)}
                        </span>
                      </p>
                    )}
                  </div>
                  {issueResult.is_guest && issueResult.requester.full_name && (
                    <p
                      className="text-sm text-amber-600 dark:text-amber-400"
                      role="status"
                    >
                      {issueResult.requester.full_name}
                      {issueResult.requester.id_document_type &&
                        issueResult.requester.id_document_number && (
                          <span className="font-mono">
                            {' '}
                            · {issueResult.requester.id_document_type}{' '}
                            {issueResult.requester.id_document_number}
                          </span>
                        )}{' '}
                      — verify physical ID
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSheetClose}
                  >
                    Done
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
};
