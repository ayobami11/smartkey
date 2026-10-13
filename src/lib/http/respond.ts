import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { err, ok } from '@/types/api';

// A status + client-safe message pair. Every error a route sends is one of
// these; `message` is user-facing copy and must never carry RPC detail,
// Supabase error text or a stack trace.
export type HttpError = { status: number; message: string };

/**
 * The only place an API route builds its `{ data, error, status }` envelope.
 * Building it here, once, is what guarantees the envelope's `status` always
 * equals the HTTP status (it drifted in 11 routes when each built its own).
 */
export const respond = {
  ok: <T>(data: T, status = 200) =>
    NextResponse.json(ok(data, status), { status }),

  fail: (status: number, message: string) =>
    NextResponse.json(err(message, status), { status }),

  error: ({ status, message }: HttpError) =>
    NextResponse.json(err(message, status), { status }),

  /**
   * Logs `logMessage` (plus `context`) under a fresh correlation ref and
   * returns a 500 whose only client-visible content is that ref.
   */
  internal: (logMessage: string, context: Record<string, unknown> = {}) => {
    const ref = crypto.randomUUID();
    logger.error(logMessage, { ...context, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  },

  noContent: () => new NextResponse(null, { status: 204 }),
};
