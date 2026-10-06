// 🔗 SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 9
//             docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (write class), §5.1 (frozen shape), §6.6.1
//             docs/reports/defect-ledger.md (LP-D10 — fence RETIRED by the O4 row 7 ruling, see below)
//
// O4 row 7 (operator ruling 2026-10-03, registry-truth folds 14 + 15) — RE-POINTED from the LP-D10 lock.
//
// What this file USED to pin (LP-D10, WF6 2026-08-30): fence `a21b7b01` (2026-04-01) — stamp
// permits.parcel_linked_at for EVERY evaluated permit, matched or not, so the incremental filter
// (`parcel_linked_at IS NULL OR (geocoded_at IS NOT NULL AND parcel_linked_at < geocoded_at)`) could
// EXCLUDE a no-match permit instead of re-evaluating it forever.
// Why that fence is retired, not dropped: under staleness.mode_select "none" (full_rescan) the mode is
// "full" on every run, so there is NO incremental filter — every permit is re-checked every run, and the
// fence's only reason (exclusion from the filter) is gone with it. Kept, it would rewrite ≈240K permits
// rows per run (and fire the permits BEFORE UPDATE trigger on each).
// What it pins NOW: parcel_linked_at is stamped ONLY when the permit's parcel link CHANGED this run —
//   T1 unchanged link             ⇒ NOT rewritten (parcel_linked_at and permit_parcels.linked_at stay RUN1);
//   T2 link moved to a new parcel ⇒ restamped;
//   T3 match_type/confidence-only change (same parcel) ⇒ restamped (the upsert's guard columns);
//   T4 link removed (no match any more) ⇒ restamped, the stale row deleted;
//   T5 a never-linked no-match permit ⇒ parcel_linked_at stays NULL (the retired fence's inverse).
// The watermark statement is `watermark_update_sql` in scripts/lib/compute/link-parcels.js
// (`pp.linked_at = $3` for an upsert written this run, OR the keys the keyed DELETE removed).
//
// `runLinkKeyedPhase` is called DIRECTLY (the narrower unit this file has always used: same DB writes,
// same batch transaction, same watermark statement). The descriptor overlay is the row-7 target shape
// seat B lands (mode_select "none"; the spatial FULL-only mass retraction retired) — the same overlay
// as src/tests/steps/link_parcels/o4-row7-stamp-changed.logic.test.ts; once the real descriptor carries
// it, the overlay is a no-op and can be dropped. `persistBeforeImageRows` is spied so the keyed DELETE's
// before-image never writes docs/reports/golden/link_parcels/before-image/*.jsonl into the working tree.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/link-parcels-watermark.db.test.ts --no-file-parallelism

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

/* eslint-disable @typescript-eslint/no-require-imports */
const stepIndex = require('../../../scripts/lib/step/index.js') as {
  runLinkKeyedPhase: (args: {
    descriptor: unknown; pool: Pool; compute: unknown; config: Record<string, number>;
    chainId: string; log: unknown; tag: string; clockNow: Date;
    preWriteGate?: undefined; ownRunId?: number;
  }) => Promise<{ gate: { mode: string; reason: string }; written: Record<string, { rows_changed: number }> }>;
};
const writeLib = require('../../../scripts/lib/step/write.js') as {
  persistBeforeImageRows: (rows: unknown[], table: string, slug: string, runAt: Date) => unknown;
};
const pipelineLib = require('../../../scripts/lib/pipeline.js') as { log: unknown };
const REAL = require('../../../scripts/link-parcels.descriptor.json');
const compute = require('../../../scripts/lib/compute/link-parcels.js');
/* eslint-enable @typescript-eslint/no-require-imports */

const FX = 'LPR7';
const AP_MATCH = 900070001;
const RUN1 = new Date('2026-10-03T10:00:00.000Z');
const RUN2 = new Date('2026-10-03T11:00:00.000Z');

