// 🔗 SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 9
//             docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (write class), §5.1 (frozen shape)
//             docs/reports/defect-ledger.md (LP-D10 — see the ledger row this test locks)
//
// LP-D10 (WF6 output-panel finding, 2026-08-30) — fence `a21b7b01` (2026-04-01,
// "Prevents infinite re-evaluation of unmatchable permits ... Batch UPDATE
// parcel_linked_at = NOW() for ALL evaluated permits, regardless of match count")
// was DROPPED during commit 7's consolidation into LG-24's single transaction: it
// exists nowhere in the descriptor's `outputs.writes[]`, the compute, or
// `runLinkKeyedPhase`. The incremental filter (`parcel_linked_at IS NULL OR
// (geocoded_at IS NOT NULL AND parcel_linked_at < geocoded_at)`) depends on this
// write to ever EXCLUDE a no-match permit from re-evaluation — without it, the
// next incremental run touching an unmatchable permit re-processes it forever.
//
// `runLinkKeyedPhase` is called DIRECTLY (not via a spawned `node scripts/
// link-parcels.js` child) — the frozen shell's own `pipeline.step` wrapper
// asserts `descriptor.database.assert_current_database === "postgres"`
// (`resolve-db.js assertDbTarget`), which the ephemeral `BUILDO_TEST_DB=1`
// container (always named `buildo_test`) can never satisfy; that check lives in
// `runWithPool`, one layer OUTSIDE `runLinkKeyedPhase` itself, so calling the
// phase function directly is a legitimate, narrower unit of test (same DB writes,
// same transaction, same watermark statement) without fighting a guard that
// exists for a different, real reason (never run a converted step against the
// wrong database).
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/link-parcels-watermark.db.test.ts --no-file-parallelism

