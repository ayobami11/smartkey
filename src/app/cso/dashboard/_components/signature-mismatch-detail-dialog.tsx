'use client';

import { useState } from 'react';

import { CheckCircleIcon, FileWarningIcon } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { useConnectionStatus } from '@/hooks/use-connection-status';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RiskAcknowledgement } from '@/components/smartkey/risk-tier-badge';

import type { SignatureMismatchAlert } from '@/app/cso/dashboard/_components/signature-mismatch-alerts';

type SignatureMismatchDetailDialogProps = {
  alert: SignatureMismatchAlert | null;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
};

type ResolveDecision = 'APPROVED' | 'DECLINED';

export const SignatureMismatchDetailDialog = ({
  alert,
  onOpenChange,
  onResolved,
}: SignatureMismatchDetailDialogProps) => {
  const connectionStatus = useConnectionStatus();
  const isOffline = connectionStatus !== 'connected';

  const [acknowledged, setAcknowledged] = useState(false);
  const [resolving, setResolving] = useState<ResolveDecision | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resolvedAs, setResolvedAs] = useState<ResolveDecision | null>(null);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset local state after the close animation so the next alert opens clean.
      setAcknowledged(false);
      setResolving(null);
      setSubmitError(null);
      setResolvedAs(null);
    }
    onOpenChange(open);
  };

  const handleResolve = async (decision: ResolveDecision) => {
    if (!alert) return;
    setResolving(decision);
    setSubmitError(null);

    const result =
      alert.kind === 'reference_replacement'
        ? await apiFetch<{ status: string; new_url: string | null }>(
            '/api/admin/signature-references/resolve',
            {
              method: 'POST',
              body: {
                profile_id: alert.profile_id,
                type: alert.type,
                decision,
              },
            }
          )
        : await apiFetch<{ request_id: string; status: string }>(
            '/api/requests/hod-decision',
            {
              method: 'POST',
              body: {
                request_id: alert.id,
                decision,
                cso_override: true,
              },
            }
          );

    setResolving(null);

    if (result.error) {
      setSubmitError(result.error);
      return;
    }

    setResolvedAs(decision);
  };

  return (
    <Dialog open={!!alert} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {alert && !resolvedAs && (
          <>
            <DialogHeader>
              <DialogTitle>
                {alert.kind === 'reference_replacement'
                  ? 'Reference signature update'
                  : 'Signature mismatch'}
              </DialogTitle>
              <DialogDescription>
                {alert.kind === 'reference_replacement' ? (
                  <>
                    {alert.dean_name} —{' '}
                    {alert.type === 'signature' ? 'signature' : 'stamp'}{' '}
                    reference replacement
                  </>
                ) : (
                  <>
                    {alert.requester?.full_name ?? 'This requester'}
                    {alert.key
                      ? ` — ${alert.key.room_name} (${alert.key.code})`
                      : ''}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <FileWarningIcon
                className="size-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <p className="text-sm text-destructive">
                {alert.kind === 'reference_replacement'
                  ? `${alert.mismatch_pct}% mismatch (threshold ${alert.threshold_pct}%)`
                  : alert.signature && alert.stamp
                    ? `Signature ${alert.signature.mismatch_pct}% / stamp ${alert.stamp.mismatch_pct}% mismatch`
                    : alert.stamp
                      ? `${alert.stamp.mismatch_pct}% stamp mismatch`
                      : alert.signature
                        ? `${alert.signature.mismatch_pct}% signature mismatch`
                        : 'Mismatch detected'}
                {alert.kind === 'weekend_request' &&
                  alert.threshold_pct !== null &&
                  ` (threshold ${alert.threshold_pct}%)`}
              </p>
            </div>

            {alert.kind === 'reference_replacement' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-foreground">
                  {alert.type === 'signature' ? 'Signature' : 'Stamp'}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Reference on file
                    </p>
                    {alert.current_ref_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={alert.current_ref_url}
                        alt={`Current reference ${alert.type} on file for ${alert.dean_name}`}
                        className="aspect-2/1 w-full rounded-lg border border-border bg-muted object-contain"
                      />
                    ) : (
                      <div className="flex aspect-2/1 w-full items-center justify-center rounded-lg border border-border bg-muted text-xs text-muted-foreground">
                        No reference on file
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Submitted (pending)
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={alert.pending_url}
                      alt={`Submitted ${alert.type} pending review from ${alert.dean_name}`}
                      className="aspect-2/1 w-full rounded-lg border border-border bg-muted object-contain"
                    />
                  </div>
                </div>
              </div>
            )}

            {alert.kind === 'weekend_request' && alert.signature && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-foreground">
                  Signature
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Reference on file
                    </p>
                    {/* Regular <img> intentionally — Storage URL preview,
                        matching the convention in profile-photo-preview.tsx. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={alert.signature.ref_url}
                      alt={`Reference signature on file for ${alert.requester?.full_name ?? 'this requester'}`}
                      className="aspect-[2/1] w-full rounded-lg border border-border bg-muted object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Submitted
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={alert.signature.submitted_url}
                      alt={`Submitted signature for the request from ${alert.requester?.full_name ?? 'this requester'}`}
                      className="aspect-[2/1] w-full rounded-lg border border-border bg-muted object-contain"
                    />
                  </div>
                </div>
              </div>
            )}

            {alert.kind === 'weekend_request' && alert.stamp && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-foreground">Stamp</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Reference on file
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={alert.stamp.ref_url}
                      alt={`Reference stamp on file for ${alert.requester?.full_name ?? 'this requester'}`}
                      className="aspect-[2/1] w-full rounded-lg border border-border bg-muted object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Submitted
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={alert.stamp.submitted_url}
                      alt={`Submitted stamp for the request from ${alert.requester?.full_name ?? 'this requester'}`}
                      className="aspect-[2/1] w-full rounded-lg border border-border bg-muted object-contain"
                    />
                  </div>
                </div>
              </div>
            )}

            <RiskAcknowledgement
              acknowledged={acknowledged}
              onAcknowledge={setAcknowledged}
            />

            {!!submitError && (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            )}

            <DialogFooter>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={isOffline ? 0 : -1}>
                    <Button
                      variant="secondary"
                      disabled={
                        isOffline || !acknowledged || resolving !== null
                      }
                      aria-busy={resolving === 'DECLINED'}
                      onClick={() => handleResolve('DECLINED')}
                    >
                      Decline
                    </Button>
                  </span>
                </TooltipTrigger>
                {isOffline && (
                  <TooltipContent>
                    Available again when you reconnect.
                  </TooltipContent>
                )}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={isOffline ? 0 : -1}>
                    <Button
                      disabled={
                        isOffline || !acknowledged || resolving !== null
                      }
                      aria-busy={resolving === 'APPROVED'}
                      onClick={() => handleResolve('APPROVED')}
                    >
                      {alert.kind === 'reference_replacement'
                        ? 'Approve and replace'
                        : 'Approve anyway'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {isOffline && (
                  <TooltipContent>
                    Available again when you reconnect.
                  </TooltipContent>
                )}
              </Tooltip>
            </DialogFooter>
          </>
        )}

        {alert && resolvedAs && (
          <Card className="border-0 shadow-none ring-0">
            <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircleIcon
                className="size-10 text-emerald-500"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium text-foreground">
                  {resolvedAs === 'APPROVED' ? 'Approved' : 'Declined'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {alert.kind === 'reference_replacement'
                    ? resolvedAs === 'APPROVED'
                      ? `${alert.dean_name}'s ${alert.type} reference has been updated.`
                      : `The pending ${alert.type} upload has been discarded.`
                    : `${alert.requester?.full_name ?? 'The requester'} has been notified by email.`}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleOpenChange(false);
                  onResolved();
                }}
              >
                Close
              </Button>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};
