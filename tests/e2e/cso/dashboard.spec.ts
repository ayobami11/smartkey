import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('CSO dashboard', () => {
  test.use({ storageState: 'playwright/.auth/cso.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/cso/dashboard');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(page).toHaveURL('/cso/dashboard');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('shows live zone counters', async ({ page }) => {
    // Same slow-data-fetch reasoning as the charts below — the zone counters
    // come from the same live-keys query and can outrun the 5s default under
    // parallel worker load.
    await expect(page.getByText(/new senate/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/old senate/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('shows the zone status chart with an accessible summary', async ({
    page,
  }) => {
    const chartRegions = page.getByRole('img', {
      name: /issued.*available.*overdue/i,
    });
    // Default 5s timeout: gated on the same live-keys fetch as the zone
    // counters above — can outrun 5s under parallel worker load.
    await expect(chartRegions.first()).toBeVisible({ timeout: 15_000 });
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
    // Default 5s timeout: this section aggregates and renders the audit-log
    // activity chart, which can take longer under parallel worker load —
    // observed timing out in firefox runs (4 workers). 15s matches the
    // precedent already used for forgot-password's similarly slow flow.
    await expect(page.getByRole('heading', { name: /^events$/i })).toBeVisible({
      timeout: 15_000,
    });
    // The heading renders immediately; the chart itself is the slow part
    // (audit-log aggregation + recharts render) — same 15s treatment.
    await expect(
      page.getByRole('img', { name: /audit log activity/i })
    ).toBeVisible({ timeout: 15_000 });
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
    // Same slow-chart reasoning as the test above — re-fetches/re-renders on
    // every filter change.
    await expect(
      page.getByRole('img', { name: /audit log activity for issue/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/cso');
    await expect(page).toHaveURL('/login');
  });
});
