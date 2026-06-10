/**
 * Request body schemas for every SmartKey POST endpoint.
 *
 * Import these on the client to replicate the same validation the server runs,
 * so form errors surface before the request is even sent.
 *
 * Usage:
 *   import { loginSchema } from '@/lib/validation/schemas';
 *   const form = useForm({ resolver: zodResolver(loginSchema) });
 *
 * Every schema here is the exact Zod object used in the corresponding route
 * handler — they are the single source of truth for both sides.
 */

import { z } from 'zod';

// Auth

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const resetPasswordSchema = z.object({
  email: z.email('Enter a valid email address'),
});

// User management (CSO)

export const provisionUserSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Full name is required'),
    institutional_email: z.email('Enter a valid email address'),
    role: z.enum(['HOD', 'VERIFIER', 'REQUESTER'], {
      error: 'Select a role',
    }),
    /** Required when role is HOD or REQUESTER. UUID from GET /api/admin/departments. */
    department_id: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      (data.role === 'HOD' || data.role === 'REQUESTER') &&
      !data.department_id
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Department is required for this role',
        path: ['department_id'],
      });
    }
  });

export const authoriseCollectorSchema = z.object({
  /** UUID of the key to authorise the requester for. */
  key_id: z.string().min(1, 'Key is required'),
  /** UUID of the REQUESTER profile to add to the slot. */
  requester_id: z.string().min(1, 'Requester is required'),
});

// Requests

export const submitRequestSchema = z.object({
  /** UUID of the key being requested. */
  key_id: z.string().min(1, 'Key is required'),
  type: z.enum(['WEEKDAY', 'WEEKEND']),
  /** ISO 8601 timestamp — when the requester plans to return the key. */
  return_deadline: z.string().min(1, 'Return deadline is required'),
  /** ISO date (YYYY-MM-DD) — required for WEEKEND requests only. */
  weekend_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
});

export const weekendRequestFormSchema = z.object({
  key_id: z.string().min(1, 'Key is required'),
  weekend_date: z
    .string()
    .min(1, 'Date is required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine((val) => {
      const [y, m, d] = val.split('-').map(Number);
      const day = new Date(y, m - 1, d).getDay();
      return day === 0 || day === 6;
    }, 'Must be a Saturday or Sunday'),
  description: z.string().trim().min(1, 'Reason for access is required'),
});

export const cancelRequestSchema = z.object({
  /** UUID of the request to cancel. Must be in CODE_ISSUED status. */
  request_id: z.string().min(1, 'Request ID is required'),
});

export const hodDecisionSchema = z.object({
  /** UUID of the request being decided. */
  request_id: z.string().min(1, 'Request ID is required'),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
});

export const csoDecisionSchema = z.object({
  /** UUID of the request being decided. */
  request_id: z.string().min(1, 'Request ID is required'),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
});

// Key operations (Verifier)

export const collectKeySchema = z.object({
  /** The 6-digit code the requester presents at the desk. */
  code: z
    .string()
    .length(6, 'Code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Code must be digits only'),
  /** UUID of the verifier processing the collection. */
  verifier_id: z.string().min(1, 'Verifier ID is required'),
});

export const returnKeySchema = z.object({
  /** UUID of the request (not the key) being returned. */
  request_id: z.string().min(1, 'Request ID is required'),
  /** UUID of the verifier receiving the key. */
  verifier_id: z.string().min(1, 'Verifier ID is required'),
  /** UUID of the person returning the key, if different from the original requester. */
  returner_id: z.string().optional(),
});

export const markKeyLostSchema = z.object({
  /** UUID of the key to mark as lost/retired. */
  key_id: z.string().min(1, 'Key is required'),
  note: z.string().min(1, 'Reason is required'),
});

// Incidents

export const logIncidentSchema = z.object({
  type: z.enum([
    'MISSING_KEY',
    'SUSPICIOUS_ACTIVITY',
    'EQUIPMENT_FAULT',
    'PROCEDURAL',
    'OTHER',
  ]),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  description: z.string().min(1, 'Description is required'),
  /** ISO 8601 timestamp of when the incident occurred. */
  occurred_at: z.string().min(1, 'Occurred at is required'),
  /** Optional UUID of a related key. */
  related_key_id: z.string().optional(),
  /** Optional UUID of a related person (profile). */
  related_person_id: z.string().optional(),
});

// Shifts

export const shiftHandoverSchema = z.object({
  /** UUID of the outgoing shift being handed over. */
  outgoing_shift_id: z.string().min(1, 'Outgoing shift ID is required'),
  /** Array of key UUIDs being acknowledged at handover. */
  key_ids: z.array(z.string()),
  /** true = all keys acknowledged in one confirmation, false = per-key. */
  bulk: z.boolean(),
});

// Reports

export const generateReportSchema = z.object({
  /** UUID of the shift to generate a report for. */
  shift_id: z.string().min(1, 'Shift ID is required'),
});

export const addReportCommentSchema = z.object({
  text: z.string().min(1, 'Comment text is required'),
});

// Inferred TypeScript types
// Import these where you need the form value types.

export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ProvisionUserInput = z.infer<typeof provisionUserSchema>;
export type AuthoriseCollectorInput = z.infer<typeof authoriseCollectorSchema>;
export type SubmitRequestInput = z.infer<typeof submitRequestSchema>;
export type CancelRequestInput = z.infer<typeof cancelRequestSchema>;
export type HodDecisionInput = z.infer<typeof hodDecisionSchema>;
export type CsoDecisionInput = z.infer<typeof csoDecisionSchema>;
export type CollectKeyInput = z.infer<typeof collectKeySchema>;
export type ReturnKeyInput = z.infer<typeof returnKeySchema>;
export type MarkKeyLostInput = z.infer<typeof markKeyLostSchema>;
export type LogIncidentInput = z.infer<typeof logIncidentSchema>;
export type ShiftHandoverInput = z.infer<typeof shiftHandoverSchema>;
export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type AddReportCommentInput = z.infer<typeof addReportCommentSchema>;
export type WeekendRequestFormInput = z.infer<typeof weekendRequestFormSchema>;
