// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.10 Real-DB Integration Tests
//
// Dual-mode test DB harness:
//   - CI: GitHub Actions provides a Postgres service container pinned to
//     `_contracts.json db_target.test_image` — the Supabase Postgres image the
//     authoritative target runs (PG17 / PostGIS 3.3 / GEOS 3.14) — and sets
//     DATABASE_URL (+ CI=true). We connect to that and run migrations.
//     An exported DATABASE_URL is migrated ONLY when decideTestDbTarget() rules
//     it disposable (loopback + CI=true, or BUILDO_TEST_DB_EXTERNAL=1); the local
//     dev stack (port 54322) is always refused.
//   - Local opt-in: developer sets BUILDO_TEST_DB=1, we spin up a container of
//     the SAME image (`readDbTarget().test_image`) via testcontainers, run
//     migrations against it, and tear it down at the end of the suite.
//   - Default (nothing set): the helper returns null and every db.test.ts
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
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { StartedTestContainer } from 'testcontainers';

// Reuse the pipeline's own password masking (scripts/lib/resolve-db.js) — CJS module.
const { redactConnectionString } = createRequire(import.meta.url)('../../../scripts/lib/resolve-db.js') as {
  redactConnectionString: (connectionString: string) => string;
};

/**
 * The name of the ephemeral test database — `postgres`, deliberately, and it
 * must stay that way (LW-D16 root cause, WF3 2026-09-21).
 *
 * Every converted step declares `database.assert_current_database: "postgres"`,
 * and `scripts/lib/resolve-db.js`'s `assertDbTarget` REFUSES any other name.
 * That refusal is a PRODUCTION SAFETY FENCE (Spec 122 §P0, commit `9e2da7b1`):
 * 24 tools used to fall back to the pre-cutover `localhost:5432/buildo`
 * database and silently grade the wrong data. It is not weakened here.
 *
 * While this harness provisioned a database named `buildo_test`, every live-DB
 * test that ran a converted step for real — `pipeline.step(d, c).run({pool})`
 * in-process, or a spawned step script — refused on contact:
 *   `REFUSING: connected to database "buildo_test", expected one of "postgres"`
 * 13 committed locks across the two `compute-parcel-cost-estimates` db-test
 * files had therefore NEVER ONCE EXECUTED, `step-crash-posture.db.test.ts` sits
 * `describe.skip`-ped citing it, and the spawned-child suites
 * (`enrich-parcels-*`, `migration-245-centroid-invalidation`) failed the same way.
 *
 * The fix is to SATISFY the guard, not to bypass it: the harness provisions the
 * database name production uses, so `assertDbTarget` runs completely unmodified
 * and still refuses everything it refused before. `postgres` is also the
 * authoritative Supabase target's name, so the name check and the migration
 * floor now grade this container exactly as they grade the real thing (this
 * container runs the FULL migration set, so the floor is met honestly, never
 * exempted). Proven in both directions by
 * `src/tests/db/step-database-target-guard.db.test.ts` (a live mutation: point
 * a descriptor at a wrong name → the guard still refuses) and statically by
 * `src/tests/db-test-harness-target.infra.test.ts`.
 *
 * ⚠️ Keep in lockstep with `.github/workflows/db-tests.yml` (POSTGRES_DB /
 * DATABASE_URL / PG_DATABASE / the health check) — the infra test above reds if
 * either side drifts.
 */
export const TEST_DATABASE_NAME = 'postgres';

/**
 * The role the db-test harness connects as. `postgres` on the target image
 * (db_target) is a NON-SUPERUSER, exactly like the production target, so a test
 * runs under production's grant/RLS reality instead of a superuser's blanket
 * access. Never `supabase_admin` — it bypasses the grant checks that are half
 * the point of the DB tier. `buildo` (a prior hardcode) is not a role on the
 * image at all.
 */
export const TEST_DB_USER = 'postgres';

/**
 * The throwaway password the container is started with (`POSTGRES_PASSWORD`, which
 * the target image applies to the `postgres` role). Local testcontainer only — the
 * container is ephemeral; CI sets the same value in `.github/workflows/db-tests.yml`.
 */
