import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { loginAs } from '../utils/auth';

// Non-mutation policy, same as the rest of this suite: never completes a
// real provision/edit/revoke submission — each mutates a real profile
// (creating a real Supabase Auth account + sending a real activation email,
// or deactivating a real account) against whatever backend BASE_URL points
// at. The deeper form-validation/conditional-field behavior for
// ProvisionUserDialog is already covered by the Vitest component test
// (src/tests/cso/provision-user-dialog.test.tsx) with a mocked API — this
// spec only checks the dialogs actually open and wire up in the real page.

test.describe('CSO user administration', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'CSO');

    await page.goto('/cso/users');
    await expect(page.getByRole('heading', { name: /^users$/i })).toBeVisible();
  });

  test('opens the provision dialog and passes axe', async ({ page }) => {
    await page.getByRole('button', { name: /provision new user/i }).click();
    await expect(
      page.getByRole('heading', { name: /provision new user/i })
    ).toBeVisible();
    await expect(page.getByLabel(/full name/i)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(results.violations).toHaveLength(0);

    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(
      page.getByRole('heading', { name: /provision new user/i })
    ).not.toBeVisible();
  });

  test('opens the edit dialog for a row with the email field read-only', async ({
    page,
  }) => {
    const moreActions = page
      .getByRole('button', { name: /^more actions for/i })
      .first();
    if (!(await moreActions.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await moreActions.click();
    await page.getByRole('menuitem', { name: /edit details/i }).click();

    await expect(
      page.getByRole('heading', { name: /^edit user$/i })
    ).toBeVisible();
    await expect(page.getByLabel(/institutional email/i)).toHaveAttribute(
      'readonly',
      ''
    );
    await expect(
      page.getByRole('button', { name: /^save changes$/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(
      page.getByRole('heading', { name: /^edit user$/i })
    ).not.toBeVisible();
  });

  test('the revoke-access confirmation opens and can be cancelled without revoking', async ({
    page,
  }) => {
    const moreActions = page
      .getByRole('button', { name: /^more actions for/i })
      .first();
    if (!(await moreActions.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await moreActions.click();

    const revokeItem = page.getByRole('menuitem', { name: /revoke access/i });
    if (!(await revokeItem.isVisible().catch(() => false))) {
      // This row's account is already deactivated — no revoke action offered.
      test.skip();
      return;
    }
    await revokeItem.click();

    const dialog = page.getByRole('alertdialog', {
      name: /revoke access for/i,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/will not be able to sign in/i)
    ).toBeVisible();

    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(dialog).not.toBeVisible();
  });
});
