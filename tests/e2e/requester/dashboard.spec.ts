import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Requester dashboard', () => {
  test.use({ storageState: 'playwright/.auth/requester.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/requester/dashboard');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(page).toHaveURL('/requester/dashboard');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('shows authorised keys grid', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /authorised keys/i })
    ).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/requester/dashboard');
    await expect(page).toHaveURL('/login');
  });
});
