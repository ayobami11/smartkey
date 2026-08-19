import { ClockIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

import { type RequestStatus, type RequestType } from '@/lib/constants';
import { formatDate, relativeTimeCompact } from '@/lib/dates';

// Re-export so callers don't need to update their imports.
export type { RequestStatus, RequestType };

export type RequestRow = {
  id: string;
  created_at: string;
  type: RequestType;
  status: RequestStatus;
  key: { code: string; room_name: string } | null;
};

// Config

const STATUS_CONFIG: Record<
  RequestStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    stripe: string;
  }
> = {
  PENDING_HOD: {
    label: 'Pending approval',
    variant: 'secondary',
    stripe: 'bg-amber-400',
  },
  APPROVED: {
    label: 'Approved',
    variant: 'secondary',
    stripe: 'bg-teal-500',
  },
  CODE_ISSUED: {
    label: 'Code issued',
    variant: 'secondary',
    stripe: 'bg-blue-400',
  },
  KEY_ISSUED: {
    label: 'Key issued',
    variant: 'default',
    stripe: 'bg-primary',
  },
  KEY_RETURNED: {
    label: 'Returned',
    variant: 'outline',
    stripe: 'bg-emerald-500',
  },
  EXPIRED: {
    label: 'Expired',
    variant: 'secondary',
    stripe: 'bg-slate-400',
  },
  CANCELLED: {
    label: 'Cancelled',
    variant: 'secondary',
    stripe: 'bg-orange-400',
  },
  DECLINED: {
    label: 'Declined',
    variant: 'destructive',
    stripe: 'bg-destructive',
  },
};

// Component

type RequestCardProps = { request: RequestRow };

export const RequestCard = ({ request }: RequestCardProps) => {
  const statusCfg = STATUS_CONFIG[request.status] ?? {
    label: request.status,
    variant: 'secondary' as const,
    stripe: 'bg-slate-400',
  };

  return (
    <li className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
      <div className={`w-1 shrink-0 ${statusCfg.stripe}`} aria-hidden="true" />
      <div className="flex flex-1 items-center gap-3 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-foreground">
              {request.key?.code ?? '—'}
            </span>
            <Badge
              variant={statusCfg.variant}
              aria-label={`Status: ${statusCfg.label}`}
              className="text-xs"
            >
              {statusCfg.label}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {request.key?.room_name ?? 'Key unavailable'}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ClockIcon className="size-3 shrink-0" aria-hidden="true" />
            <time
              dateTime={request.created_at}
              title={formatDate(request.created_at)}
            >
              {relativeTimeCompact(request.created_at)}
            </time>
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-xs">
          {request.type === 'WEEKDAY' ? 'Weekday' : 'Weekend'}
        </Badge>
      </div>
    </li>
  );
};
