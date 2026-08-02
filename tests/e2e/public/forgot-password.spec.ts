import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The one flow in this suite that's safe to submit for real end-to-end:
// POST /api/auth/reset-password always returns success regardless of
// whether the email is registered (no email enumeration, per docs/API.md),
// and the form doesn't even branch on the API result — it always shows the
// "Check your email" success state. No real email is sent for an address
// that isn't registered.

test.describe('Public forgot-password page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /reset your password/i })
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('rejects an invalid email without reaching the success state', async ({
    page,
  }) => {
    const emailField = page.getByLabel(/institutional email/i);
    await emailField.fill('not-an-email');
    await page.getByRole('button', { name: /send reset link/i }).click();

    // The native type="email" input blocks submission before either React
    // Hook Form or zod ever run, so the browser's own constraint validation
    // is what's actually under test here, not a specific error string.
    await expect(emailField).toHaveJSProperty('validity.valid', false);
    await expect(
      page.getByRole('heading', { name: /reset your password/i })
    ).toBeVisible();
  });

  test('submitting a well-formed email always shows the success state', async ({
    page,
  }) => {
    await page
      .getByLabel(/institutional email/i)
      .fill('e2e-test-nonexistent@unilag.edu.ng');
    await page.getByRole('button', { name: /send reset link/i }).click();

    await expect(
      page.getByRole('heading', { name: /check your email/i })
    ).toBeVisible();
    await expect(
      page.getByText(/if that email address is registered/i)
    ).toBeVisible();

    // Two "Back to sign in" links exist on this page (the success card's CTA
    // and the page-level "Remember your password?" link) — the CTA is the
    // one that swapped in with the success state, and renders first in the
    // DOM.
    await page.getByRole('link', { name: /back to sign in/i }).first().click();
    await expect(page).toHaveURL('/login');
  });
});
