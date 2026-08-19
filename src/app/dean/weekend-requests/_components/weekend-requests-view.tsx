'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import {
  AlertTriangleIcon,
  ArchiveIcon,
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
import { GuestBadge } from '@/components/smartkey/guest-badge';
import { ExpiredBadge } from '@/components/smartkey/expired-badge';
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
import { apiFetch } from '@/lib/api';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  hodWeekendDecisionFormSchema,
  type HodWeekendDecisionFormInput,
} from '@/lib/validation/schemas';
import {
  formatDate,
  isPastDate,
  relativeTimeCompact as relativeTime,
} from '@/lib/dates';

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
  stamp_url: string | null;
  requested_room: string | null;
  requested_unit_id: string | null;
};

type DeptKey = { id: string; code: string; room_name: string };

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
  const [decision, setDecision] = useState<
    'approved' | 'declined' | 'held' | 'dismissed' | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Letter / stamp preview
  const [letterUrl, setLetterUrl] = useState<string | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [stampLoading, setStampLoading] = useState(false);

  // The HOD's department keys, for assigning a key to a guest request.
  const [deptKeys, setDeptKeys] = useState<DeptKey[]>([]);

  const {
    data: pendingRequests = [],
    isLoading: loading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['requests', 'pending-weekend'],
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const result = await apiFetch<{ requests: PendingRequest[] }>(
        '/api/requests/pending'
      );
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load requests.');
      return result.data.requests ?? [];
    },
  });

  // Load the HOD's department keys once, for the guest key picker.
  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('unit_id')
        .eq('id', user.id)
        .single();
      const deptId = (profile as { unit_id: string | null } | null)?.unit_id;
      if (!deptId) return;
      const { data } = await supabase
        .from('keys')
        .select('id, code, room_name, status')
        .eq('unit_id', deptId)
        .order('code', { ascending: true });
      setDeptKeys(
        ((data ?? []) as DeptKey[] & { status?: string }[]).filter(
          (k) => (k as { status?: string }).status !== 'RETIRED'
        )
      );
    });
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
    setStampUrl(null);
  };

  const handleClose = () => {
    setSelected(null);
    form.reset({ note: '', key_id: '', is_guest: false });
    setDecision(null);
    setSubmitError(null);
    setSubmitting(false);
    setLetterUrl(null);
    setStampUrl(null);
  };

  const handleViewLetter = async (
    requestId: string,
    type: 'letter' | 'stamp' = 'letter'
  ) => {
    const setLoading = type === 'stamp' ? setStampLoading : setLetterLoading;
    const setUrl = type === 'stamp' ? setStampUrl : setLetterUrl;
    setLoading(true);
    const result = await apiFetch<{ url: string }>(
      `/api/requests/${requestId}/letter?type=${type}`
    );
    setLoading(false);
    if (result.error || !result.data) {
      setSubmitError(
        result.error ??
          `Could not open the ${type === 'stamp' ? 'stamp' : 'letter'}.`
      );
      return;
    }
    setUrl(result.data.url);
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  const handleDecision = async (
    choice: 'APPROVED' | 'DECLINED',
    values: HodWeekendDecisionFormInput
  ) => {
    if (!selected) return;
    const isGuest = !!selected.guest;

    setSubmitting(true);
    setSubmitError(null);
    const result = await apiFetch<{
      request_id: string;
      status: string;
      mismatches?: { signature?: number; stamp?: number };
    }>('/api/requests/hod-decision', {
      method: 'POST',
      body: {
        request_id: selected.id,
        decision: choice,
        note: values.note?.trim() || undefined,
        ...(choice === 'APPROVED' && isGuest ? { key_id: values.key_id } : {}),
        // For registered requests with an uploaded signature/stamp, trigger
        // pixel-level verification against the Dean's onboarded references.
        ...(choice === 'APPROVED' && !isGuest && selected.letter_url
          ? { submitted_signature_url: selected.letter_url }
          : {}),
        ...(choice === 'APPROVED' && !isGuest && selected.stamp_url
          ? { submitted_stamp_url: selected.stamp_url }
          : {}),
      },
    });
    setSubmitting(false);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    if (result.data?.status === 'HELD_SIGNATURE_MISMATCH') {
      setDecision('held');
      setDecidedIds((prev) => new Set(prev).add(selected.id));
      return;
    }
    setDecision(choice === 'APPROVED' ? 'approved' : 'declined');
    setDecidedIds((prev) => new Set(prev).add(selected.id));
  };

  // Clears a request whose date has passed out of the queue. The request moves
  // to EXPIRED — it stays in the requester's history and the CSO audit log,
  // it just stops occupying the pending list. `fromSheet` keeps the detail
  // sheet open to show the persistent confirmation.
  const handleDismiss = async (requestId: string, fromSheet = false) => {
    setDismissingId(requestId);
    setListError(null);
    setSubmitError(null);
    const result = await apiFetch<{ request_id: string; status: string }>(
      '/api/requests/dismiss',
      { method: 'POST', body: { request_id: requestId } }
    );
    setDismissingId(null);
    if (result.error) {
      if (fromSheet) setSubmitError(result.error);
      else setListError(result.error);
      return;
    }
    setDecidedIds((prev) => new Set(prev).add(requestId));
    if (fromSheet) setDecision('dismissed');
    queryClient.invalidateQueries({
      queryKey: ['requests', 'pending-weekend'],
    });
  };

  const visibleRequests = pendingRequests.filter((r) => !decidedIds.has(r.id));
  const selectedExpired = selected ? isPastDate(selected.requested_for) : false;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Weekend Requests
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Review and decide weekend access requests for your department.
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

      {/* Dismiss failure (list-level, outside the detail sheet) */}
      {listError && (
        <p className="text-sm text-destructive" role="alert">
          {listError}
        </p>
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
            const expired = isPastDate(req.requested_for);
            const stripeClass = expired
              ? 'bg-muted-foreground'
              : req.risk_tier === 'HIGH'
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
                      {isGuest && <GuestBadge label="External" showIcon />}
                      {expired && <ExpiredBadge />}
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
                  <div className="flex shrink-0 items-center gap-2">
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
                    {expired && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDismiss(req.id)}
                              disabled={isOffline || dismissingId === req.id}
                              aria-busy={dismissingId === req.id}
                              aria-label={`Dismiss expired request from ${displayName(req)}`}
                              className={
                                isOffline ? 'pointer-events-none' : undefined
                              }
                            >
                              <ArchiveIcon
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              {dismissingId === req.id
                                ? 'Dismissing...'
                                : 'Dismiss'}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isOffline
                            ? 'Available again when you reconnect.'
                            : 'Clear this lapsed request from the queue. It stays in the audit log.'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
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
            <SheetTitle className="flex items-center gap-2">
              Weekend access request
              {selected?.guest && <GuestBadge label="External" showIcon />}
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
                    ) : decision === 'held' ? (
                      <>
                        <AlertTriangleIcon
                          className="size-10 text-amber-500"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium text-foreground">
                            Approval held — signature mismatch
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            The CSO has been notified and will review. You will
                            be able to proceed once they resolve it.
                          </p>
                        </div>
                      </>
                    ) : decision === 'dismissed' ? (
                      <>
                        <ArchiveIcon
                          className="size-10 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium text-foreground">
                            Dismissed.
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            This lapsed request has been cleared from your
                            queue. It remains in the audit log and in{' '}
                            {displayName(selected)}&apos;s history.
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

                  {/* Guest identity */}
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
                    </div>
                  )}

                  {/* Authorisation letter / signature / stamp — shown for any
                      request that has a letter_url (guest letter or
                      registered requester's Dean signature/stamp upload). */}
                  {(selected.letter_url || selected.stamp_url) && (
                    <div className="flex flex-wrap gap-2">
                      {selected.letter_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-fit"
                          onClick={() =>
                            handleViewLetter(selected.id, 'letter')
                          }
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
                              ? 'Signature opened'
                              : selected.guest
                                ? 'View authorisation letter'
                                : 'View Dean signature'}
                          <ExternalLinkIcon
                            className="size-3"
                            aria-hidden="true"
                          />
                        </Button>
                      )}
                      {!selected.guest && selected.stamp_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-fit"
                          onClick={() => handleViewLetter(selected.id, 'stamp')}
                          disabled={stampLoading}
                          aria-busy={stampLoading}
                        >
                          <FileTextIcon
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          {stampLoading
                            ? 'Opening...'
                            : stampUrl
                              ? 'Stamp opened'
                              : 'View Dean stamp'}
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
                      {selectedExpired && <ExpiredBadge />}
                    </div>
                  </div>

                  {/* Key picker — guest requests must have a key chosen */}
                  {selected.guest && (
                    <Controller
                      name="key_id"
                      control={form.control}
                      render={({ field, fieldState }) => {
                        const selectedKey = deptKeys.find(
                          (k) => k.id === field.value
                        );
                        return (
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
                                {deptKeys.map((k) => (
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
                            {deptKeys.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                No keys available in your department.
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
                        );
                      }}
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

                  {selectedExpired && (
                    <p className="text-sm text-muted-foreground" role="alert">
                      This request&apos;s date has passed — it can no longer be
                      approved or declined. Dismiss it to clear it from your
                      queue; it stays in the audit log.
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

                  {/* Decision buttons — a lapsed request can only be
                      dismissed, so swap the pair for a single clear action
                      rather than showing two permanently disabled buttons. */}
                  {selectedExpired ? (
                    <Button
                      variant="outline"
                      className="h-auto w-full px-4 py-2.5"
                      disabled={isOffline || dismissingId === selected.id}
                      aria-busy={dismissingId === selected.id}
                      onClick={() => handleDismiss(selected.id, true)}
                    >
                      <ArchiveIcon className="size-4" aria-hidden="true" />
                      {dismissingId === selected.id
                        ? 'Dismissing...'
                        : 'Dismiss request'}
                    </Button>
                  ) : (
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
                  )}
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
