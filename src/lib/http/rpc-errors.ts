import { type HttpError, respond } from '@/lib/http/respond';
import { logger } from '@/lib/logger';
import type { KnownRpcErrorKind, RpcError } from '@/lib/rpc/call-rpc';

/**
 * Default HTTP mapping for every kind an RPC can raise. A route that needs
 * different copy passes overrides to `rpcFail` / `rpcErrorToHttp`; it never
 * writes its own `mapRpcError`. `Record<KnownRpcErrorKind, …>` makes adding a
 * kind to RPC_ERROR_KINDS without a row here a type error.
 *
 * Copy is the most common wording the routes used before this module existed.
 */
export const RPC_ERROR_HTTP: Record<KnownRpcErrorKind, HttpError> = {
  NOT_AUTHENTICATED: { status: 401, message: 'Unauthorized' },
  FORBIDDEN: { status: 403, message: 'Forbidden' },
  NOT_AUTHORISED: { status: 403, message: 'Not authorised for this key' },
  NOT_FOUND: { status: 404, message: 'Not found' },
  EXPIRED_CODE: { status: 404, message: 'Code has expired' },
  BAD_RETURN_CODE: {
    status: 404,
    message: 'Return code not recognised. Ask the requester to check it.',
  },
  EXPIRED_RETURN_CODE: {
    status: 404,
    message:
      'Return code has expired. Ask the requester to generate a new one.',
  },
  CONFLICT: {
    status: 409,
    message: "This action conflicts with the request's current state.",
  },
  NO_KEYS_AVAILABLE: {
    status: 409,
    message:
      'No key is available for this room right now. Every key is out or reserved — try again once one is returned.',
  },
  NOT_ISSUED: { status: 409, message: 'This key is not currently issued.' },
  NOT_EXPIRED: { status: 409, message: 'This code has not expired yet.' },
  DUPLICATE_PROFILE: { status: 409, message: 'Email already registered' },
  AUTH_USER_NOT_FOUND: {
    status: 409,
    message:
      'No auth account found for this email. Send an invite via Supabase Auth first, then provision.',
  },
  TOO_EARLY: {
    status: 422,
    message: 'A collection code can only be generated on the requested date.',
  },
  REQUESTER_INACTIVE: {
    status: 422,
    message: 'This user account is deactivated and cannot be authorised',
  },
  NO_VERIFICATION: {
    status: 422,
    message: 'Enter the return code, or give a reason to return without one.',
  },
  VALIDATION: { status: 422, message: 'Invalid request' },
  INVALID_DECISION: { status: 422, message: 'Invalid decision' },
  INVALID_RULES: { status: 422, message: 'Invalid rule configuration' },
  INVALID_TIER_BOUNDS: {
    status: 422,
    message: 'high_min must exceed medium_min',
  },
  INVALID_ZONE_HOURS: { status: 422, message: 'Invalid zone hours' },
  INVALID_CONFIG: {
    status: 422,
    message: 'Invalid operational configuration',
  },
};

/**
 * A per-route replacement for one kind's default:
 * - a string replaces the message and keeps the default status;
 * - an HttpError replaces both;
 * - a function receives the RPC's `detail` and returns either of the above,
 *   or `undefined` to fall back to the default.
 *
 * `detail` is internal text ("current: PENDING_HOD"). An override function
 * must return fixed copy, never `detail` itself — use `byDetail` to branch.
 */
export type RpcErrorOverride =
  | string
  | HttpError
  | ((detail: string) => string | HttpError | undefined);

// INTERNAL is deliberately not a key: an unrecognised failure is always the
// same ref'd 500, whatever the route.
export type RpcErrorOverrides = Partial<
  Record<KnownRpcErrorKind, RpcErrorOverride>
>;

const internalError = (error: RpcError): HttpError => {
  let ref = error.ref;
  if (!ref) {
    // callRpc always sets a ref on INTERNAL; this covers a hand-built error.
    ref = crypto.randomUUID();
    logger.error('RPC failed', { err: error.detail, ref });
  }
  return { status: 500, message: `Internal error. Ref: ${ref}` };
};

export const rpcErrorToHttp = (
  error: RpcError,
  overrides: RpcErrorOverrides = {}
): HttpError => {
  if (error.kind === 'INTERNAL') return internalError(error);

  const fallback = RPC_ERROR_HTTP[error.kind];
  const override = overrides[error.kind];
  const resolved =
    typeof override === 'function' ? override(error.detail) : override;

  if (resolved === undefined) return fallback;
  if (typeof resolved === 'string') {
    return { status: fallback.status, message: resolved };
  }
  return resolved;
};

/** The route-side one-liner: `if (!result.ok) return rpcFail(result.error)`. */
export const rpcFail = (error: RpcError, overrides?: RpcErrorOverrides) =>
  respond.error(rpcErrorToHttp(error, overrides));

/**
 * Branches one kind on its detail text, for the few RPCs that raise the same
 * kind for different situations (e.g. nominate_collector's two CONFLICTs).
 * The first matching pattern wins; anchor patterns (`^…$`) where the detail
 * is a fixed message. Mapped values are fixed copy — the detail itself is
 * never returned. No match → `fallback`, or the catalogue default.
 */
export const byDetail =
  (
    cases: ReadonlyArray<readonly [RegExp, string | HttpError]>,
    fallback?: string | HttpError
  ) =>
  (detail: string): string | HttpError | undefined => {
    for (const [pattern, value] of cases) {
      if (pattern.test(detail)) return value;
    }
    return fallback;
  };
