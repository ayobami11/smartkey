import {
  assessPlausibility,
  DEFAULT_THRESHOLD,
  verifySignature,
} from '@/lib/ai/signature/verifier';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { logger } from '@/lib/logger';
import { callRpc } from '@/lib/rpc/call-rpc';
import { downloadStorageObject, toProxyUrl } from '@/lib/storage/object-url';
import { checkUpload } from '@/lib/storage/upload-type';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BUCKET = 'hod-signatures';

// The reference changed while this upload was being verified (a second
// upload, or the CSO approving a held one). Comparing again is the only safe
// answer, so the Dean is asked to retry.
const REFERENCE_CHANGED = {
  status: 409,
  message:
    'Your reference changed while this upload was being checked. Please try again.',
};

// Replaces a Dean's signature or stamp reference image.
//
// If an existing reference is on file, the new upload is compared pixel-level
// against it via Sharp + Pixelmatch, scored over the ink region. When the
// mismatch ratio exceeds the configured threshold (SIGNATURE_DIFF_THRESHOLD,
// default 55% — see verifier.ts for why it is not the old 15%) the upload is
// held for the CSO (hold_signature_reference); otherwise it becomes the
// reference (set_signature_reference). Each RPC writes its state and its
// audit entry in one transaction. Both are service-only, because the
// verification above is what makes them safe to call.
//
// Every upload goes to a fresh path ({uid}/{type}-{uuid}.{ext}), so the live
// reference file is never overwritten, and a held upload that the CSO later
// approves can no longer be overwritten by the next held one.
export const POST = route({
  name: 'profile/signature',
  auth: 'user',
  roles: ['DEAN'],
  handler: async ({ supabase, user, request }) => {
    const { data: refs } = await supabase
      .from('profiles')
      .select('signature_ref_url, stamp_ref_url')
      .eq('id', user.id)
      .single();
    if (!refs) return respond.fail(401, 'Unauthorized');

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return respond.fail(422, 'Invalid form data');
    }

    const type = formData.get('type');
    const image = formData.get('image');

    if (type !== 'signature' && type !== 'stamp') {
      return respond.fail(422, 'type must be "signature" or "stamp"');
    }
    if (!(image instanceof File)) {
      return respond.fail(422, 'image is required');
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return respond.fail(413, 'Image must be under 5 MB');
    }

    const imageBytes = await image.arrayBuffer();

    // The stored type and extension come from the bytes, never from the
    // browser-declared type or filename (see upload-type.ts). Checked before
    // the plausibility pass: Sharp would happily rasterise an SVG.
    const detected = checkUpload(imageBytes, 'image');
    if (!detected) {
      return respond.fail(422, 'image must be a PNG, JPEG or WebP file');
    }
    const imageBuffer = Buffer.from(imageBytes);

    // Coarse sanity check that this actually looks like a signature/stamp
    // before anything else — no point comparing garbage against the current
    // reference, or accepting it as a new one.
    const plausibility = await assessPlausibility(imageBuffer);
    if (!plausibility.plausible) {
      return respond.fail(
        422,
        plausibility.reason === 'too_sparse'
          ? `This doesn't look like a ${type} — the image appears blank. Please upload a clear photo or scan of just your ${type}.`
          : `This doesn't look like a ${type} — the image has too much dark content. Please upload a clear, cropped photo of just your ${type}.`
      );
    }

    const admin = createAdminClient();
    const currentRefUrl =
      type === 'signature' ? refs.signature_ref_url : refs.stamp_ref_url;

    let verdict: {
      mismatchPct: number;
      passed: boolean;
      comparedUrl: string;
    } | null = null;
    if (currentRefUrl) {
      let currentRefBuffer: Buffer;
      try {
        // Downloaded through the Storage API: `hod-signatures` is private, so
        // the stored URL is not retrievable over plain HTTP.
        currentRefBuffer = await downloadStorageObject(admin, currentRefUrl);
      } catch (e) {
        return respond.internal(
          'profile/signature: failed to fetch current reference',
          { err: String(e) }
        );
      }

      try {
        const result = await verifySignature(currentRefBuffer, imageBuffer);
        verdict = {
          mismatchPct: parseFloat((result.mismatch_ratio * 100).toFixed(2)),
          passed: result.passed,
          comparedUrl: currentRefUrl,
        };
      } catch (e) {
        return respond.internal('profile/signature: verification error', {
          err: String(e),
        });
      }
    }

    const storagePath = `${user.id}/${type}-${crypto.randomUUID()}.${detected.extension}`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, imageBytes, { contentType: detected.contentType });
    if (uploadError) {
      return respond.internal('profile/signature: upload failed', {
        err: uploadError.message,
      });
    }
    const uploadedUrl = admin.storage.from(BUCKET).getPublicUrl(storagePath)
      .data.publicUrl;

    // Nothing references the new object if the RPC refuses, so remove it
    // rather than leave an orphan. Best-effort: a leftover file is harmless.
    const discardUpload = async () => {
      const { error } = await admin.storage.from(BUCKET).remove([storagePath]);
      if (error) {
        logger.warn('profile/signature: could not remove unused upload', {
          storagePath,
          err: error.message,
        });
      }
    };

    if (verdict && !verdict.passed) {
      const held = await callRpc(admin, 'hold_signature_reference', {
        p_profile_id: user.id,
        p_type: type,
        p_pending_url: uploadedUrl,
        p_compared_ref_url: verdict.comparedUrl,
        p_mismatch_pct: verdict.mismatchPct,
        p_threshold_pct: parseFloat((DEFAULT_THRESHOLD * 100).toFixed(2)),
      });
      if (!held.ok) {
        await discardUpload();
        return rpcFail(held.error, { CONFLICT: REFERENCE_CHANGED });
      }
      return respond.ok({
        status: 'HELD_SIGNATURE_MISMATCH',
        mismatch_pct: verdict.mismatchPct,
        message:
          'Reference not updated: the new image looks significantly different from the current one. The CSO has been notified and can review it.',
      });
    }

    const updated = await callRpc(admin, 'set_signature_reference', {
      p_profile_id: user.id,
      p_type: type,
      p_new_url: uploadedUrl,
      p_compared_ref_url: currentRefUrl ?? undefined,
    });
    if (!updated.ok) {
      await discardUpload();
      return rpcFail(updated.error, { CONFLICT: REFERENCE_CHANGED });
    }

    // The audit entry keeps the canonical storage URL as the durable record;
    // the response carries the proxy URL the browser can render.
    return respond.ok({
      status: 'updated',
      new_url: toProxyUrl(uploadedUrl, { version: Date.now() }),
    });
  },
});
