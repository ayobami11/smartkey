import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Verifier dashboard', () => {
  test.use({ storageState: 'playwright/.auth/verifier.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/verifier/dashboard');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(page).toHaveURL('/verifier/dashboard');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('shows pending requests queue', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /pending requests/i })
    ).toBeVisible();
  });

  test('shows outstanding keys section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /outstanding keys/i })
    ).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/verifier');
    await expect(page).toHaveURL('/login');
  });
});
