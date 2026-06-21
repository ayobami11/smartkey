import { LiveRequestQueue } from '../_components/live-request-queue';
import { OutstandingKeys } from '../_components/outstanding-keys';

export const metadata = { title: 'Dashboard' };

export default function VerifierDashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="grid flex-1 items-start gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Left 60% — live request queue */}
        <LiveRequestQueue />
        {/* Right 40% — outstanding keys */}
        <OutstandingKeys />
      </div>
    </div>
  );
}
