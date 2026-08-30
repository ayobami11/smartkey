import { fileURLToPath } from 'url';

import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    server: {
      deps: {
        external: [/^zod$/],
      },
    },
    setupFiles: ['./src/tests/setup.ts'],
    exclude: [
      ...configDefaults.exclude,
      '.claude/worktrees/**',
      'tests/e2e/**',
    ],
  },
});