const CONFIG: Record<string, number> = Object.freeze({
  link_parcels_confidence_address_points_exact: 0.97,
  link_parcels_confidence_exact_address: 0.95,
  link_parcels_confidence_spatial_polygon: 0.90,
  link_parcels_confidence_name_only: 0.80,
  link_parcels_link_rate_warn_pct: 25,
  spatial_match_max_distance_m: 100,
  spatial_match_confidence: 0.65,
});

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** The row-7 target descriptor shape (seat B lands the real edit) — guards and triggers stay REAL. */
function row7Descriptor() {
  const d = clone(REAL);
  d.staleness.mode_select = 'none';
  d.outputs.writes[0].retract = 'none';
  delete d.outputs.writes[0].retract_when;
  return d;
}

const sq = (x0: number, y0: number, side: number): string => JSON.stringify({
  type: 'Polygon', coordinates: [[[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]]],
});

describe.skipIf(!dbAvailable())('O4 row 7 — parcel_linked_at is stamped only when the permit\'s parcel link changed (live DB)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool() as Pool;
  });

  async function cleanup() {
    await pool.query(`DELETE FROM permit_parcels WHERE permit_num LIKE '${FX}%'`);
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE '${FX}%'`);
    await pool.query('DELETE FROM parcel_address_points WHERE address_point_id = $1', [AP_MATCH]);
    await pool.query('DELETE FROM address_points WHERE address_point_id = $1', [AP_MATCH]);
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE '${FX}-%'`);
  }

  beforeEach(async () => {
    vi.spyOn(writeLib, 'persistBeforeImageRows').mockImplementation(
      (rows: unknown[]) => ({ written: true, path: 'docs/reports/golden/link_parcels/before-image/stub.jsonl', rows: rows.length }),
    );
    await cleanup();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  async function runOnce(clockNow: Date, config: Record<string, number> = CONFIG) {
    const result = await stepIndex.runLinkKeyedPhase({
      descriptor: row7Descriptor(), pool, compute, config, chainId: 'permits',
      log: pipelineLib.log, tag: '[link_parcels]', clockNow, ownRunId: -1,
    });
    expect(result.gate.reason, 'mode_select "none" ⇒ every run is a full rescan').toBe('full_rescan');
    return result;
  }

  /**
   * A parcel reachable ONLY through the address-points bridge: it carries street_type_normalized (the
   * bridge CTE's LP-D9 disambiguator) but no house number / street name, so the `exact` and `name_only`
   * strategies can never match it — removing the bridge row therefore removes the permit's only match.
   */
  async function addParcel(parcelId: string, x0: number, y0: number): Promise<number> {
    const r = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, street_type_normalized)
       VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), 'RD')
       RETURNING id`,
      [parcelId, sq(x0, y0, 0.0005)],
    );
    return Number(r.rows[0].id);
  }

  /** P-MATCH (77 LPR7MATCHST RD) resolves to `parcelId` through the address-points bridge. */
  async function seedMatchablePermit(parcelId: number) {
    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, geom,
         addr_num_normalized, linear_name_normalized, maint_stage, address_status, address_class_desc)
       VALUES ($1, 43.75, -79.2, ST_SetSRID(ST_MakePoint(-79.2,43.75),4326), '77','LPR7MATCHST','REGULAR','CURRENT','STRUCTURE')`,
      [AP_MATCH],
    );
    await pool.query(
      'INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at) VALUES ($1, $2, NOW())',
      [parcelId, AP_MATCH],
    );
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, street_num, street_name, street_type, parcel_linked_at, geocoded_at)
       VALUES ($1, '00', '77', 'LPR7MATCHST', 'RD', NULL, NULL)`,
      [`${FX}-MATCH`],
    );
  }

  async function stampOf(permitNum: string): Promise<number | null> {
    const r = await pool.query(
      `SELECT parcel_linked_at FROM permits WHERE permit_num = $1 AND revision_num = '00'`,
      [permitNum],
    );
    const v = r.rows[0].parcel_linked_at;
    return v === null ? null : new Date(v).getTime();
  }

  async function linksOf(permitNum: string) {
    const r = await pool.query(
      `SELECT parcel_id, match_type, confidence::text AS confidence, linked_at FROM permit_parcels
        WHERE permit_num = $1 AND revision_num = '00' ORDER BY parcel_id`,
      [permitNum],
    );
    return r.rows.map((row) => ({
      parcel_id: Number(row.parcel_id),
      match_type: row.match_type as string,
      confidence: row.confidence as string,
      linked_at: new Date(row.linked_at).getTime(),
    }));
  }

  /** Run 1: P-MATCH's link is NEW ⇒ stamped RUN1 — the baseline T1–T4 start from. */
  async function baseline(): Promise<number> {
    const parcelId = await addParcel(`${FX}-MATCH`, -79.2, 43.75);
    await seedMatchablePermit(parcelId);
    await runOnce(RUN1);
    expect(await stampOf(`${FX}-MATCH`), 'a new link is a changed link').toBe(RUN1.getTime());
    const links = await linksOf(`${FX}-MATCH`);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ parcel_id: parcelId, match_type: 'address_points_exact', linked_at: RUN1.getTime() });
    return parcelId;
  }

  it('T1 — an UNCHANGED link is not rewritten: parcel_linked_at and permit_parcels.linked_at stay at run 1', async () => {
    const parcelId = await baseline();
    await runOnce(RUN2);
    expect(await stampOf(`${FX}-MATCH`), 'full rescan re-checked the permit but its link did not change').toBe(RUN1.getTime());
    const links = await linksOf(`${FX}-MATCH`);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ parcel_id: parcelId, linked_at: RUN1.getTime() });
  });

  it('T2 — a link MOVED to a different parcel is restamped (upsert of the new row + keyed delete of the old)', async () => {
    const oldParcel = await baseline();
    const newParcel = await addParcel(`${FX}-MOVED`, -79.21, 43.76);
    await pool.query('UPDATE parcel_address_points SET parcel_id = $1 WHERE address_point_id = $2', [newParcel, AP_MATCH]);
    await runOnce(RUN2);
    expect(await stampOf(`${FX}-MATCH`)).toBe(RUN2.getTime());
    const links = await linksOf(`${FX}-MATCH`);
    expect(links, 'exactly one row survives — the new parcel; the old row was deleted').toHaveLength(1);
    expect(links[0]).toMatchObject({ parcel_id: newParcel, linked_at: RUN2.getTime() });
    expect(links[0]!.parcel_id).not.toBe(oldParcel);
  });

  it('T3 — a match_type/confidence-only change on the SAME parcel is restamped (the upsert guard columns)', async () => {
    const parcelId = await baseline();
    await runOnce(RUN2, { ...CONFIG, link_parcels_confidence_address_points_exact: 0.96 });
    expect(await stampOf(`${FX}-MATCH`)).toBe(RUN2.getTime());
    const links = await linksOf(`${FX}-MATCH`);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ parcel_id: parcelId, match_type: 'address_points_exact', confidence: '0.96', linked_at: RUN2.getTime() });
  });

  it('T4 — a REMOVED link (the permit matches nothing any more) is restamped and the stale row deleted', async () => {
    await baseline();
    await pool.query('DELETE FROM parcel_address_points WHERE address_point_id = $1', [AP_MATCH]);
    await runOnce(RUN2);
    expect(await stampOf(`${FX}-MATCH`), 'the keyed DELETE removed its link — a changed link').toBe(RUN2.getTime());
    expect(await linksOf(`${FX}-MATCH`)).toHaveLength(0);
  });

  it('T5 — a never-linked permit that matches nothing keeps parcel_linked_at NULL (LP-D10 fence retired under full_rescan)', async () => {
    // No address point / parcel anywhere matches this street; no lat/lng, so no spatial fallback either.
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, street_num, street_name, street_type, parcel_linked_at, geocoded_at)
       VALUES ($1, '00', '999999', 'NONEXISTENTSTREETLPR7XYZ', 'RD', NULL, NULL)`,
      [`${FX}-NOMATCH`],
    );
    await runOnce(RUN1);
    expect(await stampOf(`${FX}-NOMATCH`), 'no link before, no link after — nothing changed, nothing stamped').toBeNull();
    expect(await linksOf(`${FX}-NOMATCH`)).toHaveLength(0);
  });
});
