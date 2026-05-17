import { EllipsisIcon, KeyRoundIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

type KeyStatus = 'AVAILABLE' | 'ISSUED' | 'OVERDUE' | 'RETIRED';

type Key = {
  id: string;
  code: string;
  room: string;
  department: string;
  hod: string;
  status: KeyStatus;
};

const statusConfig: Record<KeyStatus, { label: string; class: string }> = {
  AVAILABLE: { label: 'Available', class: 'bg-emerald-100 text-emerald-700' },
  ISSUED: { label: 'Issued', class: 'bg-primary/10 text-primary' },
  OVERDUE: { label: 'Overdue', class: 'bg-destructive/10 text-destructive' },
  RETIRED: { label: 'Retired', class: 'bg-muted text-muted-foreground' },
};

const keys: Key[] = [
  {
    id: 'k-001',
    code: 'NS-101',
    room: 'New Senate Room 101',
    department: 'Faculty of Arts',
    hod: 'Prof. Yetunde Bello',
    status: 'AVAILABLE',
  },
  {
    id: 'k-002',
    code: 'NS-211',
    room: 'New Senate Room 211',
    department: 'Faculty of Sciences',
    hod: 'Prof. Chidi Adeleke',
    status: 'AVAILABLE',
  },
  {
    id: 'k-003',
    code: 'NS-304',
    room: 'New Senate Room 304',
    department: 'Faculty of Engineering',
    hod: 'Prof. Fatima Suleiman',
    status: 'ISSUED',
  },
  {
    id: 'k-004',
    code: 'NS-405',
    room: 'New Senate Room 405',
    department: 'Faculty of Law',
    hod: 'Dr. Aisha Mohammed',
    status: 'AVAILABLE',
  },
  {
    id: 'k-005',
    code: 'NS-502',
    room: 'New Senate Room 502',
    department: 'Faculty of Medicine',
    hod: 'Prof. Yetunde Bello',
    status: 'OVERDUE',
  },
  {
    id: 'k-006',
    code: 'NS-118',
    room: 'New Senate Room 118',
    department: 'Faculty of Sciences',
    hod: 'Prof. Chidi Adeleke',
    status: 'AVAILABLE',
  },
  {
    id: 'k-007',
    code: 'OS-101',
    room: 'Old Senate Room 101',
    department: 'Faculty of Arts',
    hod: 'Prof. Yetunde Bello',
    status: 'AVAILABLE',
  },
  {
    id: 'k-008',
    code: 'OS-107',
    room: 'Old Senate Room 107',
    department: 'Faculty of Engineering',
    hod: 'Prof. Fatima Suleiman',
    status: 'ISSUED',
  },
  {
    id: 'k-009',
    code: 'OS-203',
    room: 'Old Senate Room 203',
    department: 'Faculty of Sciences',
    hod: 'Prof. Chidi Adeleke',
    status: 'AVAILABLE',
  },
  {
    id: 'k-010',
    code: 'OS-215',
    room: 'Old Senate Room 215',
    department: 'Faculty of Law',
    hod: 'Dr. Aisha Mohammed',
    status: 'AVAILABLE',
  },
  {
    id: 'k-011',
    code: 'OS-310',
    room: 'Old Senate Room 310',
    department: 'Faculty of Medicine',
    hod: 'Prof. Yetunde Bello',
    status: 'AVAILABLE',
  },
  {
    id: 'k-012',
    code: 'OS-012',
    room: 'Old Senate Room 012',
    department: 'Faculty of Arts',
    hod: 'Prof. Yetunde Bello',
    status: 'RETIRED',
  },
];

const tabs = ['All', 'New Senate', 'Old Senate', 'Retired'] as const;

export default function KeyInventoryPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Key Inventory
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Master inventory of all keys across both Senate zones.
          </p>
        </div>
        <Button>
          <PlusIcon className="size-4" aria-hidden="true" />
          Add key
        </Button>
      </div>

      <div
        className="flex items-center gap-1 border-b border-border"
        role="tablist"
        aria-label="Filter by zone"
      >
        {tabs.map((tab, idx) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={idx === 0}
            className={`px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              idx === 0
                ? '-mb-px border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {keys.map((key) => {
          const statusCfg = statusConfig[key.status];
          return (
            <div
              key={key.id}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <KeyRoundIcon
                      className="size-4 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <code className="font-mono text-base font-semibold text-foreground">
                    {key.code}
                  </code>
                </div>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={`More actions for ${key.code}`}
                >
                  <EllipsisIcon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {key.room}
                </span>
                <span className="text-xs text-muted-foreground">
                  {key.department}
                </span>
                <span className="text-xs text-muted-foreground">{key.hod}</span>
              </div>

              <span
                className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusCfg.class}`}
                aria-label={`Status: ${statusCfg.label}`}
              >
                {statusCfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
