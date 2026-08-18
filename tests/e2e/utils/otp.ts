import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

// SmartKey's email-OTP MFA sends real codes over live Gmail SMTP
// (src/lib/email/otp.ts) — there is no test-mode bypass, deliberately (see
// docs/E2E_OTP_SETUP.md). This reads the code back out of a real mailbox via
// IMAP so CSO/DEAN/VERIFIER specs can complete login unattended.
//
// The mailbox is one Gmail account shared across all three MFA roles via
// "+" address tags (`smartkey.tests+cso@gmail.com`, `+dean@`, `+verifier@`)
// — Gmail delivers all three to the same inbox, so one IMAP credential pair
// covers every role. `toAddress` filters which role's code to read back when
// multiple logins are in flight (Playwright runs `fullyParallel`).

const SUBJECT = 'Your SmartKey verification code';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;

// Gmail routes this mailbox's SmartKey OTP mail to Spam, not INBOX — checked
// directly on 2026-08-18 (same sender/subject repeated on every test run
// looks exactly like what Gmail's spam heuristics flag, and nobody in this
// unattended mailbox is ever there to mark it "Not spam"). All Mail excludes
// both Spam and Trash in Gmail's IMAP implementation, so it isn't a
// substitute for checking Spam explicitly.
const MAILBOXES = ['INBOX', '[Gmail]/Spam'];

type FetchOtpParams = {
  /** The `+`-tagged address the code was sent to, e.g. the CSO test account. */
  toAddress: string;
  /** Only consider messages received after this instant (Date.now() at the point login was submitted) — an inbox this shared can carry a stale code from a previous run. */
  sentAfter: Date;
};

/**
 * Polls the shared E2E test mailbox over IMAP for the most recent SmartKey
 * OTP email addressed to `toAddress` received after `sentAfter`, and returns
 * the 6-digit code inside it.
 *
 * Requires `E2E_OTP_IMAP_USER` / `E2E_OTP_IMAP_APP_PASSWORD` — see
 * docs/E2E_OTP_SETUP.md for provisioning. Throws if either is unset, so a
 * misconfigured CI run fails loudly instead of hanging on the OTP screen.
 */
export const fetchOtpCode = async ({
  toAddress,
  sentAfter,
}: FetchOtpParams): Promise<string> => {
  const user = process.env.E2E_OTP_IMAP_USER;
  const pass = process.env.E2E_OTP_IMAP_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      'E2E_OTP_IMAP_USER / E2E_OTP_IMAP_APP_PASSWORD are not set — cannot read ' +
        'the OTP mailbox. See docs/E2E_OTP_SETUP.md.'
    );
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const code = await tryFetchOnce({ user, pass, toAddress, sentAfter });
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `No OTP email arrived for ${toAddress} within ${POLL_TIMEOUT_MS / 1000}s ` +
      `(checked ${MAILBOXES.join(', ')}). Check GMAIL_USER/GMAIL_APP_PASSWORD ` +
      `on the app under test, and that ${toAddress} is a real "+"-tagged ` +
      'alias of E2E_OTP_IMAP_USER.'
  );
};

const tryFetchOnce = async ({
  user,
  pass,
  toAddress,
  sentAfter,
}: {
  user: string;
  pass: string;
  toAddress: string;
  sentAfter: Date;
}): Promise<string | null> => {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  try {
    for (const mailbox of MAILBOXES) {
      const code = await searchMailbox({
        client,
        mailbox,
        toAddress,
        sentAfter,
      });
      if (code) return code;
    }
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
};

const searchMailbox = async ({
  client,
  mailbox,
  toAddress,
  sentAfter,
}: {
  client: ImapFlow;
  mailbox: string;
  toAddress: string;
  sentAfter: Date;
}): Promise<string | null> => {
  const lock = await client.getMailboxLock(mailbox);
  try {
    // Newest first: `since` narrows the server-side search, but IMAP SINCE
    // is date-only (no time component), so still filter on the exact
    // instant client-side below.
    const uids = await client.search({
      subject: SUBJECT,
      since: sentAfter,
    });
    if (!uids || uids.length === 0) return null;

    // Highest UID = most recently delivered.
    const sorted = [...uids].sort((a, b) => b - a);

    for (const uid of sorted) {
      const message = await client.fetchOne(uid, {
        envelope: true,
        source: true,
      });
      if (!message || !message.source) continue;

      const to =
        message.envelope?.to?.map((addr) => addr.address).join(',') ?? '';
      if (!to.toLowerCase().includes(toAddress.toLowerCase())) continue;

      const receivedAt = message.envelope?.date;
      if (receivedAt && receivedAt.getTime() < sentAfter.getTime()) continue;

      const parsed = await simpleParser(message.source);
      // .text first, not .html: the email template (src/lib/email/otp.ts)
      // sets the "Your sign-in verification code:" label to color:#475569
      // (slate-600) ahead of the code <div> in source order. That hex value
      // is 6 pure digits, so a naive \d{6} match against raw HTML always
      // grabs "475569" instead of the real code — deterministically, not a
      // flake. mailparser synthesizes .text by stripping tags/attributes
      // from .html when no text/plain part exists, so it's clean.
      const body = parsed.text || parsed.html || '';
      const match = body.match(/(\d{6})/);
      if (match) return match[1];
    }
    return null;
  } finally {
    lock.release();
  }
};
