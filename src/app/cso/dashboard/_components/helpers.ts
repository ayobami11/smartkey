export { formatTime } from '@/lib/dates';

export const formatFactors = (factors: unknown[] | undefined) => {
  if (!Array.isArray(factors) || factors.length === 0)
    return 'risk factors detected';
  return factors
    .map((f) =>
      typeof f === 'object' && f !== null
        ? (((f as Record<string, unknown>).rule as string | undefined) ??
          String(f))
        : String(f)
    )
    .join(', ');
};
