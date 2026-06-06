export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

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
