import {
  ClockIcon,
  EllipsisIcon,
  KeyRoundIcon,
  XCircleIcon,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Types

export type KeyStatus = 'AVAILABLE' | 'ISSUED' | 'OVERDUE' | 'RETIRED';
export type KeyZone = 'NEW_SENATE' | 'OLD_SENATE';

export type Key = {
  id: string;
  code: string;
  zone: KeyZone;
  room: string;
  department: string;
  hod: string;
  hodPending: boolean;
  status: KeyStatus;
};

// Constants

const statusConfig: Record<KeyStatus, { label: string; cls: string }> = {
  AVAILABLE: { label: 'Available', cls: 'bg-emerald-100 text-emerald-700' },
  ISSUED: { label: 'Issued', cls: 'bg-primary/10 text-primary' },
  OVERDUE: { label: 'Overdue', cls: 'bg-destructive/10 text-destructive' },
  RETIRED: { label: 'Retired', cls: 'bg-muted text-muted-foreground' },
};

// Component

type Props = {
  keyItem: Key;
  onMarkLost: (key: { id: string; code: string }) => void;
};

export const KeyCard = ({ keyItem, onMarkLost }: Props) => {
  const statusCfg = statusConfig[keyItem.status];

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <KeyRoundIcon className="size-4 text-primary" aria-hidden="true" />
          </div>
          <code className="font-mono text-base font-semibold text-foreground">
            {keyItem.code}
          </code>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={`More actions for ${keyItem.code}`}
            >
              <EllipsisIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {keyItem.status !== 'RETIRED' && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() =>
                  onMarkLost({ id: keyItem.id, code: keyItem.code })
                }
              >
                <XCircleIcon className="size-4" aria-hidden="true" />
                Mark as lost
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {keyItem.room}
        </span>
        <span className="text-xs text-muted-foreground">
          {keyItem.department}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {keyItem.hod !== '—' ? (
            <>
              <span className="font-bold text-white">HOD:</span> {keyItem.hod}
            </>
          ) : (
            <span className="italic">No HOD assigned</span>
          )}
          {keyItem.hodPending && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              aria-label="HOD has not activated their account yet"
            >
              <ClockIcon className="size-3" aria-hidden="true" />
              Pending activation
            </span>
          )}
        </span>
      </div>

      <span
        className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusCfg.cls}`}
        aria-label={`Status: ${statusCfg.label}`}
      >
        {statusCfg.label}
      </span>
    </div>
  );
};
