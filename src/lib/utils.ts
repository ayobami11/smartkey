import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Parses a keystroke's raw input string into a number for a controlled
// numeric text field (see the callers for why type="number" isn't used).
// A cleared field displays a literal "0", so the next keystroke can land
// next to it as "05" or "50" depending on which side the browser puts the
// cursor after a programmatic value update. Whenever the raw value or the
// previously stored number was empty or 0, this drops exactly one
// leftover "0" so the typed digit replaces it instead of extending it
// into a two-digit number.
export function parseDigitInput(value: string, previousValue: number): number {
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly === '') return 0;
  const wasEmptyOrZero = value === '' || value === '0' || previousValue === 0;
  const digits =
    wasEmptyOrZero && digitsOnly.length > 1
      ? digitsOnly.replace('0', '')
      : digitsOnly;
  return Number(digits.replace(/^0+(?=\d)/, ''));
}
