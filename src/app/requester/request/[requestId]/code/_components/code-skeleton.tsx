import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const CodeSkeleton = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6">
    <div className="w-full max-w-sm space-y-6">
      {/* Key context — zone / room name / key code */}
      <div className="flex flex-col items-center gap-1 text-center">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-0.5 h-5 w-40" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Code card — mirrors CardHeader + CodeCountdown + CardContent */}
      <Card>
        <div>
          <CardHeader className="pb-0 text-center">
            <Skeleton className="mx-auto h-4 w-32" />
          </CardHeader>
          {/* Countdown row */}
          <div className="flex justify-center pb-5 pt-2">
            <Skeleton className="h-3.5 w-16" />
          </div>
          {/* Progress bar */}
          <Skeleton className="h-1 rounded-none" />
        </div>
        <CardContent className="pb-6 pt-6 text-center">
          {/* 6-digit code at text-6xl */}
          <Skeleton className="mx-auto h-16 w-48" />
          {/* Instructional text */}
          <Skeleton className="mx-auto mt-4 h-3 w-56" />
        </CardContent>
      </Card>

      {/* "Request approved" badge */}
      <div className="flex justify-center">
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>

      {/* Back to dashboard button */}
      <Skeleton className="h-8 w-full rounded-md" />
    </div>
  </div>
);
