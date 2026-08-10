import { ActiveRequestBanner } from '@/app/requester/dashboard/_components/active-request-banner';
import { AuthorizedKeys } from '@/app/requester/dashboard/_components/authorized-keys';
import { OutstandingKeys } from '@/app/requester/dashboard/_components/outstanding-keys';
import { WeekendRequests } from '@/app/requester/dashboard/_components/weekend-requests';

export const metadata = { title: 'Dashboard' };

export default function RequesterDashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your authorised keys and active requests.
        </p>
      </div>

      <ActiveRequestBanner />
      <OutstandingKeys />
      <AuthorizedKeys />
      <WeekendRequests />
    </div>
  );
}
