// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §P0 (resolve-db, the database-target fence)
// 🔗 SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 — the converted step's database guard)
//
// LW-D16 root-cause lock (WF3, 2026-09-21) — BOTH DIRECTIONS, against the live
// testcontainer.
//
// The fix for LW-D16 renamed the harness's ephemeral database to `postgres`
// (`setup-testcontainer.ts`'s TEST_DATABASE_NAME) so that a converted step's
// `database.assert_current_database` guard is SATISFIED rather than bypassed.
// The obvious way to get that wrong would have been to weaken the guard — a
// test-only escape hatch inside `assertDbTarget`, a blanket disable, a
// swallowed error. This file proves, in the exact environment the 13
// previously-unexecuted locks now run in, that the guard is still armed:
//
//   ① forward  — the harness provisions the name every converted descriptor
//                declares, so a real `.run({pool})` gets past the guard.
//   ② mutation — point the SAME step at a WRONG database name and the guard
//                still REFUSES, with the same message it always produced.
//   ③ mutation — raise the migration floor above the container's real depth and
//                the guard still REFUSES on the floor half too.
//   ④ direct   — `assertDbTarget` itself, called against this live pool with a
//                wrong expectation, still rejects (no env/harness input makes
//                it lenient).
//
// A refused run writes nothing and opens no ledger row: `assertDatabaseTarget`
// is the FIRST statement inside `runWithPool`'s try, ahead of `openLedgerRow`
// (scripts/lib/step/index.js). The mutations below therefore leave no
// `pipeline_runs` residue for the rest of the suite.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import path from 'path';
import { dbAvailable, getTestPool, TEST_DATABASE_NAME } from './setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pipelineLib = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolveDb = require(path.join(REPO_ROOT, 'scripts/lib/resolve-db.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require(path.join(REPO_ROOT, 'scripts/compute-parcel-cost-estimates.descriptor.json'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/compute-parcel-cost-estimates.js'));

/** A descriptor clone with ONLY its `database` block re-pointed. */
function withDatabase(over: Record<string, unknown>) {
  return { ...descriptor, database: { ...descriptor.database, ...over } };
}

const QUIET = { log: () => {}, warn: () => {} };

describe.skipIf(!dbAvailable())('LW-D16 — the step database-target guard is satisfied, not weakened (live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => { await pool.end(); });

  it('① the harness provisions exactly the database the descriptor declares', async () => {
    const { rows } = await pool.query('SELECT current_database() AS db');
    expect(rows[0].db).toBe(TEST_DATABASE_NAME);
    expect(descriptor.database.assert_current_database).toBe(TEST_DATABASE_NAME);
  });

  it('② MUTATION — the same step pointed at a WRONG database name still REFUSES', async () => {
    const mutated = withDatabase({ assert_current_database: 'buildo_test' });
    await expect(
      pipelineLib.step(mutated, compute).run({ pool, chainId: 'sources' }),
    ).rejects.toThrow(
      /REFUSING: connected to database "postgres", expected one of "buildo_test"/,
    );
  });

  it('② MUTATION — the pre-cutover database name is refused too (the fence\'s actual target)', async () => {
    const mutated = withDatabase({ assert_current_database: 'buildo' });
    await expect(
      pipelineLib.step(mutated, compute).run({ pool, chainId: 'sources' }),
    ).rejects.toThrow(/REFUSING: connected to database "postgres", expected one of "buildo"/);
  });

  it('③ MUTATION — the migration floor half still REFUSES a below-floor depth', async () => {
    const mutated = withDatabase({ min_migration: 999_999 });
    await expect(
      pipelineLib.step(mutated, compute).run({ pool, chainId: 'sources' }),
    ).rejects.toThrow(/REFUSING to run against a below-floor database[\s\S]*required floor: 999999/);
  });

  it('③ the container meets the REAL declared floor honestly (not by exemption)', async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM public.schema_migrations');
    expect(rows[0].n).toBeGreaterThanOrEqual(descriptor.database.min_migration);
    expect(rows[0].n).toBeGreaterThanOrEqual(resolveDb.DEFAULT_MIN_MIGRATION);
  });

  it('④ assertDbTarget itself still rejects a wrong expectation against this very pool', async () => {
    await expect(
      resolveDb.assertDbTarget(pool, {
        label: 'lw-d16',
        expectDatabase: 'buildo',
        logger: QUIET,
      }),
    ).rejects.toThrow(/connected to database "postgres", expected one of "buildo"/);
  });

  it('④ …and accepts the real one, so the pass is the guard\'s verdict, not a skipped check', async () => {
    const res = await resolveDb.assertDbTarget(pool, {
      label: 'lw-d16',
      expectDatabase: TEST_DATABASE_NAME,
      logger: QUIET,
    });
    expect(res.database).toBe(TEST_DATABASE_NAME);
    expect(res.hasTracking).toBe(true);
  });
});
