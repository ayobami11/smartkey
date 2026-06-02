import { ActiveRequestBanner } from '../_components/active-request-banner';
import { AuthorizedKeys } from '../_components/authorized-keys';

export default function RequesterDashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <ActiveRequestBanner />
      <AuthorizedKeys />
    </div>
  );
}
