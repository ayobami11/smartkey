import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  format,
  intervalToDuration,
  isToday,
  subDays,
} from 'date-fns';

// HH:MM (24-hour)
export const formatTime = (iso: string): string =>
  format(new Date(iso), 'HH:mm');

// "Mon 4 Jun 2026"
export const formatDate = (iso: string): string =>
  format(new Date(iso), 'EEE d MMM yyyy');

// "Mon 4 Jun" (no year)
export const formatDateShort = (iso: string): string =>
  format(new Date(iso), 'EEE d MMM');

// "Monday 4 June 2026" (long weekday + long month)
export const formatDateLong = (iso: string): string =>
  format(new Date(iso), 'EEEE d MMMM yyyy');

// "4 Jun 2026" (no weekday)
export const formatDateNumeric = (iso: string): string =>
  format(new Date(iso), 'd MMM yyyy');

// "Today 14:32" or "Mon 4 Jun 14:32"
export const formatDeadline = (iso: string): string => {
  const d = new Date(iso);
  return isToday(d)
    ? `Today ${format(d, 'HH:mm')}`
    : format(d, 'EEE d MMM HH:mm');
};

// Verbose relative time: "just now", "2 mins ago", "3 hrs ago", "1 day ago"
export const relativeTime = (iso: string): string => {
  const now = new Date();
  const date = new Date(iso);
  const mins = differenceInMinutes(now, date);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = differenceInHours(now, date);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = differenceInDays(now, date);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

// Compact relative time: "just now", "2m ago", "3h ago", "1d ago"
export const relativeTimeCompact = (iso: string): string => {
  const now = new Date();
  const date = new Date(iso);
  const mins = differenceInMinutes(now, date);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = differenceInHours(now, date);
  if (hrs < 24) return `${hrs}h ago`;
  const days = differenceInDays(now, date);
  return `${days}d ago`;
};

// CSO users last sign-in: compact up to 7d, then a formatted date
export const formatLastSignIn = (iso: string | null): string => {
  if (!iso) return 'Never';
  const now = new Date();
  const date = new Date(iso);
  const mins = differenceInMinutes(now, date);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = differenceInHours(now, date);
  if (hrs < 24) return `${hrs}h ago`;
  const days = differenceInDays(now, date);
  if (days < 7) return `${days}d ago`;
  return formatDateNumeric(iso);
};

// Countdown display: "mm:ss" | "Xh Ym" | "Xd Yh"
export const formatCountdown = (seconds: number): string => {
  const {
    days,
    hours,
    minutes,
    seconds: secs,
  } = intervalToDuration({
    start: 0,
    end: seconds * 1000,
  });
  if ((days ?? 0) > 0) return `${days}d ${hours}h`;
  if ((hours ?? 0) > 0) return `${hours}h ${minutes}m`;
  return `${String(minutes ?? 0).padStart(2, '0')}:${String(secs ?? 0).padStart(2, '0')}`;
};

// Seconds until an ISO expiry timestamp (never negative)
export const secondsRemaining = (isoExpiry: string): number =>
  Math.max(0, differenceInSeconds(new Date(isoExpiry), new Date()));

// Check whether a YYYY-MM-DD date string is today (local time)
export const isTodayDate = (isoDate: string): boolean =>
  format(new Date(), 'yyyy-MM-dd') === isoDate;

// Check whether a YYYY-MM-DD date string is strictly before today (local time)
export const isPastDate = (isoDate: string): boolean =>
  isoDate < format(new Date(), 'yyyy-MM-dd');

// ISO string N days before now (for filter presets)
export const subDaysISO = (n: number): string =>
  subDays(new Date(), n).toISOString();

// Current date as YYYY-MM-DD (for date input min attributes)
export const todayDateISO = (): string => format(new Date(), 'yyyy-MM-dd');
