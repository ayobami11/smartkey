import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';
import type { Database } from '@/types/database';

type Functions = Database['public']['Functions'];
export type RpcName = keyof Functions;
export type RpcArgs<N extends RpcName> = Functions[N]['Args'];
// Set-returning RPCs come back as an array; callRpc unwraps it to one row.
export type RpcRow<N extends RpcName> =
  Functions[N]['Returns'] extends (infer R)[] ? R : Functions[N]['Returns'];
// RPCs declared `returns void` are generated as `Returns: undefined`. They
// have no row to unwrap, so they go through callRpcVoid instead of callRpc.
export type VoidRpcName = {
  [N in RpcName]: Functions[N]['Returns'] extends undefined ? N : never;
}[RpcName];

// Every RPC raises `'<KIND>: <detail>'`, or occasionally the bare `'<KIND>'`.
// The prefix is the stable part of the contract — SQLSTATE codes are not:
// P0004 covers five different kinds, and P0009/P0010 are each shared by two.
// Match the exact prefix, never a substring, so a detail that happens to
// contain another kind's name cannot misclassify the error.
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
  'NOT_AUTHENTICATED',
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

export type KnownRpcErrorKind = (typeof RPC_ERROR_KINDS)[number];
export type RpcErrorKind = KnownRpcErrorKind | 'INTERNAL';

// `detail` is the RPC's own text after the prefix. It can name internal
// states ("current: PENDING_HOD") and is for logs and branching only — never
// send it to a client. `ref` is set only for INTERNAL, which is logged here.
export type RpcError = { kind: RpcErrorKind; detail: string; ref?: string };

export type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RpcError };

export type RpcClient = SupabaseClient<Database>;

// The `: detail` half is optional: several RPCs (nominate_collector,
// update_operational_config, create_request) raise a bare `NOT_AUTHENTICATED`,
// which must not fall through to INTERNAL. A bare kind gets detail ''.
const PREFIX_PATTERN = /^([A-Z_]+)(?::\s*([\s\S]*))?$/;

const isKnownKind = (value: string): value is KnownRpcErrorKind =>
  (RPC_ERROR_KINDS as readonly string[]).includes(value);

export const parseRpcErrorMessage = (
  message: string
): { kind: RpcErrorKind; detail: string } => {
  const match = PREFIX_PATTERN.exec(message);
  if (match && isKnownKind(match[1])) {
    return { kind: match[1], detail: match[2] ?? '' };
  }
  return { kind: 'INTERNAL', detail: message };
};

const internal = (name: string, detail: string): RpcError => {
  const ref = crypto.randomUUID();
  logger.error(`${name} RPC failed`, { err: detail, ref });
  return { kind: 'INTERNAL', detail, ref };
};

type RawRpcResult = { data: unknown; error: { message: string } | null };

// The generated client types `args` per function name; that relationship is
// already enforced by the exported functions' own signatures.
const invoke = (
  client: RpcClient,
  name: RpcName,
  args: unknown
): PromiseLike<RawRpcResult> =>
  (client.rpc as (fn: string, args: unknown) => PromiseLike<RawRpcResult>).call(
    client,
    name,
    args
  );

const toRpcError = (name: RpcName, message: string): RpcError => {
  const parsed = parseRpcErrorMessage(message);
  return parsed.kind === 'INTERNAL' ? internal(name, parsed.detail) : parsed;
};

export const callRpc = async <N extends RpcName>(
  client: RpcClient,
  name: N,
  args: RpcArgs<N>
): Promise<RpcResult<RpcRow<N>>> => {
  const { data, error } = await invoke(client, name, args);

  if (error) return { ok: false, error: toRpcError(name, error.message) };

  const row = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) {
    return { ok: false, error: internal(name, 'RPC returned empty result') };
  }

  return { ok: true, data: row as RpcRow<N> };
};

// For `returns void` RPCs (remove_collector, update_risk_config,
// update_operational_config). Same error parsing and logging as callRpc, but a
// null result is the success value — there is no row to guard.
export const callRpcVoid = async <N extends VoidRpcName>(
  client: RpcClient,
  name: N,
  args: RpcArgs<N>
): Promise<RpcResult<null>> => {
  const { error } = await invoke(client, name, args);
  if (error) return { ok: false, error: toRpcError(name, error.message) };
  return { ok: true, data: null };
};
