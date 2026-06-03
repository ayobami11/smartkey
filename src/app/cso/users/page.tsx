'use client';

import { useEffect, useState } from 'react';
import {
  MoreHorizontalIcon,
  SearchIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createBrowserClient } from '@/lib/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────

type UserRole = 'CSO' | 'HOD' | 'VERIFIER' | 'REQUESTER';
type UserStatus = 'ACTIVE' | 'PENDING_ACTIVATION' | 'DEACTIVATED';

type User = {
  id: string;
  full_name: string;
  institutional_email: string;
  role: UserRole;
  department?: string;
  status: UserStatus;
};

type Department = { id: string; name: string };

// ── Constants ─────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<UserRole, string> = {
  CSO: 'CSO',
  HOD: 'HOD',
  VERIFIER: 'Verifier',
  REQUESTER: 'Requester',
};

const ROLE_CLASS: Record<UserRole, string> = {
  CSO: 'bg-primary/10 text-primary',
  HOD: 'bg-amber-100 text-amber-700',
  VERIFIER: 'bg-blue-100 text-blue-700',
  REQUESTER: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  PENDING_ACTIVATION: 'Pending activation',
  DEACTIVATED: 'Deactivated',
};

const STATUS_CLASS: Record<UserStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PENDING_ACTIVATION: 'bg-amber-100 text-amber-700',
  DEACTIVATED: 'bg-muted text-muted-foreground',
};

const STATUS_CHIPS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Pending', value: 'PENDING_ACTIVATION' },
  { label: 'Deactivated', value: 'DEACTIVATED' },
];

