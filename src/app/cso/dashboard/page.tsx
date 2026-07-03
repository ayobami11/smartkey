export const metadata = { title: 'Dashboard' };

import { EventsChart } from '@/app/cso/dashboard/_components/events-chart';
import { IncidentsChart } from '@/app/cso/dashboard/_components/incidents-chart';
import { KeysChart } from '@/app/cso/dashboard/_components/keys-chart';
import { PendingReview } from '@/app/cso/dashboard/_components/pending-review';
import { RiskAlerts } from '@/app/cso/dashboard/_components/risk-alerts';
import { SignatureMismatchAlerts } from '@/app/cso/dashboard/_components/signature-mismatch-alerts';
import { WeekendRequests } from '@/app/cso/dashboard/_components/weekend-requests';

export default function CsoDashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Live overview of pending decisions, key status, and recent activity.
        </p>
      </div>

      {/* Needs your attention */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PendingReview />
        <SignatureMismatchAlerts />
        <RiskAlerts />
        <WeekendRequests />
      </div>

      {/* Live status */}
      <KeysChart />

      {/* Trends */}
      <div className="grid gap-6 md:grid-cols-2">
        <IncidentsChart />
        <EventsChart />
      </div>
    </div>
  );
}
