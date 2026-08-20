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

import { todayDateISO } from '@/lib/dates';
import { password } from '@/lib/validation/primitives';

// Auth

export const otpSchema = z.object({
  otp: z
    .string()
    .length(6, 'Enter the 6-digit code sent to your email.')
    .regex(/^\d{6}$/, 'Code must be 6 digits.'),
});

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
    role: z.enum(['DEAN', 'VERIFIER', 'REQUESTER'], {
      error: 'Select a role',
    }),
    /** Required when role is DEAN or REQUESTER. UUID from GET /api/admin/units. */
    unit_id: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.role === 'DEAN' || data.role === 'REQUESTER') && !data.unit_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Unit is required for this role',
        path: ['unit_id'],
      });
    }
  });

// Editing an existing user. Email is intentionally immutable (it is the auth
// login identity and chain-of-trust anchor); role is not editable here. Only
// the full name and — for departmental roles — the department can change.
export const editUserSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  /** Required when the target is an HOD or REQUESTER. UUID from GET /api/admin/units. */
  unit_id: z.string().optional(),
});

export const createKeyFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Key code is required.')
    .regex(
      /^[A-Z0-9]+-\d+$/,
      'Code must be uppercase letters/digits, a hyphen, then digits (e.g. NS-304).'
    ),
  zone: z.enum(['NEW_SENATE', 'OLD_SENATE'], { error: 'Select a zone.' }),
  room_name: z.string().trim().min(1, 'Room name is required.'),
  unit_id: z.string().uuid('Select a unit.'),
  key_count: z
    .number()
    .int()
    .min(1, 'Minimum 1 key.')
    .max(20, 'Maximum 20 keys.'),
});

export type CreateKeyFormInput = z.infer<typeof createKeyFormSchema>;

export const authoriseCollectorSchema = z.object({
  key_id: z.string().min(1, 'Key is required'),
  requester_id: z.string().min(1, 'Requester is required'),
});

// Requests

export const submitRequestSchema = z.object({
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

/** Accepted MIME types for the HOD authorisation letter upload. */
export const LETTER_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

/** Maximum authorisation letter file size in bytes (5 MB). */
export const LETTER_MAX_BYTES = 5 * 1024 * 1024;

/** Public (non-registered) weekend access request form. */
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
  unit_id: z.string().min(1, 'Select the unit you are visiting.'),
  weekend_date: z
    .string()
    .min(1, 'Date is required.')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine((val) => {
      const [y, m, d] = val.split('-').map(Number);
      const day = new Date(y, m - 1, d).getDay();
      return day === 0 || day === 6;
    }, 'Must be a Saturday or Sunday.'),
  letter: z
    .custom<FileList>()
    .refine(
      (files) => files?.length > 0,
      'The authorization letter is required.'
    )
    .refine(
      (files) =>
        !files?.length ||
        (LETTER_ACCEPTED_MIME_TYPES as readonly string[]).includes(
          files[0]?.type
        ),
      'Upload a PDF, JPG, or PNG file.'
    )
    .refine(
      (files) => !files?.length || files[0]?.size <= LETTER_MAX_BYTES,
      'File must be 5 MB or smaller.'
    ),
});

export const cancelRequestSchema = z.object({
  /** UUID of the request to cancel. Must be in CODE_ISSUED status. */
  request_id: z.string().min(1, 'Request ID is required'),
});

export const hodDecisionSchema = z.object({
  request_id: z.string().min(1, 'Request ID is required'),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
});

/**
 * Client-side form for the HOD weekend-decision sheet. The Approve action is
 * always clickable; this schema's superRefine surfaces the "key required for
 * a guest approval" rule as a field error instead of disabling the button.
 */
export const hodWeekendDecisionFormSchema = z
  .object({
    note: z.string().optional(),
    key_id: z.string().optional(),
    /** Hidden discriminator — true when reviewing an external (guest) request. */
    is_guest: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.is_guest && !data.key_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Select a key to assign before approving.',
        path: ['key_id'],
      });
    }
  });

