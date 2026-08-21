import {
  AlertCircleIcon,
  ClockIcon,
  EllipsisIcon,
  KeyRoundIcon,
  XCircleIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

import { KeysEmpty } from '@/app/cso/keys/_components/keys-empty';

export type OutstandingKey = {
  requestId: string;
  keyId: string;
  keyCode: string;
  roomName: string;
  zone: string;
  requesterName: string;
  issuedAt: string;
  returnDeadline: string;
  isOverdue: boolean;
};

type Props = {
  items: OutstandingKey[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  onMarkLost: (key: { id: string; code: string }) => void;
};

export const OutstandingKeys = ({
  items,
  isLoading,
  isError,
  error,
  onRetry,
  onMarkLost,
}: Props) => {
  return (
    <>
      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive">
            Failed to load outstanding keys
          </p>
          {error instanceof Error && (
            <p className="mt-1 text-xs text-destructive/80">{error.message}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {items.length === 0 ? (
            <KeysEmpty
              title="No keys currently issued"
              description="All keys have been returned."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <div
                  key={item.requestId}
                  className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <KeyRoundIcon
                          className="size-4 text-primary"
                          aria-hidden="true"
                        />
                      </div>
                      <code className="font-mono text-base font-semibold text-foreground">
                        {item.keyCode}
                      </code>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          aria-label={`More actions for ${item.keyCode}`}
                        >
                          <EllipsisIcon
                            className="size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() =>
                            onMarkLost({ id: item.keyId, code: item.keyCode })
                          }
                        >
                          <XCircleIcon className="size-4" aria-hidden="true" />
                          Mark as lost
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {item.roomName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.requesterName}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ClockIcon className="size-3.5" aria-hidden="true" />
                      {new Date(item.issuedAt).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · Due{' '}
                      {new Date(item.returnDeadline).toLocaleTimeString(
                        'en-GB',
                        { hour: '2-digit', minute: '2-digit' }
                      )}
                    </span>
                  </div>

                  <span
                    className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.isOverdue
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-primary/10 text-primary'
                    }`}
                    aria-label={`Status: ${item.isOverdue ? 'Overdue' : 'Issued'}`}
                  >
                    {item.isOverdue && (
                      <AlertCircleIcon
                        className="size-3.5"
                        aria-hidden="true"
                      />
                    )}
                    {item.isOverdue ? 'Overdue' : 'Issued'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
};
