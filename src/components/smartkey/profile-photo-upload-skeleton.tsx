import { Skeleton } from '@/components/ui/skeleton';

export const ProfilePhotoUploadSkeleton = () => (
  <div className="flex items-center gap-4">
    <Skeleton className="size-20 shrink-0 rounded-full" />
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-28 rounded-md" />
      <Skeleton className="h-8 w-28 rounded-md" />
    </div>
  </div>
);
