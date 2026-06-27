'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  FileTextIcon,
  IdCardIcon,
  InboxIcon,
  KeyRoundIcon,
  MapPinIcon,
  UserRoundIcon,
  XCircleIcon,
} from 'lucide-react';

import { useRealtime } from '@/hooks/use-realtime';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { RiskTierBadge } from '@/components/smartkey/risk-tier-badge';
import type { RiskTier } from '@/lib/ai/risk/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyHeader,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
  hodWeekendDecisionFormSchema,
  type HodWeekendDecisionFormInput,
} from '@/lib/validation/schemas';

// Types

type Requester = {
  id: string;
  full_name: string;
  institutional_email: string;
} | null;

type Guest = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  id_document_type: string;
  id_document_number: string;
} | null;

type PendingRequest = {
  id: string;
  requester: Requester;
  guest: Guest;
  key: {
    id: string;
    code: string;
    room_name: string;
    zone: string;
  } | null;
  requested_for: string;
  created_at: string;
  type: 'WEEKDAY' | 'WEEKEND';
  risk_tier: string;
  letter_url: string | null;
  requested_room: string | null;
  requested_unit_id: string | null;
};

type DeptKey = { id: string; code: string; room_name: string };

// Helpers

const relativeTime = (iso: string) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const displayName = (req: PendingRequest) =>
  req.guest?.full_name ?? req.requester?.full_name ?? 'Unknown requester';

const initials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// Component

