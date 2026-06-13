import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Keep vitest's defaults but skip agent worktrees, which contain copies of
    // the source (and its tests) and would otherwise run twice.
    exclude: [...configDefaults.exclude, '.claude/worktrees/**'],
  },
});
