import Link from 'next/link';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  KeyRoundIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

type FilledSlot = {
  filled: true;
  name: string;
  email: string;
  authorisedAt: string;
};
type VacantSlot = { filled: false };
type Slot = FilledSlot | VacantSlot;

type RecentEvent = {
  id: string;
  type: 'ISSUED' | 'RETURNED' | 'REQUESTED';
  actor: string;
  time: string;
};

const slots: Slot[] = [
  {
    filled: true,
    name: 'Dr. Emeka Bakare',
    email: 'e.bakare@unilag.edu.ng',
    authorisedAt: '2 Jan 2026',
  },
  {
    filled: true,
    name: 'Eng. Adeyemi Fashola',
    email: 'a.fashola@unilag.edu.ng',
    authorisedAt: '15 Feb 2026',
  },
  { filled: false },
];

const recentEvents: RecentEvent[] = [
  {
    id: 'e-1',
    type: 'ISSUED',
    actor: 'Dr. Bakare',
    time: '14 May 2026, 09:15',
  },
  {
    id: 'e-2',
    type: 'RETURNED',
    actor: 'Dr. Bakare',
    time: '14 May 2026, 16:30',
  },
  {
    id: 'e-3',
    type: 'REQUESTED',
    actor: 'Dr. Bakare',
    time: '13 May 2026, 08:45',
  },
  {
    id: 'e-4',
    type: 'ISSUED',
    actor: 'Eng. Adeyemi',
    time: '12 May 2026, 10:00',
  },
  {
    id: 'e-5',
    type: 'RETURNED',
    actor: 'Eng. Adeyemi',
    time: '12 May 2026, 17:30',
  },
];

const eventConfig: Record<
  RecentEvent['type'],
  { label: string; icon: typeof CheckCircleIcon; iconClass: string }
> = {
  ISSUED: {
    label: 'Key issued',
    icon: KeyRoundIcon,
    iconClass: 'text-primary',
  },
  RETURNED: {
    label: 'Key returned',
    icon: RotateCcwIcon,
    iconClass: 'text-emerald-600',
  },
  REQUESTED: {
    label: 'Key requested',
    icon: CheckCircleIcon,
    iconClass: 'text-muted-foreground',
  },
};

export default function KeySlotManagementPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Back link */}
      <Link
        href="/hod"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Back to dashboard
      </Link>

      {/* Key header */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <KeyRoundIcon className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-lg font-semibold text-foreground">
                NS-304
              </code>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                New Senate
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Senate Hall A · Faculty of Engineering
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {slots.filter((s) => s.filled).length} of 3 slots filled
        </p>
      </div>

      {/* Slot cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Authorised collectors
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {slots.map((slot, idx) =>
            slot.filled ? (
              <div
                key={idx}
                className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {slot.name
                      .split(' ')
                      .slice(-2)
                      .map((n) => n[0])
                      .join('')}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Slot {idx + 1}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {slot.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{slot.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Authorised {slot.authorisedAt}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button variant="outline" size="sm" className="w-full">
                    View activity
                  </Button>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                    >
                      Replace
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                      aria-label={`Remove ${slot.name}`}
                    >
                      <Trash2Icon className="size-3.5" aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={idx}
                className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <UserIcon
                    className="size-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Slot {idx + 1} vacant
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    No collector assigned
                  </p>
                </div>
                <Button size="sm" variant="outline">
                  <PlusIcon className="size-4" aria-hidden="true" />
                  Add collector
                </Button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Recent activity for NS-304
        </h2>
        <div className="rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
          {recentEvents.map((event, idx) => {
            const cfg = eventConfig[event.type];
            const Icon = cfg.icon;
            return (
              <div
                key={event.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  idx !== recentEvents.length - 1
                    ? 'border-b border-border'
                    : ''
                }`}
              >
                <Icon
                  className={`size-4 shrink-0 ${cfg.iconClass}`}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-foreground">
                    {cfg.label} · {event.actor}
                  </span>
                  <time className="font-mono text-xs text-muted-foreground">
                    {event.time}
                  </time>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
