import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Two branches, neither of which submits for real:
//   - ?error=expired is a static state driven entirely by the query param.
//   - the normal form calls supabase.auth.updateUser() directly (not an API
//     route), which requires a real authenticated password-recovery session
//     established via the emailed PKCE link — something this environment has
//     no way to obtain. Only client-side (password-match) validation is safe
//     to exercise here.

test.describe('Public reset-password page', () => {
  test('the expired-link state renders and passes axe', async ({ page }) => {
    await page.goto('/reset-password?error=expired');

    await expect(
      page.getByRole('heading', { name: /^link expired$/i })
    ).toBeVisible();
    const requestLink = page.getByRole('link', { name: /request a new link/i });
    await expect(requestLink).toHaveAttribute('href', '/forgot-password');

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('the normal flow shows the set-new-password form and passes axe', async ({
    page,
  }) => {
    await page.goto('/reset-password');

    await expect(
      page.getByRole('heading', { name: /set a new password/i })
    ).toBeVisible();
    await expect(page.getByLabel(/^new password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm new password/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('the show/hide toggle reveals the password value', async ({ page }) => {
    await page.goto('/reset-password');

    const field = page.getByLabel(/^new password$/i);
    await field.fill('Sup3rSecret!');
    await expect(field).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /^show password$/i }).first().click();
    await expect(field).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: /^hide password$/i }).first().click();
    await expect(field).toHaveAttribute('type', 'password');
  });

  test('mismatched passwords are rejected client-side without calling Supabase', async ({
    page,
  }) => {
    await page.goto('/reset-password');

    await page.getByLabel(/^new password$/i).fill('Sup3rSecret!');
    await page.getByLabel(/confirm new password/i).fill('DifferentPass1!');
    await page.getByRole('button', { name: /update password/i }).click();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
    // Still on the form — a failed client-side validation never reaches the
    // "Password updated" success state.
    await expect(
      page.getByRole('heading', { name: /set a new password/i })
    ).toBeVisible();
  });

  test('a weak password is rejected client-side', async ({ page }) => {
    await page.goto('/reset-password');

    // Both fields share the same password schema, so a weak value in either
    // triggers the same message — only fill the one under test.
    await page.getByLabel(/^new password$/i).fill('short');
    await page.getByLabel(/confirm new password/i).fill('short');
    await page.getByRole('button', { name: /update password/i }).click();

    await expect(
      page.getByText(/password must contain at least 12 characters/i).first()
    ).toBeVisible();
  });
});
