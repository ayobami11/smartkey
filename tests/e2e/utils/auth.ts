import type { Page } from '@playwright/test';

import { fetchOtpCode } from './otp';

export type TestRole = 'CSO' | 'DEAN' | 'VERIFIER' | 'REQUESTER';

const DASHBOARD_URL: Record<TestRole, string> = {
  CSO: '/cso/dashboard',
  DEAN: '/dean/dashboard',
  VERIFIER: '/verifier/dashboard',
  REQUESTER: '/requester/dashboard',
};

// Mirrors src/app/api/auth/login/route.ts's MFA_ROLES exactly — REQUESTER is
// the only role exempt from email-OTP MFA. If that set ever changes there,
// change it here too.
const MFA_ROLES: ReadonlySet<TestRole> = new Set(['CSO', 'DEAN', 'VERIFIER']);

/**
 * Signs in as the given test role via the real login + OTP flow — no
 * test-mode bypass exists (see docs/E2E_OTP_SETUP.md), so CSO/DEAN/VERIFIER
 * genuinely complete email MFA by reading the code back out of the shared
 * IMAP test mailbox. Waits for the redirect to that role's dashboard before
 * returning.
 *
 * Requires `TEST_<ROLE>_EMAIL` / `TEST_<ROLE>_PASSWORD`, and for the three
 * MFA roles, `E2E_OTP_IMAP_USER` / `E2E_OTP_IMAP_APP_PASSWORD`.
 */
export const loginAs = async (page: Page, role: TestRole): Promise<void> => {
  const email = process.env[`TEST_${role}_EMAIL`] ?? '';
  const password = process.env[`TEST_${role}_PASSWORD`] ?? '';

  await page.goto('/login');
  // pressSequentially, not fill: a bulk .fill() on the very first interaction
  // with a freshly-loaded page has been observed to silently no-op in
  // WebKit — the field reads back empty immediately after — while the same
  // call on a field that's already been interacted with once works fine.
  // Looks like a hydration-timing race rather than anything email-specific.
  // Real keystroke-by-keystroke input doesn't hit it. This is the one login
  // path every MFA-gated spec depends on via the shared storageState setup,
  // so it's worth the (here, negligible — this only runs 4 times per suite
  // run) extra cost over fill().
  await page.getByLabel(/email/i).pressSequentially(email);
  await page.locator('input[type="password"]').pressSequentially(password);

  // Captured before submit, not after — the OTP email can land in the
  // couple hundred ms it takes the page to redraw the OTP screen, and a
  // sentAfter timestamp taken too late would filter out a genuinely fresh
  // code.
  const submittedAt = new Date();
  await page.getByRole('button', { name: /sign in/i }).click();

  if (!MFA_ROLES.has(role)) {
    await page.waitForURL(DASHBOARD_URL[role]);
    return;
  }

  const otpInput = page.getByLabel(/verification code/i);
  await otpInput.waitFor({ state: 'visible' });

  const code = await fetchOtpCode({ toAddress: email, sentAfter: submittedAt });

  await otpInput.fill(code);
  await page.getByRole('button', { name: /verify code/i }).click();
  await page.waitForURL(DASHBOARD_URL[role]);
};