export const WeekendRequestsView = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();
  const isOffline = connectionStatus === 'offline';
  const [selected, setSelected] = useState<PendingRequest | null>(null);
  const form = useForm<HodWeekendDecisionFormInput>({
    resolver: zodResolver(hodWeekendDecisionFormSchema),
    defaultValues: { note: '', key_id: '', is_guest: false },
  });
  const [decision, setDecision] = useState<'approved' | 'declined' | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());

  // Letter preview
  const [letterUrl, setLetterUrl] = useState<string | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);

  // The CSO's administrative keys, for assigning a key to a guest request.
  const [deptKeys, setDeptKeys] = useState<DeptKey[]>([]);

  const {
    data: pendingRequests = [],
    isLoading: loading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['cso', 'requests', 'pending-weekend'],
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const supabase = createBrowserClient();

      // Fetch Administration dept IDs (authoriser='CSO') first
      const { data: adminDepts } = await supabase
        .from('units')
        .select('id')
        .eq('authoriser', 'CSO');

      const adminDeptIds = new Set(
        ((adminDepts ?? []) as { id: string }[]).map((d) => d.id)
      );

      // Fetch all PENDING_HOD WEEKEND requests with join data
      const { data, error } = await supabase
        .from('requests')
        .select(
          `id, requested_for, created_at, type, risk_tier, letter_url,
           requested_room, requested_unit_id, key_id,
           requester:profiles!requester_id(id, full_name, institutional_email),
           guest:guest_requesters!guest_id(id, full_name, email, phone, id_document_type, id_document_number),
           key:keys!key_id(id, code, room_name, zone, unit_id)`
        )
        .eq('type', 'WEEKEND')
        .eq('status', 'PENDING_HOD')
        .order('created_at', { ascending: false });

      if (error) throw new Error('Failed to load requests.');

      // Keep only requests that belong to Administration:
      // - Registered request: key.department_id is an admin dept
      // - Guest request (key_id null): requested_unit_id is an admin dept
      return ((data ?? []) as Record<string, unknown>[])
        .filter((req) => {
          const key = req.key as { unit_id: string } | null;
          if (key?.unit_id) return adminDeptIds.has(key.unit_id);
          return req.requested_unit_id
            ? adminDeptIds.has(req.requested_unit_id as string)
            : false;
        })
        .map(
          (req) =>
            ({
              id: req.id,
              requester: req.requester ?? null,
              guest: req.guest ?? null,
              key: req.key
                ? {
                    id: (req.key as Record<string, unknown>).id,
                    code: (req.key as Record<string, unknown>).code,
                    room_name: (req.key as Record<string, unknown>).room_name,
                    zone: (req.key as Record<string, unknown>).zone,
                  }
                : null,
              requested_for: req.requested_for,
              created_at: req.created_at,
              type: req.type,
              risk_tier: req.risk_tier,
              letter_url: req.letter_url,
              requested_room: req.requested_room,
              requested_unit_id: req.requested_unit_id,
            }) as PendingRequest
        );
    },
  });

  // Load the CSO's administrative keys once, for the guest key picker.
  useEffect(() => {
    const supabase = createBrowserClient();
    const loadKeys = async () => {
      const { data, error } = await supabase
        .from('keys')
        .select(
          'id, code, room_name, status, department:units!unit_id(authoriser)'
        )
        .order('code', { ascending: true });

      if (!error && data) {
        setDeptKeys(
          (
            data as unknown as Array<{
              id: string;
              code: string;
              room_name: string;
              status: string;
              department: { authoriser: string } | null;
            }>
          )
            .filter(
              (k) =>
                k.status !== 'RETIRED' && k.department?.authoriser === 'CSO'
            )
            .map((k) => ({
              id: k.id,
              code: k.code,
              room_name: k.room_name,
            }))
        );
      }
    };
    void loadKeys();
  }, []);

  useRealtime({
    table: 'requests',
    filter: { column: 'type', value: 'WEEKEND' },
    onInsert: () =>
      queryClient.invalidateQueries({
        queryKey: ['requests', 'pending-weekend'],
      }),
    onUpdate: () =>
      queryClient.invalidateQueries({
        queryKey: ['requests', 'pending-weekend'],
      }),
  });

  const handleSelect = (req: PendingRequest) => {
    setSelected(req);
    form.reset({ note: '', key_id: '', is_guest: !!req.guest });
    setLetterUrl(null);
  };

  const handleClose = () => {
    setSelected(null);
    form.reset({ note: '', key_id: '', is_guest: false });
    setDecision(null);
    setSubmitError(null);
    setSubmitting(false);
    setLetterUrl(null);
  };

  const handleViewLetter = async (requestId: string) => {
    setLetterLoading(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/letter`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          (json as { error?: string }).error ?? 'Could not open the letter.'
        );
        return;
      }
      const url = (json as { data?: { url: string } }).data?.url;
      if (url) {
        setLetterUrl(url);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setSubmitError('Network error. Could not open the letter.');
    } finally {
      setLetterLoading(false);
    }
  };

  const handleDecision = async (
    choice: 'APPROVED' | 'DECLINED',
    values: HodWeekendDecisionFormInput
  ) => {
    if (!selected) return;
    const isGuest = !!selected.guest;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/requests/hod-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: selected.id,
          decision: choice,
          note: values.note?.trim() || undefined,
          ...(choice === 'APPROVED' && isGuest
            ? { key_id: values.key_id }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(
          (json as { error?: string }).error ?? 'Something went wrong.'
        );
        return;
      }
      setDecision(choice === 'APPROVED' ? 'approved' : 'declined');
      setDecidedIds((prev) => new Set(prev).add(selected.id));
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const visibleRequests = pendingRequests.filter((r) => !decidedIds.has(r.id));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Weekend Requests
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Review and decide weekend access requests for Administration keys.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {/* Fetch error */}
      {!loading && fetchError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive">
            {fetchError.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !fetchError && visibleRequests.length === 0 && (
        <Empty className="flex-none border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No pending requests</EmptyTitle>
            <EmptyDescription>
              Weekend requests appear here when staff or visitors submit them.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Request list */}
      {!loading && !fetchError && visibleRequests.length > 0 && (
        <div className="flex flex-col gap-3">
          {visibleRequests.map((req) => {
            const isGuest = !!req.guest;
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {req.key?.code ?? 'Key on approval'}
                      </span>
                      {isGuest && <ExternalBadge />}
                      <RiskTierBadge
                        tier={req.risk_tier as RiskTier}
                        factors={[]}
                      />
                      <span className="text-xs text-muted-foreground">
                        &middot; {relativeTime(req.created_at)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Requested by:
                      </span>{' '}
                      {displayName(req)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">For:</span>{' '}
                      {formatDate(req.requested_for)}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelect(req)}
                          disabled={isOffline}
                          aria-label={`Review weekend request from ${displayName(req)}`}
                          className={
                            isOffline ? 'pointer-events-none' : undefined
                          }
                        >
                          Review
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

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle className="flex items-center gap-2 text-lg">
              Weekend access request
              {selected?.guest && <ExternalBadge />}
            </SheetTitle>
          </SheetHeader>

          {selected && (
            <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
              {decision ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                    {decision === 'approved' ? (
                      <>
                        <CheckCircleIcon
                          className="size-10 text-emerald-500"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium text-foreground">
                            Approved.
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {displayName(selected)} has been notified by email.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <XCircleIcon
                          className="size-10 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium text-foreground">
                            Declined.
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {displayName(selected)} has been notified.
                          </p>
                        </div>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={handleClose}>
                      Done
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Requester / guest */}
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {initials(displayName(selected))}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {displayName(selected)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selected.guest?.email ??
                          selected.requester?.institutional_email ??
                          ''}{' '}
                        · Submitted {relativeTime(selected.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Guest identity + letter */}
                  {selected.guest && (
                    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <UserRoundIcon
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        External requester
                      </div>
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <IdCardIcon
                          className="mt-0.5 size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          <span className="font-medium text-foreground">
                            {selected.guest.id_document_type}:
                          </span>{' '}
                          <span className="font-mono">
                            {selected.guest.id_document_number}
                          </span>
                        </span>
                      </div>
                      {selected.guest.phone && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            Phone:
                          </span>{' '}
                          {selected.guest.phone}
                        </p>
                      )}
                      {selected.letter_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-fit"
                          onClick={() => handleViewLetter(selected.id)}
                          disabled={letterLoading}
                          aria-busy={letterLoading}
                        >
                          <FileTextIcon
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          {letterLoading
                            ? 'Opening...'
                            : letterUrl
                              ? 'Letter opened'
                              : 'View authorisation letter'}
                          <ExternalLinkIcon
                            className="size-3"
                            aria-hidden="true"
                          />
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Request details */}
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
                    {selected.key ? (
                      <div className="flex items-center gap-2 text-xs">
                        <KeyRoundIcon
                          className="size-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span className="font-medium text-foreground">
                          <code className="font-mono">{selected.key.code}</code>{' '}
                          — {selected.key.room_name}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No key assigned yet. Choose one below to authorise this
                        request.
                      </p>
                    )}
                    {selected.requested_room && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPinIcon
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          Requested Room:{' '}
                          <span className="font-medium text-foreground">
                            {selected.requested_room}
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarIcon
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {formatDate(selected.requested_for)}
                    </div>
                  </div>

                  {/* Key picker — guest requests must have a key chosen */}
                  {selected.guest && (
                    <Controller
                      name="key_id"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="assign-key" className="text-xs">
                            Assign a key
                          </Label>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              id="assign-key"
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue placeholder="Select an administration key..." />
                            </SelectTrigger>
                            <SelectContent>
                              {deptKeys.map((k) => (
                                <SelectItem key={k.id} value={k.id}>
                                  <span className="font-mono">{k.code}</span>
                                  <span className="ml-2 text-muted-foreground">
                                    — {k.room_name}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {deptKeys.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              No administrative keys available.
                            </p>
                          )}
                          {fieldState.invalid && (
                            <p
                              className="text-xs text-destructive"
                              role="alert"
                            >
                              {fieldState.error?.message}
                            </p>
                          )}
                        </div>
                      )}
                    />
                  )}

                  {/* High-risk warning */}
                  {selected.risk_tier === 'HIGH' && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <AlertTriangleIcon
                        className="mt-0.5 size-4 shrink-0 text-amber-600"
                        aria-hidden="true"
                      />
                      <p className="text-xs text-amber-800">
                        This request has been flagged as high risk by the
                        system. Review carefully before approving.
                      </p>
                    </div>
                  )}

                  {submitError && (
                    <p className="text-sm text-destructive" role="alert">
                      {submitError}
                    </p>
                  )}

                  {/* Note */}
                  <Controller
                    name="note"
                    control={form.control}
                    render={({ field }) => (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="hod-note" className="text-xs">
                          Note to requester{' '}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </Label>
                        <Textarea
                          id="hod-note"
                          placeholder="Included in the notification email..."
                          rows={3}
                          className="resize-none text-sm"
                          {...field}
                        />
                      </div>
                    )}
                  />

                  {/* Decision buttons */}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      className="h-auto flex-1 px-4 py-2.5"
                      disabled={submitting || isOffline}
                      aria-busy={submitting}
                      onClick={form.handleSubmit((values) =>
                        handleDecision('APPROVED', values)
                      )}
                    >
                      {submitting ? 'Submitting...' : 'Approve'}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto flex-1 px-4 py-2.5 border-destructive text-destructive hover:bg-destructive/5 hover:text-destructive"
                      disabled={submitting || isOffline}
                      onClick={() =>
                        handleDecision('DECLINED', form.getValues())
                      }
                    >
                      Decline
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

// Sub-components

const ExternalBadge = () => (
  <span
    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
    aria-label="External requester"
  >
    <UserRoundIcon className="size-3" aria-hidden="true" />
    External
  </span>
);
