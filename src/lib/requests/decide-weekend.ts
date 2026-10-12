import { after } from 'next/server';

import { writeAuditEntry } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  callRpc,
  type RpcArgs,
  type RpcName,
  type RpcResult,
  type RpcRow,
} from '@/lib/rpc/call-rpc';
import {
  downloadStorageObject,
  parseStorageUrl,
} from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

// The Weekend decision module: a Dean or the CSO approves or declines a
// weekend request. Callers say who is deciding and what; everything else —
// guest or registered, which authoriser owns the unit, which images to
// verify, whether this is a CSO override of a held approval — is derived here
// from the request row and the actor's profile. See CONTEXT.md.

type UserRole = Database['public']['Enums']['user_role'];
type Authoriser = Database['public']['Enums']['department_authoriser'];

export type WeekendDecisionInput = {
  requestId: string;
  // The profile making the decision: the session user on the dashboard, or
  // the unit's current Dean on the emailed one-click page.
  actorId: string;
  decision: 'APPROVED' | 'DECLINED';
  note?: string;
  // Guest approvals only: the key the authoriser assigns. Ignored otherwise.
  keyId?: string;
};

export type WeekendDecisionRejection =
  | 'NOT_FOUND'
  | 'ALREADY_DECIDED'
  | 'DATE_PASSED'
  | 'NOT_AUTHORISER'
  | 'NO_MISMATCH_TO_OVERRIDE'
  | 'KEY_REQUIRED'
  | 'ONBOARDING_INCOMPLETE'
  | 'INVALID_SUBMISSION'
  | 'INTERNAL';

export type Mismatches = { signature?: number; stamp?: number };

export type WeekendDecisionResult =
  | { outcome: 'APPROVED' | 'DECLINED'; requestId: string }
  | { outcome: 'HELD'; requestId: string; mismatches: Mismatches }
  | { outcome: 'REJECTED'; reason: WeekendDecisionRejection; ref?: string };

export type DecisionContext = {
  request: {
    id: string;
    status: string;
    isGuest: boolean;
    letterUrl: string | null;
    stampUrl: string | null;
  } | null;
  // The unit whose authoriser governs this request: the key's unit for a
  // registered request, `requested_unit_id` for a guest one.
  authoriser: Authoriser | null;
  actor: {
    id: string;
    role: UserRole;
    signatureRefUrl: string | null;
    stampRefUrl: string | null;
  } | null;
};

export type VerifyOutcome = {
  mismatchPct: number;
  passed: boolean;
  thresholdPct: number;
};

// Internal seam. Production adapters come from defaultPorts(); tests pass
// in-memory ones. Callers of decideWeekend never see this.
export type WeekendDecisionPorts = {
  loadContext: (requestId: string, actorId: string) => Promise<DecisionContext>;
  rpc: <N extends RpcName>(
    name: N,
    args: RpcArgs<N>
  ) => Promise<RpcResult<RpcRow<N>>>;
  loadImage: (url: string) => Promise<Buffer>;
  verify: (reference: Buffer, submitted: Buffer) => Promise<VerifyOutcome>;
  audit: typeof writeAuditEntry;
  notify: {
    decided: (
      requestId: string,
      decision: 'APPROVED' | 'DECLINED',
      note?: string
    ) => void;
    signatureMismatch: (
      requestId: string,
      mismatches: Mismatches,
      thresholdPct: number
    ) => void;
  };
};

const toPct = (ratio: number) => parseFloat((ratio * 100).toFixed(2));

export const defaultPorts = (): WeekendDecisionPorts => {
  const admin = createAdminClient();

  return {
    loadContext: async (requestId, actorId) => {
      const [{ data: req }, { data: actor }] = await Promise.all([
        admin
          .from('requests')
          .select(
            `id, status, guest_id, letter_url, stamp_url,
             key:keys!requests_key_id_fkey(unit:units!keys_unit_id_fkey(authoriser)),
             requested_unit:units!requests_requested_unit_id_fkey(authoriser)`
          )
          .eq('id', requestId)
          .maybeSingle(),
        admin
          .from('profiles')
          .select('id, role, signature_ref_url, stamp_ref_url')
          .eq('id', actorId)
          .maybeSingle(),
      ]);

      const key = Array.isArray(req?.key) ? req.key[0] : req?.key;
      const keyUnit = Array.isArray(key?.unit) ? key.unit[0] : key?.unit;
      const requestedUnit = Array.isArray(req?.requested_unit)
        ? req.requested_unit[0]
        : req?.requested_unit;
      const isGuest = Boolean(req?.guest_id);

      return {
        request: req
          ? {
              id: req.id,
              status: req.status,
              isGuest,
              letterUrl: req.letter_url,
              stampUrl: req.stamp_url,
            }
          : null,
        authoriser:
          (isGuest ? requestedUnit?.authoriser : keyUnit?.authoriser) ?? null,
        actor: actor
          ? {
              id: actor.id,
              role: actor.role,
              signatureRefUrl: actor.signature_ref_url,
              stampRefUrl: actor.stamp_ref_url,
            }
          : null,
      };
    },
    rpc: (name, args) => callRpc(admin, name, args),
    loadImage: (url) => downloadStorageObject(admin, url),
    // Loaded lazily: the verifier pulls in sharp, and the email adapters pull
    // in nodemailer — neither belongs in the import graph of a test that
    // replaces them.
    verify: async (reference, submitted) => {
      const { verifySignature, DEFAULT_THRESHOLD } =
        await import('@/lib/ai/signature/verifier');
      const result = await verifySignature(reference, submitted);
      return {
        mismatchPct: toPct(result.mismatch_ratio),
        passed: result.passed,
        thresholdPct: toPct(DEFAULT_THRESHOLD),
      };
    },
    audit: writeAuditEntry,
    // after(): Vercel may freeze the function once the response is sent, so
    // an unawaited promise could be cut off mid-send.
    notify: {
      decided: (requestId, decision, note) =>
        after(async () => {
          const { notifyWeekendDecided } =
            await import('@/lib/email/notify-weekend-decision');
          await notifyWeekendDecided(requestId, decision, note);
        }),
      signatureMismatch: (requestId, mismatches, thresholdPct) =>
        after(async () => {
          const { notifyCsoSignatureMismatch } =
            await import('@/lib/email/notify-weekend-decision');
          await notifyCsoSignatureMismatch(requestId, mismatches, thresholdPct);
        }),
    },
  };
};

