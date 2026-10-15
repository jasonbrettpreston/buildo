// SPEC LINK: docs/specs/00_engineering_standards.md
// Vitest global setup
// Configure test environment defaults
import { afterAll } from 'vitest';
import { installBeforeImageSandbox, removeBeforeImageSandbox } from './helpers/before-image-sandbox';

// Suppress noisy console.error/warn in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    // Allow assertion errors through
    if (args[0] instanceof Error) {
      originalError(...args);
    }
  };

  console.warn = (...args: unknown[]) => {
    // Suppress Firebase/API key warnings in test environment
    const msg = String(args[0]);
    if (msg.includes('API_KEY') || msg.includes('Firebase')) return;
    originalWarn(...args);
  };
}

// Set test environment variables
(process.env as Record<string, string>).NODE_ENV = 'test';

// R-M before-image files written by a test go to a per-file os.tmpdir() sandbox, never into
// docs/reports/golden/<slug>/before-image/ (WF3 before-image test leak). Lock:
// src/tests/before-image-test-isolation.infra.test.ts.
installBeforeImageSandbox();
afterAll(() => {
  removeBeforeImageSandbox();
});
