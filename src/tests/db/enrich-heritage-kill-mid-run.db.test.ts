// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8d, §11.1
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 12 — crash posture)
//
// Batch-2 row 2.2, §5 / §8 — the F-IL1 kill-mid-run pattern (enrich_ravines precedent):
// cancel/terminate the backend mid-UPDATE (`pg_backend_pid()`/`pg_cancel_backend()` against a
// REAL Postgres backend, never a fixture model of the semantics) and assert (a) zero committed
// writes, (b) an unmodified re-run completes and converges. `compute.ENRICH_SQL` is a SINGLE
// statement (`WITH ... UPDATE`); Postgres statements are atomic by construction, so a
// mid-statement cancel is guaranteed to leave zero partial writes REGARDLESS of timing — but
// that guarantee is only worth trusting once actually exercised against the real backend.
// Because the real statement completes in single-digit milliseconds against a tiny fixture (too
// fast to reliably race a cancel), this file races the cancel against a TIMING-SLOWED VARIANT of
// the identical join logic (one `pg_sleep(2)` cross-joined into the same CTE chain, changing
// nothing else) and then separately proves the REAL, unmodified `ENRICH_SQL` still converges
// correctly afterward. Skipped unless BUILDO_TEST_DB=1.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../../scripts/lib/compute/enrich-heritage.js');

const HCD = "ST_Multi(ST_GeomFromText('POLYGON((-79.41 43.69,-79.39 43.69,-79.39 43.71,-79.41 43.71,-79.41 43.69))',4326))";
const P_V = "ST_GeomFromText('POLYGON((-79.401 43.699,-79.399 43.699,-79.399 43.701,-79.401 43.701,-79.401 43.699))',4326)";

/** The identical statement, slowed by ONE injected pg_sleep join — nothing else differs. */
function slowedEnrichSql(): string {
  return compute.ENRICH_SQL.replace(
    'FROM parcel_c pc\n  LEFT JOIN LATERAL (',
    'FROM parcel_c pc\n  CROSS JOIN LATERAL (SELECT pg_sleep(2)) AS _slow\n  LEFT JOIN LATERAL (',
  );
}

describe.skipIf(!dbAvailable())('enrich_heritage — F-IL1 kill-mid-run (real pg_cancel_backend)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => {
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'HER-KILL-%'");
    await pool.query('DELETE FROM heritage_districts WHERE source_id = 990401');
    await pool.end();
  });

  it('(a) a mid-statement cancel commits ZERO writes; (b) an unmodified re-run then completes and converges', async () => {
    expect(slowedEnrichSql()).not.toBe(compute.ENRICH_SQL); // sanity: the injection actually changed the text
    expect(slowedEnrichSql().replace(/CROSS JOIN LATERAL \(SELECT pg_sleep\(2\)\) AS _slow\n {2}/, ''))
      .toBe(compute.ENRICH_SQL); // …and ONLY the injection — the rest is byte-identical

    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'HER-KILL-%'");
    await pool.query('DELETE FROM heritage_districts WHERE source_id = 990401');
    await pool.query(`INSERT INTO heritage_districts (source_id, name, hcd_type, geom, source_dataset_version) VALUES (990401, 'Kill Test HCD', 'designated_district', ${HCD}, 'kill-v1|kill-v1')`);
    await pool.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('HER-KILL-V', ${P_V})`);

    // Dedicated client for the slow statement, so we can name its own backend pid.
    const slowClient = await pool.connect();
    try {
      const pidRes = await slowClient.query('SELECT pg_backend_pid() AS pid');
      const pid = pidRes.rows[0].pid;

      const slowPromise = slowClient.query(slowedEnrichSql(), [2, 'kill-v1|kill-v1']).catch((err) => err);

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
    // defaults: is_heritage_designated defaults to false at the column level, never NULL).
    const afterCancel = await pool.query(
      `SELECT is_heritage_designated AS d, heritage_designation_type AS t, heritage_dataset_version_when_enriched AS ver
         FROM parcels WHERE parcel_id = 'HER-KILL-V'`,
    );
    expect(afterCancel.rows[0].d).toBe(false);
    expect(afterCancel.rows[0].t).toBeNull();
    expect(afterCancel.rows[0].ver).toBeNull();

    // (b) an UNMODIFIED re-run (the real ENRICH_SQL, no slowdown) completes and converges.
    const rerun = await pool.query(compute.ENRICH_SQL, [2, 'kill-v1|kill-v1']);
    expect(rerun.rowCount).toBeGreaterThanOrEqual(1);
    const afterRerun = await pool.query(
      `SELECT is_heritage_designated AS d, heritage_designation_type AS t, heritage_dataset_version_when_enriched AS ver
         FROM parcels WHERE parcel_id = 'HER-KILL-V'`,
    );
    expect(afterRerun.rows[0].d).toBe(true);
    expect(afterRerun.rows[0].t).toBe('part_v_hcd');
    expect(afterRerun.rows[0].ver).toBe('kill-v1|kill-v1');
  }, 30000);
});
