import { describe, expect, it } from 'vitest';

import { otpEmail } from '@/lib/email/templates/account';
import {
  collectionCodeEmail,
  csoSignatureMismatchEmail,
  guestSubmissionReceivedEmail,
  guestWeekendApprovedEmail,
  overdueReminderEmail,
  weekendApprovedEmail,
  weekendDeclinedEmail,
  weekendReminderEmail,
  weekendSubmittedEmail,
} from '@/lib/email/templates/request';
import type { EmailContent } from '@/lib/email/transport';

const EVIL = '<img src=x onerror=alert(1)>';
const LINK = 'https://smartkey.test/x';

// Every request template, fed attacker-controlled text in every free-text
// field a guest, requester or Dean can set.
const rendered: Record<string, EmailContent> = {
  collectionCode: collectionCodeEmail({
    fullName: EVIL,
    code: '123456',
    codeExpiresAt: '2026-10-13T10:00:00Z',
    keyCode: EVIL,
    roomName: EVIL,
  }),
  weekendSubmitted: weekendSubmittedEmail({
    fullName: EVIL,
    requesterName: EVIL,
    unitName: EVIL,
    roomLabel: EVIL,
    requestedFor: EVIL,
    link: LINK,
    decisionLink: LINK,
    isGuest: true,
  }),
  weekendApproved: weekendApprovedEmail({
    fullName: EVIL,
    link: LINK,
    requestedFor: EVIL,
    keyCode: EVIL,
    roomName: EVIL,
  }),
  guestWeekendApproved: guestWeekendApprovedEmail({
    fullName: EVIL,
    link: LINK,
    requestedFor: EVIL,
    keyCode: EVIL,
    roomName: EVIL,
  }),
  weekendDeclined: weekendDeclinedEmail({ fullName: EVIL, note: EVIL }),
  csoSignatureMismatch: csoSignatureMismatchEmail({
    fullName: EVIL,
    requesterName: EVIL,
    keyCode: EVIL,
    roomName: EVIL,
    mismatches: { signature: 70, stamp: 80 },
    thresholdPct: 55,
    link: LINK,
  }),
  guestSubmissionReceived: guestSubmissionReceivedEmail({
    fullName: EVIL,
    link: LINK,
  }),
  weekendReminder: weekendReminderEmail({ fullName: EVIL, link: LINK }),
  overdueReminder: overdueReminderEmail({
    fullName: EVIL,
    keyCode: EVIL,
    roomName: EVIL,
    returnDeadline: '2026-10-13T16:00:00Z',
  }),
};

describe('request email templates', () => {
  it.each(Object.entries(rendered))(
    '%s never renders user text as markup',
    (_, email) => {
      const html = email.html.toString();
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  );

  it('keeps the logo image, which is markup the template owns', () => {
    expect(rendered.weekendReminder.html.toString()).toContain(
      '<img src="cid:smartkey-mark"'
    );
  });

  it('shows both mismatch rows when both checks failed', () => {
    const html = rendered.csoSignatureMismatch.html.toString();
    expect(html).toContain('>70%<');
    expect(html).toContain('>80%<');
  });
});

describe('otp email', () => {
  // tests/e2e/utils/otp.ts reads this email over IMAP to log in.
  it('carries the code in the body and the preheader', () => {
    const { subject, html } = otpEmail({ code: '482913' });
    expect(subject).toBe('Your SmartKey verification code');
    expect(html.toString()).toContain('>482913</div>');
    expect(html.toString()).toContain(
      'Your SmartKey verification code is 482913. It expires in 10 minutes.'
    );
  });
});
