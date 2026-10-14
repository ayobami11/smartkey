import * as z from 'zod';

export const email = z.email('Please provide a valid email address.');

export const uuid = z.uuid();

/**
 * The longest full name accepted anywhere a person's name is set from input
 * (profile, CSO user admin, guest weekend form). A name is copied into
 * audit_log.actor_name and into email subjects and bodies, so it is bounded.
 */
export const FULL_NAME_MAX = 120;

export const FULL_NAME_TOO_LONG = `Full name must be ${FULL_NAME_MAX} characters or fewer.`;

/** A person's full name: trimmed, non-empty, at most FULL_NAME_MAX. */
export const fullName = (requiredMessage = 'Full name is required') =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(FULL_NAME_MAX, FULL_NAME_TOO_LONG);

export const password = z
  .string()
  .min(12, {
    message: 'Password must contain at least 12 characters.',
  })
  .max(64, {
    message: 'Password cannot exceed 64 characters.',
  })
  .regex(/[a-z]/, {
    message: 'Password must contain at least one lowercase letter.',
  })
  .regex(/[A-Z]/, {
    message: 'Password must contain at least one uppercase letter.',
  })
  .regex(/\d/, {
    message: 'Password must contain at least one number.',
  })
  .regex(/[^A-Za-z0-9]/, {
    message: 'Password must contain at least one special character.',
  });
