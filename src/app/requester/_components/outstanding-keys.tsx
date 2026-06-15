'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClockIcon, InboxIcon, KeyRoundIcon } from 'lucide-react';

import { useRealtime } from '@/hooks/useRealtime';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { createBrowserClient } from '@/lib/supabase/client';

// Types

type OutstandingKey = {
  id: string;
  status: 'KEY_ISSUED' | 'KEY_OVERDUE';
  return_code: string | null;
  return_code_expires_at: string | null;
  return_deadline: string;
  issued_at: string;
  key: { code: string; room_name: string; zone: string } | null;
};

type SheetPhase =
  | { phase: 'idle' }
  | { phase: 'generating' }
  | { phase: 'code_active'; code: string; expires_at: string }
  | { phase: 'error'; message: string };

// Helpers

const secondsRemaining = (iso: string) =>
  Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));

const formatCountdown = (s: number): string => {
  if (s >= 86400) {
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  }
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const relativeTime = (iso: string) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff === 1) return '1 min ago';
  if (diff < 60) return `${diff} min ago`;
  const hours = Math.floor(diff / 60);
  return hours === 1 ? '1 hr ago' : `${hours} hrs ago`;
};

const formatDeadline = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? `Today ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
};

// Return code countdown — isolated so the interval only runs while the sheet
// is open and in code_active phase.

const ReturnCodeDisplay = ({
  code,
  expiresAt,
  onExpired,
}: {
  code: string;
  expiresAt: string;
  onExpired: () => void;
}) => {
  const [countdown, setCountdown] = useState(() => secondsRemaining(expiresAt));

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(secondsRemaining(expiresAt));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <div
      className="rounded-lg border border-primary/20 bg-primary/5 p-5 text-center"
      aria-live="polite"
    >
      <p className="text-xs font-medium text-muted-foreground">Return code</p>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ClockIcon className="size-3.5" aria-hidden="true" />
        <span
          className="font-mono"
          aria-label={
            countdown > 0
              ? `Expires in ${formatCountdown(countdown)}`
              : 'Expired'
          }
        >
          {countdown > 0 ? formatCountdown(countdown) : 'Expired'}
        </span>
      </div>

      {countdown > 0 ? (
        <>
          <p
            className="mt-3 font-mono text-5xl font-semibold tracking-[0.3em] text-foreground"
            aria-label={`Return code: ${code}`}
          >
            {code}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Read this to the security officer when you hand back the key.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Code expired. Generate a new one.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onExpired}
          >
            Generate new code
          </Button>
        </>
      )}
    </div>
  );
};

// Component

export const OutstandingKeys = () => {
  const queryClient = useQueryClient();
  const connectionStatus = useConnectionStatus();
  const isOffline = connectionStatus === 'offline';

  const [userId, setUserId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<OutstandingKey | null>(null);
  const [sheetPhase, setSheetPhase] = useState<SheetPhase>({ phase: 'idle' });

  // Resolve user ID once on mount

  useEffect(() => {
    createBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) setUserId(user.id);
      });
  }, []);

  // Fetch outstanding keys

  const {
    data: keys = [],
    isLoading: loading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['outstanding-keys', userId],
    enabled: !!userId,
    refetchInterval: connectionStatus !== 'connected' ? 10_000 : false,
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('requests')
        .select(
          'id, status, return_code, return_code_expires_at, return_deadline, issued_at, key:keys!key_id(code, room_name, zone)'
        )
        .eq('requester_id', userId!)
        .in('status', ['KEY_ISSUED'])
        .order('issued_at', { ascending: false });

      if (error)
        throw new Error(error.message ?? 'Failed to load your issued keys.');

      const now = Date.now();
      return (data ?? []).map((row) => ({
        ...row,
        status:
          row.return_deadline !== null &&
          new Date(row.return_deadline).getTime() < now
            ? ('KEY_OVERDUE' as const)
            : ('KEY_ISSUED' as const),
      })) as OutstandingKey[];
    },
  });

  // Live updates — KEY_RETURNED transitions remove the row; KEY_ISSUED keeps it visible

  useRealtime({
    table: 'requests',
    onUpdate: (payload) => {
      const row = payload.new as { status?: string; requester_id?: string };
      if (
        row.requester_id === userId &&
        ['KEY_ISSUED', 'KEY_RETURNED'].includes(row.status ?? '')
      ) {
        queryClient.invalidateQueries({
          queryKey: ['outstanding-keys', userId],
        });
      }
    },
  });

  // Sheet helpers

  const openReturnSheet = (item: OutstandingKey) => {
    setSelectedKey(item);

    setSheetPhase(
      item.return_code !== null && item.return_code_expires_at !== null
        ? {
            phase: 'code_active',
            code: item.return_code,
            expires_at: item.return_code_expires_at,
          }
        : { phase: 'idle' }
    );
    setSheetOpen(true);
  };

  const handleSheetClose = () => {
    setSheetOpen(false);
    setTimeout(() => {
      setSelectedKey(null);
      setSheetPhase({ phase: 'idle' });
    }, 200);
  };

  const handleGenerateCode = async () => {
    if (!selectedKey) return;
    setSheetPhase({ phase: 'generating' });
    try {
      const res = await fetch('/api/requests/request-return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: selectedKey.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSheetPhase({
          phase: 'error',
          message:
            (json as { error?: string }).error ??
            'Could not generate a return code. Please try again.',
        });
        return;
      }
      const result = (
        json as {
          data?: {
            return_code: string;
            return_code_expires_at: string;
          };
        }
      ).data!;
      setSheetPhase({
        phase: 'code_active',
        code: result.return_code,
        expires_at: result.return_code_expires_at,
      });
      queryClient.invalidateQueries({ queryKey: ['outstanding-keys', userId] });
    } catch {
      setSheetPhase({
        phase: 'error',
        message: 'Network error. Check your connection and try again.',
      });
    }
  };

  // Render

  const isOverdue = (item: OutstandingKey) => item.status === 'KEY_OVERDUE';
  const selectedIsOverdue = selectedKey ? isOverdue(selectedKey) : false;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">
        Outstanding keys
      </h2>

      {/* Loading */}
      {loading && (
        <div
          className="flex flex-col gap-3"
          aria-busy="true"
          aria-label="Loading outstanding keys"
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
          <p className="font-medium">Failed to load outstanding keys</p>
          <p className="mt-1 text-destructive/80">{fetchError.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !fetchError && keys.length === 0 && (
        <Empty className="border border-border bg-card">
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>No keys are currently issued</EmptyTitle>
            <EmptyDescription>
              Keys that have been issued will appear here.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      )}

      {/* Key rows */}
      {!loading && !fetchError && keys.length > 0 && (
        <div className="flex flex-col gap-3">
          {keys.map((item) => {
            const overdue = isOverdue(item);
            const stripe = overdue ? 'bg-destructive' : 'bg-emerald-500';
            return (
              <div
                key={item.id}
                className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div className={`w-1 shrink-0 ${stripe}`} aria-hidden="true" />
                <div className="flex flex-1 items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {item.key?.code}
                      </span>
                      {overdue && (
                        <span
                          className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                          aria-label="Key is overdue"
                        >
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.key?.room_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Issued {relativeTime(item.issued_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Return by{' '}
                      <span
                        className={
                          overdue
                            ? 'font-medium text-destructive'
                            : 'font-medium'
                        }
                      >
                        {formatDeadline(item.return_deadline)}
                      </span>
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          className={`shrink-0${isOffline ? ' pointer-events-none' : ''}`}
                          onClick={() => openReturnSheet(item)}
                          disabled={isOffline}
                          aria-label={`Return key ${item.key?.code ?? ''}`}
                        >
                          Return
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

      {/* Return key sheet */}
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
            <SheetTitle>Return key</SheetTitle>
            <SheetDescription>
              Generate a code to confirm the handover with the security officer.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
            {selectedKey && (
              <>
                {/* Key details card — always visible */}
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <KeyRoundIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    Key details
                  </div>
                  <p className="mt-2 font-mono text-sm font-medium text-foreground">
                    {selectedKey.key?.code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedKey.key?.room_name}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Issued {relativeTime(selectedKey.issued_at)}
                  </p>
                  {selectedIsOverdue && (
                    <p className="mt-1 text-xs font-medium text-destructive">
                      This key is overdue (deadline:{' '}
                      {formatDeadline(selectedKey.return_deadline)})
                    </p>
                  )}
                </div>

                {/* Phase: idle */}
                {sheetPhase.phase === 'idle' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full">
                        <Button
                          className="w-full"
                          onClick={handleGenerateCode}
                          disabled={isOffline}
                        >
                          Generate code
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {isOffline && (
                      <TooltipContent>
                        Available again when you reconnect.
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}

                {/* Phase: generating */}
                {sheetPhase.phase === 'generating' && (
                  <Button className="w-full" disabled aria-busy="true">
                    Generating…
                  </Button>
                )}

                {/* Phase: code_active */}
                {sheetPhase.phase === 'code_active' && (
                  <ReturnCodeDisplay
                    key={sheetPhase.expires_at}
                    code={sheetPhase.code}
                    expiresAt={sheetPhase.expires_at}
                    onExpired={() => setSheetPhase({ phase: 'idle' })}
                  />
                )}

                {/* Phase: error */}
                {sheetPhase.phase === 'error' && (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-destructive" role="alert">
                      {sheetPhase.message}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateCode}
                      disabled={isOffline}
                    >
                      Try again
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
};
