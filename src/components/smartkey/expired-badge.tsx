import { HourglassIcon } from 'lucide-react';

export const ExpiredBadge = () => (
  <span
    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
    aria-label="Expired"
  >
    <HourglassIcon className="size-3" aria-hidden="true" />
    Expired
  </span>
);
