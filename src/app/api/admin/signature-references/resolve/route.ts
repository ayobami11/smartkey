import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  profile_id: z.uuid(),
  type: z.enum(['signature', 'stamp']),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Unauthorized' };
  if (msg.includes('FORBIDDEN'))
    return {
      status: 403,
      message: 'Only the CSO can resolve a held signature reference',
    };
  if (msg.includes('NOT_FOUND'))
    return { status: 404, message: 'No pending reference for this profile' };
  if (msg.includes('INVALID_DECISION'))
    return { status: 422, message: 'Invalid decision' };
  return { status: 500, message: msg };
};

// Resolves a held signature/stamp reference-replacement mismatch
// (POST /api/profile/signature). Mirrors POST /api/requests/hod-decision's
// cso_override path for weekend-request mismatches: the CSO reviews the
// pending upload against the current reference and either approves it in
// (replacing the reference) or declines it (discarding the pending upload).
export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), {
      status: 422,
    });
  }

  const { profile_id, type, decision, note } = parsed.data;

  const { data, error } = await supabase.rpc(
    'resolve_pending_signature_reference',
    {
      p_profile_id: profile_id,
      p_type: type,
      p_decision: decision,
      p_note: note ?? undefined,
    }
  );

  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('resolve_pending_signature_reference RPC failed', {
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
    ok({ status: result.status, new_url: result.new_url })
  );
};
