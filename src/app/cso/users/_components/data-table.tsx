'use client';

import { useMemo, useState } from 'react';
import { CirclePlusIcon, SearchIcon } from 'lucide-react';
import {
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ROLE_LABEL,
  STATUS_LABEL,
  type ColumnCallbacks,
  type UserRole,
  type UserRow,
  type UserStatus,
  createColumns,
} from '@/app/cso/users/_components/columns';

// Filter option lists

const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: ROLE_LABEL.CSO, value: 'CSO' },
  { label: ROLE_LABEL.HOD, value: 'HOD' },
  { label: ROLE_LABEL.VERIFIER, value: 'VERIFIER' },
  { label: ROLE_LABEL.REQUESTER, value: 'REQUESTER' },
];

const STATUS_OPTIONS: { label: string; value: UserStatus }[] = [
  { label: STATUS_LABEL.ACTIVE, value: 'ACTIVE' },
  { label: STATUS_LABEL.PENDING_ACTIVATION, value: 'PENDING_ACTIVATION' },
  { label: STATUS_LABEL.DEACTIVATED, value: 'DEACTIVATED' },
];

// Component

type UsersDataTableProps = { data: UserRow[] } & ColumnCallbacks;

export const UsersDataTable = ({
  data,
  onEdit,
  onRevoke,
  onResend,
  resendingId,
}: UsersDataTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const columns = useMemo(
    () => createColumns({ onEdit, onRevoke, onResend, resendingId }),
    [onEdit, onRevoke, onResend, resendingId]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
  });

  const roleFilterValue =
    (table.getColumn('role')?.getFilterValue() as string[] | undefined) ?? [];
  const statusFilterValue =
    (table.getColumn('status')?.getFilterValue() as string[] | undefined) ?? [];

  const toggleFilter = (columnId: string, value: string, current: string[]) => {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    table.getColumn(columnId)?.setFilterValue(next.length ? next : undefined);
    table.setPageIndex(0);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Global search */}
        <InputGroup className="min-w-56 flex-1">
          <InputGroupInput
            type="search"
            placeholder="Search by name or email"
            aria-label="Search users"
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              table.setPageIndex(0);
            }}
          />
          <InputGroupAddon align="inline-start">
            <SearchIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </InputGroupAddon>
        </InputGroup>

        {/* Role multi-filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-dashed"
            >
              <CirclePlusIcon className="size-3.5" aria-hidden="true" />
              Role
              {roleFilterValue.length > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {roleFilterValue.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>Filter by role</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ROLE_OPTIONS.map((opt) => (
              <DropdownMenuCheckboxItem
                key={opt.value}
                checked={roleFilterValue.includes(opt.value)}
                onCheckedChange={() =>
                  toggleFilter('role', opt.value, roleFilterValue)
                }
              >
                {opt.label}
              </DropdownMenuCheckboxItem>
            ))}
            {roleFilterValue.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    table.getColumn('role')?.setFilterValue(undefined);
                    table.setPageIndex(0);
                  }}
                  className="text-muted-foreground"
                >
                  Clear filter
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status multi-filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-dashed"
            >
              <CirclePlusIcon className="size-3.5" aria-hidden="true" />
              Status
              {statusFilterValue.length > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {statusFilterValue.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_OPTIONS.map((opt) => (
              <DropdownMenuCheckboxItem
                key={opt.value}
                checked={statusFilterValue.includes(opt.value)}
                onCheckedChange={() =>
                  toggleFilter('status', opt.value, statusFilterValue)
                }
              >
                {opt.label}
              </DropdownMenuCheckboxItem>
            ))}
            {statusFilterValue.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    table.getColumn('status')?.setFilterValue(undefined);
                    table.setPageIndex(0);
                  }}
                  className="text-muted-foreground"
                >
                  Clear filter
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No users match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(val) => {
              table.setPageSize(Number(val));
              table.setPageIndex(0);
            }}
          >
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {Math.max(table.getPageCount(), 1)}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
