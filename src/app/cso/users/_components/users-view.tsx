'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
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
import { UsersDataTable } from '@/app/cso/users/_components/data-table';
import { EditUserDialog } from '@/app/cso/users/_components/edit-user-dialog';
import { ProvisionUserDialog } from '@/app/cso/users/_components/provision-user-dialog';
import { UsersTableSkeleton } from '@/app/cso/users/_components/users-table-skeleton';
import {
  type UserRole,
  type UserRow,
  type UserStatus,
} from '@/app/cso/users/_components/columns';

// Component

export const UsersView = () => {
  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);

  // Resend invite
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Fetch users
  const {
    data: users = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<UserRow[]>({
    queryKey: ['cso', 'users'],
    queryFn: async () => {
      const result = await apiFetch<{ users: Record<string, unknown>[] }>(
        '/api/admin/users'
      );
      if (result.error || !result.data)
        throw new Error(result.error ?? 'Failed to load users.');
      return (result.data.users ?? []).map((u) => {
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
    },
    staleTime: 60_000,
  });

  // Revoke access
  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    const result = await apiFetch(
      `/api/admin/users/${revokeTarget.id}/revoke`,
      { method: 'PATCH' }
    );
    if (result.error) {
      setRevokeError(result.error);
      setRevoking(false);
      return;
    }
    setRevoking(false);
    toast.success(`Access revoked for ${revokeTarget.name}.`);
    setRevokeTarget(null);
    refetch();
  };

  // Resend invite
  const handleResend = async (user: UserRow) => {
    setResendingId(user.id);
    const result = await apiFetch(`/api/admin/users/${user.id}/resend-invite`, {
      method: 'POST',
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Invite resent to ${user.institutional_email}.`);
    }
    setResendingId(null);
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
        <ProvisionUserDialog onSuccess={() => refetch()} />
      </div>

      {/* Loading skeleton */}
      {isLoading && <UsersTableSkeleton />}

      {/* Error */}
      {isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-destructive">
            Failed to load users
          </p>
          {error instanceof Error && (
            <p className="mt-1 text-xs text-destructive/80">{error.message}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Data table */}
      {!isLoading && !isError && (
        <UsersDataTable
          data={users}
          onEdit={(user) => setEditTarget(user)}
          onRevoke={(user) =>
            setRevokeTarget({ id: user.id, name: user.full_name })
          }
          onResend={handleResend}
          resendingId={resendingId}
        />
      )}

      {/* Edit user */}
      <EditUserDialog
        user={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={() => refetch()}
      />

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
            <AlertDialogTitle className="text-lg">
              Revoke access for {revokeTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
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
              {revoking ? 'Revoking...' : 'Revoke access'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
