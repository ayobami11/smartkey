import Link from 'next/link';
import {
  FileTextIcon,
  SearchIcon,
  SirenIcon,
  UserPlusIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import { LiveZoneCounts } from '@/app/cso/dashboard/_components/live-zone-counts';
import { PendingReview } from '@/app/cso/dashboard/_components/pending-review';
import { RiskAlerts } from '@/app/cso/dashboard/_components/risk-alerts';

export default function CsoDashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/cso/reports">
            <FileTextIcon className="size-4" aria-hidden="true" />
            Generate report now
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cso/audit">
            <SearchIcon className="size-4" aria-hidden="true" />
            Search audit log
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cso/audit">
            <SirenIcon className="size-4" aria-hidden="true" />
            View incidents
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cso/users">
            <UserPlusIcon className="size-4" aria-hidden="true" />
            Provision user
          </Link>
        </Button>
      </div>

      {/* Three-column layout */}
      <div className="grid flex-1 items-start gap-6 lg:grid-cols-3">
        <LiveZoneCounts />
        <PendingReview />
        <RiskAlerts />
      </div>
    </div>
  );
}
