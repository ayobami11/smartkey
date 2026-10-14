import * as z from 'zod';

import { USER_ROLES } from '@/lib/constants';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';

// What a profile with no notification_preferences row gets. Every column
// defaults to true except digest_email, which is opt-in.
const DEFAULTS = {
  key_issued_in_app: true,
  overdue_email: true,
  weekend_decided_email: true,
  weekend_submitted_in_app: true,
  weekend_submitted_email: true,
  signature_mismatch_email: true,
  digest_email: false,
};

// z.object strips unknown keys, so a `profile_id` in the body never reaches
// the upsert: the row is always the caller's own.
const bodySchema = z
  .object({
    key_issued_in_app: z.boolean().optional(),
    overdue_email: z.boolean().optional(),
    weekend_decided_email: z.boolean().optional(),
    weekend_submitted_in_app: z.boolean().optional(),
    weekend_submitted_email: z.boolean().optional(),
    signature_mismatch_email: z.boolean().optional(),
    digest_email: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one preference field is required',
  });

// Both handlers list every role so route() confirms a profile row exists.
export const GET = route({
  name: 'profile/notification-preferences',
  auth: 'user',
  roles: USER_ROLES,
  handler: async ({ supabase, user }) => {
    const { data: prefs, error } = await supabase
      .from('notification_preferences')
      .select(
        'key_issued_in_app, overdue_email, weekend_decided_email, weekend_submitted_in_app, weekend_submitted_email, signature_mismatch_email, digest_email'
      )
      .eq('profile_id', user.id)
      .maybeSingle();

    if (error) {
      logger.error('profile/notification-preferences: read failed', {
        userId: user.id,
        err: error.message,
      });
      return respond.fail(500, 'Failed to load preferences');
    }

    return respond.ok(prefs ?? DEFAULTS);
  },
});

// Postgrest only writes the columns present in the upsert, so a Dean's PATCH
// never disturbs the Requester-only columns and vice versa.
export const PATCH = route({
  name: 'profile/notification-preferences',
  auth: 'user',
  roles: USER_ROLES,
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ profile_id: user.id, ...body }, { onConflict: 'profile_id' });

    if (error) {
      logger.error('profile/notification-preferences: write failed', {
        userId: user.id,
        err: error.message,
      });
      return respond.fail(500, 'Failed to save preferences');
    }

    return respond.ok(body);
  },
});
