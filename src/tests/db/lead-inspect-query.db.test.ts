// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (Cycle 7)
//             docs/specs/01-pipeline/83_lead_cost_model.md §3 (the dual-path
//             SOURCE_SQL pattern this test enforces consistency with)
//
// Real-DB integration test for fetchLeadInspect (admin Lead Detail Inspector).
//
// Why this test exists (WF2 2026-05-08):
//   WF2 #4 (commit 6683477) shipped the inspector with three SQL column
//   drifts that no existing test caught:
//     1. pb.area_sqm/pb.height_m read from parcel_buildings — those
//        columns live on building_footprints (PG 42703 at runtime)
//     2. parc.area_sqm read from parcels — should be lot_size_sqm
//     3. n.id = p.neighbourhood_id joined SERIAL vs city PK (silent miss)
//   All three slipped because admin-leads-inspect.infra.test.ts mocks
//   fetchLeadInspect AND admin-detail-inspectors.ui.test.tsx mocks the
//   API entirely. Only an integration test that exercises the actual
//   SQL against the real schema would have caught any of them.
//
//   Commit 73f3ae6 fixed all three. This test pins the contract so the
//   same class of regression (column drift / wrong join key) cannot land
//   silently again.
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set so the default
// `npm run test` doesn't fail when Docker isn't running locally.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { fetchLeadInspect } from '@/lib/leads/lead-inspect-query';

const pool = getTestPool();

// Test fixture identifiers — all prefixed `TEST 999700` so afterAll
// cleanup is targeted and concurrent tests are unaffected.
const PERMIT_NUM = 'TEST 999700';
const PERMIT_REV = '00';
const ADMIN_UID = 'inspect-test-admin-uid';
// parcels.parcel_id is VARCHAR(20); building_footprints.source_id is VARCHAR(50).
const PARCEL_SOURCE_ID = 'TST-PARC-999700';
const BUILDING_SOURCE_ID = 'TST-BUILDING-999700';
const NEIGHBOURHOOD_CITY_ID = 999700; // city open-data PK (INTEGER)

// Seeded geometry/cost values the assertions reference verbatim.
const SEED_LOT_SIZE_SQM = 500.50;
const SEED_FOOTPRINT_AREA_SQM = 200.25;
const SEED_MAX_HEIGHT_M = 12.75;
const SEED_AVG_HOUSEHOLD_INCOME = 87500;
const SEED_NEIGHBOURHOOD_NAME = 'Test Inspect Neighbourhood';
const SEED_ESTIMATED_COST = 1_250_000;

// Captured during seed so cleanup can target the SERIAL primary keys.
let parcelSerialId: number | null = null;
let buildingSerialId: number | null = null;
let neighbourhoodSerialId: number | null = null;

