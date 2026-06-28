'use client';

import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
} from 'lucide-react';
import { type ColumnDef, type FilterFn, type Row } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  type UserRole,
  type UserStatus,
  ROLE_LABELS,
  ROLE_CLASSES,
  USER_STATUS_LABELS,
  USER_STATUS_CLASSES,
} from '@/lib/constants';
import { formatLastSignIn } from '@/lib/dates';

// Re-export so callers that already import from here don't need to change.
export type { UserRole, UserStatus };

// Types

export type UserRow = {
  id: string;
  full_name: string;
  institutional_email: string;
  role: UserRole;
  department: string | undefined;
  status: UserStatus;
  last_sign_in_at: string | null;
};

export type ColumnCallbacks = {
  onEdit: (user: UserRow) => void;
  onRevoke: (user: UserRow) => void;
  onResend: (user: UserRow) => void;
  resendingId: string | null;
};

// Re-export maps so callers that already import from here don't need to change.
export { ROLE_LABELS as ROLE_LABEL, USER_STATUS_LABELS as STATUS_LABEL };

// Custom filter: scalar cell value must be present in the filter string[]
const multiValueFilter: FilterFn<UserRow> = (
  row,
  columnId,
  filterValue: string[]
) => !filterValue?.length || filterValue.includes(row.getValue(columnId));
multiValueFilter.autoRemove = (val: string[]) => !val?.length;

// Custom sort: null values always sort to the bottom regardless of direction
const nullsLastSort = (
  rowA: Row<UserRow>,
  rowB: Row<UserRow>,
  columnId: string
): number => {
  const a = rowA.getValue<string | null>(columnId);
  const b = rowB.getValue<string | null>(columnId);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
};

// Sortable header button

const SortableHeader = ({
  column,
  label,
}: {
  column: {
    toggleSorting: (asc: boolean) => void;
    getIsSorted: () => false | 'asc' | 'desc';
  };
  label: string;
}) => {
  const sorted = column.getIsSorted();
  const Icon =
    sorted === 'asc'
      ? ArrowUpIcon
      : sorted === 'desc'
        ? ArrowDownIcon
        : ArrowUpDownIcon;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {label}
      <Icon className="ml-2 size-3.5" aria-hidden="true" />
    </Button>
  );
};

// Column factory

export const createColumns = (
  callbacks: ColumnCallbacks
): ColumnDef<UserRow>[] => [
  {
    accessorKey: 'full_name',
    enableGlobalFilter: true,
    enableSorting: true,
    header: ({ column }) => <SortableHeader column={column} label="Name" />,
    cell: ({ row }) => (
      <span className="block max-w-40 truncate font-medium text-foreground">
        {row.getValue<string>('full_name')}
      </span>
    ),
  },
  {
    accessorKey: 'institutional_email',
    enableGlobalFilter: true,
    enableSorting: true,
    header: ({ column }) => <SortableHeader column={column} label="Email" />,
    cell: ({ row }) => (
      <span className="block max-w-52 truncate text-muted-foreground">
        {row.getValue<string>('institutional_email')}
      </span>
    ),
  },
  {
    accessorKey: 'role',
    enableSorting: false,
    enableGlobalFilter: false,
    filterFn: multiValueFilter,
    header: 'Role',
    cell: ({ row }) => {
      const role = row.getValue<UserRole>('role');
      return (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_CLASSES[role]}`}
        >
          {ROLE_LABELS[role]}
        </span>
      );
    },
  },
  {
    accessorKey: 'department',
    enableGlobalFilter: false,
    enableSorting: true,
    header: ({ column }) => <SortableHeader column={column} label="Unit" />,
    cell: ({ row }) => (
      <span className="block max-w-36 truncate text-muted-foreground">
        {row.getValue<string | undefined>('department') ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    enableSorting: false,
    enableGlobalFilter: false,
    filterFn: multiValueFilter,
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue<UserStatus>('status');
      return (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${USER_STATUS_CLASSES[status]}`}
          aria-label={`Status: ${USER_STATUS_LABELS[status]}`}
        >
          {USER_STATUS_LABELS[status]}
        </span>
      );
    },
  },
  {
    accessorKey: 'last_sign_in_at',
    enableSorting: true,
    enableGlobalFilter: false,
    sortingFn: nullsLastSort,
    header: ({ column }) => (
      <SortableHeader column={column} label="Last sign-in" />
    ),
    cell: ({ row }) => {
      const iso = row.getValue<string | null>('last_sign_in_at');
      return (
        <span
          className="text-muted-foreground"
          aria-label={
            iso
              ? `Last sign-in: ${new Date(iso).toLocaleString()}`
              : 'Never signed in'
          }
        >
          {formatLastSignIn(iso)}
        </span>
      );
    },
  },
  {
    id: 'actions',
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      const user = row.original;
      const { onEdit, onRevoke, onResend, resendingId } = callbacks;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={`More actions for ${user.full_name}`}
            >
              <MoreHorizontalIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onEdit(user)}>
              Edit details
            </DropdownMenuItem>
            {user.status === 'PENDING_ACTIVATION' && (
              <DropdownMenuItem
                disabled={resendingId === user.id}
                onClick={() => onResend(user)}
              >
                {resendingId === user.id ? 'Resending...' : 'Resend invite'}
              </DropdownMenuItem>
            )}
            {user.status !== 'DEACTIVATED' && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onRevoke(user)}
              >
                Revoke access
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
