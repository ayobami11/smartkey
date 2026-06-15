'use client';

import * as React from 'react';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { RiskFactor, RiskTier } from '@/lib/ai/risk/types';

import { RiskFactorPopover } from '@/components/smartkey/risk-factor-popover';

type TierConfig = {
  label: string;
  icon: React.ElementType;
  badgeClass: string;
};

const TIER_CONFIG: Record<RiskTier, TierConfig> = {
  LOW: {
    label: 'Low risk',
    icon: ShieldCheck,
    badgeClass:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  },
  MEDIUM: {
    label: 'Medium risk',
    icon: ShieldAlert,
    badgeClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
  HIGH: {
    label: 'High risk',
    icon: ShieldX,
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
};

type RiskTierBadgeProps = {
  tier: RiskTier;
  factors: RiskFactor[];
};

const RiskTierBadge = ({ tier, factors }: RiskTierBadgeProps) => {
  const { label, icon: Icon, badgeClass } = TIER_CONFIG[tier];

  const triggerButton = (
    <button
      type="button"
      className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      View factors
    </button>
  );

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        aria-label={`${tier.toLowerCase()} risk`}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}
      >
        <Icon size={12} strokeWidth={2} aria-hidden="true" />
        {label}
      </span>
      {factors.length > 0 && (
        <RiskFactorPopover factors={factors} trigger={triggerButton} />
      )}
    </div>
  );
};

type RiskAcknowledgementProps = {
  acknowledged: boolean;
  onAcknowledge: (acknowledged: boolean) => void;
};

const RiskAcknowledgement = ({
  acknowledged,
  onAcknowledge,
}: RiskAcknowledgementProps) => {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="risk-acknowledgement"
        checked={acknowledged}
        onCheckedChange={(checked) => onAcknowledge(checked === true)}
        className="mt-0.5"
      />
      <Label
        htmlFor="risk-acknowledgement"
        className="cursor-pointer text-sm leading-snug"
      >
        I have reviewed the contributing factors above.
      </Label>
    </div>
  );
};

export { RiskAcknowledgement, RiskTierBadge };
