import { todayDateISOTz } from '@/lib/dates';

export type WeekendDateProblem = 'NOT_WEEKEND' | 'PAST';

// A weekend request may only be made for a Saturday or Sunday that is today
// or later in Lagos. The day of the week is read from the date itself (UTC
// midnight), which is the same calendar day in every zone; "today" is Lagos.
//
// Until 2026-10-13 only the day of the week was checked, so a past weekend
// could be requested: the Dean was emailed about a request that could never
// be approved (approve_weekend refuses a past date) and the nightly sweep
// just expired it.
export const weekendDateProblem = (
  isoDate: string,
  now: Date = new Date()
): WeekendDateProblem | null => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(isoDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== isoDate
  ) {
    return 'NOT_WEEKEND';
  }
  const day = date.getUTCDay();
  if (day !== 0 && day !== 6) return 'NOT_WEEKEND';
  return isoDate < todayDateISOTz(now) ? 'PAST' : null;
};

export const WEEKEND_DATE_MESSAGES: Record<WeekendDateProblem, string> = {
  NOT_WEEKEND: 'The selected date must be a Saturday or Sunday.',
  PAST: 'That weekend has already passed. Choose a date from today onwards.',
};
