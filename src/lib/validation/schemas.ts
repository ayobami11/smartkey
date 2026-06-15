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

import { password } from '@/lib/validation/primitives';

// Auth

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: password,
    confirmPassword: password,
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

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

export const weekdayRequestFormSchema = z.object({
  return_deadline: z
    .string()
    .min(1, 'Return time is required.')
    .refine(
      (val) => new Date(val) > new Date(),
      'Return time must be in the future.'
    ),
});

export const weekendRequestFormSchema = z.object({
  key_id: z.string().min(1, 'Key is required'),
  weekend_date: z
    .string()
    .min(1, 'Date is required.')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine((val) => {
      const [y, m, d] = val.split('-').map(Number);
      const day = new Date(y, m - 1, d).getDay();
      return day === 0 || day === 6;
    }, 'Must be a Saturday or Sunday.'),
  description: z.string().trim().min(1, 'Reason for access is required.'),
});

/** Allowed government / institutional ID document types a guest may declare. */
export const ID_DOCUMENT_TYPES = [
  'Staff ID',
  'Student ID',
  'National ID (NIN)',
  "Driver's licence",
] as const;

/**
 * Public (non-registered) weekend access request form.
 *
 * Mirrors the multipart body accepted by POST /api/public/weekend-request.
 * The `letter` file is validated separately at submit time (a real File is not
 * available during SSR), so it is kept out of this object schema.
 */
export const guestWeekendRequestFormSchema = z.object({
  full_name: z.string().trim().min(1, 'Your full name is required.'),
  email: z.email('Enter a valid email address.'),
  phone: z.string().trim().optional(),
  id_document_type: z.enum(ID_DOCUMENT_TYPES, {
    error: 'Select an ID document type.',
  }),
  id_document_number: z
    .string()
    .trim()
    .min(1, 'Enter the number on your ID document.'),
  requested_room: z
    .string()
    .trim()
    .min(1, 'Enter the name or number of the room you need access to.'),
  department_id: z.string().min(1, 'Select the department you are visiting.'),
  weekend_date: z
    .string()
    .min(1, 'Date is required.')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine((val) => {
      const [y, m, d] = val.split('-').map(Number);
      const day = new Date(y, m - 1, d).getDay();
      return day === 0 || day === 6;
    }, 'Must be a Saturday or Sunday.'),
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

export const issueKeyFormSchema = z.object({
  verification_code: z
    .string()
    .length(6, "Enter the 6-digit code sent to the requester's email."),
});

export const returnKeyFormSchema = z.object({
  return_code: z
    .string()
    .length(6, 'Enter the 6-digit return code from the requester.'),
});

export const returnKeyOverrideFormSchema = z.object({
  override_reason: z
    .string()
    .trim()
    .min(3, 'Give a brief reason for returning without a code.'),
});

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
  /** The 6-digit return code the requester reads out at the desk. */
  code: z
    .string()
    .regex(/^\d{6}$/, 'Code must be exactly 6 digits')
    .optional(),
  /** Reason for completing a return without a code (verifier override path). */
  override_reason: z.string().min(3, 'Give a brief reason').optional(),
});

export const requestReturnSchema = z.object({
  /** UUID of the requester's own request whose key is being returned. */
  request_id: z.string().min(1, 'Request ID is required'),
});

export const markKeyLostSchema = z.object({
  /** UUID of the key to mark as lost/retired. */
  key_id: z.string().min(1, 'Key is required'),
  note: z.string().min(1, 'Reason is required'),
});

// Incidents

export const incidentFormSchema = z.object({
  type: z.enum(
    [
      'MISSING_KEY',
      'SUSPICIOUS_ACTIVITY',
      'EQUIPMENT_FAULT',
      'PROCEDURAL',
      'OTHER',
    ],
    { error: 'Select an incident type.' }
  ),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH'], {
    error: 'Select a severity level.',
  }),
  description: z.string().min(1, 'Description is required.'),
});

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

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
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
export type RequestReturnInput = z.infer<typeof requestReturnSchema>;
export type MarkKeyLostInput = z.infer<typeof markKeyLostSchema>;
export type LogIncidentInput = z.infer<typeof logIncidentSchema>;
export type ShiftHandoverInput = z.infer<typeof shiftHandoverSchema>;
export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type AddReportCommentInput = z.infer<typeof addReportCommentSchema>;
export type WeekdayRequestFormInput = z.infer<typeof weekdayRequestFormSchema>;
export type WeekendRequestFormInput = z.infer<typeof weekendRequestFormSchema>;
export type GuestWeekendRequestFormInput = z.infer<
  typeof guestWeekendRequestFormSchema
>;
export type IssueKeyFormInput = z.infer<typeof issueKeyFormSchema>;
export type ReturnKeyFormInput = z.infer<typeof returnKeyFormSchema>;
export type ReturnKeyOverrideFormInput = z.infer<
  typeof returnKeyOverrideFormSchema
>;
export type IncidentFormInput = z.infer<typeof incidentFormSchema>;
