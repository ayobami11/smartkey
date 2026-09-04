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

  // The security contract of GET /api/keys/availability. It reads past RLS
  // with the admin client, so what it is allowed to return is enforced only by
  // its own select list — assert that here rather than trusting review.
  test('key availability never exposes codes or photos', async ({ page }) => {
    const response = await page.request.get('/api/keys/availability');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data.keys)).toBe(true);

    for (const entry of body.data.keys) {
      expect(Object.keys(entry).sort()).toEqual([
        'holder',
        'issued_at',
        'key_id',
        'return_deadline',
        'state',
      ]);
      if (entry.holder) {
        expect(Object.keys(entry.holder).sort()).toEqual([
          'full_name',
          'is_guest',
        ]);
      }
    }
  });
});

test.describe('Key availability route is requester-only', () => {
  test.use({ storageState: 'playwright/.auth/cso.json' });

  test('a CSO is refused', async ({ page }) => {
    const response = await page.request.get('/api/keys/availability');
    expect(response.status()).toBe(403);
  });
});
