import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { LiveRequestQueue } from '../_components/live-request-queue';
import { OutstandingKeys } from '../_components/outstanding-keys';
import { getQueryClient } from '@/lib/queries/get-query-client';
import {
  getLiveQueueSeed,
  getOutstandingKeysSeed,
} from '@/lib/queries/verifier-dashboard';

export const metadata = { title: 'Dashboard' };

export default async function VerifierDashboardPage() {
  const queryClient = getQueryClient();

  const [initialRequests] = await Promise.all([
    getLiveQueueSeed(),
    queryClient.prefetchQuery({
      queryKey: ['keys', 'outstanding'],
      queryFn: getOutstandingKeysSeed,
    }),
  ]);

  const dehydratedState = dehydrate(queryClient);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Pending requests and outstanding keys for your shift.
        </p>
      </div>

      <HydrationBoundary state={dehydratedState}>
        <LiveRequestQueue initialRequests={initialRequests} />
        <OutstandingKeys />
      </HydrationBoundary>
    </div>
  );
}
