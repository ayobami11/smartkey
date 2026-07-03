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

// Types

export type SignatureMismatchAlert = {
  id: string;
  requested_for: string;
  occurred_at: string;
  ref_url: string | null;
  submitted_url: string | null;
  mismatch_pct: number | null;
  threshold_pct: number | null;
  requester?: { full_name: string } | null;
  key?: { code: string; room_name: string } | null;
};

const QUERY_KEY = ['cso', 'signature-alerts'];

// Component

export const SignatureMismatchAlerts = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();
  const [selectedAlert, setSelectedAlert] =
    useState<SignatureMismatchAlert | null>(null);

  useRealtime({
    table: 'audit_log',
    onInsert: (payload) => {
      const row = payload.new as { event?: string };
      if (row.event === 'SIGNATURE_MISMATCH')
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
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
      const result = await apiFetch<{ alerts: SignatureMismatchAlert[] }>(
        '/api/ai/signature-alerts'
      );
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load signature alerts.');
      return result.data.alerts ?? [];
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
              {alerts.map((alert) => (
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
                          Signature mismatch
                          {alert.mismatch_pct !== null &&
                            ` — ${alert.mismatch_pct}%`}
                        </span>
                      </div>
                      <time className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatTime(alert.occurred_at)}
                      </time>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {alert.key
                        ? `${alert.key.room_name} — ${alert.key.code}`
                        : 'Unknown key'}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {alert.requester?.full_name ?? 'Unknown requester'}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedAlert(alert)}
                        aria-label={`Review signature mismatch for ${alert.requester?.full_name ?? 'this request'}`}
                      >
                        Review
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
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
