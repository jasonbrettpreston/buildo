// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7
//             docs/specs/02-web-admin/86_control_panel.md §4 (chain step 21.5)
//
// Layer 2 live-DB regression-lock for the phase_stay_calibration computation
// pipeline. Seeds 50 transitions across (permit_type='TEST-PHASE-CAL',
// phase='P7c') with known durations [10, 20, 30, ..., 500]; runs the SAME
// PERCENTILE_CONT SQL the script uses; asserts median ≈ 255, p25 ≈ 130,
// p75 ≈ 380 within ±5%.
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

const TEST_PERMIT_TYPE = 'TEST-PHASE-CAL';
const TEST_PHASE = 'P7c';
const PERMIT_NUM_PREFIX = 'TEST 99CAL';
const PERMIT_REV = '00';

// 50 phase durations: 10, 20, 30, ..., 500 days. Median = 255, p25 = 130,
// p75 = 380 (per PERCENTILE_CONT continuous interpolation).
const KNOWN_DURATIONS_DAYS = Array.from({ length: 50 }, (_, i) => (i + 1) * 10);

describe.skipIf(!dbAvailable())('phase_stay_calibration percentile pipeline — live-DB regression-lock (WF1 #B 2026-05-09)', () => {
  beforeAll(async () => {
    if (!pool) return;

    // Need a host permit row for the FK chain — but permit_phase_transitions
    // doesn't FK back to permits; transitions require permit_num/revision_num
    // strings only. Seed 50 permits + 50 paired transitions per duration.
    const baseAt = Date.parse('2024-01-01T00:00:00.000Z');
    for (let i = 0; i < KNOWN_DURATIONS_DAYS.length; i++) {
      const permit_num = `${PERMIT_NUM_PREFIX}${String(i).padStart(3, '0')}`;
      const enteredAt = new Date(baseAt + i * 1000); // each permit's entry slightly different
      const exitedAt = new Date(enteredAt.getTime() + KNOWN_DURATIONS_DAYS[i]! * 86400_000);

      await pool.query(
        `INSERT INTO permits (permit_num, revision_num, permit_type, status)
         VALUES ($1, $2, $3, 'TEST')
         ON CONFLICT (permit_num, revision_num) DO UPDATE SET permit_type = EXCLUDED.permit_type`,
        [permit_num, PERMIT_REV, TEST_PERMIT_TYPE],
      );

      // Two transitions per permit so the LAG can compute a duration:
      // (null → P7c) at enteredAt, (P7c → P18) at exitedAt.
      // The duration of P7c = exitedAt - enteredAt = KNOWN_DURATIONS_DAYS[i]
      await pool.query(
        `DELETE FROM permit_phase_transitions WHERE permit_num = $1 AND revision_num = $2`,
        [permit_num, PERMIT_REV],
      );
      await pool.query(
        `INSERT INTO permit_phase_transitions
           (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type)
         VALUES
           ($1, $2, NULL, $3, $4, $5),
           ($1, $2, $3, 'P18', $6, $5)`,
        [permit_num, PERMIT_REV, TEST_PHASE, enteredAt.toISOString(), TEST_PERMIT_TYPE, exitedAt.toISOString()],
      );
    }
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(
      `DELETE FROM permit_phase_transitions WHERE permit_num LIKE $1`,
      [`${PERMIT_NUM_PREFIX}%`],
    );
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE $1`, [`${PERMIT_NUM_PREFIX}%`]);
    await pool.end();
  });

  it('PERCENTILE_CONT computes median ≈ 255 days for the seeded fixture (±5%)', async () => {
    if (!pool) return;
    // Run the same SQL pattern compute-phase-calibration.js will use.
    // Scoped to the test fixture's permit_type so we don't mix with real data.
    const r = await pool.query<{ median_days: string; p25_days: string; p75_days: string; sample_size: string }>(
      `WITH transitions_with_duration AS (
         SELECT
           permit_num, revision_num, permit_type, from_phase,
           transitioned_at - LAG(transitioned_at) OVER (
             PARTITION BY permit_num, revision_num ORDER BY transitioned_at
           ) AS phase_duration
         FROM permit_phase_transitions
         WHERE permit_type = $1
       )
       SELECT
         PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM phase_duration) / 86400.0)::INTEGER AS median_days,
         PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM phase_duration) / 86400.0)::INTEGER AS p25_days,
         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM phase_duration) / 86400.0)::INTEGER AS p75_days,
         COUNT(*)::INTEGER AS sample_size
       FROM transitions_with_duration
       WHERE from_phase IS NOT NULL AND phase_duration IS NOT NULL`,
      [TEST_PERMIT_TYPE],
    );

    expect(r.rowCount).toBe(1);
    const median = Number(r.rows[0]!.median_days);
    const p25 = Number(r.rows[0]!.p25_days);
    const p75 = Number(r.rows[0]!.p75_days);
    const n = Number(r.rows[0]!.sample_size);

    expect(n).toBe(50); // 50 transitions with non-null phase_duration

    // Median of [10, 20, ..., 500] = 255. PostgreSQL PERCENTILE_CONT linear-interpolates.
    expect(median).toBeGreaterThan(255 * 0.95);
    expect(median).toBeLessThan(255 * 1.05);

    // p25 of [10..500] = 132.5 (interpolated). Allow ±5%.
    expect(p25).toBeGreaterThan(125);
    expect(p25).toBeLessThan(140);

    // p75 of [10..500] = 377.5. Allow ±5%.
    expect(p75).toBeGreaterThan(370);
    expect(p75).toBeLessThan(385);
  });
});
