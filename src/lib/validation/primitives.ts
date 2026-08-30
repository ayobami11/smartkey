import * as z from 'zod';

export const email = z.email('Please provide a valid email address.');

export const uuid = z.uuid();

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
