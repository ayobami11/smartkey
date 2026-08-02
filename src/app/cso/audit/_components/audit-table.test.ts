import { describe, expect, it } from 'vitest';

import {
  buildPageNumbers,
  mapRow,
} from '@/app/cso/audit/_components/audit-table';

describe('buildPageNumbers', () => {
  it('returns every page with no ellipsis when total <= 7', () => {
    expect(buildPageNumbers(0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(buildPageNumbers(3, 1)).toEqual([0]);
  });

  it('returns an empty array when there are no pages', () => {
    expect(buildPageNumbers(0, 0)).toEqual([]);
  });

  it('shows first, current+1, ellipsis, last when current is the first page', () => {
    expect(buildPageNumbers(0, 10)).toEqual([0, 1, 'ellipsis', 9]);
  });

  it('shows first, ellipsis, current-1/current/current+1, ellipsis, last for a middle page', () => {
    expect(buildPageNumbers(5, 10)).toEqual([
      0,
      'ellipsis',
      4,
      5,
      6,
      'ellipsis',
      9,
    ]);
  });

  it('shows first, ellipsis, current-1, current when current is the last page', () => {
    expect(buildPageNumbers(9, 10)).toEqual([0, 'ellipsis', 8, 9]);
  });

  it('collapses adjacent-but-not-consecutive pages into a single ellipsis, not two', () => {
    // total=8, current=0: {0,7,1} -> gap between 1 and 7 is one ellipsis.
    expect(buildPageNumbers(0, 8)).toEqual([0, 1, 'ellipsis', 7]);
  });

  it('does not insert an ellipsis between genuinely consecutive pages', () => {
    // total=10, current=1: {0,9,1,0,2} -> 0 and 1 are consecutive, no ellipsis between them.
    expect(buildPageNumbers(1, 10)).toEqual([0, 1, 2, 'ellipsis', 9]);
  });
});

describe('mapRow', () => {
  const baseRow = {
    id: 'evt-1',
    event: 'KEY_ISSUED',
    actor_name: 'Officer Musa',
    actor_role: 'VERIFIER',
    actor_department: 'Administration',
    payload: { key_code: 'NS-304' },
    occurred_at: '2026-06-08T09:00:00.000Z',
  };

  it('maps a well-formed row: event type, actor, role label, department, keyCode', () => {
    const row = mapRow(baseRow);
    expect(row.id).toBe('evt-1');
    expect(row.type).toBe('ISSUE');
    expect(row.actor).toBe('Officer Musa');
    expect(row.actorRole).toBe('Verifier');
    expect(row.department).toBe('Administration');
    expect(row.keyCode).toBe('NS-304');
    expect(row.description).toBe('KEY ISSUED');
  });

  it('falls back to an unrecognised event mapping to SETTINGS', () => {
    expect(mapRow({ ...baseRow, event: 'SOME_FUTURE_EVENT' }).type).toBe(
      'SETTINGS'
    );
  });

  it('defaults description to "Event" when the event name is missing', () => {
    const { event: _drop, ...rest } = baseRow;
    void _drop;
    expect(mapRow(rest).description).toBe('Event');
  });

  it('falls back actor name: actor_name -> payload.actor_name -> actor_profile -> "Unknown actor"', () => {
    expect(
      mapRow({
        ...baseRow,
        actor_name: null,
        payload: { actor_name: 'Dr. Bakare' },
      }).actor
    ).toBe('Dr. Bakare');

    expect(
      mapRow({
        ...baseRow,
        actor_name: null,
        payload: {},
        actor_profile: { full_name: 'Ada Lovelace' },
      }).actor
    ).toBe('Ada Lovelace');

    expect(
      mapRow({ ...baseRow, actor_name: null, payload: {}, actor_profile: null })
        .actor
    ).toBe('Unknown actor');
  });

  it('strips the trailing "(external)" suffix from the actor name', () => {
    expect(
      mapRow({ ...baseRow, actor_name: 'Jane Doe (external)' }).actor
    ).toBe('Jane Doe');
  });

  it('detects a guest event (no actor_role + payload.external) and overrides role/department', () => {
    const row = mapRow({
      ...baseRow,
      actor_role: null,
      actor_department: 'Should be ignored',
      payload: { external: true },
    });
    expect(row.actorRole).toBe('Guest');
    expect(row.department).toBe('N/A');
  });

  it('does not treat a row as guest when actor_role is present, even with payload.external', () => {
    const row = mapRow({ ...baseRow, payload: { external: true } });
    expect(row.actorRole).not.toBe('Guest');
  });

  it('falls back department: actor_department -> actor_profile.units.name -> CSO/VERIFIER "Security" -> undefined', () => {
    expect(
      mapRow({
        ...baseRow,
        actor_department: null,
        actor_profile: { units: { name: 'Old Senate' } },
      }).department
    ).toBe('Old Senate');

    expect(
      mapRow({
        ...baseRow,
        actor_role: 'CSO',
        actor_department: null,
        actor_profile: null,
      }).department
    ).toBe('Security');

    expect(
      mapRow({
        ...baseRow,
        actor_role: 'VERIFIER',
        actor_department: null,
        actor_profile: null,
      }).department
    ).toBe('Security');

    expect(
      mapRow({
        ...baseRow,
        actor_role: 'REQUESTER',
        actor_department: null,
        actor_profile: null,
      }).department
    ).toBeUndefined();
  });

  it('omits keyCode when the payload has none', () => {
    expect(mapRow({ ...baseRow, payload: {} }).keyCode).toBeUndefined();
  });

  it('treats a non-object payload as empty rather than throwing', () => {
    expect(() =>
      mapRow({ ...baseRow, payload: 'not-an-object' })
    ).not.toThrow();
    expect(mapRow({ ...baseRow, payload: null }).keyCode).toBeUndefined();
  });
});