export const csoDecisionSchema = z.object({
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

/** Client-side form for the CSO "mark as lost" dialog — key_id comes from component state, not a form field. */
export const markKeyLostFormSchema = z.object({
  note: z.string().trim().min(1, 'Describe when and how the key went missing.'),
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
  description: z
    .string()
    .min(1, 'Description is required.')
    .min(10, 'Description must be at least 10 characters.'),
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
  related_key_id: z.string().optional(),
  related_person_id: z.string().optional(),
});

// Shifts

export const shiftHandoverSchema = z.object({
  outgoing_shift_id: z.string().min(1, 'Outgoing shift ID is required'),
  key_ids: z.array(z.string()),
  /** true = all keys acknowledged in one confirmation, false = per-key. */
  bulk: z.boolean(),
});

// Reports

export const generateReportSchema = z.object({
  shift_id: z.string().min(1, 'Please select a shift.'),
});

export const addReportCommentSchema = z.object({
  text: z.string().min(1, 'Comment text is required'),
});

// Image upload (HOD onboarding — signature and stamp steps share this logic)

/**
 * Creates a Zod schema for a single-image upload field.
 * Pass a `requiredMessage` that names the specific asset being uploaded
 * so the error copy makes sense in context.
 */
export const createImageUploadSchema = (requiredMessage: string) =>
  z.object({
    file: z.custom<File | undefined>().superRefine((val, ctx) => {
      if (!(val instanceof File)) {
        ctx.addIssue({ code: 'custom', message: requiredMessage });
        return z.NEVER;
      }
      if (!['image/jpeg', 'image/png'].includes(val.type)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Only PNG or JPG files are accepted.',
        });
        return z.NEVER;
      }
      if (val.size > 5 * 1024 * 1024) {
        ctx.addIssue({
          code: 'custom',
          message: 'File must be 5 MB or smaller.',
        });
      }
    }),
  });

// Custom date range (TimeRangeFilter widget) — client-side only, no route
// handler counterpart; validates the two typed date inputs in the popover.
export const customDateRangeSchema = z
  .object({
    from: z
      .string()
      .min(1, 'Start date is required.')
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
      .refine(
        (v) => v <= todayDateISO(),
        'Start date cannot be in the future.'
      ),
    to: z
      .string()
      .min(1, 'End date is required.')
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
      .refine((v) => v <= todayDateISO(), 'End date cannot be in the future.'),
  })
  .superRefine((data, ctx) => {
    if (data.to < data.from) {
      ctx.addIssue({
        code: 'custom',
        message: 'End date must be on or after the start date.',
        path: ['to'],
      });
    }
  });

// Profile

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
});

// Inferred TypeScript types
// Import these where you need the form value types.

export type OtpInput = z.infer<typeof otpSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ProvisionUserInput = z.infer<typeof provisionUserSchema>;
export type EditUserInput = z.infer<typeof editUserSchema>;
export type AuthoriseCollectorInput = z.infer<typeof authoriseCollectorSchema>;
export type SubmitRequestInput = z.infer<typeof submitRequestSchema>;
export type CancelRequestInput = z.infer<typeof cancelRequestSchema>;
export type HodDecisionInput = z.infer<typeof hodDecisionSchema>;
export type HodWeekendDecisionFormInput = z.infer<
  typeof hodWeekendDecisionFormSchema
>;
export type CsoDecisionInput = z.infer<typeof csoDecisionSchema>;
export type CollectKeyInput = z.infer<typeof collectKeySchema>;
export type ReturnKeyInput = z.infer<typeof returnKeySchema>;
export type RequestReturnInput = z.infer<typeof requestReturnSchema>;
export type MarkKeyLostInput = z.infer<typeof markKeyLostSchema>;
export type MarkKeyLostFormInput = z.infer<typeof markKeyLostFormSchema>;
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
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CustomDateRangeInput = z.infer<typeof customDateRangeSchema>;
export type ImageUploadInput = { file: File | undefined };
