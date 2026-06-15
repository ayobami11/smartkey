import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const UsersTableSkeleton = () => (
  <div className="flex flex-col gap-4" aria-busy="true">
    {/* Toolbar */}
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-9 min-w-56 flex-1" />
      <Skeleton className="h-9 w-22" />
      <Skeleton className="h-9 w-24" />
    </div>

    {/* Table */}
    <div className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
      <Table>
        <TableHeader>
          <TableRow>
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
            <TableHead className="px-4">
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className="sr-only" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[0, 1, 2, 3, 4].map((i) => (
            <TableRow key={i}>
              {[0, 1, 2, 3, 4, 5, 6].map((j) => (
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
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-center gap-1">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-14" />
        </div>
      </div>
    </div>
  </div>
);
