// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.9 Real DB integration tests
//
// Dual-mode test DB harness:
//   - CI: GitHub Actions provides a `postgres:16` + PostGIS service container
//     and sets DATABASE_URL. We connect to that and run migrations.
//   - Local opt-in: developer sets BUILDO_TEST_DB=1, we spin up a
//     `postgis/postgis:16-3.4` container via testcontainers, run migrations
//     against it, and tear it down at the end of the suite.
//   - Default (neither set): the helper returns null and every db.test.ts
//     file early-skips its suite. CI will fail if a db.test.ts isn't gated.
//
// Why this design:
//   - Phase 1a's "migration 030 broken" blocker meant every Phase 1/2 test
//     was reading SQL by eye. Real-DB integration tests catch the bug
//     class that mocked-pool tests are blind to: SQL syntax errors,
//     constraint violations, FK cascades, geography casts, and column
//     width truncations. The Phase 0+1+2 holistic review caught a
//     revision_num '0' vs '00' drift that ONLY shows up when you query
//     real data — exactly this layer.
//
// Migrations applied: 001..NNN in numeric order via scripts/migrate.js.
// Pool reuse: globalSetup boots the container once and exposes the URL
// via process.env.DATABASE_URL so individual test files connect with a
// fresh `pg.Pool` per file (they tear down their own pool).

import { execSync } from 'node:child_process';
import { Pool } from 'pg';
import type { StartedTestContainer } from 'testcontainers';

let startedContainer: StartedTestContainer | null = null;

/**
 * vitest globalSetup. Boots the test DB once for the entire suite. Returns
 * a teardown function that vitest calls after all tests finish.
 *
 * If neither DATABASE_URL nor BUILDO_TEST_DB=1 is set, this is a no-op
 * and individual test files will skip via the `dbAvailable()` guard.
 */
export async function setup(): Promise<() => Promise<void>> {
  // CI path: DATABASE_URL is provided by the service container.
  if (process.env.DATABASE_URL) {
    await runMigrations(process.env.DATABASE_URL);
    return async () => {
      // Service container is managed by GH Actions; nothing to tear down.
    };
  }

  // Local opt-in path.
  if (process.env.BUILDO_TEST_DB !== '1') {
    return async () => {
      // No-op teardown — tests will skip.
    };
  }

  // Lazy-import testcontainers so the dependency is only loaded when needed
  // (avoids slowing down the normal mocked-test suite by ~1s of imports).
  const { GenericContainer } = await import('testcontainers');
  startedContainer = await new GenericContainer('postgis/postgis:16-3.4-alpine')
    .withEnvironment({
      POSTGRES_USER: 'buildo',
      POSTGRES_PASSWORD: 'buildo',
      POSTGRES_DB: 'buildo_test',
    })
    .withExposedPorts(5432)
    .start();

  const host = startedContainer.getHost();
  const port = startedContainer.getMappedPort(5432);
  const url = `postgres://buildo:buildo@${host}:${port}/buildo_test`;
  process.env.DATABASE_URL = url;
  await runMigrations(url);

  return async () => {
    if (startedContainer) {
      await startedContainer.stop();
      startedContainer = null;
    }
  };
}

async function runMigrations(databaseUrl: string): Promise<void> {
  // Use the existing scripts/migrate.js runner for parity with production.
  // It reads PG_* env vars; we translate from DATABASE_URL.
  const url = new URL(databaseUrl);
  execSync('node scripts/migrate.js', {
    stdio: 'inherit',
    env: {
      ...process.env,
      PG_HOST: url.hostname,
      PG_PORT: url.port,
      PG_USER: url.username,
      PG_PASSWORD: url.password,
      PG_DATABASE: url.pathname.slice(1),
    },
  });
}

/**
 * Helper for individual test files: returns a fresh pg.Pool connected to
 * the test DB, or `null` if no DB is available (test file should skip).
 */
export function getTestPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  // eslint-disable-next-line no-restricted-syntax -- test harness must own its pool to avoid leaking the prod shared pool into integration tests; the prod boundary rule (src/lib/db/) does not apply to src/tests/db/
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

/**
 * Convenience for `describe.skipIf(!dbAvailable())(...)` patterns.
 */
export function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
