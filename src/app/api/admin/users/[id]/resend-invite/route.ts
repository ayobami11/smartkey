import * as z from 'zod';

import { activationEmail } from '@/lib/email/templates/account';
import { gmailTransport } from '@/lib/email/transport';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { byDetail, rpcFail } from '@/lib/http/rpc-errors';
import { logger } from '@/lib/logger';
import { callRpc } from '@/lib/rpc/call-rpc';
import { createAdminClient } from '@/lib/supabase/admin';

// Logs under a fresh ref and returns a 500 whose copy names the step that
// failed; the UI shows it as-is.
const failedStep = (
  message: string,
  logMessage: string,
  context: Record<string, unknown>
) => {
  const ref = crypto.randomUUID();
  logger.error(logMessage, { ...context, ref });
  return respond.fail(500, `${message} Ref: ${ref}`);
};

// Re-sends a fresh activation link to a user still in PENDING_ACTIVATION.
// Use when the original invite link expired before the user activated.
//
// Order: generate the link, then record USER_INVITE_RESENT
// (record_invite_resent, which re-checks the status under a lock), then send.
// Sending can never share a transaction, so the entry records that the CSO
// re-sent a fresh link; a send that then fails still answers 500.
export const POST = route({
  name: 'admin/users/[id]/resend-invite',
  auth: 'user',
  roles: ['CSO'],
  params: z.object({ id: z.uuid() }),
  paramsError: { status: 404, message: 'User not found' },
  handler: async ({ supabase, params }) => {
    const { id } = params;

    const { data: target, error: fetchError } = await supabase
      .from('profiles')
      .select('id, institutional_email, role, status')
      .eq('id', id)
      .single();

    if (fetchError || !target) return respond.fail(404, 'User not found');

    if (target.status === 'ACTIVE') {
      return respond.fail(409, 'User is already active');
    }
    if (target.status === 'DEACTIVATED') {
      return respond.fail(409, 'User is deactivated — reinstate them first');
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';
    const activationPath =
      target.role === 'DEAN' ? '/dean/onboarding' : '/activate';

    // generateLink mints a fresh one-time token. We build our own
    // /auth/confirm link from the token hash (verified server-side via
    // verifyOtp) and send it via Gmail so delivery is reliable regardless of
    // Supabase's SMTP config.
    const { data: linkData, error: linkError } =
      await createAdminClient().auth.admin.generateLink({
        type: 'magiclink',
        email: target.institutional_email,
      });

    if (linkError || !linkData?.properties?.hashed_token) {
      return failedStep(
        'Could not generate link.',
        'resend-invite: generateLink failed',
        { id, err: linkError?.message ?? 'no hashed_token returned' }
      );
    }

    // The CSO's own session: record_invite_resent checks the actor.
    const recorded = await callRpc(supabase, 'record_invite_resent', {
      p_profile_id: id,
    });
    if (!recorded.ok) {
      return rpcFail(recorded.error, {
        NOT_FOUND: 'User not found',
        CONFLICT: byDetail([
          [/^user is already active/, 'User is already active'],
          [
            /^user is deactivated/,
            'User is deactivated — reinstate them first',
          ],
        ]),
      });
    }

    const confirmParams = new URLSearchParams({
      token_hash: linkData.properties.hashed_token,
      type: linkData.properties.verification_type,
      next: activationPath,
    });
    const confirmLink = `${siteUrl}/auth/confirm?${confirmParams.toString()}`;

    try {
      await gmailTransport.send({
        to: target.institutional_email,
        ...activationEmail({ link: confirmLink, isReinvite: true }),
      });
    } catch (e: unknown) {
      return failedStep(
        'Could not send email.',
        'resend-invite: email send failed',
        { id, err: String(e) }
      );
    }

    return respond.ok({ profile_id: id, status: 'PENDING_ACTIVATION' });
  },
});
