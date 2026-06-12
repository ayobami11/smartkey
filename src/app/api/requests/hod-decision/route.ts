import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { verifySignature } from '@/lib/ai/signature/verifier';
import { writeAuditEntry } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  request_id: z.uuid(),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
  // URL of the HOD-signed letter uploaded by the requester to weekend-letters
  // storage. When present, the embedded signature is compared pixel-level
  // against the HOD's onboarded reference. Omit if no letter was uploaded.
  submitted_signature_url: z.url().optional(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Not authenticated' };
  if (msg.includes('FORBIDDEN')) return { status: 403, message: 'Forbidden' };
  if (msg.includes('NOT_FOUND')) return { status: 404, message: 'Not found' };
  if (msg.includes('CONFLICT'))
    return { status: 409, message: msg.split(': ')[1] ?? 'Conflict' };
  if (msg.includes('NOT_AUTHORISED'))
    return { status: 403, message: 'Not authorised for this key' };
  if (msg.includes('EXPIRED_CODE'))
    return { status: 404, message: 'Code has expired' };
  return { status: 500, message: 'Internal error' };
};

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, department_id, signature_ref_url')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'HOD')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { request_id, decision, note, submitted_signature_url } = parsed.data;

  if (decision === 'APPROVED') {
    if (!profile.signature_ref_url) {
      return NextResponse.json(
        err(
          'HOD onboarding is incomplete. Please upload your signature before approving requests.',
          403
        ),
        { status: 403 }
      );
    }

    // Run pixel-level signature verification when a submitted letter is present.
    if (submitted_signature_url) {
      let verifyResult: { mismatch_ratio: number; passed: boolean };

      try {
        const [refRes, subRes] = await Promise.all([
          fetch(profile.signature_ref_url),
          fetch(submitted_signature_url),
        ]);
        if (!refRes.ok || !subRes.ok)
          throw new Error('Failed to fetch signature images');

        const [refBuffer, subBuffer] = await Promise.all([
          refRes.arrayBuffer().then(Buffer.from),
          subRes.arrayBuffer().then(Buffer.from),
        ]);

        verifyResult = await verifySignature(refBuffer, subBuffer);
      } catch (e) {
        const ref = crypto.randomUUID();
        logger.error('hod-decision: signature fetch/verify failed', {
          ref,
          err: e instanceof Error ? e.message : String(e),
        });
        return NextResponse.json(
          err(`Signature verification error. Ref: ${ref}`, 500),
          { status: 500 }
        );
      }

      if (!verifyResult.passed) {
        // Approval is held — do not call approve_weekend. Write an audit entry
        // so the CSO can see the reference URL, submitted URL, and mismatch %.
        const mismatch_pct = parseFloat(
          (verifyResult.mismatch_ratio * 100).toFixed(2)
        );
        try {
          await writeAuditEntry({
            event: 'SIGNATURE_MISMATCH',
            actorId: user.id,
            actorRole: 'HOD',
            targetType: 'request',
            targetId: request_id,
            payload: {
              ref_url: profile.signature_ref_url,
              submitted_url: submitted_signature_url,
              mismatch_pct,
              threshold_pct: parseFloat(
                (
                  parseFloat(process.env.SIGNATURE_DIFF_THRESHOLD ?? '0.15') *
                  100
                ).toFixed(2)
              ),
            },
          });
        } catch (auditErr) {
          logger.error(
            'hod-decision: failed to write signature_mismatch audit entry',
            {
              err:
                auditErr instanceof Error ? auditErr.message : String(auditErr),
            }
          );
        }

        return NextResponse.json(
          ok({
            request_id,
            status: 'HELD_SIGNATURE_MISMATCH',
            mismatch_pct,
            message:
              'Approval held: signature mismatch detected. The CSO has been notified.',
          })
        );
      }

      // Verification passed — call RPC with real mismatch data.
      const { data, error } = await supabase.rpc('approve_weekend', {
        p_request_id: request_id,
        p_hod_id: user.id,
        p_note: note ?? undefined,
        p_signature_verified: true,
        p_signature_mismatch_pct: parseFloat(
          (verifyResult.mismatch_ratio * 100).toFixed(2)
        ),
      });

      if (error) {
        const mapped = mapRpcError(error.message);
        if (mapped.status === 500) {
          const ref = crypto.randomUUID();
          logger.error('approve_weekend RPC failed', {
            err: error.message,
            ref,
          });
          return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
            status: 500,
          });
        }
        return NextResponse.json(err(mapped.message, mapped.status), {
          status: mapped.status,
        });
      }

      const result = Array.isArray(data) ? data[0] : data;
      return NextResponse.json(
        ok({ request_id: result.request_id, status: 'CODE_ISSUED' })
      );
    }

    // No submitted letter — proceed without comparison.
    const { data, error } = await supabase.rpc('approve_weekend', {
      p_request_id: request_id,
      p_hod_id: user.id,
      p_note: note ?? undefined,
      p_signature_verified: true,
      p_signature_mismatch_pct: undefined,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('approve_weekend RPC failed', { err: error.message, ref });
        return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
          status: 500,
        });
      }
      return NextResponse.json(err(mapped.message, mapped.status), {
        status: mapped.status,
      });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(
      ok({ request_id: result.request_id, status: 'CODE_ISSUED' })
    );
  } else {
    const { data, error } = await supabase.rpc('decline_weekend', {
      p_request_id: request_id,
      p_hod_id: user.id,
      p_note: note ?? undefined,
    });

    if (error) {
      const mapped = mapRpcError(error.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('decline_weekend RPC failed', { err: error.message, ref });
        return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
          status: 500,
        });
      }
      return NextResponse.json(err(mapped.message, mapped.status), {
        status: mapped.status,
      });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(
      ok({ request_id: result.request_id, status: 'DECLINED' })
    );
  }
};
