'use client';

import { useEffect, useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';

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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UsersDataTable } from './_components/data-table';
import { ProvisionUserDialog } from './_components/provision-user-dialog';
import {
  type UserRole,
  type UserRow,
  type UserStatus,
} from './_components/columns';

// Component

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Resend invite
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Fetch all users
  const fetchUsers = async () => {
    setLoadState('loading');
    setFetchError(null);

    const params = new URLSearchParams({ limit: '1000' });

    try {
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setFetchError(json.error ?? 'Failed to load users.');
        setLoadState('error');
        return;
      }
      const incoming: UserRow[] = (
        (json.data?.users ?? []) as Record<string, unknown>[]
      ).map((u) => {
        const role = u.role as UserRole;
        const deptName = (u.department as Record<string, unknown> | null)
          ?.name as string | undefined;
        return {
          id: u.id as string,
          full_name: u.full_name as string,
          institutional_email: u.institutional_email as string,
          role,
          department:
            role === 'CSO' || role === 'VERIFIER'
              ? (deptName ?? 'Security')
              : deptName,
          status: u.status as UserStatus,
          last_sign_in_at: (u.last_sign_in_at as string | null) ?? null,
        };
      });
      setUsers(incoming);
      setLoadState('ready');
    } catch {
      setFetchError('Something went wrong. Check your connection.');
      setLoadState('error');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Revoke access
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

  // Resend invite
  const handleResend = async (user: UserRow) => {
    setResendingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/resend-invite`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to resend invite.');
        return;
      }
      toast.success(`Invite resent to ${user.institutional_email}.`);
    } catch {
      toast.error('Something went wrong. Check your connection.');
    } finally {
      setResendingId(null);
    }
  };

  // Render
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage SmartKey accounts across all roles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="Refresh users list"
            disabled={refreshing || loadState === 'loading'}
            onClick={async () => {
              setRefreshing(true);
              await fetchUsers();
              setRefreshing(false);
            }}
          >
            <RefreshCwIcon
              className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <ProvisionUserDialog onSuccess={() => fetchUsers()} />
        </div>
      </div>

      {/* Loading skeleton */}
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
                <TableHead>Last sign-in</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[0, 1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  {[0, 1, 2, 3, 4, 5, 6].map((j) => (
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
            onClick={() => fetchUsers()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Data table */}
      {loadState === 'ready' && (
        <UsersDataTable
          data={users}
          onRevoke={(user) =>
            setRevokeTarget({ id: user.id, name: user.full_name })
          }
          onResend={handleResend}
          resendingId={resendingId}
        />
      )}

      {/* Revoke access confirmation */}
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