const rejected = (
  reason: WeekendDecisionRejection,
  ref?: string
): WeekendDecisionResult => ({
  outcome: 'REJECTED',
  reason,
  ...(ref ? { ref } : {}),
});

// Translates an RPC failure into a domain rejection. The RPC's own text is
// never returned — it names internal states ("current: PENDING_HOD").
const fromRpcError = (
  error: { kind: string; detail: string; ref?: string },
  csoOverride: boolean
): WeekendDecisionResult => {
  switch (error.kind) {
    case 'CONFLICT':
      return rejected(
        error.detail.includes('already passed')
          ? 'DATE_PASSED'
          : 'ALREADY_DECIDED'
      );
    case 'FORBIDDEN':
      return rejected(
        csoOverride ? 'NO_MISMATCH_TO_OVERRIDE' : 'NOT_AUTHORISER'
      );
    case 'NOT_FOUND':
      return rejected('NOT_FOUND');
    default:
      return rejected('INTERNAL', error.ref);
  }
};

type Check = {
  ref_url: string;
  submitted_url: string;
  mismatch_pct: number;
  passed: boolean;
};

export const decideWeekend = async (
  input: WeekendDecisionInput,
  ports: WeekendDecisionPorts = defaultPorts()
): Promise<WeekendDecisionResult> => {
  const { requestId, actorId, decision, note, keyId } = input;
  const { request, authoriser, actor } = await ports.loadContext(
    requestId,
    actorId
  );

  if (!request || !actor) return rejected('NOT_FOUND');
  // Fast path only — the RPC re-checks under a row lock and stays the authority.
  if (request.status !== 'PENDING_HOD') return rejected('ALREADY_DECIDED');

  // The CSO acting on a Dean-authorised unit can only be releasing a held
  // approval; the RPC honours that only when a SIGNATURE_MISMATCH audit
  // entry exists for the request.
  const csoOverride = actor.role === 'CSO' && authoriser === 'DEAN';

  const finish = async <
    N extends 'approve_weekend' | 'approve_guest_weekend' | 'decline_weekend',
  >(
    name: N,
    args: RpcArgs<N>
  ): Promise<WeekendDecisionResult> => {
    const result = await ports.rpc(name, args);
    if (!result.ok) return fromRpcError(result.error, csoOverride);
    const row = result.data as { request_id: string };
    ports.notify.decided(
      row.request_id,
      decision,
      decision === 'DECLINED' ? note : undefined
    );
    return { outcome: decision, requestId: row.request_id };
  };

  if (decision === 'DECLINED') {
    return finish('decline_weekend', {
      p_request_id: requestId,
      p_hod_id: actorId,
      p_note: note,
      p_cso_override: csoOverride,
    });
  }

  // Guest approval assigns a key instead of comparing a signature — guests
  // have no reference on file; the authoriser reviews the letter manually.
  if (request.isGuest) {
    if (!keyId) return rejected('KEY_REQUIRED');
    return finish('approve_guest_weekend', {
      p_request_id: requestId,
      p_hod_id: actorId,
      p_key_id: keyId,
      p_note: note,
    });
  }

  // The CSO has no reference signature, so nothing is compared.
  if (actor.role === 'CSO') {
    return finish('approve_weekend', {
      p_request_id: requestId,
      p_hod_id: actorId,
      p_note: note,
      p_signature_verified: false,
      p_cso_override: csoOverride,
    });
  }

  if (!actor.signatureRefUrl) return rejected('ONBOARDING_INCOMPLETE');

  // The images come from the request row, never from the caller. Each must
  // be an object in weekend-letters: anything else (e.g. a URL pointing at
  // the Dean's own reference in hod-signatures) would compare against itself.
  for (const url of [request.letterUrl, request.stampUrl]) {
    if (url && parseStorageUrl(url)?.bucket !== 'weekend-letters') {
      logger.error(
        'decide-weekend: stored submission is not a weekend-letters object',
        {
          requestId,
        }
      );
      return rejected('INVALID_SUBMISSION');
    }
  }

  let signatureCheck: Check | null = null;
  let stampCheck: Check | null = null;
  let thresholdPct = 0;

  const runCheck = async (
    refUrl: string,
    submittedUrl: string
  ): Promise<Check> => {
    const [refImage, submittedImage] = await Promise.all([
      ports.loadImage(refUrl),
      ports.loadImage(submittedUrl),
    ]);
    const outcome = await ports.verify(refImage, submittedImage);
    thresholdPct = outcome.thresholdPct;
    return {
      ref_url: refUrl,
      submitted_url: submittedUrl,
      mismatch_pct: outcome.mismatchPct,
      passed: outcome.passed,
    };
  };

  try {
    if (request.letterUrl) {
      signatureCheck = await runCheck(actor.signatureRefUrl, request.letterUrl);
    }
    if (request.stampUrl) {
      if (actor.stampRefUrl) {
        stampCheck = await runCheck(actor.stampRefUrl, request.stampUrl);
      } else {
        logger.error(
          'decide-weekend: stamp submitted but no stamp_ref_url on file',
          {
            requestId,
          }
        );
      }
    }
  } catch (e) {
    const ref = crypto.randomUUID();
    logger.error('decide-weekend: signature/stamp fetch/verify failed', {
      ref,
      err: e instanceof Error ? e.message : String(e),
    });
    return rejected('INTERNAL', ref);
  }

  const mismatches: Mismatches = {
    ...(signatureCheck && !signatureCheck.passed
      ? { signature: signatureCheck.mismatch_pct }
      : {}),
    ...(stampCheck && !stampCheck.passed
      ? { stamp: stampCheck.mismatch_pct }
      : {}),
  };

  if (Object.keys(mismatches).length > 0) {
    const describe = (c: Check | null) =>
      c
        ? {
            ref_url: c.ref_url,
            submitted_url: c.submitted_url,
            mismatch_pct: c.mismatch_pct,
          }
        : null;

    // The audit entry IS the hold: it is what the CSO dashboard lists and
    // what approve_weekend's override checks for. Without it there is no
    // hold, so a write failure must not be reported as HELD.
    try {
      await ports.audit({
        event: 'SIGNATURE_MISMATCH',
        actorId,
        actorRole: actor.role,
        targetType: 'request',
        targetId: requestId,
        payload: {
          signature: describe(signatureCheck),
          stamp: describe(stampCheck),
          threshold_pct: thresholdPct,
        },
      });
    } catch (e) {
      const ref = crypto.randomUUID();
      logger.error(
        'decide-weekend: failed to write SIGNATURE_MISMATCH audit entry',
        {
          ref,
          err: e instanceof Error ? e.message : String(e),
        }
      );
      return rejected('INTERNAL', ref);
    }

    ports.notify.signatureMismatch(requestId, mismatches, thresholdPct);
    return { outcome: 'HELD', requestId, mismatches };
  }

  return finish('approve_weekend', {
    p_request_id: requestId,
    p_hod_id: actorId,
    p_note: note,
    // True only when a comparison actually ran — "no letter attached" is
    // recorded as not verified, not as verified.
    p_signature_verified: signatureCheck !== null || stampCheck !== null,
    p_signature_mismatch_pct: signatureCheck?.mismatch_pct,
  });
};

