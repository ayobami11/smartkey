'use client';

import * as React from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { RiskFactor } from '@/lib/ai/risk/types';

type RiskFactorPopoverProps = {
  factors: RiskFactor[];
  trigger: React.ReactNode;
};

const RiskFactorPopover = ({ factors, trigger }: RiskFactorPopoverProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent aria-label="Risk factors" className="w-80">
        <p className="mb-3 text-sm font-medium">Risk factors</p>
        {factors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No risk factors identified.
          </p>
        ) : (
          <ul className="space-y-2">
            {factors.map((factor) => (
              <li
                key={factor.rule}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="text-foreground">{factor.description}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {factor.weight}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
};

export { RiskFactorPopover };