const TEST_DB_PASSWORD = 'postgres';

/** The declared DB engine the DB-tier tests must match (see `_contracts.json#db_target`). */
export interface DbTarget {
  pg_major: number;
  postgis_major_minor: string;
  test_image: string;
}

/**
 * The single source of truth for the DB-test engine: `docs/specs/_contracts.json
 * #db_target` (WF3 PostGIS pin 2026-10-03). The harness provisions the image the
 * authoritative target runs, so DB-tier behaviour is graded against the engine
 * that will execute it. Read with fs — NOT a JSON import — because this module
 * runs as vitest globalSetup, where an import assertion/attribute would couple
 * the whole db suite to the bundler (panel finding 6). Throws (never falls back)
 * when the contract is missing or malformed: silently testing a different engine
 * is the defect this pins.
 */
export function readDbTarget(): DbTarget {
  const path = fileURLToPath(new URL('../../../docs/specs/_contracts.json', import.meta.url));
  const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as {
    db_target?: Partial<DbTarget>;
  };
  const target = parsed.db_target;
  const ok =
    target != null &&
    typeof target.pg_major === 'number' &&
    typeof target.postgis_major_minor === 'string' &&
    target.postgis_major_minor !== '' &&
    typeof target.test_image === 'string' &&
    target.test_image !== '';
  if (!ok) {
    throw new Error(
      '[db-test setup] docs/specs/_contracts.json db_target is missing or malformed — ' +
        'expected { pg_major: number, postgis_major_minor: string, test_image: string }',
    );
  }
  return {
    pg_major: target.pg_major as number,
    postgis_major_minor: target.postgis_major_minor as string,
    test_image: target.test_image as string,
  };
}

let startedContainer: StartedTestContainer | null = null;

export type TestDbTarget = 'testcontainer' | 'external-ci' | 'noop';

/** The local Supabase dev stack's Postgres port — never a disposable test DB. */
const DEV_STACK_PORT = '54322';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * PURE: which database may this harness migrate? (WF3 2026-10-03 — a pre-commit
 * run with the dev DB env exported migrated/seeded 127.0.0.1:54322/postgres and
 * stopped only on a permission error.) Rules, in order:
 *   1. No (or blank) DATABASE_URL → 'testcontainer' if BUILDO_TEST_DB=1, else 'noop' (db tests self-skip).
 *   2. A QUALIFIED DATABASE_URL → 'external-ci' (this wins over BUILDO_TEST_DB=1 — the
 *      original precedence; CI runs `npm run test:db`, which always sets BUILDO_TEST_DB=1).
 *      Qualified = parseable AND not the dev-stack port 54322 on loopback (never, no flag
 *      overrides) AND either: non-loopback host with BUILDO_TEST_DB_EXTERNAL=1, or loopback
 *      host (e.g. the CI service container, localhost:5432) with CI=true (GitHub Actions
 *      sets it) or BUILDO_TEST_DB_EXTERNAL=1.
 *   3. An UNQUALIFIED DATABASE_URL → 'testcontainer' if BUILDO_TEST_DB=1 (the container
 *      URL REPLACES the exported one — the exported target is never touched), else refuse.
 * A refusal throws naming the target with the password redacted. Refusing (not
 * no-op-ing) an unqualified URL matters: a no-op would leave DATABASE_URL exported,
 * so `dbAvailable()` would be true and the db tests would run, unmigrated, against it.
 */
