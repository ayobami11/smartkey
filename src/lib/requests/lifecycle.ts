import type { HttpError } from '@/lib/http/respond';
import { rpcErrorToHttp, type RpcErrorOverrides } from '@/lib/http/rpc-errors';
import { notifyAfterResponse } from '@/lib/notifications/notify';
import { callRpc, type RpcClient, type RpcResult } from '@/lib/rpc/call-rpc';

// The Request lifecycle module: the three steps a requester takes on their
// own request after it is approved or issued — mint the on-the-day
// collection code, mint a return code, retire a lapsed collection code.
//
// A registered requester and an external guest take the same steps. The
// difference is only who they are and how that is proved, so it lives in one
// place: the LifecycleTarget a route hands in. Each step then calls the
// matching RPC (the registered one with the session user, the guest one with
// the access_token), maps its errors to one set of copy, and does anything
// else the step owes (the code email). Routes do auth and shape the response.
//
// The RPCs are themselves thin wrappers around one SQL implementation per
// step (20261019090000_merge_guest_registered_lifecycle.sql), so both paths
// raise the same error kinds; this module gives each kind the same copy.

export type LifecycleTarget =
  // `requesterId` is always the session user, never a body field. The RPC
  // asserts it again (_assert_session_actor) and checks ownership.
  | { kind: 'registered'; requestId: string; requesterId: string }
  // The access_token from the guest's status-page link. The guest RPCs are
  // service-role only, so the client must be the admin client.
  | { kind: 'guest'; accessToken: string };

export type LifecycleResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: HttpError };

export type CollectionCode = {
  request_id: string;
  code: string;
  code_expires_at: string;
};

export type ReturnCode = {
  request_id: string;
  return_code: string;
  return_code_expires_at: string;
};

export type CodeExpiry = { request_id: string; status: string };

// Copy shared by every step. NOT_AUTHENTICATED and FORBIDDEN are raised only
// on the registered path (a guest's token either resolves or is NOT_FOUND).
const COMMON: RpcErrorOverrides = {
  NOT_AUTHENTICATED: 'Not authenticated',
  NOT_FOUND: 'Request not found',
  FORBIDDEN: 'This is not your request',
};

// TOO_EARLY and NO_KEYS_AVAILABLE keep the catalogue copy, as does
// NOT_EXPIRED. Exported so the contract tests pin the same strings.
export const LIFECYCLE_ERROR_COPY = {
  collectionCode: {
    ...COMMON,
    CONFLICT: 'This request is not approved for collection.',
  },
  returnCode: {
    ...COMMON,
    NOT_ISSUED: 'This key is not currently issued to you',
  },
  expireCode: COMMON,
} satisfies Record<string, RpcErrorOverrides>;

const settle = <T>(
  result: RpcResult<T>,
  overrides: RpcErrorOverrides
): LifecycleResult<T> =>
  result.ok
    ? result
    : { ok: false, error: rpcErrorToHttp(result.error, overrides) };

/**
 * Mints the 6-digit collection code for an APPROVED weekend request, on its
 * requested date only, and emails it after the response. Minting reserves a
 * copy of the key, so a fully spoken-for room is NO_KEYS_AVAILABLE (409).
 */
export const generateCollectionCode = async (
  client: RpcClient,
  target: LifecycleTarget
): Promise<LifecycleResult<CollectionCode>> => {
  const result =
    target.kind === 'registered'
      ? await callRpc(client, 'generate_weekend_code', {
          p_request_id: target.requestId,
          p_requester_id: target.requesterId,
        })
      : await callRpc(client, 'generate_guest_weekend_code', {
          p_access_token: target.accessToken,
        });

  const settled = settle(result, LIFECYCLE_ERROR_COPY.collectionCode);
  if (settled.ok) {
    // A failed send never fails the step: the code is already on screen.
    notifyAfterResponse({
      type: 'CODE_ISSUED',
      requestId: settled.data.request_id,
    });
  }
  return settled;
};

/**
 * Mints a 6-digit return code (15 minutes) for the holder's KEY_ISSUED
 * request. The request stays KEY_ISSUED; the verifier enters the code.
 */
export const generateReturnCode = async (
  client: RpcClient,
  target: LifecycleTarget
): Promise<LifecycleResult<ReturnCode>> => {
  const result =
    target.kind === 'registered'
      ? await callRpc(client, 'request_return', {
          p_request_id: target.requestId,
          p_requester_id: target.requesterId,
        })
      : await callRpc(client, 'request_return_guest', {
          p_access_token: target.accessToken,
        });

  return settle(result, LIFECYCLE_ERROR_COPY.returnCode);
};

/**
 * Retires a lapsed collection code: EXPIRED, or back to APPROVED for a
 * weekend request on its own date. Idempotent — a request that already moved
 * on comes back with its current status. The UI fires it at countdown zero.
 */
export const expireCollectionCode = async (
  client: RpcClient,
  target: LifecycleTarget
): Promise<LifecycleResult<CodeExpiry>> => {
  const result =
    target.kind === 'registered'
      ? await callRpc(client, 'expire_request', {
          p_request_id: target.requestId,
          p_requester_id: target.requesterId,
        })
      : await callRpc(client, 'expire_guest_request', {
          p_access_token: target.accessToken,
        });

  return settle(result, LIFECYCLE_ERROR_COPY.expireCode);
};
