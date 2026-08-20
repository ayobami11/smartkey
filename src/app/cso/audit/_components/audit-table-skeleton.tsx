import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const AuditTableSkeleton = () => (
  <div className="flex flex-col gap-4" aria-busy="true">
    {/* Filter bar */}
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-9 min-w-56 flex-1" />
      <Skeleton className="h-9 w-22" />
      <Skeleton className="h-9 w-24" />
    </div>

    <div className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-4 w-10" />
            <TableHead className="px-4">
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className="px-4">
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className="px-4">
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className="px-4">
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className="px-4">
              <Skeleton className="h-4 w-16" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <TableRow key={i}>
              <TableCell className="px-4 py-3">
                <Skeleton className="size-4" />
              </TableCell>
              {[0, 1, 2, 3, 4].map((j) => (
                <TableCell key={j} className="px-4 py-3">
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    {/* Pagination */}
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Skeleton className="h-8 w-44" />
      <div className="flex items-center gap-1">
        <Skeleton className="h-9 w-24" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="size-9" />
        ))}
        <Skeleton className="h-9 w-16" />
      </div>
    </div>
  </div>
);