describe.skipIf(!dbAvailable())('fetchLeadInspect — live-DB regression-lock (WF2 #4 column-drift bug class)', () => {
  beforeAll(async () => {
    if (!pool) return;

    // 1. neighbourhoods — exercises the n.neighbourhood_id = p.neighbourhood_id
    //    join (NOT n.id; drift #3 from commit 73f3ae6).
    const nbRes = await pool.query<{ id: number }>(
      `INSERT INTO neighbourhoods (neighbourhood_id, name, avg_household_income, period_of_construction)
       VALUES ($1, $2, $3, '1971-1980')
       ON CONFLICT (neighbourhood_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [NEIGHBOURHOOD_CITY_ID, SEED_NEIGHBOURHOOD_NAME, SEED_AVG_HOUSEHOLD_INCOME],
    );
    neighbourhoodSerialId = nbRes.rows[0]!.id;

    // 2. parcels — exercises the parc.lot_size_sqm SELECT (NOT area_sqm; drift #2).
    const parcRes = await pool.query<{ id: number }>(
      `INSERT INTO parcels (parcel_id, lot_size_sqm, centroid_lat, centroid_lng)
       VALUES ($1, $2::float8, 43.65::float8, -79.38::float8)
       ON CONFLICT (parcel_id) DO UPDATE SET lot_size_sqm = EXCLUDED.lot_size_sqm
       RETURNING id`,
      [PARCEL_SOURCE_ID, SEED_LOT_SIZE_SQM],
    );
    parcelSerialId = parcRes.rows[0]!.id;

    // 3. building_footprints — exercises the bf.footprint_area_sqm /
    //    bf.max_height_m SELECT (post-fix columns; drift #1).
    //    geometry column is JSONB NOT NULL; a minimal Point is sufficient.
    const bfRes = await pool.query<{ id: number }>(
      `INSERT INTO building_footprints (source_id, geometry, footprint_area_sqm, max_height_m)
       VALUES ($1, '{"type":"Point","coordinates":[-79.38,43.65]}'::jsonb, $2::float8, $3::float8)
       ON CONFLICT (source_id) DO UPDATE SET footprint_area_sqm = EXCLUDED.footprint_area_sqm
       RETURNING id`,
      [BUILDING_SOURCE_ID, SEED_FOOTPRINT_AREA_SQM, SEED_MAX_HEIGHT_M],
    );
    buildingSerialId = bfRes.rows[0]!.id;

    // 4. parcel_buildings — exercises the LATERAL `building_id` fetch +
    //    the new LEFT JOIN building_footprints bf ON bf.id = pb.building_id.
    //    is_primary=true so the LATERAL ORDER BY is_primary DESC picks this row.
    await pool.query(
      `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, structure_type, confidence)
       VALUES ($1, $2, true, 'primary', 0.95)
       ON CONFLICT (parcel_id, building_id) DO NOTHING`,
      [parcelSerialId, buildingSerialId],
    );

    // 5. permits — primary row. permits.neighbourhood_id is a FK to
    //    neighbourhoods.id (SERIAL) per migration 109's fk_permits_neighbourhoods,
    //    NOT to neighbourhoods.neighbourhood_id (the city open-data PK).
    //    builder_name set to a recognizable token but entities table NOT seeded
    //    so the entity panel returns null cleanly (orthogonal to the drift bugs).
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, permit_type, structure_type,
                            status, builder_name, neighbourhood_id)
       VALUES ($1, $2, 'New Building', 'sfd',
               'Permit Issued', 'TEST INSPECT BUILDER', $3)
       ON CONFLICT (permit_num, revision_num) DO UPDATE
         SET neighbourhood_id = EXCLUDED.neighbourhood_id`,
      [PERMIT_NUM, PERMIT_REV, neighbourhoodSerialId],
    );

    // 6. permit_parcels — link permits → parcels.
    await pool.query(
      `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence)
       VALUES ($1, $2, $3, 'address', 0.95)
       ON CONFLICT (permit_num, revision_num, parcel_id) DO NOTHING`,
      [PERMIT_NUM, PERMIT_REV, parcelSerialId],
    );

    // 7. cost_estimates — exercises the ce LEFT JOIN. cost_source='permit'
    //    so the cost panel populates without needing the full Surgical chain.
    await pool.query(
      `INSERT INTO cost_estimates (permit_num, revision_num, estimated_cost,
                                   cost_source, cost_tier, premium_factor,
                                   complexity_score, model_version)
       VALUES ($1, $2, $3::float8, 'permit', 'large', 1.00, 50, 2)
       ON CONFLICT (permit_num, revision_num) DO UPDATE
         SET estimated_cost = EXCLUDED.estimated_cost`,
      [PERMIT_NUM, PERMIT_REV, SEED_ESTIMATED_COST],
    );
  });

  afterAll(async () => {
    if (!pool) return;

    // Reverse-order cleanup — FK CASCADE on permits handles cost_estimates +
    // permit_parcels rows that have ON DELETE CASCADE; for the rest we delete
    // explicitly to keep the test idempotent across re-runs.
    await pool.query(`DELETE FROM permit_parcels WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.query(`DELETE FROM cost_estimates WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.query(`DELETE FROM permits WHERE permit_num = $1`, [PERMIT_NUM]);
    if (parcelSerialId !== null && buildingSerialId !== null) {
      await pool.query(
        `DELETE FROM parcel_buildings WHERE parcel_id = $1 AND building_id = $2`,
        [parcelSerialId, buildingSerialId],
      );
    }
    if (buildingSerialId !== null) {
      await pool.query(`DELETE FROM building_footprints WHERE id = $1`, [buildingSerialId]);
    }
    if (parcelSerialId !== null) {
      await pool.query(`DELETE FROM parcels WHERE id = $1`, [parcelSerialId]);
    }
    if (neighbourhoodSerialId !== null) {
      await pool.query(`DELETE FROM neighbourhoods WHERE id = $1`, [neighbourhoodSerialId]);
    }
    await pool.end();
  });

  it('fetches the seeded permit without throwing (smoke — would 500 on any column drift)', async () => {
    if (!pool) return;
    const result = await fetchLeadInspect(pool, {
      permit_num: PERMIT_NUM,
      revision_num: PERMIT_REV,
      adminUid: ADMIN_UID,
    });
    expect(result).not.toBeNull();
    expect(result!.lead_id).toBe(`${PERMIT_NUM}--${PERMIT_REV}`);
    expect(result!.lead_type).toBe('permit');
  });

  it('populates spatial.parcel.area_sqm from parcels.lot_size_sqm (regression-lock for drift #2: parc.area_sqm)', async () => {
    if (!pool) return;
    const result = await fetchLeadInspect(pool, {
      permit_num: PERMIT_NUM,
      revision_num: PERMIT_REV,
      adminUid: ADMIN_UID,
    });
    expect(result!.spatial.parcel).not.toBeNull();
    // The query reads parc.lot_size_sqm aliased as parcel_area_sqm; the JS
    // mapper exposes it as spatial.parcel.area_sqm. Drift #2 (commit 73f3ae6)
    // had parc.area_sqm — column doesn't exist on parcels (mig 011 schema
    // exposes lot_size_sqm). PG 42703 surfaced via this exact path.
    expect(result!.spatial.parcel!.area_sqm).toBeCloseTo(SEED_LOT_SIZE_SQM, 2);
  });

  it('populates spatial.massing from building_footprints (regression-lock for drift #1: pb.area_sqm/height_m)', async () => {
    if (!pool) return;
    const result = await fetchLeadInspect(pool, {
      permit_num: PERMIT_NUM,
      revision_num: PERMIT_REV,
      adminUid: ADMIN_UID,
    });
    expect(result!.spatial.massing).not.toBeNull();
    // Drift #1 had pb.area_sqm/pb.height_m read directly from parcel_buildings;
    // those columns don't exist on that table (geometry lives on
    // building_footprints per mig 023). The fix added a LEFT JOIN
    // building_footprints bf and SELECTs bf.footprint_area_sqm / bf.max_height_m.
    expect(result!.spatial.massing!.area_sqm).toBeCloseTo(SEED_FOOTPRINT_AREA_SQM, 2);
    expect(result!.spatial.massing!.height_m).toBeCloseTo(SEED_MAX_HEIGHT_M, 2);
  });

  it('populates spatial.neighbourhood via FK-correct join n.id = p.neighbourhood_id (per mig 109)', async () => {
    if (!pool) return;
    const result = await fetchLeadInspect(pool, {
      permit_num: PERMIT_NUM,
      revision_num: PERMIT_REV,
      adminUid: ADMIN_UID,
    });
    // permits.neighbourhood_id is a FK to neighbourhoods.id (the SERIAL)
    // per migration 109 fk_permits_neighbourhoods. The earlier WF3 73f3ae6
    // commit's flip to n.neighbourhood_id caused a silent miss against this
    // FK — the join would still execute but resolve to the wrong row.
    //
    // The MainRow SELECT exposes p.neighbourhood_id as the spatial.neighbourhood.id
    // field, so it carries the SERIAL FK value (not the city open-data PK).
    // The user-facing identity is `name` + `avg_household_income`, both of
    // which come from the joined neighbourhoods row — those are the
    // assertions that actually catch the silent-miss bug class.
    expect(result!.spatial.neighbourhood).not.toBeNull();
    expect(result!.spatial.neighbourhood!.id).toBe(neighbourhoodSerialId);
    expect(result!.spatial.neighbourhood!.name).toBe(SEED_NEIGHBOURHOOD_NAME);
    expect(result!.spatial.neighbourhood!.avg_household_income).toBe(SEED_AVG_HOUSEHOLD_INCOME);
  });

  // ─── WF1 #B 2026-05-09 — lifecycle.timeline[] (closes Spec 84 bug 84-W4) ───

  it('populates lifecycle.timeline[] from permit_phase_transitions + phase_stay_calibration (WF1 #B)', async () => {
    if (!pool) return;

    // Seed: 2 transitions for the inspector-test permit (already inserted in
    // beforeAll). Also seed phase_stay_calibration cohort stats so the timeline's
    // upcoming entries get cohort_median_days populated.
    await pool.query(
      `DELETE FROM permit_phase_transitions WHERE permit_num = $1 AND revision_num = $2`,
      [PERMIT_NUM, PERMIT_REV],
    );
    await pool.query(
      `INSERT INTO permit_phase_transitions
         (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type)
       VALUES
         ($1, $2, NULL,           'P3', '2025-01-01T00:00:00.000Z'::timestamptz, 'New Building'),
         ($1, $2, 'P3',    'P7c',       '2025-12-01T00:00:00.000Z'::timestamptz, 'New Building')`,
      [PERMIT_NUM, PERMIT_REV],
    );

    // The seeded permit's permit_type was 'New Building' in beforeAll;
    // populate phase_stay_calibration for a few buckets so cohort fields land.
    await pool.query(
      `INSERT INTO phase_stay_calibration (permit_type, phase, median_days, p25_days, p75_days, sample_size)
       VALUES
         ('New Building', 'P3', 30, 14, 60, 1500),
         ('New Building', 'P7c',      45, 22, 87, 12000),
         ('New Building', 'P8',       30, 15, 60, 8000),
         ('New Building', 'P18',      30, 10, 60, 5000)
       ON CONFLICT (permit_type, phase) DO UPDATE
         SET median_days = EXCLUDED.median_days,
             p25_days = EXCLUDED.p25_days,
             p75_days = EXCLUDED.p75_days,
             sample_size = EXCLUDED.sample_size`,
    );

    // Set the permit's lifecycle_phase + phase_started_at so the inspector
    // can compute current_phase_days_in.
    await pool.query(
      `UPDATE permits
          SET lifecycle_phase = 'P7c',
              phase_started_at = '2025-12-01T00:00:00.000Z'::timestamptz,
              permit_type = 'New Building'
        WHERE permit_num = $1 AND revision_num = $2`,
      [PERMIT_NUM, PERMIT_REV],
    );

    const result = await fetchLeadInspect(pool, {
      permit_num: PERMIT_NUM,
      revision_num: PERMIT_REV,
      adminUid: ADMIN_UID,
    });
    expect(result).not.toBeNull();

    const timeline = (result as unknown as { lifecycle: { timeline: Array<{ phase: string; phase_name: string | null; status: 'completed' | 'current' | 'upcoming'; days_in_phase: number | null; cohort_median_days: number | null }> } }).lifecycle.timeline;

    // 1 completed + 1 current + ≥1 upcoming (per New Building canonical path)
    const completed = timeline.filter((e) => e.status === 'completed');
    const current = timeline.filter((e) => e.status === 'current');
    const upcoming = timeline.filter((e) => e.status === 'upcoming');

    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(current.length).toBe(1);
    expect(upcoming.length).toBeGreaterThanOrEqual(1);

    // P3 → P7c = 334 days (Jan 1 to Dec 1).
    expect(completed[0]!.phase).toBe('P3');
    expect(completed[0]!.phase_name).toBe('CoA Approved');
    expect(completed[0]!.days_in_phase).toBe(334);

    // Current = P7c, friendly name "Issued (Late)", cohort populated from
    // the seeded phase_stay_calibration row.
    expect(current[0]!.phase).toBe('P7c');
    expect(current[0]!.phase_name).toBe('Issued (Late)');
    expect(current[0]!.cohort_median_days).toBe(45);

    // First upcoming entry uses cohort_median_days as predicted days_in_phase.
    expect(upcoming[0]!.days_in_phase).toBe(upcoming[0]!.cohort_median_days);
  });

  it('lifecycle top-level fields populated: phase_name + current_phase_days_in + predicted_remaining_days (WF1 #B)', async () => {
    if (!pool) return;
    const result = await fetchLeadInspect(pool, {
      permit_num: PERMIT_NUM,
      revision_num: PERMIT_REV,
      adminUid: ADMIN_UID,
    });

    const lifecycle = (result as unknown as { lifecycle: { phase_name: string | null; current_phase_days_in: number | null; predicted_remaining_days: number | null } }).lifecycle;

    expect(lifecycle.phase_name).toBe('Issued (Late)');
    // current_phase_days_in = NOW - phase_started_at; phase_started_at was
    // 2025-12-01; today is 2026-05-09+ → 159+ days. Allow loose lower bound.
    expect(lifecycle.current_phase_days_in).toBeGreaterThan(150);
    // predicted_remaining_days = sum of upcoming entries' median_days; for
    // New Building canonical path with seeded calibration > 0.
    expect(lifecycle.predicted_remaining_days).toBeGreaterThan(0);
  });

  it('cleanup phase_stay_calibration test rows (afterAll-ish)', async () => {
    if (!pool) return;
    await pool.query(
      `DELETE FROM phase_stay_calibration WHERE permit_type = 'New Building' AND phase IN ('P3', 'P7c', 'P8', 'P18')`,
    );
  });
});
