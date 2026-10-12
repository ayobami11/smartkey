import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';
import type { Database } from '@/types/database';

type Functions = Database['public']['Functions'];
export type RpcName = keyof Functions;
export type RpcArgs<N extends RpcName> = Functions[N]['Args'];
// Set-returning RPCs come back as an array; callRpc unwraps it to one row.
export type RpcRow<N extends RpcName> =
  Functions[N]['Returns'] extends (infer R)[] ? R : Functions[N]['Returns'];

// Every RPC raises `'<KIND>: <detail>'`. The prefix is the stable part of the
// contract — SQLSTATE codes are not: P0004 covers five different kinds, and
// P0009/P0010 are each shared by two. Match the exact prefix, never a
// substring, so a detail that happens to contain another kind's name cannot
// misclassify the error.
export const RPC_ERROR_KINDS = [
  'AUTH_USER_NOT_FOUND',
  'BAD_RETURN_CODE',
  'CONFLICT',
  'DUPLICATE_PROFILE',
  'EXPIRED_CODE',
  'EXPIRED_RETURN_CODE',
  'FORBIDDEN',
  'INVALID_CONFIG',
  'INVALID_DECISION',
  'INVALID_RULES',
  'INVALID_TIER_BOUNDS',
  'INVALID_ZONE_HOURS',
  'NOT_AUTHORISED',
  'NOT_EXPIRED',
  'NOT_FOUND',
  'NOT_ISSUED',
  'NO_KEYS_AVAILABLE',
  'NO_VERIFICATION',
  'REQUESTER_INACTIVE',
  'TOO_EARLY',
  'VALIDATION',
] as const;

export type RpcErrorKind = (typeof RPC_ERROR_KINDS)[number] | 'INTERNAL';

// `detail` is the RPC's own text after the prefix. It can name internal
// states ("current: PENDING_HOD") and is for logs and branching only — never
// send it to a client. `ref` is set only for INTERNAL, which is logged here.
export type RpcError = { kind: RpcErrorKind; detail: string; ref?: string };

export type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RpcError };

export type RpcClient = SupabaseClient<Database>;

const PREFIX_PATTERN = /^([A-Z_]+):\s*([\s\S]*)$/;

const isKnownKind = (
  value: string
): value is Exclude<RpcErrorKind, 'INTERNAL'> =>
  (RPC_ERROR_KINDS as readonly string[]).includes(value);

export const parseRpcErrorMessage = (
  message: string
): { kind: RpcErrorKind; detail: string } => {
  const match = PREFIX_PATTERN.exec(message);
  if (match && isKnownKind(match[1])) {
    return { kind: match[1], detail: match[2] };
  }
  return { kind: 'INTERNAL', detail: message };
};

const internal = (name: string, detail: string): RpcError => {
  const ref = crypto.randomUUID();
  logger.error(`${name} RPC failed`, { err: detail, ref });
  return { kind: 'INTERNAL', detail, ref };
};

export const callRpc = async <N extends RpcName>(
  client: RpcClient,
  name: N,
  args: RpcArgs<N>
): Promise<RpcResult<RpcRow<N>>> => {
  // The generated client types `args` per function name; that relationship
  // is already enforced by this function's own signature.
  const { data, error } = await (
    client.rpc as (
      fn: string,
      args: unknown
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  ).call(client, name, args);

  if (error) {
    const parsed = parseRpcErrorMessage(error.message);
    if (parsed.kind === 'INTERNAL') {
      return { ok: false, error: internal(name, parsed.detail) };
    }
    return { ok: false, error: parsed };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) {
    return { ok: false, error: internal(name, 'RPC returned empty result') };
  }

  return { ok: true, data: row as RpcRow<N> };
};
