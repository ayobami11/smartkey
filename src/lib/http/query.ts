import * as z from 'zod';

// Building blocks for route() `query` schemas. Every value arrives as a
// string (or is absent), so each helper parses from a string. Their job is to
// stop a malformed value before it reaches PostgREST, where it would come back
// as a Postgres cast error and a 500 instead of a 422.

/**
 * A page size: a positive integer, defaulting to `fallback`. A value above
 * `max` is clamped to `max` rather than refused, which is what the read routes
 * have always done.
 */
export const pageLimit = (fallback: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1))
    .transform((n) => Math.min(n, max))
    .optional()
    .transform((n) => n ?? fallback);

// A date, or a date and time with an optional zone: what `toISOString()` and
// Postgres' own timestamptz output both produce. Anything else Postgres would
// refuse to cast.
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

// Date.parse rolls an impossible day over (2026-02-30 → 2 March) where
// Postgres refuses it, so the calendar date is checked on its own.
const isRealDate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** An ISO-8601 date or timestamp that Postgres can cast to timestamptz. */
export const timestamp = z
  .string()
  .regex(TIMESTAMP_PATTERN)
  .refine((s) => isRealDate(s) && !Number.isNaN(Date.parse(s)));

/** A comma-separated list where every item is one of `values`. */
export const csvEnum = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(z.enum(values)).min(1));