const ROLE_CHIPS: { label: string; value: string }[] = [
  { label: 'All roles', value: '' },
  { label: 'CSO', value: 'CSO' },
  { label: 'HOD', value: 'HOD' },
  { label: 'Verifier', value: 'VERIFIER' },
  { label: 'Requester', value: 'REQUESTER' },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<
    'loading' | 'loadingMore' | 'ready' | 'error'
  >('loading');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Provision sheet
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pRole, setPRole] = useState<'HOD' | 'VERIFIER' | 'REQUESTER'>(
    'REQUESTER'
  );
  const [pDeptId, setPDeptId] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // ── Fetch users ───────────────────────────────────────────────────────────

  const fetchUsers = async (reset = true, cursor?: string) => {
    if (reset) setLoadState('loading');
    else setLoadState('loadingMore');
    setFetchError(null);

    const params = new URLSearchParams({ limit: '20' });
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (cursor) params.set('cursor', cursor);

    try {
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setFetchError(json.error ?? 'Failed to load users.');
        setLoadState('error');
        return;
      }
      const incoming: User[] = (
        (json.data?.users ?? []) as Record<string, unknown>[]
      ).map((u) => ({
        id: u.id as string,
        full_name: u.full_name as string,
        institutional_email: u.institutional_email as string,
        role: u.role as UserRole,
        department:
          ((u.department as Record<string, unknown> | null)?.name as
            | string
            | undefined) ?? undefined,
        status: u.status as UserStatus,
      }));
      setNextCursor(json.data?.next_cursor ?? null);
      setUsers(reset ? incoming : (prev) => [...prev, ...incoming]);
      setLoadState('ready');
    } catch {
      setFetchError('Something went wrong. Check your connection.');
      setLoadState('error');
    }
  };

  useEffect(() => {
    fetchUsers(true);
  }, [roleFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch departments ─────────────────────────────────────────────────────

  const fetchDepartments = async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .order('name');
    setDepartments(data ?? []);
  };

  const handleOpenProvision = () => {
    setProvisionOpen(true);
    setPName('');
    setPEmail('');
    setPRole('REQUESTER');
    setPDeptId('');
    setProvisionError(null);
    fetchDepartments();
  };

  // ── Provision user ────────────────────────────────────────────────────────

  const handleProvision = async () => {
    setProvisioning(true);
    setProvisionError(null);
    try {
      const body: Record<string, string> = {
        full_name: pName,
        institutional_email: pEmail,
        role: pRole,
      };
      if ((pRole === 'HOD' || pRole === 'REQUESTER') && pDeptId) {
        body.department_id = pDeptId;
      }
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setProvisionError(json.error ?? 'Failed to provision user.');
        return;
      }
      setProvisionOpen(false);
      // Refetch to show the new user
      fetchUsers(true);
    } catch {
      setProvisionError('Something went wrong. Check your connection.');
    } finally {
      setProvisioning(false);
    }
  };

  // ── Revoke access ─────────────────────────────────────────────────────────

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const res = await fetch(`/api/admin/users/${revokeTarget.id}/revoke`, {
        method: 'PATCH',
      });
      const json = await res.json();
      if (!res.ok) {
        setRevokeError(json.error ?? 'Failed to revoke access.');
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === revokeTarget.id
            ? { ...u, status: 'DEACTIVATED' as UserStatus }
            : u
        )
      );
      setRevokeTarget(null);
    } catch {
      setRevokeError('Something went wrong. Check your connection.');
    } finally {
      setRevoking(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const filtered = search
    ? users.filter(
        (u) =>
          u.full_name.toLowerCase().includes(search.toLowerCase()) ||
          u.institutional_email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  // ── Render ────────────────────────────────────────────────────────────────

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

      {/* Search + filters */}
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by status"
        >
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setStatusFilter(chip.value)}
              aria-pressed={statusFilter === chip.value}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                statusFilter === chip.value
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by role"
        >
          {ROLE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setRoleFilter(chip.value)}
              aria-pressed={roleFilter === chip.value}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                roleFilter === chip.value
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loadState === 'loading' && (
        <div
          className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
          aria-busy="true"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[0, 1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  {[0, 1, 2, 3, 4, 5].map((j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Error */}
      {loadState === 'error' && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive">
            Failed to load users
          </p>
          {fetchError && (
            <p className="mt-1 text-xs text-destructive/80">{fetchError}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => fetchUsers(true)}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Content */}
      {(loadState === 'ready' || loadState === 'loadingMore') && (
        <>
          {filtered.length === 0 ? (
            <Empty className="border border-border bg-card">
              <EmptyMedia variant="icon">
                <UsersIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
              </EmptyMedia>
              <EmptyContent>
                <EmptyTitle>No users found</EmptyTitle>
                <EmptyDescription>
                  No users match the current filters.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="sr-only">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium text-foreground">
                        {user.full_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.institutional_email}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_CLASS[user.role]}`}
                        >
                          {ROLE_LABEL[user.role]}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.department ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[user.status]}`}
                          aria-label={`Status: ${STATUS_LABEL[user.status]}`}
                        >
                          {STATUS_LABEL[user.status]}
                        </span>
                      </TableCell>
                      <TableCell>
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
                          <DropdownMenuContent align="end">
                            {user.status !== 'DEACTIVATED' && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() =>
                                  setRevokeTarget({
                                    id: user.id,
                                    name: user.full_name,
                                  })
                                }
                              >
                                Revoke access
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} user{filtered.length !== 1 ? 's' : ''}
            </p>
            {nextCursor && (
              <Button
                variant="outline"
                onClick={() => fetchUsers(false, nextCursor ?? undefined)}
                disabled={loadState === 'loadingMore'}
                aria-busy={loadState === 'loadingMore'}
              >
                {loadState === 'loadingMore' ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </div>
        </>
      )}

      {/* Provision user Sheet */}
      <Sheet open={provisionOpen} onOpenChange={setProvisionOpen}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle>Provision new user</SheetTitle>
            <SheetDescription>
              Create a new SmartKey account. An activation link will be sent to
              the user&apos;s institutional email.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="p-name">Full name</Label>
              <Input
                id="p-name"
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="e.g. Dr. Adebayo Okafor"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="p-email">Institutional email</Label>
              <Input
                id="p-email"
                type="email"
                value={pEmail}
                onChange={(e) => setPEmail(e.target.value)}
                placeholder="name@unilag.edu.ng"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="p-role">Role</Label>
              <Select
                value={pRole}
                onValueChange={(v) =>
                  setPRole(v as 'HOD' | 'VERIFIER' | 'REQUESTER')
                }
              >
                <SelectTrigger id="p-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOD">HOD</SelectItem>
                  <SelectItem value="VERIFIER">Verifier</SelectItem>
                  <SelectItem value="REQUESTER">Requester</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(pRole === 'HOD' || pRole === 'REQUESTER') && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="p-dept">Department</Label>
                <Select value={pDeptId} onValueChange={setPDeptId}>
                  <SelectTrigger id="p-dept">
                    <SelectValue placeholder="Select a department…" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {provisionError && (
              <p className="text-sm text-destructive" role="alert">
                {provisionError}
              </p>
            )}
          </div>
          <SheetFooter className="border-t border-border p-6">
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            <Button
              disabled={!pName.trim() || !pEmail.trim() || provisioning}
              aria-busy={provisioning}
              onClick={handleProvision}
            >
              {provisioning ? 'Provisioning…' : 'Provision user'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Revoke access AlertDialog */}
      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke access for {revokeTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately deactivate their account and invalidate
              their session. They will not be able to sign in until access is
              reinstated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError && (
            <p className="text-sm text-destructive" role="alert">
              {revokeError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              aria-busy={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking ? 'Revoking…' : 'Revoke access'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
