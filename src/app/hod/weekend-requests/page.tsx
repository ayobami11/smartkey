'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  KeyRoundIcon,
  XIcon,
} from 'lucide-react';

import { useRealtime } from '@/hooks/useRealtime';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

// Types

type PendingRequest = {
  id: string;
  requester: {
    id: string;
    full_name: string;
    institutional_email: string;
  };
  key: {
    id: string;
    code: string;
    room_name: string;
    zone: string;
  };
  requested_for: string;
  created_at: string;
  type: 'WEEKDAY' | 'WEEKEND';
  risk_tier: string;
};

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

// Component

export default function WeekendRequestsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [selected, setSelected] = useState<PendingRequest | null>(null);
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<'approved' | 'declined' | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());

  const {
    data: pendingRequests = [],
    isLoading: loading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['requests', 'pending-weekend'],
    queryFn: async () => {
      const res = await fetch('/api/requests/pending');
      const json = await res.json();
      if (!res.ok)
        throw new Error(
          (json as { error?: string }).error ?? 'Failed to load requests.'
        );
      return (
        (json as { data?: { requests?: PendingRequest[] } }).data?.requests ??
        []
      );
    },
  });

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

  const handleClose = () => {
    setSelected(null);
    setNote('');
    setDecision(null);
    setSubmitError(null);
    setSubmitting(false);
  };

  const handleDecision = async (choice: 'APPROVED' | 'DECLINED') => {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/requests/hod-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: selected.id,
          decision: choice,
          note: note.trim() || undefined,
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

  const tabs = [
    { label: 'Pending', count: visibleRequests.length },
    { label: 'Decided this week', count: 0 },
    { label: 'All', count: null },
  ] as const;

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

      {/* Tabs */}
      <div
        className="flex items-center gap-1 border-b border-border"
        role="tablist"
        aria-label="Filter requests"
      >
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={activeTab === idx}
            onClick={() => setActiveTab(idx)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              activeTab === idx
                ? '-mb-px border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-xs font-semibold text-primary">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && activeTab === 0 && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {/* Fetch error */}
      {!loading && fetchError && activeTab === 0 && (
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

      {/* Request list */}
      {!loading && !fetchError && (
        <>
          {activeTab === 0 && visibleRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
              <p className="text-sm font-medium text-foreground">
                No pending requests right now.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Weekend requests appear here when staff submit them.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(activeTab === 0 ? visibleRequests : []).map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)] sm:flex-row sm:items-start"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {req.requester.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-sm font-semibold text-foreground">
                        {req.requester.full_name}
                      </span>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <KeyRoundIcon
                            className="size-3.5 text-primary"
                            aria-hidden="true"
                          />
                          <code className="font-mono">{req.key.code}</code> —{' '}
                          {req.key.room_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarIcon
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          {formatDate(req.requested_for)}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClockIcon className="size-3.5" aria-hidden="true" />
                          {relativeTime(req.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setSelected(req)}
                    className="shrink-0"
                  >
                    Review
                  </Button>
                </div>
              ))}

              {activeTab !== 0 && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No requests in this view.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle className="text-base">
              Weekend access request
            </SheetTitle>
          </SheetHeader>

          {selected && (
            <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
              {decision ? (
                /* Success / declined state */
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  {decision === 'approved' ? (
                    <>
                      <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100">
                        <CheckCircleIcon
                          className="size-6 text-emerald-700"
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Approved.
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selected.requester.full_name} has been notified by
                          email.
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Signed with your stored signature reference at{' '}
                          {new Date().toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          .
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <XIcon
                          className="size-6 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Declined.
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selected.requester.full_name} has been notified.
                        </p>
                      </div>
                    </>
                  )}
                  <Button variant="outline" onClick={handleClose}>
                    Done
                  </Button>
                </div>
              ) : (
                <>
                  {/* Requester */}
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {selected.requester.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {selected.requester.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selected.requester.institutional_email} · Submitted{' '}
                        {relativeTime(selected.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Request details */}
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
                    <div className="flex items-center gap-2 text-xs">
                      <KeyRoundIcon
                        className="size-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-foreground">
                        <code className="font-mono">{selected.key.code}</code> —{' '}
                        {selected.key.room_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarIcon
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {formatDate(selected.requested_for)}
                    </div>
                  </div>

                  {/* Risk warning for high-risk requests */}
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

                  {/* Submit error */}
                  {submitError && (
                    <p className="text-sm text-destructive" role="alert">
                      {submitError}
                    </p>
                  )}

                  {/* Note */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="hod-note" className="text-xs">
                      Note to requester{' '}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="hod-note"
                      placeholder="Included in the notification email…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </div>

                  {/* Decision buttons */}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      className="flex-1"
                      disabled={submitting}
                      aria-busy={submitting}
                      onClick={() => handleDecision('APPROVED')}
                    >
                      {submitting ? 'Submitting…' : 'Approve and sign'}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-destructive text-destructive hover:bg-destructive/5 hover:text-destructive"
                      disabled={submitting}
                      onClick={() => handleDecision('DECLINED')}
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
}
