import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Fully static, unauthenticated, no backend — every interaction here is
// safe to complete for real, unlike the rest of the suite.

test.describe('Public help page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /help & support/i })
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('all four FAQ items open and close', async ({ page }) => {
    const questions = [
      /how do i get an account/i,
      /didn.t receive my verification code/i,
      /forgot my password/i,
      /how do i request a key/i,
    ];

    for (const question of questions) {
      const trigger = page.getByRole('button', { name: question });
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');

      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('the password FAQ links to /forgot-password', async ({ page }) => {
    await page
      .getByRole('button', { name: /forgot my password/i })
      .click();
    await expect(
      page.getByRole('link', { name: /forgot password/i })
    ).toHaveAttribute('href', '/forgot-password');
  });

  test('shows the CSO contact email and a working sign-in link', async ({
    page,
  }) => {
    await expect(
      page.getByRole('link', { name: /cso@unilag\.edu\.ng/i })
    ).toHaveAttribute('href', 'mailto:cso@unilag.edu.ng');

    await page.getByRole('link', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL('/login');
  });
});
