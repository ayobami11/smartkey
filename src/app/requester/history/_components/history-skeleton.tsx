import { Skeleton } from '@/components/ui/skeleton';

export const HistorySkeleton = () => (
  <div
    className="flex flex-col gap-3"
    aria-busy="true"
    aria-label="Loading history"
  >
    {Array.from({ length: 5 }).map((_, i) => (
      <Skeleton key={i} className="h-18 rounded-lg" />
    ))}
  </div>
);
