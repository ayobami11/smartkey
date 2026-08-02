import { NextRequest, NextResponse } from 'next/server';

import {
  DEFAULT_THRESHOLD,
  verifySignature,
} from '@/lib/ai/signature/verifier';
import { writeAuditEntry } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Replaces a Dean's signature or stamp reference image.
//
// If an existing reference is on file, the new upload is compared pixel-level
// against it via Sharp + Pixelmatch, scored over the ink region. When the
// mismatch ratio exceeds the configured threshold (SIGNATURE_DIFF_THRESHOLD,
// default 55% — see verifier.ts for why it is not the old 15%) the update is
// held and a SIGNATURE_MISMATCH audit entry is written so the CSO can review.
// Otherwise the reference is replaced and a SIGNATURE_REFERENCE_UPDATED entry
// is written.
export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, signature_ref_url, stamp_ref_url')
    .eq('id', user.id)
    .single();

  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'DEAN')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(err('Invalid form data', 422), { status: 422 });
  }

  const type = formData.get('type');
  const image = formData.get('image');

  if (type !== 'signature' && type !== 'stamp') {
    return NextResponse.json(err('type must be "signature" or "stamp"', 422), {
      status: 422,
    });
  }
  if (!(image instanceof File)) {
    return NextResponse.json(err('image is required', 422), { status: 422 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(err('Image must be under 5 MB', 413), {
      status: 413,
    });
  }

  const imageBytes = await image.arrayBuffer();
  const imageBuffer = Buffer.from(imageBytes);

  const currentRefUrl =
    type === 'signature' ? profile.signature_ref_url : profile.stamp_ref_url;

  // When an existing reference is on file, compare the new upload pixel-level
  // against it before allowing the update.
  if (currentRefUrl) {
    let currentRefBuffer: Buffer;
    try {
      const res = await fetch(currentRefUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      currentRefBuffer = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      const ref = crypto.randomUUID().slice(0, 8);
      logger.error('signature-replace: failed to fetch current reference', {
        ref,
        err: String(e),
      });
      return NextResponse.json(
        err(`Could not load current reference. Ref: ${ref}`, 500),
        { status: 500 }
      );
    }

    let verifyResult: { mismatch_ratio: number; passed: boolean };
    try {
      verifyResult = await verifySignature(currentRefBuffer, imageBuffer);
    } catch (e) {
      const ref = crypto.randomUUID().slice(0, 8);
      logger.error('signature-replace: verification error', {
        ref,
        err: String(e),
      });
      return NextResponse.json(err(`Verification error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }

    const mismatch_pct = parseFloat(
      (verifyResult.mismatch_ratio * 100).toFixed(2)
    );
    const threshold_pct = parseFloat((DEFAULT_THRESHOLD * 100).toFixed(2));

    if (!verifyResult.passed) {
      try {
        await writeAuditEntry({
          event: 'SIGNATURE_MISMATCH',
          actorId: user.id,
          actorRole: 'DEAN',
          targetType: 'profile',
          targetId: user.id,
          payload: {
            context: 'reference_replacement',
            type,
            current_ref_url: currentRefUrl,
            mismatch_pct,
            threshold_pct,
          },
        });
      } catch (auditErr) {
        logger.error(
          'signature-replace: failed to write SIGNATURE_MISMATCH audit entry',
          {
            err:
              auditErr instanceof Error ? auditErr.message : String(auditErr),
          }
        );
      }

      return NextResponse.json(
        ok({
          status: 'HELD_SIGNATURE_MISMATCH',
          mismatch_pct,
          message:
            'Reference not updated: the new image looks significantly different from the current one. The CSO has been notified.',
        })
      );
    }
  }

  // Verification passed (or no existing reference) — upload the new file.
  const admin = createAdminClient();
  const ext = image.name.split('.').pop() ?? 'png';
  const storagePath = `${user.id}/${type}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from('hod-signatures')
    .upload(storagePath, imageBytes, { contentType: image.type, upsert: true });

  if (uploadError) {
    const ref = crypto.randomUUID().slice(0, 8);
    logger.error('signature-replace: upload failed', {
      ref,
      err: uploadError.message,
    });
    return NextResponse.json(err(`Upload failed. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  const { data: urlData } = admin.storage
    .from('hod-signatures')
    .getPublicUrl(storagePath);

  const newUrl = urlData.publicUrl;
  const profileUpdate =
    type === 'signature'
      ? { signature_ref_url: newUrl }
      : { stamp_ref_url: newUrl };

  const { error: updateError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id);

  if (updateError) {
    const ref = crypto.randomUUID().slice(0, 8);
    logger.error('signature-replace: profile update failed', {
      ref,
      err: updateError.message,
    });
    return NextResponse.json(err(`Profile update failed. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  try {
    await writeAuditEntry({
      event: 'SIGNATURE_REFERENCE_UPDATED',
      actorId: user.id,
      actorRole: 'DEAN',
      targetType: 'profile',
      targetId: user.id,
      payload: {
        type,
        new_url: newUrl,
        replaced_existing: Boolean(currentRefUrl),
      },
    });
  } catch (auditErr) {
    logger.error(
      'signature-replace: failed to write SIGNATURE_REFERENCE_UPDATED audit entry',
      {
        err: auditErr instanceof Error ? auditErr.message : String(auditErr),
      }
    );
  }

  return NextResponse.json(ok({ status: 'updated', new_url: newUrl }));
};
