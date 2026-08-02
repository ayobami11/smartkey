import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// `/verifier/handover` is a plain, independently-navigable route — there is
// no dashboard lock/redirect enforcing the documented "handover before
// dashboard access" rule (confirmed by reading layout.tsx, page.tsx, and
// middleware.ts: none of them check shift state). This spec tests the
// handover page's own actual behaviour, not that missing rule.
//
// Neither "Start shift" nor the final "Acknowledge/Complete handover" submit
// is ever clicked — both create/end a real shift row against whatever
// backend BASE_URL points at.

test.describe('Verifier shift handover', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(process.env.TEST_VERIFIER_EMAIL ?? '');
    await page
      .locator('input[type="password"]')
      .fill(process.env.TEST_VERIFIER_PASSWORD ?? '');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/verifier/dashboard');

    await page.goto('/verifier/handover');
    // Wait for the loading skeleton to resolve into one of the real states.
    await expect(
      page.getByRole('heading', { name: /start shift|shift handover/i })
    ).toBeVisible();
  });

  test('renders whichever state is current and passes axe', async ({
    page,
  }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('no-shift state shows "Start shift" with the button enabled', async ({
    page,
  }) => {
    const noShiftHeading = page.getByRole('heading', {
      name: /^start shift$/i,
    });
    if (!(await noShiftHeading.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await expect(page.getByText(/no active shift found/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^start shift$/i })
    ).toBeEnabled();
  });

  test('ready state: select-all reflects and drives the per-key checkboxes', async ({
    page,
  }) => {
    const readyHeading = page.getByRole('heading', {
      name: /^shift handover$/i,
    });
    if (!(await readyHeading.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const selectAll = page.getByRole('checkbox', { name: /select all keys/i });
    if (!(await selectAll.isVisible().catch(() => false))) {
      // No outstanding keys — "Complete handover" is offered directly.
      await expect(
        page.getByText(/no keys are currently outstanding/i)
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /^complete handover$/i })
      ).toBeEnabled();
      return;
    }

    await expect(selectAll).not.toBeChecked();
    const bulkButton = page.getByRole('button', {
      name: /^acknowledge \d+ key/i,
    });
    await expect(bulkButton).toBeDisabled();

    await selectAll.click();
    await expect(selectAll).toBeChecked();
    await expect(bulkButton).toBeEnabled();

    // Every per-key checkbox should now be checked too.
    const perKeyCheckboxes = page.getByRole('checkbox', {
      name: /^acknowledge key/i,
    });
    const count = await perKeyCheckboxes.count();
    for (let i = 0; i < count; i++) {
      await expect(perKeyCheckboxes.nth(i)).toBeChecked();
    }

    // Unchecking one row drops select-all out of the fully-checked state.
    if (count > 0) {
      await perKeyCheckboxes.first().click();
      await expect(selectAll).not.toBeChecked();
      await expect(bulkButton).toBeDisabled();
    }
  });
});
