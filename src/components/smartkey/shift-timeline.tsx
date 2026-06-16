import { ClockIcon } from 'lucide-react';

import type { TimelineEntry } from '@/lib/ai/reports/types';

type ShiftTimelineProps = {
  entries: TimelineEntry[];
};

// Renders the structured event timeline that Gemini returns alongside the prose
// report. Server-safe (no client interactivity). Times use the mono font for
// alignment and character disambiguation, per DESIGN.md.
const ShiftTimeline = ({ entries }: ShiftTimelineProps) => {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No timeline events for this shift.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4 border-l border-border pl-4">
      {entries.map((entry, i) => (
        <li key={i} className="relative flex flex-col gap-0.5">
          <span
            className="absolute -left-[1.3rem] top-1 flex size-4 items-center justify-center rounded-full bg-muted"
            aria-hidden="true"
          >
            <ClockIcon className="size-2.5 text-muted-foreground" />
          </span>
          <div className="flex items-baseline gap-2">
            <time className="font-mono text-xs text-muted-foreground">
              {entry.time}
            </time>
            <span className="text-sm font-medium text-foreground">
              {entry.event}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{entry.description}</p>
        </li>
      ))}
    </ol>
  );
};

export { ShiftTimeline };
