import { LiveRequestQueue } from '../_components/live-request-queue';
import { OutstandingKeys } from '../_components/outstanding-keys';

export const metadata = { title: 'Dashboard' };

export default function VerifierDashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <LiveRequestQueue />
      <OutstandingKeys />
    </div>
  );
}
