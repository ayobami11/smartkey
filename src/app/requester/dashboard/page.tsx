import { ActiveRequestBanner } from '@/app/requester/dashboard/_components/active-request-banner';
import { AuthorizedKeys } from '@/app/requester/dashboard/_components/authorized-keys';
import { OutstandingKeys } from '@/app/requester/dashboard/_components/outstanding-keys';
import { WeekendRequests } from '@/app/requester/dashboard/_components/weekend-requests';

export default function RequesterDashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <ActiveRequestBanner />
      <OutstandingKeys />
      <AuthorizedKeys />
      <WeekendRequests />
    </div>
  );
}
