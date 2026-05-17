import Link from 'next/link';
import {
  BotIcon,
  DownloadIcon,
  FileTextIcon,
  FlagIcon,
  KeyRoundIcon,
  RotateCcwIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

type Report = {
  id: string;
  shift: number;
  date: string;
  timeRange: string;
  officers: string[];
  issued: number;
  returned: number;
  flagged: number;
};

const reportGroups: { day: string; items: Report[] }[] = [
  {
    day: 'Today — Wed 14 May 2026',
    items: [
      {
        id: 'r-001',
        shift: 3,
        date: 'Wed 14 May 2026',
        timeRange: '16:00–00:00',
        officers: ['Officer Musa', 'Officer Adeleke'],
        issued: 8,
        returned: 7,
        flagged: 1,
      },
      {
        id: 'r-002',
        shift: 2,
        date: 'Wed 14 May 2026',
        timeRange: '08:00–16:00',
        officers: ['Officer Ibrahim', 'Officer Okonkwo'],
        issued: 12,
        returned: 12,
        flagged: 0,
      },
    ],
  },
  {
    day: 'Tue 13 May 2026',
    items: [
      {
        id: 'r-003',
        shift: 3,
        date: 'Tue 13 May 2026',
        timeRange: '16:00–00:00',
        officers: ['Officer Musa', 'Officer Adeleke'],
        issued: 10,
        returned: 9,
        flagged: 2,
      },
      {
        id: 'r-004',
        shift: 2,
        date: 'Tue 13 May 2026',
        timeRange: '08:00–16:00',
        officers: ['Officer Fashola', 'Officer Nwosu'],
        issued: 15,
        returned: 15,
        flagged: 0,
      },
      {
        id: 'r-005',
        shift: 1,
        date: 'Tue 13 May 2026',
        timeRange: '00:00–08:00',
        officers: ['Officer Bakare', 'Officer Lawal'],
        issued: 2,
        returned: 2,
        flagged: 0,
      },
    ],
  },
];

const filterChips = [
  'All',
  'Last 7 days',
  'Last 30 days',
  'Has incidents',
  'Has anomalies',
];

export default function ShiftReportsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Shift Reports
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            AI-generated summaries of key events, flagged incidents, and
            chain-of-custody logs per shift.
          </p>
        </div>
        <Button>
          <FileTextIcon className="size-4" aria-hidden="true" />
          Generate report now
        </Button>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter reports"
      >
        {filterChips.map((chip, idx) => (
          <button
            key={chip}
            type="button"
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              idx === 0
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card text-foreground hover:bg-muted'
            }`}
            aria-pressed={idx === 0}
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-8">
        {reportGroups.map((group) => (
          <div key={group.day} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.day}
            </h2>
            {group.items.map((report) => (
              <Link
                key={report.id}
                href={`/cso/reports/${report.id}`}
                className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      Shift {report.shift} — {report.date}, {report.timeRange}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {report.officers.join(', ')}
                    </span>
                  </div>
                  <DownloadIcon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <KeyRoundIcon
                      className="size-3.5 text-primary"
                      aria-hidden="true"
                    />
                    {report.issued} issued
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <RotateCcwIcon
                      className="size-3.5 text-emerald-600"
                      aria-hidden="true"
                    />
                    {report.returned} returned
                  </span>
                  {report.flagged > 0 && (
                    <span className="flex items-center gap-1.5 text-destructive">
                      <FlagIcon className="size-3.5" aria-hidden="true" />
                      {report.flagged} flagged
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BotIcon className="size-3.5" aria-hidden="true" />
                  <span>Generated by AI from shift event data</span>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
