// Extracts a Cookie header string from a Playwright storageState JSON file
// (produced by tests/e2e/auth.setup.ts) so Lighthouse CI — which only
// accepts a Cookie header, not a storageState file — can audit an
// authenticated page. See .github/workflows/lighthouse.yml.
//
// Usage: node scripts/lighthouse-auth-cookie.mjs playwright/.auth/requester.json

import { readFileSync } from 'node:fs';

const [, , storageStatePath] = process.argv;

if (!storageStatePath) {
  console.error(
    'Usage: node scripts/lighthouse-auth-cookie.mjs <path-to-storageState.json>'
  );
  process.exit(1);
}

const { cookies } = JSON.parse(readFileSync(storageStatePath, 'utf8'));

process.stdout.write(
  cookies.map(({ name, value }) => `${name}=${value}`).join('; ')
);
