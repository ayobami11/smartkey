import { cache } from 'react';

import type { RiskFactor, RiskTier } from '@/lib/ai/risk/types';
import {
  shapeOutstanding,
  type OutstandingSourceRow,
  type OutstandingStatus,
} from '@/lib/keys/outstanding';
import { rewriteStorageUrls } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';

// This duplicates query/role-check/post-processing logic from
// src/app/api/requests/live-queue/route.ts and src/app/api/keys/out/route.ts
// on purpose, to seed the Verifier dashboard's first paint without editing
// src/app/api/**. If either route's query, select columns, role gate, or
// select logic changes, this file must be updated to match by hand. The
// overdue derivation and row shaping are shared: both use shapeOutstanding()
// from src/lib/keys/outstanding.ts.

const REQUEST_SELECT = `
  id,
  type,
  status,
  requested_for,
  risk_tier,
  risk_factors,
  created_at,
  requester:profiles!requester_id(id, full_name, photo_url),
  guest:guest_requesters!guest_id(id, full_name),
  key:keys!key_id(id, code, room_name, zone)
`;

export type QueueRequest = {
  id: string;
  type: 'WEEKDAY' | 'WEEKEND';
  status: 'CODE_ISSUED';
  requested_for: string;
  risk_tier: RiskTier;
  risk_factors: RiskFactor[];
  created_at: string;
  requester: { id: string; full_name: string; photo_url: string | null } | null;
  guest: { id: string; full_name: string } | null;
  key: { id: string; code: string; room_name: string; zone: string } | null;
};

export type OutstandingKey = {
  id: string;
  /** True once a KEY_ISSUED request is past its return deadline. */
  is_overdue: boolean;
  /** @deprecated read `is_overdue`; `KEY_OVERDUE` is not a request status. */
  status: OutstandingStatus;
  issued_at: string;
  return_deadline: string;
  created_at: string;
  requester: { id: string; full_name: string; photo_url: string | null } | null;
  key: {
    id: string;
    code: string;
    room_name: string;
    zone: string;
    key_count: number | null;
  } | null;
};

// Memoized per request — both seed functions below need "am I signed in, and
// what's my role" once each; without this each would repeat its own
// auth.getUser() + profiles lookup round trip.
const getVerifierSession = cache(
  async (): Promise<{ userId: string; role: string } | null> => {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, unit_id')
      .eq('id', user.id)
      .single();
    if (!profile) return null;

    return { userId: user.id, role: profile.role };
  }
);

export const getLiveQueueSeed = async (): Promise<QueueRequest[] | null> => {
  const session = await getVerifierSession();
  if (!session || session.role !== 'VERIFIER') return null;

  const { data, error } = await createAdminClient()
    .from('requests')
    .select(REQUEST_SELECT)
    .eq('status', 'CODE_ISSUED')
    .order('created_at', { ascending: true });

  if (error) return null;
  // Matches what GET /api/requests/live-queue returns, so the seeded first
  // paint and the client-side refetch render the same photo URLs.
  return rewriteStorageUrls(data as unknown as QueueRequest[]);
};

export const getOutstandingKeysSeed = async (): Promise<
  OutstandingKey[] | null
> => {
  const session = await getVerifierSession();
  if (!session || (session.role !== 'CSO' && session.role !== 'VERIFIER'))
    return null;

  const { data, error } = await createAdminClient()
    .from('requests')
    .select(
      `id, status, issued_at, return_deadline, created_at,
       requester:profiles!requester_id(id, full_name, photo_url),
       guest:guest_requesters!guest_id(id, full_name),
       key:keys!key_id(id, code, room_name, zone, status, key_count)`
    )
    .in('status', ['KEY_ISSUED'])
    .order('return_deadline', { ascending: true });

  if (error) return null;

  // Same shaping as GET /api/keys/out, from the same module.
  return rewriteStorageUrls(
    shapeOutstanding(
      (data ?? []) as unknown as (OutstandingSourceRow &
        Omit<OutstandingKey, 'requester' | 'status' | 'is_overdue'>)[]
    )
  ) as OutstandingKey[];
};
