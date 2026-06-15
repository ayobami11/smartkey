import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
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
    .select('role, department_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'VERIFIER')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { code } = parsed.data;

  const { data: req } = await supabase
    .from('requests')
    .select('id, status, code_expires_at, key_id, requester_id, guest_id')
    .eq('code', code)
    .eq('status', 'CODE_ISSUED')
    .single();

  if (!req) {
    return NextResponse.json(err('Code not found or already used', 404), {
      status: 404,
    });
  }

  if (req.code_expires_at && new Date(req.code_expires_at) < new Date()) {
    return NextResponse.json(err('Code has expired', 404), { status: 404 });
  }

  // IMPORTANT FIX: Use server-verified user.id instead of trusting client payload
  const { data: rpcData, error: rpcError } = await supabase.rpc('issue_key', {
    p_request_id: req.id,
    p_verifier_id: user.id,
  });

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('issue_key RPC failed', { err: rpcError.message, ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }
    return NextResponse.json(err(mapped.message, mapped.status), {
      status: mapped.status,
    });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('issue_key RPC returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  const { data: keyData } = req.key_id
    ? await supabase
        .from('keys')
        .select('code, room_name')
        .eq('id', req.key_id)
        .single()
    : { data: null };

  // External (guest) requests have a guest_id and no requester_id. The verifier
  // checks the declared physical ID document at the desk instead of a passport
  // photo. The shape is additive so the verifier UI can branch on `is_guest`.
  if (req.guest_id) {
    const { data: guest } = await supabase
      .from('guest_requesters')
      .select('full_name, id_document_type, id_document_number')
      .eq('id', req.guest_id)
      .single();

    return NextResponse.json(
      ok({
        request_id: result.request_id,
        is_guest: true,
        requester: {
          full_name: guest?.full_name ?? null,
          photo_url: null,
          id_document_type: guest?.id_document_type ?? null,
          id_document_number: guest?.id_document_number ?? null,
        },
        key: {
          code: keyData?.code ?? null,
          room_name: keyData?.room_name ?? null,
        },
        issued_at: result.issued_at,
      }),
      { status: 200 }
    );
  }

  const { data: requesterProfile } = req.requester_id
    ? await supabase
        .from('profiles')
        .select('full_name, photo_url')
        .eq('id', req.requester_id)
        .single()
    : { data: null };

  return NextResponse.json(
    ok({
      request_id: result.request_id,
      is_guest: false,
      requester: {
        full_name: requesterProfile?.full_name ?? null,
        photo_url: requesterProfile?.photo_url ?? null,
      },
      key: {
        code: keyData?.code ?? null,
        room_name: keyData?.room_name ?? null,
      },
      issued_at: result.issued_at,
    }),
    { status: 200 }
  );
};
