'use client';

import { useEffect, useState } from 'react';

import { ClockIcon } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { formatCountdown } from '@/lib/dates';

type Props = {
  countdown: number;
  codeExpiresAt: string | null;
};

// Code lifetime per product spec — create_request RPC always sets expiry to now + 10 min
const CODE_LIFETIME_MS = 10 * 60 * 1000;

export const CodeCountdown = ({ countdown, codeExpiresAt }: Props) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  if (!codeExpiresAt) return null;

  const progressValue = Math.max(
    0,
    Math.min(
      100,
      ((new Date(codeExpiresAt).getTime() - now) / CODE_LIFETIME_MS) * 100
    )
  );

  return (
    <>
      <div className="flex items-center justify-center gap-1.5 pt-2 pb-5 text-sm text-muted-foreground">
        <ClockIcon className="size-3.5" aria-hidden="true" />
        <span
          className="font-mono"
          aria-label={`Expires in ${formatCountdown(countdown)}`}
        >
          {formatCountdown(countdown)}
        </span>
      </div>
      <Progress
        value={progressValue}
        className="h-1 rounded-none **:data-[slot=progress-indicator]:duration-200 **:data-[slot=progress-indicator]:ease-linear"
      />
    </>
  );
};
