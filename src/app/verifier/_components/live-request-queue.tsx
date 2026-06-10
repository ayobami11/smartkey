'use client';

import { useEffect, useState } from 'react';
import { CheckCircleIcon, InboxIcon, KeyRoundIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  RiskAcknowledgement,
  RiskTierBadge,
} from '@/components/smartkey/RiskTierBadge';
import { useRealtime } from '@/hooks/useRealtime';
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
  requester: { id: string; full_name: string; photo_url: string | null };
  key: { id: string; code: string; room_name: string; zone: string };
};

type IssueResult = {
  request_id: string;
  requester: { full_name: string | null; photo_url: string | null };
  key: { code: string | null; room_name: string | null };
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

const avatarInitials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

// Component

export const LiveRequestQueue = () => {
  const [requests, setRequests] = useState<QueueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [verifierId, setVerifierId] = useState<string | null>(null);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
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

  useEffect(() => {
    const init = async () => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setVerifierId(user.id);
    };
    init();
    fetchQueue();
  }, []);

  useRealtime<{ id: string; status: string }>({
    table: 'requests',
    onInsert: (payload) => {
      if (
        (payload.new as { id: string; status: string }).status === 'CODE_ISSUED'
      )
        fetchQueue();
    },
    onUpdate: (payload) => {
      const row = payload.new as { id: string; status: string };
      if (row.status !== 'CODE_ISSUED')
        setRequests((prev) => prev.filter((r) => r.id !== row.id));
    },
  });

  const fetchQueue = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/requests/live-queue');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setFetchError(
          (json as { error?: string }).error ?? 'Failed to load the queue.'
        );
        return;
      }
      const json = await res.json();
      setRequests(
        (json as { data?: { requests?: QueueRequest[] } }).data?.requests ?? []
      );
    } catch {
      setFetchError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Sheet helpers

  const openSheet = (req?: QueueRequest) => {
    setContextRequest(req ?? null);
    setCodeInput('');
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
    setCodeInput('');
    setSheetStep('code');
    setIssueError(null);
    setIssueResult(null);
    setIssuing(false);
    setAcknowledged(false);
  };

  const handleIssue = async () => {
    if (codeInput.length !== 6 || !verifierId) return;
    setIssuing(true);
    setIssueError(null);
    try {
      const res = await fetch('/api/requests/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeInput, verifier_id: verifierId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 404
            ? 'Code not recognised or expired. Ask the requester to verify, or request a new code.'
            : ((json as { error?: string }).error ??
              'Something went wrong. Please try again.');
        setIssueError(msg);
        return;
      }
      const result = (json as { data?: IssueResult }).data;
      if (!result) {
        setIssueError('Unexpected response from server. Please try again.');
        return;
      }
      setIssueResult(result);
      // Remove the issued request from local list
      setRequests((prev) => prev.filter((r) => r.id !== result.request_id));
      setSheetStep('success');
    } catch {
      setIssueError('Network error. Check your connection and try again.');
    } finally {
      setIssuing(false);
    }
  };

  // Render

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-foreground">
          Pending requests
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openSheet()}
          aria-label="Enter 6-digit code to issue a key"
        >
          <KeyRoundIcon className="size-3.5" aria-hidden="true" />
          Enter code
        </Button>
      </div>

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
            onClick={fetchQueue}
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
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {req.requester.full_name}
                      </span>
                      <RiskTierBadge
                        tier={req.risk_tier}
                        factors={req.risk_factors}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {req.key.code}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        {req.key.room_name}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <time className="font-mono text-xs text-muted-foreground">
                      {relativeTime(req.created_at)}
                    </time>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openSheet(req)}
                      aria-label={`Issue key for ${req.requester.full_name}`}
                    >
                      Issue
                    </Button>
                  </div>
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
            <SheetTitle>Issue a key</SheetTitle>
            <SheetDescription>
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
                    {contextRequest.requester.full_name}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {contextRequest.key.code} · {contextRequest.key.room_name}
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
                <div className="flex flex-col items-center gap-3">
                  <Label
                    htmlFor="otp-input"
                    className="text-sm text-muted-foreground"
                  >
                    Enter the 6-digit code
                  </Label>
                  <InputOTP
                    id="otp-input"
                    maxLength={6}
                    value={codeInput}
                    onChange={setCodeInput}
                    disabled={issuing}
                    aria-label="6-digit verification code"
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
                </div>

                {issueError && (
                  <p
                    className="text-center text-xs text-destructive"
                    role="alert"
                  >
                    {issueError}
                  </p>
                )}

                <Button
                  className="w-full"
                  disabled={
                    codeInput.length !== 6 ||
                    issuing ||
                    !verifierId ||
                    (contextRequest?.risk_tier === 'HIGH' && !acknowledged)
                  }
                  onClick={handleIssue}
                  aria-busy={issuing}
                >
                  {issuing ? 'Issuing…' : 'Issue key'}
                </Button>

                {!verifierId && (
                  <p className="text-center text-xs text-muted-foreground">
                    Loading session…
                  </p>
                )}
              </div>
            )}

            {/* Success step */}
            {sheetStep === 'success' && issueResult && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <CheckCircleIcon
                  className="size-10 text-emerald-600"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium text-foreground">
                    Issued successfully
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {issueResult.requester.full_name
                      ? `Key ${issueResult.key.code ?? ''} issued to ${issueResult.requester.full_name} at ${formatTime(issueResult.issued_at)}.`
                      : `Key issued at ${formatTime(issueResult.issued_at)}.`}
                  </p>
                </div>

                {/* Persistent confirmation card */}
                <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-left dark:border-emerald-900 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircleIcon className="size-3.5" aria-hidden="true" />
                    Issued
                  </div>
                  {issueResult.key.code && (
                    <p className="mt-1.5 font-mono text-sm font-medium text-foreground">
                      {issueResult.key.code}
                    </p>
                  )}
                  {issueResult.key.room_name && (
                    <p className="text-xs text-muted-foreground">
                      {issueResult.key.room_name}
                    </p>
                  )}
                  {issueResult.requester.full_name && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                        {avatarInitials(issueResult.requester.full_name)}
                      </div>
                      <span className="text-xs text-foreground">
                        {issueResult.requester.full_name}
                      </span>
                    </div>
                  )}
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {formatTime(issueResult.issued_at)}
                  </p>
                </div>

                <Button className="mt-2 w-full" onClick={handleSheetClose}>
                  Done
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
};
