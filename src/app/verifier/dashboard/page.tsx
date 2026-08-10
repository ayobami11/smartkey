import { LiveRequestQueue } from '../_components/live-request-queue';
import { OutstandingKeys } from '../_components/outstanding-keys';

export const metadata = { title: 'Dashboard' };

export default function VerifierDashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Pending requests and outstanding keys for your shift.
        </p>
      </div>

      <LiveRequestQueue />
      <OutstandingKeys />
    </div>
  );
}
