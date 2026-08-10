import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Dean dashboard', () => {
  test.use({ storageState: 'playwright/.auth/dean.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dean/dashboard');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(page).toHaveURL('/dean/dashboard');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('shows the weekend requests and collectors sections', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: /^weekend requests$/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /^authorised collectors$/i })
    ).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/dean/dashboard');
    await expect(page).toHaveURL('/login');
  });
});
