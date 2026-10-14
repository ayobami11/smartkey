import { USER_ROLES } from '@/lib/constants';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';
import { toProxyUrl } from '@/lib/storage/object-url';

// Returns the authenticated user's profile. Used by settings pages to surface
// role-specific fields such as signature_ref_url and stamp_ref_url for Deans.
//
// No `roles`: this route reads the profile itself, so a second lookup in
// route() would only repeat the query. A missing row is still a 401.
export const GET = route({
  name: 'profile/me',
  auth: 'user',
  handler: async ({ supabase, user }) => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, institutional_email, role, status, photo_url, signature_ref_url, stamp_ref_url, unit_id, unit:units!unit_id(id, name)'
      )
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return respond.internal('profile/me: profile query failed', {
        err: error.message,
      });
    }
    if (!profile) return respond.fail(401, 'Unauthorized');

    // Storage buckets are private; hand the client proxy URLs it can actually
    // render rather than the raw object URLs stored on the row.
    return respond.ok({
      profile: {
        ...profile,
        photo_url: toProxyUrl(profile.photo_url),
        signature_ref_url: toProxyUrl(profile.signature_ref_url),
        stamp_ref_url: toProxyUrl(profile.stamp_ref_url),
      },
    });
  },
});

// Updates the authenticated user's own profile. Only full_name is mutable here;
// email is managed by Supabase Auth, photo by POST /api/profile/photo and a
// Dean's references by POST /api/profile/signature. The update runs with the
// user's session, so the profiles column guard (protect_profile_columns)
// rejects any other column even if this handler were changed to send one.
//
// The body is parsed here rather than by a `body` schema so the two
// messages the settings forms show ('Invalid JSON', 'full_name is required')
// stay as they were.
export const PATCH = route({
  name: 'profile/me',
  auth: 'user',
  roles: USER_ROLES,
  handler: async ({ supabase, user, request }) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return respond.fail(422, 'Invalid JSON');
    }

    const raw =
      body && typeof body === 'object' && 'full_name' in body
        ? (body as { full_name: unknown }).full_name
        : undefined;

    if (typeof raw !== 'string' || raw.trim() === '') {
      return respond.fail(422, 'full_name is required');
    }
    const full_name = raw.trim();

    const { error } = await supabase
      .from('profiles')
      .update({ full_name })
      .eq('id', user.id);

    if (error) {
      logger.error('profile/me: update failed', {
        userId: user.id,
        err: error.message,
      });
      return respond.fail(500, 'Failed to update profile');
    }

    return respond.ok({ full_name });
  },
});
