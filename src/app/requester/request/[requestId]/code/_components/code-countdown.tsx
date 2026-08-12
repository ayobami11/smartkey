'use client';

import { useEffect, useState } from 'react';

import { ClockIcon } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { formatCountdown } from '@/lib/dates';

type Props = {
  countdown: number;
  codeExpiresAt: string | null;
};

export const CodeCountdown = ({ countdown, codeExpiresAt }: Props) => {
  const [now, setNow] = useState(() => Date.now());
  const [lifetimeMs] = useState(() =>
    codeExpiresAt
      ? Math.max(0, new Date(codeExpiresAt).getTime() - Date.now())
      : 0
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  if (!codeExpiresAt || lifetimeMs === 0) return null;

  const progressValue = Math.max(
    0,
    Math.min(
      100,
      ((new Date(codeExpiresAt).getTime() - now) / lifetimeMs) * 100
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
