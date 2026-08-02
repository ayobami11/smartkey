import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, mockCreateAdminClient, mockLogger } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}));

import { writeAuditEntry } from '@/lib/audit';

type ProfileLookupResult = {
  data: { full_name: string; units: { name: string } | null } | null;
  error: { message: string } | null;
};

// Builds a fake Supabase client whose `.from('profiles')...maybeSingle()`
// and `.from('audit_log').insert()` calls are independently configurable,
// mirroring the two calls writeAuditEntry actually makes.
const mockSupabaseClient = ({
  profileResult = { data: null, error: null },
  insertError = null,
}: {
  profileResult?: ProfileLookupResult;
  insertError?: { message: string; code?: string } | null;
} = {}) => {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const maybeSingle = vi.fn().mockResolvedValue(profileResult);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return { select };
    if (table === 'audit_log') return { insert };
    throw new Error(`Unexpected table in test: ${table}`);
  });

  mockCreateAdminClient.mockReturnValue({ from: mockFrom });

  return { insert, select, eq, maybeSingle };
};

const baseParams = {
  event: 'KEY_ISSUED',
  actorId: 'actor-1',
  actorRole: 'VERIFIER' as const,
  targetType: 'request',
  targetId: 'request-1',
  payload: { key_id: 'key-1' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('writeAuditEntry', () => {
  it('inserts a row with the actor name and unit denormalised from the profile join', async () => {
    const { insert, eq } = mockSupabaseClient({
      profileResult: {
        data: { full_name: 'Officer Musa', units: { name: 'Administration' } },
        error: null,
      },
    });

    await writeAuditEntry(baseParams);

    expect(eq).toHaveBeenCalledWith('id', 'actor-1');
    expect(insert).toHaveBeenCalledWith({
      event: 'KEY_ISSUED',
      actor_id: 'actor-1',
      actor_role: 'VERIFIER',
      actor_name: 'Officer Musa',
      actor_department: 'Administration',
      target_type: 'request',
      target_id: 'request-1',
      payload: { key_id: 'key-1' },
    });
  });

  it('writes null actor_name/actor_department when the actor has no unit', async () => {
    const { insert } = mockSupabaseClient({
      profileResult: {
        data: { full_name: 'Dr. Bakare', units: null },
        error: null,
      },
    });

    await writeAuditEntry(baseParams);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_name: 'Dr. Bakare',
        actor_department: null,
      })
    );
  });

  it('still writes the entry with null actor fields when the profile lookup fails (non-fatal)', async () => {
    const { insert } = mockSupabaseClient({
      profileResult: { data: null, error: { message: 'connection reset' } },
    });

    await writeAuditEntry(baseParams);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Could not resolve actor profile for audit entry',
      expect.objectContaining({ event: 'KEY_ISSUED', actorId: 'actor-1' })
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_name: null, actor_department: null })
    );
  });

  it('throws and logs when the audit_log insert fails', async () => {
    mockSupabaseClient({
      insertError: { message: 'permission denied', code: '42501' },
    });

    await expect(writeAuditEntry(baseParams)).rejects.toThrow(
      'Audit log write failed for event "KEY_ISSUED": permission denied'
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to write audit log entry',
      expect.objectContaining({ event: 'KEY_ISSUED', code: '42501' })
    );
  });

  it('does not throw when the insert succeeds', async () => {
    mockSupabaseClient();
    await expect(writeAuditEntry(baseParams)).resolves.toBeUndefined();
  });
});
