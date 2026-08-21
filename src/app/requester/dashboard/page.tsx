import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ActiveRequestBanner } from '@/app/requester/dashboard/_components/active-request-banner';
import { AuthorizedKeys } from '@/app/requester/dashboard/_components/authorized-keys';
import { OutstandingKeys } from '@/app/requester/dashboard/_components/outstanding-keys';
import { WeekendRequests } from '@/app/requester/dashboard/_components/weekend-requests';
import { getQueryClient } from '@/lib/queries/get-query-client';
import { createServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard' };

type ActiveRequest = {
  id: string;
  status: 'CODE_ISSUED';
  code: string | null;
  code_expires_at: string | null;
  key: { code: string; room_name: string } | null;
};

type OutstandingKey = {
  id: string;
  status: 'KEY_ISSUED' | 'KEY_OVERDUE';
  return_code: string | null;
  return_code_expires_at: string | null;
  return_deadline: string;
  issued_at: string;
  key: { code: string; room_name: string; zone: string } | null;
};

type AuthorisedKey = {
  key: {
    id: string;
    code: string;
    zone: string;
    room_name: string;
    status: string;
  };
};

type WeekendStatus = 'PENDING_HOD' | 'APPROVED' | 'DECLINED';

type WeekendRequest = {
  id: string;
  status: WeekendStatus;
  requested_for: string;
  key: { code: string; room_name: string } | null;
};

// Extracted so the impure Date.now() call isn't inline inside the page
// component's body — React Compiler's purity rule flags that even inside a
// nested async closure like a queryFn.
const withOverdueStatus = <T extends { return_deadline: string | null }>(
  rows: T[]
): (T & { status: 'KEY_ISSUED' | 'KEY_OVERDUE' })[] => {
  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    status:
      row.return_deadline !== null &&
      new Date(row.return_deadline).getTime() < now
        ? ('KEY_OVERDUE' as const)
        : ('KEY_ISSUED' as const),
  }));
};

export default async function RequesterDashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const queryClient = getQueryClient();

  if (userId) {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['active-request', userId],
        queryFn: async () => {
          const { data } = await supabase
            .from('requests')
            .select(
              'id, status, code, code_expires_at, key:keys!key_id(code, room_name)'
            )
            .eq('requester_id', userId)
            .in('status', ['CODE_ISSUED'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return (data as ActiveRequest | null) ?? null;
        },
      }),
      queryClient.prefetchQuery({
        queryKey: ['outstanding-keys', userId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('requests')
            .select(
              'id, status, return_code, return_code_expires_at, return_deadline, issued_at, key:keys!key_id(code, room_name, zone)'
            )
            .eq('requester_id', userId)
            .in('status', ['KEY_ISSUED'])
            .order('issued_at', { ascending: false });

          if (error)
            throw new Error(
              error.message ?? 'Failed to load your issued keys.'
            );

          return withOverdueStatus(data ?? []) as OutstandingKey[];
        },
      }),
      queryClient.prefetchQuery({
        queryKey: ['requester', 'authorized-keys'],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('authorisations')
            .select('key:keys!key_id(id, code, zone, room_name, status)')
            .eq('profile_id', userId);

          if (error) throw new Error('Failed to load your authorised keys.');
          return {
            keys: (data ?? []) as unknown as AuthorisedKey[],
            userId,
          };
        },
      }),
      queryClient.prefetchQuery({
        queryKey: ['weekend-requests', userId],
        queryFn: async () => {
          const { data } = await supabase
            .from('requests')
            .select(
              'id, status, requested_for, key:keys!key_id(code, room_name)'
            )
            .eq('requester_id', userId)
            .eq('type', 'WEEKEND')
            .in('status', ['PENDING_HOD', 'APPROVED', 'DECLINED'])
            .order('requested_for', { ascending: true });
          return (data as WeekendRequest[] | null) ?? [];
        },
      }),
    ]);
  }

  const dehydratedState = dehydrate(queryClient);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your authorised keys and active requests.
        </p>
      </div>

      <HydrationBoundary state={dehydratedState}>
        <ActiveRequestBanner userId={userId} />
        <OutstandingKeys userId={userId} />
        <AuthorizedKeys />
        <WeekendRequests userId={userId} />
      </HydrationBoundary>
    </div>
  );
}
