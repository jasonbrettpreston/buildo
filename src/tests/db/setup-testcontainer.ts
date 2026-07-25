// 🔗 SPEC LINK: docs/specs/00-architecture/00_engineering_standards.md §12.9 Real DB integration tests
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

// Minimal Supabase baseline the migration set legitimately depends on but a
// bare postgis/postgis image does not provide. On the real target (Supabase
// local stack + cloud) GoTrue always creates the `auth` schema, `auth.users`,
// `auth.uid()`, and the `anon`/`authenticated`/`service_role` roles;
// migrations 226/228/229/230/231/233/234/235 reference them (FK to auth.users,
// RLS policies calling auth.uid(), and un-guarded GRANT/REVOKE on those roles —
// e.g. mig 233 `REVOKE ... FROM anon, authenticated`). Without this, migrate.js
// aborts globalSetup (first at mig 226 `schema "auth" does not exist`, then at
// mig 233 `role "anon" does not exist`) and the ENTIRE db-test suite fails
// before a single test runs. This is the CI image's counterpart to PostGIS
// being pre-baked: a foundational baseline the real target always has. The
// OPTIONAL Supabase extensions (pg_cron/pg_net/vault) are self-guarded inside
// their own migrations (224/232/233/234) and correctly skip on this image —
// only the auth schema + roles are foundational and (partly) unguarded.
// Kept to exactly the referenced surface: auth.users(id), auth.uid(), 3 roles.
const SUPABASE_AUTH_BASELINE_SQL = `
  DO $roles$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
  END
  $roles$;

  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
  );
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $fn$ SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid $fn$;
`;

async function seedSupabaseAuthBaseline(databaseUrl: string): Promise<void> {
  // The container's port opens before Postgres finishes initdb, so a query
  // fired at that instant hits FATAL 57P03 "the database system is starting up"
  // (or a refused connection). Retry through that transient window — the same
  // resilience migrate.js already has. In CI the db-tests workflow health-checks
  // Postgres before running the suite, so this only matters for the local
  // testcontainers path.
  const deadline = Date.now() + 30_000;
  for (let attempt = 1; ; attempt++) {
    // eslint-disable-next-line no-restricted-syntax -- test harness owns its own pool (see getTestPool)
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await pool.query(SUPABASE_AUTH_BASELINE_SQL);
      await pool.end();
      return;
    } catch (err) {
      await pool.end().catch(() => {});
      const code = (err as { code?: string }).code;
      const transient =
        code === '57P03' || // starting up
        code === 'ECONNREFUSED' ||
        code === '08006' || // connection failure
        code === '08001'; // unable to connect
      if (!transient || Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function runMigrations(databaseUrl: string): Promise<void> {
  // Provision the Supabase auth baseline BEFORE migrate.js — several migrations
  // FK to auth.users / call auth.uid() and would otherwise hard-fail here.
  await seedSupabaseAuthBaseline(databaseUrl);
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
