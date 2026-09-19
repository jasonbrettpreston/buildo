// 🔗 SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §11.1 (#418)
// 🔗 SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 12 — crash posture)
//
// F-IL1 (batch-2 row 2.1 STEP 0 fold) — the plan cited a non-existent "§5.7" for kill-mid-run
// coverage. This is the real test: cancel/terminate the backend mid-UPDATE (the technique
// `refresh-snapshot-recorder-bound.db.test.ts` uses for its own bounded-read cancellation
// proofs — `pg_backend_pid()`/`pg_cancel_backend()` against a REAL Postgres backend, never a
// fixture model of the semantics) and assert (a) zero committed writes, (b) an unmodified
// re-run completes and converges.
//
// `ENRICH_SQL` is a SINGLE statement (`WITH ... UPDATE`); Postgres statements are atomic by
// construction, so a mid-statement cancel is guaranteed to leave zero partial writes REGARDLESS
// of timing — but that guarantee is only worth trusting once actually exercised against the
// real backend, not asserted from the SQL standard. Because the real statement completes in
// single-digit milliseconds against a 2-row fixture (too fast to reliably race a cancel), this
// file races the cancel against a TIMING-SLOWED VARIANT of the identical WHERE/SET logic (one
// `pg_sleep(2)` cross-joined into the same CTE chain, changing nothing else) — enough margin to
// deterministically land the cancel mid-execution — and then separately proves the REAL,
// unmodified `ENRICH_SQL` still converges correctly afterward. Skipped unless BUILDO_TEST_DB=1.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../../scripts/lib/compute/enrich-ravines.js');

const RAVINE = "ST_Multi(ST_GeomFromText('POLYGON((-79.41 43.69,-79.39 43.69,-79.39 43.71,-79.41 43.71,-79.41 43.69))',4326))";
const INSIDE = "ST_GeomFromText('POLYGON((-79.401 43.699,-79.399 43.699,-79.399 43.701,-79.401 43.701,-79.401 43.699))',4326)";

/** The identical statement, slowed by ONE injected pg_sleep join — nothing else differs. */
function slowedEnrichSql(): string {
  return compute.ENRICH_SQL.replace(
    'CROSS JOIN LATERAL (',
    'CROSS JOIN LATERAL (SELECT pg_sleep(2)) AS _slow\n  CROSS JOIN LATERAL (',
  );
}

describe.skipIf(!dbAvailable())('enrich_ravines — F-IL1 kill-mid-run (real pg_cancel_backend)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => {
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'RAV-KILL-%'");
    await pool.query('DELETE FROM ravines WHERE source_id = 990301');
    await pool.end();
  });

  it('(a) a mid-statement cancel commits ZERO writes; (b) an unmodified re-run then completes and converges', async () => {
    expect(slowedEnrichSql()).not.toBe(compute.ENRICH_SQL); // sanity: the injection actually changed the text
    expect(slowedEnrichSql().replace(/CROSS JOIN LATERAL \(SELECT pg_sleep\(2\)\) AS _slow\n {2}/, ''))
      .toBe(compute.ENRICH_SQL); // …and ONLY the injection — the rest is byte-identical

    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'RAV-KILL-%'");
    await pool.query('DELETE FROM ravines WHERE source_id = 990301');
    await pool.query(`INSERT INTO ravines (source_id, geom, source_dataset_version) VALUES (990301, ${RAVINE}, 'kill-v1')`);
    await pool.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('RAV-KILL-IN', ${INSIDE})`);

    // Dedicated client for the slow statement, so we can name its own backend pid.
    const slowClient = await pool.connect();
    try {
      const pidRes = await slowClient.query('SELECT pg_backend_pid() AS pid');
      const pid = pidRes.rows[0].pid;

      const slowPromise = slowClient.query(slowedEnrichSql(), ['kill-v1']).catch((err) => err);

      // Poll pg_stat_activity on a SEPARATE connection until the slow statement is genuinely
      // 'active' with our expected query text, then cancel it — never a blind fixed-delay guess.
      let cancelled = false;
      for (let i = 0; i < 40 && !cancelled; i++) {
        const activity = await pool.query(
          `SELECT state, query FROM pg_stat_activity WHERE pid = $1 AND state = 'active' AND query ILIKE '%pg_sleep%'`,
          [pid],
        );
        if (activity.rows.length > 0) {
          await pool.query('SELECT pg_cancel_backend($1)', [pid]);
          cancelled = true;
        } else {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      expect(cancelled).toBe(true); // the race actually landed mid-statement — not a vacuous pass

      const result = await slowPromise;
      expect(result).toBeInstanceOf(Error);
      expect(String((result as Error).message)).toMatch(/canceling statement due to user request/i);
    } finally {
      slowClient.release();
    }

    // (a) ZERO committed writes — the cancelled parcel is untouched (still at its INSERT-time
    // defaults: is_in_ravine_protection_area defaults to false at the column level, never NULL).
    const afterCancel = await pool.query(
      `SELECT is_in_ravine_protection_area AS inr, ravine_distance_m AS dist, ravine_dataset_version_when_enriched AS ver
         FROM parcels WHERE parcel_id = 'RAV-KILL-IN'`,
    );
    expect(afterCancel.rows[0].inr).toBe(false);
    expect(afterCancel.rows[0].dist).toBeNull();
    expect(afterCancel.rows[0].ver).toBeNull();

    // (b) an UNMODIFIED re-run (the real ENRICH_SQL, no slowdown) completes and converges.
    const rerun = await pool.query(compute.ENRICH_SQL, ['kill-v1']);
    expect(rerun.rowCount).toBeGreaterThanOrEqual(1);
    const afterRerun = await pool.query(
      `SELECT is_in_ravine_protection_area AS inr, ravine_distance_m AS dist, ravine_dataset_version_when_enriched AS ver
         FROM parcels WHERE parcel_id = 'RAV-KILL-IN'`,
    );
    expect(afterRerun.rows[0].inr).toBe(true);
    expect(Number(afterRerun.rows[0].dist)).toBeLessThanOrEqual(0);
    expect(afterRerun.rows[0].ver).toBe('kill-v1');
  }, 30000);
});