const REJECTION_HTTP: Record<
  WeekendDecisionRejection,
  { status: number; message: string }
> = {
  NOT_FOUND: { status: 404, message: 'Request not found.' },
  ALREADY_DECIDED: {
    status: 409,
    message: 'This request has already been decided.',
  },
  DATE_PASSED: {
    status: 409,
    message: 'The requested weekend date has already passed.',
  },
  NOT_AUTHORISER: {
    status: 403,
    message: 'You are not the authoriser for this request.',
  },
  NO_MISMATCH_TO_OVERRIDE: {
    status: 403,
    message:
      'This request belongs to a Dean-authorised unit and has no held approval to resolve.',
  },
  KEY_REQUIRED: {
    status: 422,
    message: 'A key must be assigned to approve an external request.',
  },
  ONBOARDING_INCOMPLETE: {
    status: 403,
    message:
      'Your onboarding is incomplete. Upload your signature before approving requests.',
  },
  INVALID_SUBMISSION: {
    status: 422,
    message:
      'The letter attached to this request cannot be verified. Decline it and ask the requester to resubmit.',
  },
  INTERNAL: { status: 500, message: 'Internal error.' },
};

export const rejectionToHttp = (
  reason: WeekendDecisionRejection,
  ref?: string
): { status: number; message: string } => {
  const mapped = REJECTION_HTTP[reason];
  return ref
    ? { status: mapped.status, message: `${mapped.message} Ref: ${ref}` }
    : mapped;
};
