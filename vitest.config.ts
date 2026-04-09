import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Use the automatic JSX runtime so component files don't need a
  // manual `import React from 'react'` at the top. tsconfig.json uses
  // `jsx: preserve` because Next.js owns the prod transform; vitest
  // uses esbuild which needs an explicit hint here.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/tests/setup.ts'],
    // globalSetup boots the test DB ONCE when BUILDO_TEST_DB=1 or
    // DATABASE_URL is set; otherwise it's a no-op so the normal mocked
    // suite isn't slowed down. Individual *.db.test.ts files self-skip
    // via describe.skipIf(!dbAvailable()).
    globalSetup: ['src/tests/db/setup-testcontainer.ts'],
  },
});
