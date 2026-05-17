import { MoreHorizontalIcon, SearchIcon, UserPlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Role = 'CSO' | 'HOD' | 'Verifier' | 'Requester';
type Status = 'Active' | 'Pending' | 'Deactivated';

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  status: Status;
  lastSignIn: string;
};

const roleClass: Record<Role, string> = {
  CSO: 'bg-primary/10 text-primary',
  HOD: 'bg-amber-100 text-amber-700',
  Verifier: 'bg-blue-100 text-blue-700',
  Requester: 'bg-muted text-muted-foreground',
};

const statusConfig: Record<Status, { label: string; class: string }> = {
  Active: { label: 'Active', class: 'bg-emerald-100 text-emerald-700' },
  Pending: {
    label: 'Pending activation',
    class: 'bg-amber-100 text-amber-700',
  },
  Deactivated: {
    label: 'Deactivated',
    class: 'bg-muted text-muted-foreground',
  },
};

const users: User[] = [
  {
    id: 'u-001',
    name: 'Adekunle Balogun',
    email: 'a.balogun@unilag.edu.ng',
    role: 'CSO',
    status: 'Active',
    lastSignIn: '14 May 2026, 08:02',
  },
  {
    id: 'u-002',
    name: 'Prof. Chidi Adeleke',
    email: 'c.adeleke@unilag.edu.ng',
    role: 'HOD',
    department: 'Faculty of Sciences',
    status: 'Active',
    lastSignIn: '14 May 2026, 09:15',
  },
  {
    id: 'u-003',
    name: 'Prof. Fatima Suleiman',
    email: 'f.suleiman@unilag.edu.ng',
    role: 'HOD',
    department: 'Faculty of Engineering',
    status: 'Active',
    lastSignIn: '13 May 2026, 14:30',
  },
  {
    id: 'u-004',
    name: 'Prof. Yetunde Bello',
    email: 'y.bello@unilag.edu.ng',
    role: 'HOD',
    department: 'Faculty of Medicine',
    status: 'Active',
    lastSignIn: '14 May 2026, 11:00',
  },
  {
    id: 'u-005',
    name: 'Dr. Aisha Mohammed',
    email: 'a.mohammed@unilag.edu.ng',
    role: 'HOD',
    department: 'Faculty of Law',
    status: 'Pending',
    lastSignIn: '—',
  },
  {
    id: 'u-006',
    name: 'Officer Musa Lawal',
    email: 'm.lawal@unilag.edu.ng',
    role: 'Verifier',
    status: 'Active',
    lastSignIn: '14 May 2026, 16:00',
  },
  {
    id: 'u-007',
    name: 'Officer Ibrahim Fashola',
    email: 'i.fashola@unilag.edu.ng',
    role: 'Verifier',
    status: 'Active',
    lastSignIn: '14 May 2026, 08:00',
  },
  {
    id: 'u-008',
    name: 'Officer Ngozi Adeleke',
    email: 'n.adeleke@unilag.edu.ng',
    role: 'Verifier',
    status: 'Pending',
    lastSignIn: '—',
  },
  {
    id: 'u-009',
    name: 'Dr. Emeka Bakare',
    email: 'e.bakare@unilag.edu.ng',
    role: 'Requester',
    department: 'Faculty of Sciences',
    status: 'Active',
    lastSignIn: '14 May 2026, 16:12',
  },
  {
    id: 'u-010',
    name: 'Mrs. Chidinma Nwosu',
    email: 'c.nwosu@unilag.edu.ng',
    role: 'Requester',
    department: 'Faculty of Engineering',
    status: 'Active',
    lastSignIn: '14 May 2026, 14:55',
  },
  {
    id: 'u-011',
    name: 'Mr. Babatunde Okafor',
    email: 'b.okafor@unilag.edu.ng',
    role: 'Requester',
    department: 'Faculty of Arts',
    status: 'Active',
    lastSignIn: '12 May 2026, 10:00',
  },
  {
    id: 'u-012',
    name: 'Mr. Femi Okonkwo',
    email: 'f.okonkwo@unilag.edu.ng',
    role: 'Requester',
    department: 'Faculty of Sciences',
    status: 'Deactivated',
    lastSignIn: '01 Apr 2026, 09:30',
  },
];

const filterChips = [
  'All',
  'Active',
  'Pending activation',
  'Deactivated',
  'CSO',
  'HOD',
  'Verifier',
  'Requester',
];

export default function UsersPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage SmartKey accounts across all roles.
          </p>
        </div>
        <Button>
          <UserPlusIcon className="size-4" aria-hidden="true" />
          Provision new user
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search by name or email"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter users"
        >
          {filterChips.map((chip, idx) => (
            <button
              key={chip}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                idx === 0
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
              aria-pressed={idx === 0}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const roleCls = roleClass[user.role];
              const statusCfg = statusConfig[user.status];
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium text-foreground">
                    {user.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${roleCls}`}
                    >
                      {user.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.department ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusCfg.class}`}
                    >
                      {statusCfg.label}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {user.lastSignIn}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      aria-label={`More actions for ${user.name}`}
                    >
                      <MoreHorizontalIcon
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Showing 1–10 of 12 users
        </p>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled="true"
                className="pointer-events-none opacity-50"
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">2</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
