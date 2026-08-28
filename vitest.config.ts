/**
 * Coverage is ENFORCED at 100% on src/ — statements, branches, functions,
 * lines. This is a floor, not a badge: the classifier's input space is
 * enumerable (12 cells), the state machines are small, and every primitive
 * here decides whether a human gets disturbed. The only tolerated gap is an
 * explicit `v8 ignore` block carrying its justification inline.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
