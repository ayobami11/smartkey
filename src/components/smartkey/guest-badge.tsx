import { UserRoundIcon } from 'lucide-react';

import { GUEST_BADGE_CLASSES } from '@/lib/constants';

type GuestBadgeProps = {
  label?: string;
  showIcon?: boolean;
};

export const GuestBadge = ({
  label = 'Guest',
  showIcon = false,
}: GuestBadgeProps) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${GUEST_BADGE_CLASSES}`}
    aria-label={`External ${label.toLowerCase()}`}
  >
    {showIcon && <UserRoundIcon className="size-3" aria-hidden="true" />}
    {label}
  </span>
);
