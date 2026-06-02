import { EllipsisIcon, KeyRoundIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createServerClient } from '@/lib/supabase/server';

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

const tabs = ['All', 'New Senate', 'Old Senate', 'Retired'] as const;

export default async function KeyInventoryPage() {
  const supabase = await createServerClient();

  const { data: keyRows } = await supabase
    .from('keys')
    .select(
      'id, code, zone, room_name, department_id, status, department:departments!department_id(name, hod:profiles!hod_id(full_name))'
    )
    .order('code', { ascending: true });

  const keys: Key[] = (keyRows ?? []).map((k: Record<string, unknown>) => {
    const dept = k.department as Record<string, unknown> | null;
    const hod = dept?.hod as Record<string, unknown> | null;
    return {
      id: k.id as string,
      code: k.code as string,
      room: k.room_name as string,
      department: (dept?.name as string | undefined) ?? '—',
      hod: (hod?.full_name as string | undefined) ?? '—',
      status: k.status as KeyStatus,
    };
  });

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
