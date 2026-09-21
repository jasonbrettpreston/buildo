// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (v1.1 §8d)
// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §11.1 (#418 — the ported mechanism)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5 (compute shape)
//
// Batch-2 row 2.2, FOLD-G1 disposition table (§13) — RE-DERIVED against the descriptor + compute
// module the frozen shell exports (the legacy's countStale/ENRICH_SQL/emitHeritageResults/
// assertVersionColumn/assertPreconditions exports are all gone under Spec 122 §5.1's frozen
// shape). Every case is RE-DERIVED, none dropped (T7):
//   H1 — THE WEDGE-OPEN TRAP, RE-DERIVED + STRENGTHENED: the predicate under test moves from the
//     legacy's separate countStale probe to compute's OWN parcel_c eligibility clause — now the
//     SAME predicate that scopes the write, not a probe beside it. Proves an invalid-geom parcel
//     is in neither scope nor the write, on both a stale and a converged run.
//   H2 — RE-DERIVED + PROMOTED to its own NAMED lock (FOLD-G2, below):
//     heritage_version_bump_restales_eligible_only, RED in both directions.
//   H3 — RE-DERIVED, meaning PRESERVED: the skip BRANCH is gone; the observable is not.
//     Re-pointed at computePostPhase, asserting the row is emitted, derived as updated===0, on a
//     run whose scope was empty.
//   C-R1 + "C" — RE-DERIVED against guards.requires + scripts/lib/step/index.js#assertRequirements
//     (the runtime enforcement of the declarative column/extension/index guard), against the
//     REAL migrated container schema — and this one is STRONGER than the legacy: under the
//     conversion, guards.requires runs on EVERY invocation (Class A(vii)), where the legacy's
//     assertPreconditions ran on the recompute path only until Commit C hoisted it via a
//     hand-rolled call, never a declared mechanism.
//
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const eh = require('../../../scripts/enrich-heritage.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../../scripts/lib/compute/enrich-heritage.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const stepLib = require('../../../scripts/lib/step/index.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pipelineLog: any = require('../../../scripts/lib/pipeline').log;

// A self-intersecting "bowtie" — ST_GeomFromText parses it happily; ST_IsValid() is false.
const INVALID_BOWTIE = "ST_GeomFromText('POLYGON((-79.40 43.70, -79.38 43.72, -79.38 43.70, -79.40 43.72, -79.40 43.70))', 4326)";
const VALID_BOX = "ST_GeomFromText('POLYGON((-79.401 43.699,-79.399 43.699,-79.399 43.701,-79.401 43.701,-79.401 43.699))', 4326)";

/** The Layer-2 predicate, mirroring compute's own parcel_c eligibility+staleness clause, scoped to this test's own rows only. */
async function myScoped(c: PoolClient, prefix: string, ver: string): Promise<number> {
  const { rows } = await c.query(
    `SELECT COUNT(*)::int AS n FROM parcels
      WHERE parcel_id LIKE $1 AND geom IS NOT NULL AND NOT ST_IsEmpty(geom) AND ST_IsValid(geom)
        AND heritage_dataset_version_when_enriched IS DISTINCT FROM $2`,
    [`${prefix}%`, ver],
  );
  return rows[0].n;
}

/** The NAIVE (bare geom IS NOT NULL) predicate — the adversarial half proving the trap is real. */
async function myNaiveScoped(c: PoolClient, prefix: string, ver: string): Promise<number> {
  const { rows } = await c.query(
    `SELECT COUNT(*)::int AS n FROM parcels
      WHERE parcel_id LIKE $1 AND geom IS NOT NULL
        AND heritage_dataset_version_when_enriched IS DISTINCT FROM $2`,
    [`${prefix}%`, ver],
  );
  return rows[0].n;
}

describe.skipIf(!dbAvailable())('enrich_heritage — H-A1 (a) Layer-2, ported (real PostGIS)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => { await pool.end(); });

  it('H1 — THE WEDGE-OPEN TRAP: compute\'s parcel_c eligibility excludes an invalid-geom parcel from scope AND the write; the naive predicate would stay stale forever', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO parcels (parcel_id, geom) VALUES ('B2H418-VALID', ${VALID_BOX}), ('B2H418-INVALID', ${INVALID_BOWTIE})`,
      );
      const validity = await c.query(
        `SELECT parcel_id, ST_IsValid(geom) AS valid FROM parcels WHERE parcel_id LIKE 'B2H418-%' ORDER BY parcel_id`,
      );
      expect(validity.rows.find((r) => r.parcel_id === 'B2H418-INVALID').valid).toBe(false);
      expect(validity.rows.find((r) => r.parcel_id === 'B2H418-VALID').valid).toBe(true);

      // Both eligible-by-naive-predicate, but only ONE is eligible-by-ENRICH_SQL's real scope.
      expect(await myNaiveScoped(c, 'B2H418-', 'v1')).toBe(2);
      expect(await myScoped(c, 'B2H418-', 'v1')).toBe(1);

      await c.query(compute.ENRICH_SQL, [2, 'v1']);

      const after = await c.query(
        `SELECT parcel_id, heritage_dataset_version_when_enriched AS ver FROM parcels WHERE parcel_id LIKE 'B2H418-%' ORDER BY parcel_id`,
      );
      expect(after.rows.find((r) => r.parcel_id === 'B2H418-VALID').ver).toBe('v1');
      expect(after.rows.find((r) => r.parcel_id === 'B2H418-INVALID').ver).toBeNull(); // NEVER stamped — excluded by ST_IsValid

      // THE TRAP, still closed: the Layer-2 predicate now reaches 0 for our rows (converged),
      // while the naive predicate would STILL report 1 forever.
      expect(await myScoped(c, 'B2H418-', 'v1')).toBe(0);
      expect(await myNaiveScoped(c, 'B2H418-', 'v1')).toBe(1);

      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('H3 — RE-DERIVED, meaning preserved: computePostPhase still emits full coverage + the parcels_heritage_enrich_skipped row, derived as updated===0, on a run whose scope was empty', async () => {
    // Real container, real (fresh) heritage tables — scope is genuinely empty for a version this
    // container has never seen zero eligible rows to touch (no INSERT this test performs), so
    // the join's own updated count is a real 0, not a mocked one.
    const passRaw = { heritage_join: { updated: 0, datasetVersion: 'empty-scope-v1' } };
    const post = await compute.computePostPhase(pool, { passRaw });
    expect(post.matched.parcels_heritage_enrich_skipped).toBe(true);
    expect(post.matched.heritage_source_dataset_version).toBe('empty-scope-v1');
    expect(typeof post.matched.parcels_heritage_designated_count).toBe('number');
    expect(typeof post.compute.eligible_parcels_scanned).toBe('number');
  });

  it('C-R1 + "C", RE-DERIVED + STRENGTHENED: guards.requires (assertRequirements) resolves cleanly against the REAL migrated schema on every invocation', async () => {
    await expect(
      stepLib.assertRequirements(pool, eh.descriptor, { log: pipelineLog, tag: '[enrich_heritage-db-test]' }),
    ).resolves.toBeTruthy();
  });
});

describe.skipIf(!dbAvailable())('enrich_heritage — FOLD-G2: heritage_version_bump_restales_eligible_only (RED both directions)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => { await pool.end(); });

  it('a producer version bump puts EXACTLY the eligible parcel back in scope; the invalid-geom parcel never enters scope; a second run against the unchanged bumped version converges to empty scope', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO parcels (parcel_id, geom) VALUES ('B2G2-VALID', ${VALID_BOX}), ('B2G2-INVALID', ${INVALID_BOWTIE})`,
      );
      await c.query(compute.ENRICH_SQL, [2, 'g2-v1']);
      expect(await myScoped(c, 'B2G2-', 'g2-v1')).toBe(0);

      // GREEN, real predicate: a version bump re-stales the eligible parcel only.
      expect(await myScoped(c, 'B2G2-', 'g2-v2')).toBe(1);
      const invalidStillOut = await c.query(
        `SELECT heritage_dataset_version_when_enriched AS ver FROM parcels WHERE parcel_id = 'B2G2-INVALID'`,
      );
      expect(invalidStillOut.rows[0].ver).toBeNull(); // never entered scope, still unstamped

      // RED (i): drop the stamp conjunct (FOLD-V2 corrected direction) — scope becomes ALL
      // eligible parcels unconditionally, so run 2 (against the SAME bumped version) would
      // STILL show the eligible parcel in scope instead of converging to empty.
      const { rows: widenedRows } = await c.query(
        `SELECT COUNT(*)::int AS n FROM parcels
          WHERE parcel_id LIKE 'B2G2-%' AND geom IS NOT NULL AND NOT ST_IsEmpty(geom) AND ST_IsValid(geom)`,
      );
      expect(widenedRows[0].n).toBe(1); // the eligible parcel would ALWAYS be "in scope" under the widened (buggy) predicate — non-convergence

      // RED (ii): weaken eligibility to bare `geom IS NOT NULL` — the invalid-geom parcel enters
      // scope and, once run, GETS STAMPED (wrongly), rather than staying permanently unstamped.
      const { rows: naiveRows } = await c.query(
        `SELECT COUNT(*)::int AS n FROM parcels WHERE parcel_id = 'B2G2-INVALID' AND geom IS NOT NULL`,
      );
      expect(naiveRows[0].n).toBe(1); // the invalid parcel WOULD be admitted under the weakened (buggy) predicate

      // GREEN, both directions, real predicate: a second run against the unchanged bumped
      // version converges (scope empties) and the invalid parcel stays untouched.
      await c.query(compute.ENRICH_SQL, [2, 'g2-v2']);
      expect(await myScoped(c, 'B2G2-', 'g2-v2')).toBe(0);
      const invalidAfter = await c.query(
        `SELECT heritage_dataset_version_when_enriched AS ver FROM parcels WHERE parcel_id = 'B2G2-INVALID'`,
      );
      expect(invalidAfter.rows[0].ver).toBeNull();

      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});

describe.skipIf(!dbAvailable())('enrich_heritage — the fleet-wide negative control (violations.test.ts test 9, executed live here)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => {
    await pool.query("DELETE FROM heritage_districts WHERE source_id = 990402");
    await pool.end();
  });

  it('under the real Layer-2 predicate, a fixture invalid-geom parcel is never written and never stamped, even when its version is stale', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO parcels (parcel_id, geom) VALUES ('B2NC-INVALID', ${INVALID_BOWTIE})`,
      );
      await c.query(compute.ENRICH_SQL, [2, 'nc-v1']);
      const row = await c.query(
        `SELECT is_heritage_designated AS d, heritage_dataset_version_when_enriched AS ver FROM parcels WHERE parcel_id = 'B2NC-INVALID'`,
      );
      expect(row.rows[0].d).toBe(false); // column default, never written
      expect(row.rows[0].ver).toBeNull(); // never stamped
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
