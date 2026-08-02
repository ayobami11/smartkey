import { describe, expect, it } from 'vitest';

import { password } from '@/lib/validation/primitives';
import {
  guestWeekendRequestFormSchema,
  LETTER_MAX_BYTES,
  provisionUserSchema,
  weekendRequestFormSchema,
} from '@/lib/validation/schemas';

// Helpers

const makeFile = (name: string, type: string, sizeBytes = 100): File => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: sizeBytes });
  return f;
};

// The letter field uses z.custom<FileList>(); its refinements only access
// .length, [0].type, and [0].size — a plain array with an `item` method
// satisfies that interface without needing a real DataTransfer.
const makeFileList = (files: File[]): FileList =>
  Object.assign([...files], {
    item: (i: number) => files[i] ?? null,
  }) as unknown as FileList;

// Known dates
const SATURDAY = '2026-06-27';
const SUNDAY = '2026-06-28';
const MONDAY = '2026-06-29';

// ---

describe('password primitive', () => {
  it('accepts a valid strong password', () => {
    expect(password.safeParse('ValidPass1!!').success).toBe(true); // 12 chars
  });

  it('rejects a password under 12 characters', () => {
    const r = password.safeParse('Ab1!xyz'); // 7 chars
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/at least 12 characters/i);
  });

  it('rejects a password over 64 characters', () => {
    const r = password.safeParse('Aa1!'.repeat(17)); // 68 chars
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/cannot exceed 64/i);
  });

  it('rejects a password with no uppercase letter', () => {
    const r = password.safeParse('str0ng!password'); // 15 chars, no uppercase
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/uppercase/i);
  });

  it('rejects a password with no lowercase letter', () => {
    const r = password.safeParse('STR0NG!PASSWORD'); // 15 chars, no lowercase
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/lowercase/i);
  });

  it('rejects a password with no digit', () => {
    const r = password.safeParse('Strong!Password'); // 15 chars, no digit
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/number/i);
  });

  it('rejects a password with no special character', () => {
    const r = password.safeParse('Str0ngPassword'); // 14 chars, no special char
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/special character/i);
  });
});

// ---

describe('weekendRequestFormSchema — weekend_date', () => {
  const base = { key_id: 'some-uuid', description: 'Lab access.' };

  it('accepts a Saturday', () => {
    expect(
      weekendRequestFormSchema.safeParse({ ...base, weekend_date: SATURDAY })
        .success
    ).toBe(true);
  });

  it('accepts a Sunday', () => {
    expect(
      weekendRequestFormSchema.safeParse({ ...base, weekend_date: SUNDAY })
        .success
    ).toBe(true);
  });

  it('rejects a weekday with "Must be a Saturday or Sunday."', () => {
    const r = weekendRequestFormSchema.safeParse({
      ...base,
      weekend_date: MONDAY,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('Must be a Saturday or Sunday.');
  });
});

// ---

describe('guestWeekendRequestFormSchema', () => {
  const base = {
    full_name: 'Jane Doe',
    email: 'jane@example.com',
    id_document_type: 'National ID (NIN)' as const,
    id_document_number: 'ABC123',
    requested_room: 'Room 101',
    unit_id: 'dept-uuid',
    weekend_date: SATURDAY,
  };

  describe('weekend_date', () => {
    it('accepts Saturday', () => {
      expect(
        guestWeekendRequestFormSchema.safeParse({
          ...base,
          weekend_date: SATURDAY,
          letter: makeFileList([makeFile('l.pdf', 'application/pdf')]),
        }).success
      ).toBe(true);
    });

    it('rejects a weekday', () => {
      const r = guestWeekendRequestFormSchema.safeParse({
        ...base,
        weekend_date: MONDAY,
        letter: makeFileList([makeFile('l.pdf', 'application/pdf')]),
      });
      expect(r.success).toBe(false);
      const issue = r.error?.issues.find((i) =>
        i.message.includes('Saturday or Sunday')
      );
      expect(issue).toBeDefined();
    });
  });

  describe('letter field', () => {
    it('accepts a PDF', () => {
      expect(
        guestWeekendRequestFormSchema.safeParse({
          ...base,
          letter: makeFileList([makeFile('letter.pdf', 'application/pdf')]),
        }).success
      ).toBe(true);
    });

    it('accepts a JPG', () => {
      expect(
        guestWeekendRequestFormSchema.safeParse({
          ...base,
          letter: makeFileList([makeFile('letter.jpg', 'image/jpeg')]),
        }).success
      ).toBe(true);
    });

    it('accepts a PNG', () => {
      expect(
        guestWeekendRequestFormSchema.safeParse({
          ...base,
          letter: makeFileList([makeFile('letter.png', 'image/png')]),
        }).success
      ).toBe(true);
    });

    it('rejects a GIF with the MIME-type error', () => {
      const r = guestWeekendRequestFormSchema.safeParse({
        ...base,
        letter: makeFileList([makeFile('letter.gif', 'image/gif')]),
      });
      expect(r.success).toBe(false);
      const issue = r.error?.issues.find((i) =>
        i.message.includes('PDF, JPG, or PNG')
      );
      expect(issue).toBeDefined();
    });

    it('rejects a file over 5 MB with the size error', () => {
      const r = guestWeekendRequestFormSchema.safeParse({
        ...base,
        letter: makeFileList([
          makeFile('big.pdf', 'application/pdf', LETTER_MAX_BYTES + 1),
        ]),
      });
      expect(r.success).toBe(false);
      const issue = r.error?.issues.find((i) =>
        i.message.includes('5 MB or smaller')
      );
      expect(issue).toBeDefined();
    });

    it('rejects an empty file list as required', () => {
      const r = guestWeekendRequestFormSchema.safeParse({
        ...base,
        letter: makeFileList([]),
      });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].message).toBe(
        'The authorization letter is required.'
      );
    });
  });
});

// ---

describe('provisionUserSchema', () => {
  const base = {
    full_name: 'Dr. Amina Bello',
    institutional_email: 'abello@unilag.edu.ng',
  };

  it('requires unit_id when role is DEAN', () => {
    const r = provisionUserSchema.safeParse({ ...base, role: 'DEAN' });
    expect(r.success).toBe(false);
    const issue = r.error?.issues.find((i) =>
      i.message.includes('Unit is required')
    );
    expect(issue).toBeDefined();
  });

  it('requires unit_id when role is REQUESTER', () => {
    const r = provisionUserSchema.safeParse({ ...base, role: 'REQUESTER' });
    expect(r.success).toBe(false);
    const issue = r.error?.issues.find((i) =>
      i.message.includes('Unit is required')
    );
    expect(issue).toBeDefined();
  });

  it('accepts DEAN with unit_id', () => {
    expect(
      provisionUserSchema.safeParse({
        ...base,
        role: 'DEAN',
        unit_id: 'dept-uuid',
      }).success
    ).toBe(true);
  });

  it('accepts VERIFIER without department_id', () => {
    expect(
      provisionUserSchema.safeParse({ ...base, role: 'VERIFIER' }).success
    ).toBe(true);
  });
});
