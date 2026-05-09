// 🔗 SPEC LINK: docs/specs/01-pipeline/57_source_neighbourhoods.md §2
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §18.2
//             migrations/109_fk_hardening.sql step 4 (fk_permits_neighbourhoods)
//
// Layer 2 live-DB regression-lock for the neighbourhoods FK-correct join.
//
// Why this test exists (WF3 2026-05-08):
//   The 4 wrong-join sites slipped because both candidate join columns are
//   INTEGER — PG raises no error on the wrong shape; the join silently
//   miss-matches. Layer 1 (neighbourhoods-fk-join.infra.test.ts) catches
//   text regression. This Layer 2 test proves the FK-correct shape returns
//   the EXPECTED neighbourhood AND that the wrong shape would return a
//   DIFFERENT neighbourhood — making the silent miss observable.
//
// Test design — minimal but complete:
//   Seed 2 neighbourhoods A and B chosen so A's SERIAL `id` equals B's
//   city open-data `neighbourhood_id`. Then create a permit with
//   permits.neighbourhood_id = A's SERIAL id (the FK-correct value per
//   mig 109).
//
//   Running the FK-correct join → returns A.
//   Running the wrong-shape join → returns B.
//
//   Both queries succeed at the SQL level (no exceptions). The assertion
//   that A.name !== B.name is what makes the silent miss visible.
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

// Test fixture identifiers — prefixed `999800` so afterAll cleanup is
// targeted and concurrent tests are unaffected.
const PERMIT_NUM = 'TEST 999800';
const PERMIT_REV = '00';

// We seed two neighbourhoods chosen so the SERIAL `id` of A collides with
// the city `neighbourhood_id` of B. Picking high integers far above the
// real Toronto neighbourhood range (which goes up to ~175) and the
// real SERIAL range (which has grown to a few thousand) avoids any
// collision with live dev-DB data. The seed uses ON CONFLICT DO UPDATE
// so re-runs are idempotent. The second-pass UPDATE flips a column for
// observability.
const A_CITY_ID = 999801;
// B's city neighbourhood_id is set at runtime to A's SERIAL id (see seed
// step 2). That overlap is what makes the silent-miss bug observable —
// any hardcoded B_CITY_ID would fail to align.
const A_NAME = 'Test Inspect Neighbourhood A (FK-correct match)';
const B_NAME = 'Test Inspect Neighbourhood B (silent-miss match)';
const A_INCOME = 88800;
const B_INCOME = 22200;

// Captured during seed for cleanup + the alignment assertion below.
let aSerialId: number | null = null;
let bSerialId: number | null = null;