import path from 'node:path';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const stepIndex = require('../../../scripts/lib/step/index.js') as {
  runLinkKeyedPhase: (args: {
    descriptor: unknown; pool: Pool; compute: unknown; config: Record<string, number>;
    chainId: string; log: unknown; tag: string; clockNow: Date;
    preWriteGate?: undefined; ownRunId?: number;
  }) => Promise<{ written: Record<string, { rows_changed: number }> }>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pipelineLib = require('../../../scripts/lib/pipeline.js') as { log: unknown };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require('../../../scripts/link-parcels.descriptor.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../../scripts/lib/compute/link-parcels.js');

const FX = 'LPD10';

const CONFIG: Record<string, number> = {
  link_parcels_confidence_address_points_exact: 0.97,
  link_parcels_confidence_exact_address: 0.95,
  link_parcels_confidence_spatial_polygon: 0.90,
  link_parcels_confidence_name_only: 0.80,
  link_parcels_link_rate_warn_pct: 25,
  spatial_match_max_distance_m: 100,
  spatial_match_confidence: 0.65,
};

describe.skipIf(!dbAvailable())('LP-D10 — the parcel_linked_at watermark write (live DB)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool() as Pool;
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM permit_parcels WHERE permit_num LIKE '${FX}%'`);
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE '${FX}%'`);
    await pool.query(`DELETE FROM parcel_address_points WHERE address_point_id IN (900010001, 900010002)`);
    await pool.query(`DELETE FROM address_points WHERE address_point_id IN (900010001, 900010002)`);
    await pool.query(`DELETE FROM parcels WHERE parcel_id IN ('LPD10-TEST-MATCH', 'LPD10-STALE-1', 'LPD10-STALE-2')`);
  });

  const sq = (x0: number, y0: number, side: number): string => JSON.stringify({
    type: 'Polygon', coordinates: [[[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]]],
  });

  async function runOnce(clockNow: Date) {
    return stepIndex.runLinkKeyedPhase({
      descriptor, pool, compute, config: CONFIG, chainId: 'permits',
      log: pipelineLib.log, tag: '[link_parcels]', clockNow, ownRunId: -1,
    });
  }

  it('a permit engineered to match NOTHING still gets parcel_linked_at stamped (the fence\'s own reason to exist)', async () => {
    // No real address_points/parcels row anywhere matches this street name —
    // eligible for the incremental filter (street_num + street_name populated),
    // guaranteed zero matches across every strategy (no lat/lng either, so
    // Strategy 3 never even attempts a spatial fallback).
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, street_num, street_name, street_type, parcel_linked_at, geocoded_at)
       VALUES ($1, '00', '999999', 'NONEXISTENTSTREETLPD10XYZ', 'RD', NULL, NULL)`,
      [`${FX}-NOMATCH`],
    );

    // LG-24 zero-match cleanup branch (keep_parcel_id IS NULL): pre-seed a STALE
    // link this permit "used to have" (a throwaway dummy parcel — never actually
    // re-matchable via any strategy here), so the run exercises the DELETE, not
    // merely the watermark's own no-op-on-empty-set path.
    const staleFx = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       VALUES ('LPD10-STALE-1', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326))
       RETURNING id`,
      [sq(-79.5, 43.6, 0.0003)],
    );
    const staleParcelId = staleFx.rows[0].id as number;
    await pool.query(
      `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence, linked_at)
       VALUES ($1, '00', $2, 'spatial', 0.65, NOW())`,
      [`${FX}-NOMATCH`, staleParcelId],
    );

    const before = await pool.query(
      `SELECT parcel_linked_at FROM permits WHERE permit_num = $1 AND revision_num = '00'`,
      [`${FX}-NOMATCH`],
    );
    expect(before.rows[0].parcel_linked_at).toBeNull();

    const RUN_AT = new Date('2026-08-30T23:00:00.000Z');
    await runOnce(RUN_AT);

    const after = await pool.query(
      `SELECT parcel_linked_at FROM permits WHERE permit_num = $1 AND revision_num = '00'`,
      [`${FX}-NOMATCH`],
    );
    // THE ASSERTION: RED on the unfixed code (parcel_linked_at stays NULL forever
    // — the exact "infinite re-evaluation" fence a21b7b01 existed to prevent).
    expect(after.rows[0].parcel_linked_at, 'parcel_linked_at was never stamped — LP-D10 regression').not.toBeNull();
    expect(new Date(after.rows[0].parcel_linked_at as string).getTime()).toBe(RUN_AT.getTime());

    // Zero rows in permit_parcels for this permit — LG-24's zero-match cleanup
    // branch DELETEd the stale row, AND the watermark is not the same thing as a
    // match: a no-match permit gets marked EVALUATED, not LINKED.
    const linked = await pool.query(
      `SELECT count(*) FROM permit_parcels WHERE permit_num = $1 AND revision_num = '00'`,
      [`${FX}-NOMATCH`],
    );
    expect(Number(linked.rows[0].count)).toBe(0);
  });

  it('a permit that DOES match also gets parcel_linked_at stamped (both directions — the write is not only the no-match path)', async () => {
    const rdRes = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
         street_name_normalized, street_type_normalized, address_number, linear_name_full)
       VALUES ('LPD10-TEST-MATCH','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326),
         '77','LPD10MATCHST','RD','77','Lpd10matchst Rd')
       RETURNING id`,
      [sq(-79.2, 43.75, 0.0005)],
    );
    const parcelId = rdRes.rows[0].id as number;
    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, geom,
         addr_num_normalized, linear_name_normalized, maint_stage, address_status, address_class_desc)
       VALUES (900010001, 43.75, -79.2, ST_SetSRID(ST_MakePoint(-79.2,43.75),4326), '77','LPD10MATCHST','REGULAR','CURRENT','STRUCTURE')`,
    );
    await pool.query(
      `INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at) VALUES ($1, 900010001, NOW())`,
      [parcelId],
    );
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, street_num, street_name, street_type, parcel_linked_at, geocoded_at)
       VALUES ($1, '00', '77', 'LPD10MATCHST', 'RD', NULL, NULL)`,
      [`${FX}-MATCH`],
    );

    // LG-24 changed-match retraction branch (keep_parcel_id set, != the stale
    // row's own parcel_id): pre-seed a link to a DIFFERENT (wrong, throwaway
    // dummy) parcel, so the run must retract IT specifically while keeping the
    // correct new one — not merely insert alongside a stale row.
    const staleFx = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       VALUES ('LPD10-STALE-2', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326))
       RETURNING id`,
      [sq(-79.6, 43.6, 0.0003)],
    );
    const staleParcelId = staleFx.rows[0].id as number;
    await pool.query(
      `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence, linked_at)
       VALUES ($1, '00', $2, 'spatial', 0.65, NOW())`,
      [`${FX}-MATCH`, staleParcelId],
    );

    const RUN_AT = new Date('2026-08-30T23:05:00.000Z');
    await runOnce(RUN_AT);

    const after = await pool.query(
      `SELECT parcel_linked_at FROM permits WHERE permit_num = $1 AND revision_num = '00'`,
      [`${FX}-MATCH`],
    );
    expect(after.rows[0].parcel_linked_at).not.toBeNull();
    expect(new Date(after.rows[0].parcel_linked_at as string).getTime()).toBe(RUN_AT.getTime());

    // Exactly ONE row survives — the changed-match retraction DELETEd the stale
    // (wrong-parcel) row, the upsert wrote the correct one.
    const linked = await pool.query(
      `SELECT parcel_id, match_type FROM permit_parcels WHERE permit_num = $1 AND revision_num = '00'`,
      [`${FX}-MATCH`],
    );
    expect(linked.rows.length).toBe(1);
    expect(Number(linked.rows[0].parcel_id)).toBe(parcelId);
    expect(linked.rows[0].match_type).toBe('address_points_exact');
  });
});