export function decideTestDbTarget(env: Record<string, string | undefined>): TestDbTarget {
  const raw = env.DATABASE_URL;
  const hasUrl = typeof raw === 'string' && raw.trim() !== '';
  const wantsContainer = env.BUILDO_TEST_DB === '1';

  if (!hasUrl) return wantsContainer ? 'testcontainer' : 'noop';

  // null = the exported URL qualifies as a disposable external DB; a string = why it does not.
  const disqualified = ((): string | null => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return 'DATABASE_URL is not a parseable URL';
    }
    const host = url.hostname.toLowerCase();
    const port = url.port || '5432';
    const loopback = LOOPBACK_HOSTS.has(host);
    const externalMarker = env.BUILDO_TEST_DB_EXTERNAL === '1';
    if (loopback && port === DEV_STACK_PORT) {
      return `${host}:${port} is the local Supabase dev stack, never a throwaway test DB`;
    }
    if (!loopback) {
      return externalMarker ? null : `${host} is not a loopback host and BUILDO_TEST_DB_EXTERNAL=1 is not set`;
    }
    return env.CI === 'true' || externalMarker
      ? null
      : 'neither CI=true nor BUILDO_TEST_DB_EXTERNAL=1 marks it as a disposable test DB';
  })();

  if (disqualified === null) return 'external-ci';
  // A fresh container's URL REPLACES the exported one in setup() — the exported target is never touched.
  if (wantsContainer) return 'testcontainer';

  throw new Error(
    `[db-test setup] REFUSING to migrate ${redactConnectionString(raw)}: ${disqualified}\n` +
      `  The db-test harness only migrates a disposable database. Either unset DATABASE_URL\n` +
      `  (db tests skip), set BUILDO_TEST_DB=1 (fresh testcontainer), or — for a disposable\n` +
      `  external DB — run under CI=true (loopback service container) or set BUILDO_TEST_DB_EXTERNAL=1.`,
  );
}

/**
 * vitest globalSetup. Boots the test DB once for the entire suite. Returns
 * a teardown function that vitest calls after all tests finish.
 *
 * The target is chosen by `decideTestDbTarget(process.env)` — it throws (and the
 * suite aborts before any connection) for a database that is not disposable.
 * With no DATABASE_URL and no BUILDO_TEST_DB=1 this is a no-op and individual
 * test files skip via the `dbAvailable()` guard.
 */
