import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('CSO dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as CSO before each test.
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(process.env.TEST_CSO_EMAIL ?? '');
    await page
      .locator('input[type="password"]')
      .fill(process.env.TEST_CSO_PASSWORD ?? '');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/cso/dashboard');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(page).toHaveURL('/cso/dashboard');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('shows live zone counters', async ({ page }) => {
    await expect(page.getByText(/new senate/i)).toBeVisible();
    await expect(page.getByText(/old senate/i)).toBeVisible();
  });

  test('shows the zone status chart with an accessible summary', async ({
    page,
  }) => {
    const chartRegions = page.getByRole('img', {
      name: /issued.*available.*overdue/i,
    });
    await expect(chartRegions.first()).toBeVisible();
    // Visible numeric companion, not just the chart — must survive without CSS/JS parsing an SVG.
    await expect(page.getByText(/^Issued \d+$/).first()).toBeVisible();
    await expect(page.getByText(/^Available \d+$/).first()).toBeVisible();
    await expect(page.getByText(/^Overdue \d+$/).first()).toBeVisible();
  });

  test('shows the incidents chart', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /^incidents$/i })
    ).toBeVisible();
  });

  test('shows the activity volume chart with an accessible summary', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: /^events$/i })
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: /audit log activity/i })
    ).toBeVisible();
  });

  test('filters the activity chart by event category', async ({ page }) => {
    const filter = page.getByRole('combobox', {
      name: /filter activity by event type/i,
    });
    await expect(filter).toBeVisible();
    await expect(filter).toHaveText(/all events/i);

    await filter.click();
    await page.getByRole('option', { name: 'Issue' }).click();

    await expect(filter).toHaveText(/issue/i);
    await expect(
      page.getByRole('img', { name: /audit log activity for issue/i })
    ).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/cso');
    await expect(page).toHaveURL('/login');
  });
});
