import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  ClockIcon,
  HourglassIcon,
} from 'lucide-react';

import type { KeyAvailabilityState } from '@/lib/keys/availability';

export const KEY_AVAILABILITY_CONFIG: Record<
  KeyAvailabilityState,
  {
    label: string;
    srLabel: string;
    stripe: string;
    badge: string;
    Icon: React.ElementType;
  }
> = {
  AVAILABLE: {
    label: 'Available',
    srLabel: 'Key is available',
    stripe: 'bg-emerald-500',
    badge:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    Icon: CheckIcon,
  },
  SPOKEN_FOR: {
    label: 'Being collected',
    srLabel: 'Key is being collected',
    stripe: 'bg-amber-500',
    badge:
      'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
    Icon: HourglassIcon,
  },
  OUT: {
    label: 'In use',
    srLabel: 'Key is currently in use',
    stripe: 'bg-indigo-500',
    badge:
      'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400',
    Icon: ClockIcon,
  },
  OVERDUE: {
    label: 'Overdue',
    srLabel: 'Key is overdue',
    stripe: 'bg-destructive',
    badge: 'bg-destructive/10 text-destructive',
    Icon: AlertTriangleIcon,
  },
  RETIRED: {
    label: 'Retired',
    srLabel: 'Key is retired',
    stripe: 'bg-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    Icon: BanIcon,
  },
};

/** States in which the key cannot be requested right now. */
export const UNREQUESTABLE_STATES: readonly KeyAvailabilityState[] = [
  'SPOKEN_FOR',
  'OUT',
  'OVERDUE',
  'RETIRED',
] as const;