export async function setup(): Promise<() => Promise<void>> {
  const target = decideTestDbTarget(process.env);

  // CI path: DATABASE_URL is provided by the service container (CI=true) or an
  // explicitly-marked disposable DB (BUILDO_TEST_DB_EXTERNAL=1).
  if (target === 'external-ci') {
    await runMigrations(process.env.DATABASE_URL as string);
    return async () => {
      // Service container is managed by GH Actions; nothing to tear down.
    };
  }

  // Nothing configured — tests skip.
  if (target === 'noop') {
    return async () => {
      // No-op teardown — tests will skip.
    };
  }

  // Lazy-import testcontainers so the dependency is only loaded when needed
  // (avoids slowing down the normal mocked-test suite by ~1s of imports).
  const { GenericContainer, Wait } = await import('testcontainers');
  startedContainer = await new GenericContainer(readDbTarget().test_image)
    // Do NOT set POSTGRES_USER: the image's default init role is `supabase_admin`
    // (a superuser), and the harness deliberately connects as the non-superuser
    // `postgres` — the role the image accepts POSTGRES_PASSWORD for.
    .withEnvironment({
      POSTGRES_PASSWORD: TEST_DB_PASSWORD,
      POSTGRES_DB: TEST_DATABASE_NAME,
    })
    .withExposedPorts(5432)
    // The image's init runs a temporary server, then RESTARTS it, so "ready to accept
    // connections" is logged twice; only the second one is the server the suite uses.
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .withStartupTimeout(180_000)
    .start();

  const host = startedContainer.getHost();
  const port = startedContainer.getMappedPort(5432);
  const url = `postgres://${TEST_DB_USER}:${TEST_DB_PASSWORD}@${host}:${port}/${TEST_DATABASE_NAME}`;
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
// GoTrue-less image (e.g. a bare PostGIS image) does not provide. On the real target (Supabase
// local stack + cloud) GoTrue always creates the `auth` schema, `auth.users`,
// `auth.uid()`, and the `anon`/`authenticated`/`service_role` roles;
// migrations 226/228/229/230/231/233/234/235 reference them (FK to auth.users,
// RLS policies calling auth.uid(), and un-guarded GRANT/REVOKE on those roles —
// e.g. mig 233 `REVOKE ... FROM anon, authenticated`). Without this, migrate.js
// aborts globalSetup (first at mig 226 `schema "auth" does not exist`, then at
// mig 233 `role "anon" does not exist`) and the ENTIRE db-test suite fails
// before a single test runs. This is the CI image's counterpart to PostGIS
// being pre-baked: a foundational baseline the real target always has.
// Kept to exactly the referenced surface: auth.users(id), auth.uid(), 3 roles.
//
// CONDITIONAL since the WF3 PostGIS pin (2026-10-03, panel finding 1): the test
// image is now the Supabase target image (`_contracts.json db_target`), which
// already ships every object below, and the harness connects as the target's
// non-superuser `postgres`, which can neither create in schema `auth` (42501
// `permission denied for schema auth`) nor replace `auth.uid()` (owner
// `supabase_auth_admin`). So the seed runs ONLY when `to_regclass('auth.users')`
// or `to_regprocedure('auth.uid()')` is missing — kept, not deleted, for any
// GoTrue-less image (review_followups.md:2942, offboarding-sweep.db.test.ts:17-31).
// On the target image pg_cron/pg_net/vault also exist, so the self-guarded
// migrations 224/232/233/234 run for real instead of skipping.
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

/** Probe for the two auth objects the seed exists to provide (both columns are NULL when absent). */
export const AUTH_BASELINE_PROBE_SQL =
  "SELECT to_regclass('auth.users')::text AS users, to_regprocedure('auth.uid()')::text AS uid";

/** The minimal query surface `applyAuthBaselineIfMissing` needs — a pg Pool/Client fits. */
export type SqlQuery = (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;

/**
 * Seed the Supabase auth baseline ONLY when it is missing (panel finding 1).
 * Both objects present → 'skipped', and no other statement is issued (on the
 * target image the seed would throw 42501 as `postgres`). Either missing →
 * the seed runs → 'seeded'. Pure over `query`, so both directions are locked
 * DB-free in `src/tests/test-db-setup-guard.logic.test.ts`.
 */
export async function applyAuthBaselineIfMissing(query: SqlQuery): Promise<'skipped' | 'seeded'> {
  const { rows } = await query(AUTH_BASELINE_PROBE_SQL);
  const row = rows[0] ?? {};
  if (row.users != null && row.uid != null) return 'skipped';
  await query(SUPABASE_AUTH_BASELINE_SQL);
  return 'seeded';
}

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
      await applyAuthBaselineIfMissing((sql) => pool.query(sql));
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

/**
 * The env handed to the `scripts/migrate.js` child. DATABASE_URL is set
 * EXPLICITLY (panel finding 2): migrate.js resolves DATABASE_URL before PG_*,
 * so a stray exported DATABASE_URL (e.g. the dev stack's, via `.env`) would
 * otherwise win over the PG_* below — the plan-panel spike migrated 54322 that
 * way (F14). PG_* are kept for any reader of the discrete vars.
 */
export function migrationChildEnv(
  databaseUrl: string,
  baseEnv: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const url = new URL(databaseUrl);
  return {
    ...baseEnv,
    DATABASE_URL: databaseUrl,
    PG_HOST: url.hostname,
    PG_PORT: url.port,
    PG_USER: url.username,
    PG_PASSWORD: url.password,
    PG_DATABASE: url.pathname.slice(1),
  };
}

async function runMigrations(databaseUrl: string): Promise<void> {
  // Provision the Supabase auth baseline BEFORE migrate.js — several migrations
  // FK to auth.users / call auth.uid() and would otherwise hard-fail here.
  // A no-op on the target image, where it already exists.
  await seedSupabaseAuthBaseline(databaseUrl);
  // Use the existing scripts/migrate.js runner for parity with production.
  execSync('node scripts/migrate.js', {
    stdio: 'inherit',
    env: migrationChildEnv(databaseUrl, process.env) as NodeJS.ProcessEnv,
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
