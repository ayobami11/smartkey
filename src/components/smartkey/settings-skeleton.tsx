import { Skeleton } from '@/components/ui/skeleton';

export const SettingsSkeleton = () => (
  <div
    className="flex flex-1 flex-col gap-6 p-4 pt-0 lg:flex-row lg:gap-8"
    role="status"
    aria-busy="true"
    aria-label="Loading settings"
  >
    <div className="flex gap-2 lg:w-48 lg:shrink-0 lg:flex-col">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
    <div className="flex flex-1 flex-col gap-4">
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  </div>
);
