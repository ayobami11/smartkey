import { LayersIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

type KeyCopiesAvailableProps = {
  /** Copies free right now (`available_count` / `get_key_occupancy().available`). */
  available: number;
  /** Copies that exist (`keys.key_count`). */
  total: number;
  className?: string;
};

/**
 * "3 of 12 available" for a room with several interchangeable copies of its
 * key. Renders nothing for a single-copy key, where the status pill already
 * says everything.
 *
 * Neutral colour on purpose: the count is information, not a state, and the
 * state (Available, In use, Overdue…) is the pill's job. The icon is
 * decorative; screen readers get the full sentence from the label.
 */
export const KeyCopiesAvailable = ({
  available,
  total,
  className,
}: KeyCopiesAvailableProps) => {
  if (!Number.isFinite(total) || total <= 1) return null;
  const free = Math.min(Math.max(0, Math.floor(available)), total);

  return (
    <span
      role="img"
      aria-label={`${free} of ${total} copies of this key available`}
      className={cn(
        'inline-flex items-center gap-1 text-xs text-muted-foreground',
        className
      )}
    >
      <LayersIcon className="size-3" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground">
          {free} of {total}
        </span>{' '}
        available
      </span>
    </span>
  );
};
