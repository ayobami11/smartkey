import { test as setup } from '@playwright/test';

import { loginAs, type TestRole } from './utils/auth';

// One real login per role, once per run — see playwright.config.ts's 'setup'
// project comment for why.
const STORAGE_STATE_ROLES: TestRole[] = [
  'CSO',
  'DEAN',
  'VERIFIER',
  'REQUESTER',
];

for (const role of STORAGE_STATE_ROLES) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await loginAs(page, role);
    await page.context().storageState({
      path: `playwright/.auth/${role.toLowerCase()}.json`,
    });
  });
}
