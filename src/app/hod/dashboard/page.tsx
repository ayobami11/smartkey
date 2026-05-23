import Link from 'next/link';
import {
  AlertCircleIcon,
  CalendarIcon,
  ChevronRightIcon,
  KeyRoundIcon,
} from 'lucide-react';

type WeekendRequest = {
  id: string;
  requester: string;
  keyCode: string;
  date: string;
  activity: string;
};

type DeptKey = {
  id: string;
  code: string;
  room: string;
  zone: string;
  slots: boolean[];
};

const weekendRequests: WeekendRequest[] = [
  {
    id: 'wr-001',
    requester: 'Dr. Bakare',
    keyCode: 'NS-304',
    date: 'Sat 3 May 2026',
    activity: 'Lab equipment maintenance',
  },
  {
    id: 'wr-002',
    requester: 'Mrs. Adeleke',
    keyCode: 'OS-12',
    date: 'Sun 4 May 2026',
    activity: 'Departmental retreat preparation',
  },
];

const deptKeys: DeptKey[] = [
  {
    id: 'ns-304',
    code: 'NS-304',
    room: 'Senate Hall A',
    zone: 'New Senate',
    slots: [true, true, true],
  },
  {
    id: 'ns-305',
    code: 'NS-305',
    room: 'Senate Hall B',
    zone: 'New Senate',
    slots: [true, true, false],
  },
  {
    id: 'ns-306',
    code: 'NS-306',
    room: 'Senate Conference Room',
    zone: 'New Senate',
    slots: [true, true, true],
  },
  {
    id: 'os-11',
    code: 'OS-11',
    room: 'Old Senate Lab 101',
    zone: 'Old Senate',
    slots: [true, false, false],
  },
  {
    id: 'os-12',
    code: 'OS-12',
    room: 'Old Senate Storage',
    zone: 'Old Senate',
    slots: [true, true, true],
  },
  {
    id: 'os-13',
    code: 'OS-13',
    room: 'Old Senate Equipment Bay',
    zone: 'Old Senate',
    slots: [false, false, false],
  },
];

const filterTabs = ['All keys', 'Has vacant slot', 'Recently used'] as const;

export default function HodDashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Good afternoon, Prof. Okonkwo.
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Faculty of Engineering
        </p>
      </div>

      <div className="grid flex-1 items-start gap-6 lg:grid-cols-3">
        {/* Left — weekend requests panel */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Weekend Requests
            </h2>
            <span className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
              {weekendRequests.length}
            </span>
          </div>

          {weekendRequests.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No pending requests right now.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {weekendRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {req.requester
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {req.requester}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {req.keyCode}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {req.date}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {req.activity}
                  </p>
                  <Link
                    href="/hod/weekend-requests"
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Review
                    <ChevronRightIcon className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
              ))}
            </div>
          )}

          <Link
            href="/hod/weekend-requests"
            className="text-center text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            View all requests
          </Link>
        </div>

        {/* Right — department key grid */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Department Keys
            </h2>
            <div
              className="flex items-center gap-1 border-b border-border"
              role="tablist"
              aria-label="Filter keys"
            >
              {filterTabs.map((tab, idx) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={idx === 0}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    idx === 0
                      ? '-mb-px border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {deptKeys.map((key) => {
              const filledCount = key.slots.filter(Boolean).length;
              const allVacant = filledCount === 0;
              return (
                <Link
                  key={key.id}
                  href={`/hod/keys/${key.id}`}
                  className={`flex flex-col gap-3 rounded-lg border p-4 shadow-[0_2px_4px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    allVacant
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${allVacant ? 'bg-amber-100' : 'bg-primary/10'}`}
                      >
                        <KeyRoundIcon
                          className={`size-4 ${allVacant ? 'text-amber-600' : 'text-primary'}`}
                          aria-hidden="true"
                        />
                      </div>
                      <code className="font-mono text-sm font-semibold text-foreground">
                        {key.code}
                      </code>
                    </div>
                    {allVacant && (
                      <AlertCircleIcon
                        className="size-4 shrink-0 text-amber-500"
                        aria-label="No collectors authorised"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {key.room}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {key.zone}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center gap-1"
                      aria-label={`${filledCount} of 3 collectors authorised`}
                    >
                      {key.slots.map((filled, i) => (
                        <div
                          key={i}
                          className={`size-2.5 rounded-full ${
                            filled
                              ? 'bg-primary'
                              : 'border-2 border-dashed border-border'
                          }`}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {filledCount}/3 authorised
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
