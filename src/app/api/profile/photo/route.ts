import { USER_ROLES } from '@/lib/constants';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';
import { uploadExtension } from '@/lib/storage/extension';
import { toProxyUrl } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = 'passport-photos';

// Lets a signed-in user replace their own profile photo from account settings.
// The storage folder is keyed by the caller's id, so this one route serves
// every role's settings screen.
//
// `roles` lists every role so route() confirms a profile row exists: without
// it, a session with no profile would upload a file and "save" it to a row
// that is not there.
export const POST = route({
  name: 'profile/photo',
  auth: 'user',
  roles: USER_ROLES,
  handler: async ({ user, request }) => {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return respond.fail(422, 'Invalid form data');
    }

    const photo = formData.get('photo');
    if (!(photo instanceof File)) {
      return respond.fail(422, 'A photo file is required');
    }
    if (!photo.type.startsWith('image/')) {
      return respond.fail(422, 'File must be an image');
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return respond.fail(413, 'Photo must be under 5 MB');
    }

    const userId = user.id;

    // Upload via the service-role client. The user is verified above and the
    // path is built from their verified id, so this is safe and avoids the
    // storage RLS auth-context fragility of the cookie-based server client
    // (same pattern as the registration flow).
    const admin = createAdminClient();
    const photoBytes = await photo.arrayBuffer();
    const ext = uploadExtension(photo.name, 'jpg');
    const photoPath = `${userId}/passport.${ext}`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(photoPath, photoBytes, { contentType: photo.type, upsert: true });

    if (uploadError) {
      logger.error('profile/photo: upload failed', {
        userId,
        err: uploadError.message,
      });
      return respond.fail(500, 'Photo upload failed');
    }

    const photoUrl = admin.storage.from(BUCKET).getPublicUrl(photoPath)
      .data.publicUrl;

    // profiles columns other than full_name are server-written only: the
    // protect_profile_columns trigger rejects them from a user session.
    const { error: profileError } = await admin
      .from('profiles')
      .update({ photo_url: photoUrl })
      .eq('id', userId);

    if (profileError) {
      logger.error('profile/photo: profile update failed', {
        userId,
        err: profileError.message,
      });
      return respond.fail(500, 'Failed to save photo');
    }

    // The object path is stable across replacements (`{id}/passport.ext`), so
    // the proxy URL carries a version param to bust the browser cache. Done
    // server-side because the caller can't safely append to a query string it
    // doesn't own.
    return respond.ok({
      photo_url: toProxyUrl(photoUrl, { version: Date.now() }),
    });
  },
});

// Removes the authenticated user's profile photo from storage and clears
// photo_url.
export const DELETE = route({
  name: 'profile/photo',
  auth: 'user',
  roles: USER_ROLES,
  handler: async ({ user }) => {
    const userId = user.id;
    const admin = createAdminClient();

    // List files under the user's folder (the extension varies between
    // uploads, and each upload upserts its own name).
    const { data: files } = await admin.storage.from(BUCKET).list(userId);

    if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: removeError } = await admin.storage
        .from(BUCKET)
        .remove(paths);

      if (removeError) {
        logger.error('profile/photo: delete failed', {
          userId,
          err: removeError.message,
        });
        return respond.fail(500, 'Failed to delete photo');
      }
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({ photo_url: null })
      .eq('id', userId);

    if (profileError) {
      logger.error('profile/photo: clear photo_url failed', {
        userId,
        err: profileError.message,
      });
      return respond.fail(500, 'Failed to clear photo');
    }

    return respond.ok(null);
  },
});