describe.skipIf(!dbAvailable())('neighbourhoods FK-correct join — live-DB regression-lock (WF3 2026-05-08)', () => {
  beforeAll(async () => {
    if (!pool) return;

    // 1. Seed A first to capture aSerialId (the value the permit's FK will
    //    point at). A's city neighbourhood_id is arbitrary (A_CITY_ID).
    const aRes = await pool.query<{ id: number }>(
      `INSERT INTO neighbourhoods (neighbourhood_id, name, avg_household_income)
       VALUES ($1, $2, $3)
       ON CONFLICT (neighbourhood_id) DO UPDATE
         SET name = EXCLUDED.name, avg_household_income = EXCLUDED.avg_household_income
       RETURNING id`,
      [A_CITY_ID, A_NAME, A_INCOME],
    );
    aSerialId = aRes.rows[0]!.id;

    // 2. Seed B with city neighbourhood_id = aSerialId (A's SERIAL). This
    //    is the magic that makes the silent-miss bug observable: when a
    //    permit links to A via FK (permits.neighbourhood_id = aSerialId),
    //    the wrong-shape join `n.neighbourhood_id = p.neighbourhood_id`
    //    will find B (whose city_id matches aSerialId), NOT A. The
    //    correct-shape join `n.id = p.neighbourhood_id` finds A.
    const bRes = await pool.query<{ id: number }>(
      `INSERT INTO neighbourhoods (neighbourhood_id, name, avg_household_income)
       VALUES ($1, $2, $3)
       ON CONFLICT (neighbourhood_id) DO UPDATE
         SET name = EXCLUDED.name, avg_household_income = EXCLUDED.avg_household_income
       RETURNING id`,
      [aSerialId, B_NAME, B_INCOME],
    );
    bSerialId = bRes.rows[0]!.id;

    // Sanity check — alignment is what makes this test meaningful.
    if (aSerialId === null || bSerialId === null) {
      throw new Error('seed failed to capture SERIAL ids');
    }

    // 3. Permit linked to A's SERIAL (FK-correct) — but A's city PK happens
    //    to equal B's SERIAL, so the wrong-shape join would resolve to B.
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, permit_type, neighbourhood_id)
       VALUES ($1, $2, 'TEST', $3)
       ON CONFLICT (permit_num, revision_num) DO UPDATE
         SET neighbourhood_id = EXCLUDED.neighbourhood_id`,
      [PERMIT_NUM, PERMIT_REV, aSerialId],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM permits WHERE permit_num = $1`, [PERMIT_NUM]);
    if (aSerialId !== null) {
      await pool.query(`DELETE FROM neighbourhoods WHERE id = $1`, [aSerialId]);
    }
    if (bSerialId !== null) {
      await pool.query(`DELETE FROM neighbourhoods WHERE id = $1`, [bSerialId]);
    }
    await pool.end();
  });

  it('seeds align: B.neighbourhood_id (city PK) equals A.id (SERIAL) — required for the silent-miss demo', async () => {
    if (!pool) return;
    // The fixture is meaningful ONLY if B's city_id literally equals A's SERIAL.
    // Re-query B by its SERIAL primary key and assert its city PK matches A's
    // SERIAL. This catches a future regression where the seed's overlap
    // construction breaks (e.g., an ON CONFLICT path returning a stale row).
    const alignCheck = await pool.query<{ neighbourhood_id: number }>(
      `SELECT neighbourhood_id FROM neighbourhoods WHERE id = $1`,
      [bSerialId],
    );
    expect(alignCheck.rowCount).toBe(1);
    expect(alignCheck.rows[0]!.neighbourhood_id).toBe(aSerialId);
    expect(aSerialId).not.toBe(bSerialId);
  });

  it('FK-correct join (n.id = p.neighbourhood_id) returns A — the truth-rooted neighbourhood', async () => {
    if (!pool) return;
    const result = await pool.query<{ name: string; income: string }>(
      `SELECT n.name, n.avg_household_income::text AS income
         FROM permits p
         JOIN neighbourhoods n ON n.id = p.neighbourhood_id
        WHERE p.permit_num = $1 AND p.revision_num = $2`,
      [PERMIT_NUM, PERMIT_REV],
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]!.name).toBe(A_NAME);
    expect(Number(result.rows[0]!.income)).toBe(A_INCOME);
  });

  it('wrong-shape join (n.neighbourhood_id = p.neighbourhood_id) returns B — proves the silent-miss bug class is real', async () => {
    if (!pool) return;
    // This SQL is what the 4 wrong-join sites used to ship. The test
    // asserts the wrong shape produces a DIFFERENT neighbourhood — that
    // discrepancy is the bug class. After this WF the 4 sites no longer
    // run this query; the assertion here documents WHY the fix was needed.
    const result = await pool.query<{ name: string }>(
      `SELECT n.name
         FROM permits p
         JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id
        WHERE p.permit_num = $1 AND p.revision_num = $2`,
      [PERMIT_NUM, PERMIT_REV],
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]!.name).toBe(B_NAME);
    expect(result.rows[0]!.name).not.toBe(A_NAME);
  });

  it('the two joins disagree on this fixture — confirms PG raises no error and the miss is silent', async () => {
    if (!pool) return;
    const correct = await pool.query<{ name: string }>(
      `SELECT n.name FROM permits p JOIN neighbourhoods n ON n.id = p.neighbourhood_id
        WHERE p.permit_num = $1 AND p.revision_num = $2`,
      [PERMIT_NUM, PERMIT_REV],
    );
    const wrong = await pool.query<{ name: string }>(
      `SELECT n.name FROM permits p JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id
        WHERE p.permit_num = $1 AND p.revision_num = $2`,
      [PERMIT_NUM, PERMIT_REV],
    );
    expect(correct.rows[0]!.name).not.toBe(wrong.rows[0]!.name);
  });
});
