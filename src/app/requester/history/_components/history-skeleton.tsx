import { Skeleton } from '@/components/ui/skeleton';

// Mirrors RequestCard's actual layout (stripe + p-4 content with three
// stacked lines and two badges) so the skeleton's height matches the real
// card's rendered height instead of guessing a single flat value.
export const HistorySkeleton = () => (
  <div
    className="flex flex-col gap-3"
    role="status"
    aria-busy="true"
    aria-label="Loading history"
  >
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        className="flex overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
      >
        <Skeleton className="w-1 shrink-0 rounded-none" />
        <div className="flex flex-1 items-center gap-3 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
        </div>
      </div>
    ))}
  </div>
);
