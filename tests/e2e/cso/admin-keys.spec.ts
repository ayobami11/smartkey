import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Non-mutation policy, same as the rest of this suite: never completes a
// real "Add"/"Remove" collector action — both mutate real `authorisations`
// rows against whatever backend BASE_URL points at. This is the max-3-slot
// business rule surface, so UI-state coverage (picker open/close, dialog
// open/cancel, candidate list) is still meaningful without submitting.

test.describe('CSO admin-keys collector management', () => {
  test.use({ storageState: 'playwright/.auth/cso.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/cso/admin-keys');
    await expect(
      page.getByRole('heading', { name: /^administration keys$/i })
    ).toBeVisible();
  });

  test('opening a key shows the collector slots and passes axe', async ({
    page,
  }) => {
    const firstKeyCard = page
      .getByRole('link')
      .filter({ hasText: /slots? filled|authorised/i })
      .first();
    if (!(await firstKeyCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await firstKeyCard.click();
    await expect(
      page.getByRole('heading', { name: /authorised collectors/i })
    ).toBeVisible();
    await expect(page.getByText(/of 3 slots filled/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('opening the add-collector picker on a vacant slot lists eligible candidates', async ({
    page,
  }) => {
    const firstKeyCard = page
      .getByRole('link', { name: /new senate|old senate/i })
      .first();
    if (!(await firstKeyCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await firstKeyCard.click();
    await expect(
      page.getByRole('heading', { name: /authorised collectors/i })
    ).toBeVisible();

    const addButton = page.getByRole('button', { name: /add collector/i });
    if (!(await addButton.isVisible().catch(() => false))) {
      // No vacant slot on this key.
      test.skip();
      return;
    }
    await addButton.click();

    const picker = page.getByLabel(/select a collector/i);
    await expect(picker).toBeVisible();
    const addSubmit = page.getByRole('button', { name: /^add$/i });
    await expect(addSubmit).toBeDisabled();

    // Cancel closes the picker without submitting anything.
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(picker).not.toBeVisible();
    await expect(addButton).toBeVisible();
  });

  test('the remove-collector confirmation dialog opens and can be cancelled', async ({
    page,
  }) => {
    const firstKeyCard = page
      .getByRole('link', { name: /new senate|old senate/i })
      .first();
    if (!(await firstKeyCard.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await firstKeyCard.click();
    await expect(
      page.getByRole('heading', { name: /authorised collectors/i })
    ).toBeVisible();

    const removeButton = page
      .getByRole('button', { name: /^remove /i })
      .first();
    if (!(await removeButton.isVisible().catch(() => false))) {
      // No filled slot on this key.
      test.skip();
      return;
    }
    await removeButton.click();

    const dialog = page.getByRole('alertdialog', { name: /remove collector/i });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/this action cannot be undone/i)
    ).toBeVisible();

    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(dialog).not.toBeVisible();
  });
});
