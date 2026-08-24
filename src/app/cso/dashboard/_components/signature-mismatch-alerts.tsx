'use client';

import { useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, FileWarningIcon } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { useRealtime } from '@/hooks/use-realtime';
import { useConnectionStatus } from '@/hooks/use-connection-status';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

import { formatTime } from '@/app/cso/dashboard/_components/helpers';
import { SectionCardHeader } from '@/components/smartkey/section-card-header';
import { SignatureMismatchDetailDialog } from '@/app/cso/dashboard/_components/signature-mismatch-detail-dialog';

export type MismatchCheck = {
  ref_url: string;
  submitted_url: string;
  mismatch_pct: number;
};

export type WeekendRequestMismatch = {
  kind: 'weekend_request';
  id: string;
  requested_for: string;
  occurred_at: string;
  signature: MismatchCheck | null;
  stamp: MismatchCheck | null;
  threshold_pct: number | null;
  requester?: { full_name: string } | null;
  key?: { code: string; room_name: string } | null;
};

export type ReferenceReplacementMismatch = {
  kind: 'reference_replacement';
  id: string;
  profile_id: string;
  type: 'signature' | 'stamp';
  dean_name: string;
  submitted_at: string;
  mismatch_pct: number;
  threshold_pct: number;
  current_ref_url: string | null;
  pending_url: string;
};

export type SignatureMismatchAlert =
  | WeekendRequestMismatch
  | ReferenceReplacementMismatch;

type RawWeekendRequestMismatch = Omit<WeekendRequestMismatch, 'kind'>;
type RawReferenceReplacementMismatch = Omit<
  ReferenceReplacementMismatch,
  'kind' | 'id'
>;

const QUERY_KEY = ['cso', 'signature-alerts'];

export const SignatureMismatchAlerts = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();
  const [selectedAlert, setSelectedAlert] =
    useState<SignatureMismatchAlert | null>(null);

  // Filter server-side rather than in the callback. `event` is a single-column
  // equality filter with one fixed value, so it costs exactly one extra channel
  // (the filter is part of the registry's channel key) and the Realtime server
  // stops sending every unrelated audit row down the socket just to have it
  // discarded on arrival. Mismatches are rare, so this channel is near-silent.
  useRealtime({
    table: 'audit_log',
    filter: { column: 'event', value: 'SIGNATURE_MISMATCH' },
    onInsert: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const {
    data: alerts = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const result = await apiFetch<{
        alerts: RawWeekendRequestMismatch[];
        reference_replacements: RawReferenceReplacementMismatch[];
      }>('/api/ai/signature-alerts');
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load signature alerts.');

      const weekendAlerts: SignatureMismatchAlert[] = (
        result.data.alerts ?? []
      ).map((a) => ({ ...a, kind: 'weekend_request' }));
      const referenceAlerts: SignatureMismatchAlert[] = (
        result.data.reference_replacements ?? []
      ).map((a) => ({
        ...a,
        kind: 'reference_replacement',
        id: `${a.profile_id}:${a.type}`,
      }));

      return [...weekendAlerts, ...referenceAlerts];
    },
  });

  const handleResolved = () => {
    setSelectedAlert(null);
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCardHeader
        title="Signature mismatches"
        count={alerts.length}
        countLabel="held for review"
        badgeVariant="primary"
      />

      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {!!error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">{(error as Error).message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {alerts.length === 0 ? (
            <Empty className="border border-border bg-card">
              <EmptyMedia variant="icon">
                <CheckCircleIcon
                  className="size-8 text-emerald-600"
                  aria-hidden="true"
                />
              </EmptyMedia>
              <EmptyContent>
                <EmptyTitle>No signature mismatches</EmptyTitle>
                <EmptyDescription>
                  Held weekend approvals will appear here for review.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {alerts.map((alert) => {
                const isReference = alert.kind === 'reference_replacement';
                const label = isReference
                  ? `${alert.type === 'signature' ? 'Signature' : 'Stamp'} reference update — ${alert.mismatch_pct}%`
                  : alert.signature && alert.stamp
                    ? `Signature & stamp mismatch — ${alert.signature.mismatch_pct}% / ${alert.stamp.mismatch_pct}%`
                    : alert.stamp
                      ? `Stamp mismatch — ${alert.stamp.mismatch_pct}%`
                      : alert.signature
                        ? `Signature mismatch — ${alert.signature.mismatch_pct}%`
                        : 'Mismatch detected';
                const subline = isReference
                  ? 'Reference signature/stamp replacement'
                  : alert.key
                    ? `${alert.key.room_name} — ${alert.key.code}`
                    : 'Unknown key';
                const personName = isReference
                  ? alert.dean_name
                  : (alert.requester?.full_name ?? 'Unknown requester');
                const occurredAt = isReference
                  ? alert.submitted_at
                  : alert.occurred_at;

                return (
                  <div
                    key={alert.id}
                    className="flex w-full overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                  >
                    <div
                      className="w-1 shrink-0 bg-destructive"
                      aria-hidden="true"
                    />
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <FileWarningIcon
                            className="size-4 shrink-0 text-destructive"
                            aria-hidden="true"
                          />
                          <span className="text-xs font-semibold text-destructive">
                            {label}
                          </span>
                        </div>
                        <time className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatTime(occurredAt)}
                        </time>
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {subline}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {personName}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAlert(alert)}
                          aria-label={`Review signature mismatch for ${personName}`}
                        >
                          Review
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <SignatureMismatchDetailDialog
        alert={selectedAlert}
        onOpenChange={(open) => {
          if (!open) setSelectedAlert(null);
        }}
        onResolved={handleResolved}
      />
    </div>
  );
};
