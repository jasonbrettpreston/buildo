// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (v1.0) §2, §3, §5
// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2 step 5-6, §3c (stamp heal — 2026-10-06 HIGH)
//
// Live-DB integration test for Spec 65 enrich-parcels — migration 165 schema +
// the script's set-based spatial enrichment, against real PostGIS. Skipped unless
// DATABASE_URL (CI) or BUILDO_TEST_DB=1 (local testcontainer) is set; the harness
// applies migrations 001..165 before this runs.
//
// Exercises the bug-classes mocked-pool tests are blind to (all inside one
// BEGIN/ROLLBACK so no fixture cleanup is needed; temp tables drop on rollback):
//   - 36 columns exist live with the right types
//   - single-zone parcel: dominant identity + overlay-sourced height/coverage (D4)
//   - boundary parcel: every base parameter from the dominant zone (E1, Spec 69 R-ZV) + conflict counted
//   - gap parcel (no intersecting zone) → all-NULL, counted (not a failure)
//   - ambiguity flag when dominant share < 0.60
//   - idempotent re-run updates 0 rows (IS DISTINCT FROM write-guard)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// RE-POINTED — WF3 C2 (`.cursor/wf3_test_db_suite_red_active_task.md`, 2026-09-21). The
// ENRICHER conversion retired `scripts/enrich-parcels.js`'s function-export surface (now a
// 41-line `pipeline.step()` shim exporting only `{descriptor, compute, run}`); `enrichParcels`
// -> `runPass1` and `assertPreconditions` -> `assertRequirements` both moved. See
// `./_lib/enrich-parcels-harness.js` for the ctx/config bridge (built from the SAME
// `resolveConfig()` the real runner uses) and the exact successor mapping.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichParcels, assertPreconditions, compute } = require('./_lib/enrich-parcels-harness');

const TEST_PARCEL = 990_000_000; // test parcel_id range — isolated by ROLLBACK
const TEST_SRC = 990_000_000;    // test source_id range for zoning fixtures
// parcels.parcel_id is VARCHAR(20) (mig 011 — the text business key, NOT the integer
// PK parcels.id), so `parcel_id >= 990000000` errors with "character varying >= integer".
// Scope by the fixtures' own feature_type='TEST' marker (set in insParcel) AND the 990-id
// prefix (insParcel ids are TEST_PARCEL+N = '990…') — two type-safe axes so the exact-count
// assertions can't be inflated by any future test that commits a 'TEST' parcel without ROLLBACK.
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '990%'`;

// GeoJSON axis-aligned square helper [x0,y0]-[x1,y1] near (0,0), far from Toronto.
function box(x0: number, y0: number, x1: number, y1: number): string {
  return JSON.stringify({
    type: 'Polygon',
    coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
  });
}

async function insBase(
  c: PoolClient, sid: number, zn: string,
  fsi: number | null, units: number | null, frontage: number | null, g: string,
  // E1 (Spec 69 R-ZV): optional trailing extras — extra zoning_bylaw_areas columns
  // (e.g. density_max, pct_office_max, standard_setback) appended AFTER $7, so the
  // existing $7 geometry casts are untouched and prior call sites stay unchanged.
  extra: Record<string, number | null> = {},
) {
  const extraCols = Object.keys(extra);
  const extraVals = extraCols.map((k) => extra[k]);
  const extraColSql = extraCols.length ? `, ${extraCols.join(', ')}` : '';
  const extraParamSql = extraCols.map((_, i) => `$${8 + i}`).join(', ');
  const extraValueSql = extraCols.length ? `, ${extraParamSql}` : '';
  await c.query(
    // $7 is bound to BOTH the JSONB `geometry` column and the text arg of
    // ST_GeomFromGeoJSON — without explicit casts PG cannot deduce one param type
    // ("inconsistent types deduced for parameter $7"). Cast each site (text -> jsonb /
    // text -> text) so $7 resolves to text and both uses are valid. Data unchanged.
    `INSERT INTO zoning_bylaw_areas
       (source_id, zn_zone, zn_string, fsi_max, units_max, frontage_min_m, geometry, geom, source_dataset_version${extraColSql})
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7::text),4326)), NOW()${extraValueSql})`,
    [sid, zn, `${zn} (test)`, fsi, units, frontage, g, ...extraVals],
  );
}
async function insOverlay(c: PoolClient, table: string, cols: string, vals: unknown[], g: string) {
  // geom is the last positional ($N) — wrapped in ST_Multi for the MultiPolygon column.
  const n = vals.length + 1;
  await c.query(
    // $${n} feeds both the JSONB `geometry` column and ST_GeomFromGeoJSON — cast each
    // site so PG can deduce the param type (see insBase). Data unchanged.
    `INSERT INTO ${table} (${cols}, geometry, geom, source_dataset_version)
     VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')}, $${n}::jsonb, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${n}::text),4326)), NOW())`,
    [...vals, g],
  );
}
async function insParcel(c: PoolClient, pid: number, g: string) {
  await c.query(
    // $2 feeds both the JSONB `geometry` column and ST_GeomFromGeoJSON — cast each
    // site so PG can deduce the param type (see insBase). Data unchanged.
    `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
     VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326))`,
    [pid, g],
  );
}
async function getParcel(c: PoolClient, pid: number) {
  const { rows } = await c.query(`SELECT * FROM parcels WHERE parcel_id = $1`, [pid]);
  return rows[0];
}
// Stamp-heal helper — moves a parcel's geometry. Migration 242's
// trg_parcels_geom_invalidation (BEFORE UPDATE OF geom, geometry) NULLs
// zoning_enriched_at whenever geom moves, which is the mechanism the stamp heal observes.
async function shiftParcel(c: PoolClient, pid: number, g: string) {
  await c.query(
    // $2 feeds both the JSONB `geometry` column and ST_GeomFromGeoJSON — cast each
    // site so PG can deduce the param type (see insParcel). Data unchanged.
    `UPDATE parcels SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), geometry = $2::jsonb
      WHERE parcel_id = $1`,
    [pid, g],
  );
}
async function scopeCount(c: PoolClient, where: string) {
  const { rows } = await c.query(
    `SELECT count(*)::int AS n FROM parcels p WHERE ${SCOPE} AND p.geom IS NOT NULL AND (${where})`,
  );
  return Number(rows[0].n);
}

const SELF = 'enrich_parcels';
const PRODUCER = 'load_zoning';
/** Insert one ledger row inside the caller's txn; offsets are SQL intervals relative to now(), e.g. '1 day'. */
async function insRun(
  c: PoolClient, pipeline: string, status: string,
  startedOffset: string, completedOffset: string | null, meta: unknown = {},
): Promise<number> {
  const { rows } = await c.query(
    `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
     VALUES ($1, $2, now() + $3::interval, CASE WHEN $4::text IS NULL THEN NULL ELSE now() + $4::interval END, $5::jsonb)
     RETURNING id`,
    [pipeline, status, startedOffset, completedOffset, meta === null ? null : JSON.stringify(meta)],
  );
  return rows[0].id as number;
}
/** Pass 1's live incremental scope over the fixture, under the ledger answer the run would read. */
async function ledgerScopeCount(c: PoolClient): Promise<number> {
  const zc = await compute.readZoningChange(c);
  return scopeCount(c, compute.buildPass1ScopeWhere({ full: false, zoningChanged: zc.changed }));
}
const WROTE = { gate: { gated_skip: false }, zoning_rows_changed: 1 };

describe.skipIf(!dbAvailable())('Spec 65 enrich-parcels — live DB (migration 165 + engine)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => { /* rollback-per-test isolation; pool closed by harness */ });

  it('migration 165 added all 36 zoning columns to parcels', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='parcels'
         AND (column_name LIKE 'bylaw_%' OR column_name LIKE 'zoning_%'
              OR column_name IN ('exception_number','exception_text','bylaw_chapter','bylaw_section',
                  'bylaw_exception_ref','zone_status','in_policy_area','on_policy_road',
                  'in_rooming_house_overlay','in_parking_zone_overlay','in_building_setback_overlay',
                  'on_priority_retail','in_queenstw_eat_overlay'))`,
    );
    expect(rows.length).toBe(36);
  });

  it('assertPreconditions passes (GIST on parcels.geom + PostGIS present)', async () => {
    const c = await pool.connect();
    try { await expect(assertPreconditions(c)).resolves.not.toThrow(); }
    finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
  });

  it('enriches single-zone, boundary, gap, and ambiguous parcels correctly', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Two adjacent base zones: A=[0,0]-[10,10] (RD, fsi 2), B=[10,0]-[20,10] (CR, fsi 3).
      await insBase(c, TEST_SRC + 1, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
      await insBase(c, TEST_SRC + 2, 'CR', 3.0, 50, 9, box(10, 0, 20, 10));
      // Overlays covering the whole area.
      await insOverlay(c, 'zoning_height_overlay',
        'source_id, height_max_m, ht_stories', [TEST_SRC + 3, 15.0, 5], box(0, 0, 20, 20));
      await insOverlay(c, 'zoning_lot_coverage_overlay',
        'source_id, coverage_max_pct_override', [TEST_SRC + 4, 45.0], box(0, 0, 20, 20));
      await insOverlay(c, 'zoning_policy_area_overlay',
        'source_id, policy_id', [TEST_SRC + 5, 'P1'], box(0, 0, 20, 20));

      await insParcel(c, TEST_PARCEL + 1, box(1, 1, 2, 2));         // fully in A
      await insParcel(c, TEST_PARCEL + 2, box(8, 1, 11, 2));        // straddle: 2/3 in A
      await insParcel(c, TEST_PARCEL + 3, box(50, 50, 51, 51));     // gap (no zone)
      await insParcel(c, TEST_PARCEL + 4, box(9.4, 1, 10.6, 2));    // ~50/50 straddle → ambiguous

      const res = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
      expect(res.updated).toBeGreaterThanOrEqual(3);
      expect(res.gaps).toBeGreaterThanOrEqual(1);

      // P1 — single zone A + overlays
      const p1 = await getParcel(c, TEST_PARCEL + 1);
      expect(p1.zoning_class).toBe('RD');
      expect(Number(p1.bylaw_max_fsi)).toBe(2.0);
      expect(Number(p1.bylaw_max_height_m)).toBe(15.0);   // overlay replaces base (D4)
      expect(Number(p1.bylaw_max_stories)).toBe(5);
      expect(Number(p1.bylaw_max_coverage_pct)).toBe(45.0);
      expect(p1.in_policy_area).toBe(true);
      expect(Number(p1.zoning_dominant_area_share)).toBeCloseTo(1.0, 3);
      expect(p1.zoning_is_ambiguous).toBe(false);

      // P2 — boundary, dominant A: every base parameter from the dominant zone (E1)
      const p2 = await getParcel(c, TEST_PARCEL + 2);
      expect(p2.zoning_class).toBe('RD');
      expect(Number(p2.bylaw_max_fsi)).toBe(2.0);            // dominant(A)=2 (WF3; coincides with old MIN(2,3) here)
      expect(Number(p2.bylaw_min_frontage_m)).toBe(6.0);    // E1 (R-ZV): dominant zone A's frontage — DEC-1 most-restrictive MAX retired
      expect(p2.zoning_is_ambiguous).toBe(false);           // ~0.667 share

      // P3 — gap parcel: all zoning NULL
      const p3 = await getParcel(c, TEST_PARCEL + 3);
      expect(p3.zoning_class).toBeNull();
      expect(p3.bylaw_max_fsi).toBeNull();

      // P4 — ~50/50 straddle → ambiguous
      const p4 = await getParcel(c, TEST_PARCEL + 4);
      expect(p4.zoning_is_ambiguous).toBe(true);
      expect(Number(p4.zoning_dominant_area_share)).toBeLessThan(0.6);

      await c.query('ROLLBACK');
    } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
  });

  // WF3 phase C: height-overlay weld + spillover. Storeys must come from the SAME (min-height) overlay row,
  // and edge-only contacts must be dropped (NOT ST_Touches) so a mid-rise neighbour doesn't leak its storeys.
  it('WF3 — height/storey pairing: spillover dropped, straddle min-height paired, generous-height unchanged', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insBase(c, TEST_SRC + 30, 'RD', 1.0, 10, 6, box(0, 0, 100, 100)); // base zone covers all

      // Parcel A: 100%-covered by a real HT 9.0 (ht_stories NULL) + EDGE-TOUCHED by a mid-rise HT 20/ST 6.
      await insOverlay(c, 'zoning_height_overlay', 'source_id, height_max_m, ht_stories', [TEST_SRC + 31, 9.0, null], box(0, 0, 10, 10));
      await insOverlay(c, 'zoning_height_overlay', 'source_id, height_max_m, ht_stories', [TEST_SRC + 32, 20.0, 6], box(2, 1, 5, 3)); // touches A's x=2 edge
      await insParcel(c, TEST_PARCEL + 30, box(1, 1, 2, 2));

      // Parcel B: genuinely straddles HT 16 (left) + HT 15/ST 5 (right) — both real area coverage.
      await insOverlay(c, 'zoning_height_overlay', 'source_id, height_max_m, ht_stories', [TEST_SRC + 33, 16.0, null], box(15, 0, 21, 10));
      await insOverlay(c, 'zoning_height_overlay', 'source_id, height_max_m, ht_stories', [TEST_SRC + 34, 15.0, 5], box(21, 0, 25, 10));
      await insParcel(c, TEST_PARCEL + 31, box(20, 1, 22, 2));

      // Parcel C: a genuine generous-height single overlay HT 11.5 / ST 2 (5.75 m/storey is REAL low-density zoning).
      await insOverlay(c, 'zoning_height_overlay', 'source_id, height_max_m, ht_stories', [TEST_SRC + 35, 11.5, 2], box(35, 0, 45, 10));
      await insParcel(c, TEST_PARCEL + 32, box(40, 1, 42, 2));

      await enrichParcels(c, { scopeWhere: SCOPE, full: true });

      const a = await getParcel(c, TEST_PARCEL + 30);
      expect(Number(a.bylaw_max_height_m)).toBe(9.0);   // real covering overlay
      expect(a.bylaw_max_stories).toBeNull();            // spillover ST 6 dropped, NOT welded onto 9m

      const b = await getParcel(c, TEST_PARCEL + 31);
      expect(Number(b.bylaw_max_height_m)).toBe(15.0);  // most-restrictive (min) height
      expect(Number(b.bylaw_max_stories)).toBe(5);       // ITS storeys (paired), not from the 16m row

      const cc = await getParcel(c, TEST_PARCEL + 32);
      expect(Number(cc.bylaw_max_height_m)).toBe(11.5);  // genuine generous-height row UNCHANGED
      expect(Number(cc.bylaw_max_stories)).toBe(2);

      await c.query('ROLLBACK');
    } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
  });

  // WF3 regression lock (Spec 65 DEC-1): bylaw_max_fsi is sourced from the DOMINANT zone, not MIN.
  // The old 'min' rule let Postgres MIN(NULL, 2.0)=2.0 borrow FSI from a sliver-touching zone onto a
  // dominantly-RD parcel whose own zone had no FSI cap. Three distinguishing cases + the B2 source guard.
  it('WF3 — bylaw_max_fsi from dominant zone (min→dominant) + B2 source-plausibility guard', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Zone grid (lon far from Toronto; valid lat). Z1 is a real RD with NO FSI cap (fsi NULL).
      await insBase(c, TEST_SRC + 11, 'RD', null, 10, 6, box(60, 40, 70, 50)); // Z1 dominant, NULL fsi
      await insBase(c, TEST_SRC + 12, 'CR', 2.0, 50, 9, box(70, 40, 80, 50));  // Z2 sliver, fsi 2.0
      await insBase(c, TEST_SRC + 13, 'CR', 3.0, 50, 9, box(60, 30, 70, 40));  // Z3 dominant, fsi 3.0
      await insBase(c, TEST_SRC + 14, 'RD', 2.0, 10, 6, box(70, 30, 80, 40));  // Z4 minor, fsi 2.0
      await insBase(c, TEST_SRC + 15, 'RD', 15.0, 10, 6, box(60, 20, 70, 30)); // Z5 CORRUPT RD fsi 15

      // (i) un-ambiguous sliver: 95% Z1(NULL) + 5% Z2(2.0) → NULL, NOT the borrowed 2.0.
      await insParcel(c, TEST_PARCEL + 11, box(60.5, 41, 70.5, 42));
      // (ii) ambiguous ~52/48 toward Z1(NULL) + Z2(2.0) → dominant Z1 → NULL (accepted outcome).
      await insParcel(c, TEST_PARCEL + 12, box(68.9, 41, 71, 42));
      // (iii) dual-non-NULL DISAGREEING: 2/3 Z3(3.0) + 1/3 Z4(2.0) → dominant=3.0, NOT MIN=2.0.
      await insParcel(c, TEST_PARCEL + 13, box(68, 31, 71, 32));
      // (guard) fully inside corrupt RD fsi=15 → nulled by B2 → NULL + counted.
      await insParcel(c, TEST_PARCEL + 14, box(62, 21, 68, 29));

      const res = await enrichParcels(c, { scopeWhere: SCOPE, full: true });

      // (i) sliver — dominant NULL zone governs; FSI is NOT borrowed from the sliver.
      const g1 = await getParcel(c, TEST_PARCEL + 11);
      expect(g1.zoning_class).toBe('RD');
      expect(g1.bylaw_max_fsi).toBeNull();                  // old 'min' would have borrowed 2.0
      expect(g1.zoning_is_ambiguous).toBe(false);

      // (ii) ambiguous — dominant NULL zone still governs FSI (ambiguity flagged separately).
      const g2 = await getParcel(c, TEST_PARCEL + 12);
      expect(g2.zoning_is_ambiguous).toBe(true);
      expect(g2.bylaw_max_fsi).toBeNull();

      // (iii) the load-bearing case — dominant zone's HIGHER FSI wins over the lower secondary.
      const g3 = await getParcel(c, TEST_PARCEL + 13);
      expect(g3.zoning_class).toBe('CR');
      expect(Number(g3.bylaw_max_fsi)).toBe(3.0);           // dominant(3.0), NOT MIN(2,3)=2.0

      // (guard) corrupt residential fsi_max > 10 nulled at source + surfaced in the audit count.
      const g4 = await getParcel(c, TEST_PARCEL + 14);
      expect(g4.zoning_class).toBe('RD');
      expect(g4.bylaw_max_fsi).toBeNull();
      expect(res.fsiSourceNulled).toBeGreaterThanOrEqual(1);

      await c.query('ROLLBACK');
    } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
  });

  it('is idempotent — a second full pass updates 0 rows, INCLUDING multi-zone parcels', async () => {
    // Regression lock: a multi-zone parcel's zoning_dominant_area_share is a
    // fraction (e.g. 0.6667). If the temp-table column is float8 but parcels is
    // NUMERIC(5,4), the IS DISTINCT FROM guard compares unequal every run and the
    // parcel never reaches its fixed point. A single-zone parcel (share=1.0) would
    // not catch this — so this fixture MUST straddle two zones.
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insBase(c, TEST_SRC + 1, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
      await insBase(c, TEST_SRC + 2, 'CR', 3.0, 50, 9, box(10, 0, 20, 10));
      await insParcel(c, TEST_PARCEL + 1, box(1, 1, 2, 2));     // single zone
      await insParcel(c, TEST_PARCEL + 2, box(8, 1, 11, 2));    // multi-zone (2/3 vs 1/3)
      const r1 = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
      expect(r1.updated).toBe(2);
      // Verify the multi-zone parcel actually has a fractional share (not 1.0).
      const p2 = await getParcel(c, TEST_PARCEL + 2);
      expect(Number(p2.zoning_dominant_area_share)).toBeGreaterThan(0.5);
      expect(Number(p2.zoning_dominant_area_share)).toBeLessThan(1.0);
      await new Promise((r) => setTimeout(r, 5));
      const r2 = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
      expect(r2.updated).toBe(0); // <-- the regression: was = multi-zone count before the round() fix
      expect(r2.stampOnly, 'L6 [FOLD DS-6] — the run-clock stamp is rewritten on every recomputed parcel (declared_drift) without feeding updated').toBe(2);
      await c.query('ROLLBACK');
    } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
  });

  describe('stamp heal — 2026-10-06 HIGH', () => {
    // L1 — RED today: the trigger-NULLed stamp stays NULL (runPass1 only writes
    // zoning_enriched_at inside the 35-column IS DISTINCT FROM guard).
    it('L1 — a trigger-NULLed stamp on a parcel whose zoning is unchanged heals on the next --full (stampOnly 1, updated 0)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 50, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
        await insParcel(c, TEST_PARCEL + 50, box(1, 1, 2, 2));
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        expect((await getParcel(c, TEST_PARCEL + 50)).zoning_enriched_at, 'run 1 must stamp a never-enriched parcel').not.toBeNull();
        await shiftParcel(c, TEST_PARCEL + 50, box(3, 3, 4, 4));
        expect((await getParcel(c, TEST_PARCEL + 50)).zoning_enriched_at, 'mig 242 geom trigger must NULL the stamp on a geom move').toBeNull();
        await new Promise((r) => setTimeout(r, 5));
        const r2 = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        expect(r2.updated).toBe(0);
        expect(r2.stampOnly).toBe(1);
        expect((await getParcel(c, TEST_PARCEL + 50)).zoning_enriched_at, 'RED today: the NULLed stamp must heal').not.toBeNull();
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // L2 — RED today: with the stamp NULL the parcel IS still in pass 1's incremental
    // scope (the OR's `zoning_enriched_at IS NULL` arm), so this locks the fence: a
    // full run legitimately empties the incremental scope.
    it('L2 — the same heal under an incremental run empties pass 1\'s fixture scope', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 51, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
        await insParcel(c, TEST_PARCEL + 51, box(1, 1, 2, 2));
        // lens E2 — insBase seeds source_dataset_version = NOW() (DB clock) while the
        // harness stamps the host clock, so a freshly-inserted zone's version can look
        // LATER than the stamp. Pin the fixture zones below any stamp so the only scope
        // arm that can match is the NULL-stamp one.
        // Since the zoning-change-scope WF3 the version pin is no longer load-bearing (pass 1 no longer reads source_dataset_version for scope); kept so the fixture stays version-neutral.
        await c.query("UPDATE zoning_bylaw_areas SET source_dataset_version = '2000-01-01' WHERE source_id >= 990000000");
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        await shiftParcel(c, TEST_PARCEL + 51, box(3, 3, 4, 4));
        await new Promise((r) => setTimeout(r, 5));
        // a completed own run after every producer run → readZoningChange.changed = false, so the incremental scope is NULL-stamp only
        await insRun(c, SELF, 'completed', '1 day', '1 day 1 minute');
        await enrichParcels(c, { scopeWhere: SCOPE, full: false });
        // RED today: the trigger-NULLed stamp is never rewritten by the incremental run,
        // so the parcel remains in scope (expected 0, saw 1).
        expect(await ledgerScopeCount(c)).toBe(0);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // L2b rewritten (retired cross-clock arm; heal property kept in L2b'(ii))
    // RED today: the version arm still puts it in scope / readZoningChange is absent.
    it("L2b'(i) — retired cross-clock arm: a stamp older than the zone's publisher version is NOT in scope when no zoning load followed the last completed run", async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 52, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
        await insParcel(c, TEST_PARCEL + 52, box(1, 1, 2, 2));
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        await c.query(`UPDATE parcels SET zoning_enriched_at = '2000-01-02' WHERE parcel_id = $1`, [TEST_PARCEL + 52]);
        await c.query(`UPDATE zoning_bylaw_areas SET source_dataset_version = '2000-01-03' WHERE source_id = $1`, [TEST_SRC + 52]);
        await insRun(c, SELF, 'completed', '1 day', '1 day 1 minute');
        expect((await compute.readZoningChange(c)).changed).toBe(false);
        expect(await ledgerScopeCount(c)).toBe(0);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // L2b rewritten (retired cross-clock arm; heal property kept in L2b'(ii))
    // RED today: readZoningChange is absent, so the ledger-driven scope and the heal cannot be observed.
    it("L2b'(ii) — the heal property is kept: a load_zoning run that wrote after the last completed run scopes the parcel, run 2 heals it (updated 0, stampOnly 1), and a later completed run empties the scope", async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 58, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
        await insParcel(c, TEST_PARCEL + 58, box(1, 1, 2, 2));
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        await insRun(c, SELF, 'completed', '1 day', '1 day 1 minute');
        await insRun(c, PRODUCER, 'completed_with_warnings', '2 days', '2 days 1 minute', WROTE);
        expect(await ledgerScopeCount(c)).toBe(1);
        const r2 = await enrichParcels(c, { scopeWhere: SCOPE, full: false });
        expect(r2.updated).toBe(0);
        expect(r2.stampOnly).toBe(1);
        await insRun(c, SELF, 'completed', '3 days', '3 days 1 minute');
        expect(await ledgerScopeCount(c)).toBe(0);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // L3 — RED today: the gap parcel's trigger-NULLed stamp stays NULL (its zoning is
    // all-NULL so the 35-column guard never fires either).
    it('L3 — a gap parcel (no base zone), stamped then trigger-NULLed, heals', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 53, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
        await insParcel(c, TEST_PARCEL + 53, box(50, 50, 51, 51)); // gap — no intersecting zone
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        expect((await getParcel(c, TEST_PARCEL + 53)).zoning_enriched_at, 'a gap parcel is still stamped by run 1').not.toBeNull();
        await shiftParcel(c, TEST_PARCEL + 53, box(52, 52, 53, 53));
        expect((await getParcel(c, TEST_PARCEL + 53)).zoning_enriched_at, 'the geom trigger NULLs the gap parcel stamp too').toBeNull();
        await new Promise((r) => setTimeout(r, 5));
        const r2 = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        expect(r2.updated).toBe(0);
        expect(r2.stampOnly).toBe(1);
        expect((await getParcel(c, TEST_PARCEL + 53)).zoning_enriched_at, 'RED today: the gap parcel stamp must heal').not.toBeNull();
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // L4 — GREEN today (fence): a NULL-geom parcel is excluded from pass 1 by the scope
    // CTE's `p.geom IS NOT NULL` (in buildEnrichmentSql) and is never stamped.
    it('L4 — a NULL-geom parcel is outside pass 1 and is never stamped (fence)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query(`INSERT INTO parcels (parcel_id, feature_type, geometry, geom) VALUES ($1, 'TEST', NULL, NULL)`, [TEST_PARCEL + 54]);
        await insBase(c, TEST_SRC + 55, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
        await insParcel(c, TEST_PARCEL + 55, box(1, 1, 2, 2));
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        expect((await getParcel(c, TEST_PARCEL + 54)).zoning_enriched_at, 'a NULL-geom parcel must never be stamped').toBeNull();
        expect((await getParcel(c, TEST_PARCEL + 55)).zoning_enriched_at, 'the normal parcel proves the run had work').not.toBeNull();
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // L5 — RED today: stampOnly is undefined, so the disjointness of the two counters
    // cannot be observed (expected updated 1 / stampOnly 1, saw updated 1 / undefined).
    it('L5 — counters stay honest: a changed parcel and an unchanged NULL-stamp parcel in one run → updated 1 (changed only), stampOnly 1 (disjoint)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 56, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
        await insBase(c, TEST_SRC + 57, 'CR', 3.0, 10, 6, box(20, 0, 30, 10));
        await insParcel(c, TEST_PARCEL + 56, box(1, 1, 2, 2));    // P1
        await insParcel(c, TEST_PARCEL + 57, box(21, 1, 22, 2));  // P2
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        const p1Id = (await getParcel(c, TEST_PARCEL + 56)).id;
        // P1's zoning VALUES change (fsi 2.0 → 2.5); P2's values are unchanged and only
        // its stamp is NULLed by the geom trigger.
        await c.query(`UPDATE zoning_bylaw_areas SET fsi_max = 2.5 WHERE source_id = $1`, [TEST_SRC + 56]);
        await shiftParcel(c, TEST_PARCEL + 57, box(23, 3, 24, 4));
        await new Promise((r) => setTimeout(r, 5));
        const r2 = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        expect(r2.updated).toBe(1);
        expect(r2.updatedIds).toEqual([p1Id]);
        expect(r2.stampOnly).toBe(1);
        expect((await getParcel(c, TEST_PARCEL + 56)).zoning_enriched_at).not.toBeNull();
        expect((await getParcel(c, TEST_PARCEL + 57)).zoning_enriched_at).not.toBeNull();
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });
  });

  // SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2 step 6, §3c
  describe('zoning-change scope — 2026-10-06 MED', () => {
    // seed = base zone + parcel + run 1 full + a completed SELF run (E) after every producer.
    async function buildSeed(c: PoolClient, src: number, pid: number) {
      await insBase(c, src, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
      await insParcel(c, pid, box(1, 1, 2, 2));
      await enrichParcels(c, { scopeWhere: SCOPE, full: true });
      await insRun(c, SELF, 'completed', '1 day', '1 day 1 minute');
    }

    // RED today: readZoningChange is absent; the ledger-driven backdated-edit re-scope is unobservable.
    it('V1 — backdated / same-version edit: a zone edit with an OLD source_dataset_version is re-scoped once a load_zoning run that wrote completes after the last completed run', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 70, TEST_PARCEL + 70);
        await c.query(`UPDATE zoning_bylaw_areas SET fsi_max = 2.5, source_dataset_version = '2000-01-01' WHERE source_id = $1`, [TEST_SRC + 70]);
        await insRun(c, PRODUCER, 'completed_with_warnings', '2 days', '2 days 1 minute', WROTE);
        expect((await compute.readZoningChange(c)).changed).toBe(true);
        expect(await ledgerScopeCount(c)).toBe(1);
        await enrichParcels(c, { scopeWhere: SCOPE, full: false });
        expect(Number((await getParcel(c, TEST_PARCEL + 70)).bylaw_max_fsi)).toBe(2.5);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // RED today: readZoningChange is absent; the aliased producer pipeline name is unobservable.
    it('V1b — both ledger names count: sources:load_zoning completed is a producer run too', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 71, TEST_PARCEL + 71);
        await insRun(c, 'sources:load_zoning', 'completed', '2 days', '2 days 1 minute', WROTE);
        expect(await ledgerScopeCount(c)).toBe(1);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // RED today: readZoningChange is absent; the zoning_rows_changed-driven overlay re-scope is unobservable.
    it('V2 — overlay-only change (base untouched, base counters 0) re-scopes via zoning_rows_changed', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 72, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
        await insOverlay(c, 'zoning_height_overlay', 'source_id, height_max_m, ht_stories', [TEST_SRC + 73, 15.0, 5], box(0, 0, 20, 20));
        await insParcel(c, TEST_PARCEL + 72, box(1, 1, 2, 2));
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        await insRun(c, SELF, 'completed', '1 day', '1 day 1 minute');
        await c.query(`UPDATE zoning_height_overlay SET height_max_m = 12.0 WHERE source_id = $1`, [TEST_SRC + 73]);
        const P = await insRun(c, PRODUCER, 'completed_with_warnings', '2 days', '2 days 1 minute', { gate: { gated_skip: false }, zoning_rows_changed: 1 });
        await c.query(`UPDATE pipeline_runs SET records_new = 0, records_updated = 0 WHERE id = $1`, [P]);
        expect(await ledgerScopeCount(c)).toBe(1);
        await enrichParcels(c, { scopeWhere: SCOPE, full: false });
        expect(Number((await getParcel(c, TEST_PARCEL + 72)).bylaw_max_height_m)).toBe(12);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    it('V3 — steady state (fence): a completed run after the last producer run → changed false, fixture scope 0', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 74, TEST_PARCEL + 74);
        await insRun(c, PRODUCER, 'completed', '2 days', '2 days 1 minute', WROTE);
        await insRun(c, SELF, 'completed', '3 days', '3 days 1 minute');
        expect((await compute.readZoningChange(c)).changed).toBe(false);
        expect(await ledgerScopeCount(c)).toBe(0);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    it('V3b — no prior completed own run → changed (fail-safe: scope all)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 75, TEST_PARCEL + 75);
        await c.query(`DELETE FROM pipeline_runs WHERE pipeline = ANY($1::text[])`, [compute.ENRICH_SELF_FORMS]);
        const zc = await compute.readZoningChange(c);
        expect(zc.changed).toBe(true);
        expect(zc.own_last_run_id).toBeNull();
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // RED today: readZoningChange is absent; computeDeferScope's ledger-derived per-pass counts are unobservable.
    it('V4 — the defer count reads the same ledger answer: changed → pass1 = every geom parcel; after a later completed run → pass1 = NULL-stamp geom parcels only (exact counts)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 76, TEST_PARCEL + 76);
        await insRun(c, PRODUCER, 'completed_with_warnings', '2 days', '2 days 1 minute', WROTE);
        const s1 = await compute.computeDeferScope(c, 1000);
        expect(s1.zoning_change.changed).toBe(true);
        expect(s1.perPass.pass1).toBe(Number((await c.query('SELECT count(*)::int AS n FROM parcels WHERE geom IS NOT NULL')).rows[0].n));
        await insRun(c, SELF, 'completed', '3 days', '3 days 1 minute');
        const s2 = await compute.computeDeferScope(c, 1000);
        expect(s2.zoning_change.changed).toBe(false);
        expect(s2.perPass.pass1).toBe(Number((await c.query('SELECT count(*)::int AS n FROM parcels WHERE geom IS NOT NULL AND zoning_enriched_at IS NULL')).rows[0].n));
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    it('V5 — a producer run that changed nothing (zoning_rows_changed 0) does not re-scope (fence)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 77, TEST_PARCEL + 77);
        await insRun(c, PRODUCER, 'completed_with_warnings', '2 days', '2 days 1 minute', { gate: { gated_skip: false }, zoning_rows_changed: 0 });
        expect((await compute.readZoningChange(c)).changed).toBe(false);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    it('V5b — a gated skip re-emits the prior run\'s zoning_rows_changed but never counts (gated_skip tested first)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 78, TEST_PARCEL + 78);
        await insRun(c, PRODUCER, 'completed', '2 days', '2 days 1 minute', { gate: { gated_skip: true }, zoning_rows_changed: 195 });
        expect((await compute.readZoningChange(c)).changed).toBe(false);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // RED today: readZoningChange is absent; the non-completing-status watermark rule is unobservable.
    it('V6 — non-completing own runs never advance the watermark', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 79, TEST_PARCEL + 79);
        const eId = (await c.query(`SELECT id FROM pipeline_runs WHERE pipeline = $1 AND status = 'completed' ORDER BY completed_at DESC, id DESC LIMIT 1`, [SELF])).rows[0].id;
        await insRun(c, PRODUCER, 'completed_with_warnings', '2 days', '2 days 1 minute', WROTE);
        await insRun(c, SELF, 'deferred_to_full', '3 days', '3 days 1 minute', {});
        await insRun(c, SELF, 'self_skipped', '3 days', '3 days 1 minute', {});
        await insRun(c, SELF, 'failed', '3 days', '3 days 1 minute', {});
        await insRun(c, SELF, 'completed_with_errors', '3 days', '3 days 1 minute', {});
        await insRun(c, SELF, 'completed_with_warnings', '3 days', '3 days 1 minute', { audit_table: { rows: [{ metric: 'write_skipped_pre_write_warn', status: 'WARN' }] } });
        const zc = await compute.readZoningChange(c);
        expect(zc.changed).toBe(true);
        expect(zc.own_last_run_id).toBe(eId);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // RED today: readZoningChange is absent; the overlap/tie comparison semantics are unobservable.
    it('V7 — overlap and ties: a producer that started before the last completed run but completed after it counts; completed_at == started_at counts', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 80, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
        await insParcel(c, TEST_PARCEL + 80, box(1, 1, 2, 2));
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        await insRun(c, SELF, 'completed', '1 day', '1 day 10 minutes');
        const P = await insRun(c, PRODUCER, 'completed', '23 hours', '1 day 5 minutes', WROTE);
        expect((await compute.readZoningChange(c)).changed).toBe(true);
        await c.query(`DELETE FROM pipeline_runs WHERE id = $1`, [P]);
        await insRun(c, PRODUCER, 'completed', '23 hours', '1 day', WROTE);
        expect((await compute.readZoningChange(c)).changed).toBe(true);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // RED today: readZoningChange is absent; the failed/crashed-producer rule is unobservable.
    it('V8 — failed and crashed producer runs count (per-target txns may have committed)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 81, TEST_PARCEL + 81);
        const P = await insRun(c, PRODUCER, 'failed', '2 days', '2 days 1 minute', {});
        await c.query(`UPDATE pipeline_runs SET records_new = 3 WHERE id = $1`, [P]);
        expect((await compute.readZoningChange(c)).changed).toBe(true);
        await c.query(`DELETE FROM pipeline_runs WHERE id = $1`, [P]);
        await insRun(c, PRODUCER, 'crashed', '2 days', '2 days 1 minute', null);
        expect((await compute.readZoningChange(c)).changed).toBe(true);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    it('V9 — the geom-trigger path survives: with no zoning change, a moved parcel is still in scope (NULL stamp)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 82, TEST_PARCEL + 82);
        expect((await compute.readZoningChange(c)).changed).toBe(false);
        await shiftParcel(c, TEST_PARCEL + 82, box(3, 3, 4, 4));
        expect(await ledgerScopeCount(c)).toBe(1);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    // RED today: readZoningChange is absent; the malformed-rows fail-safe rule is unobservable.
    it('V10 — a malformed zoning_rows_changed (null or non-number) counts as wrote (fail-safe)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await buildSeed(c, TEST_SRC + 83, TEST_PARCEL + 83);
        const P = await insRun(c, PRODUCER, 'completed', '2 days', '2 days 1 minute', { gate: { gated_skip: false }, zoning_rows_changed: null });
        expect((await compute.readZoningChange(c)).changed).toBe(true);
        await c.query(`DELETE FROM pipeline_runs WHERE id = $1`, [P]);
        await insRun(c, PRODUCER, 'completed', '2 days', '2 days 1 minute', { gate: { gated_skip: false }, zoning_rows_changed: 'x' });
        expect((await compute.readZoningChange(c)).changed).toBe(true);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });
  });

  // SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2 DEC-1 (amended by E1)
  describe('E1 — base-zone parameters come from the dominant label (Spec 69 R-ZV, 2026-10-06 HIGH)', () => {
    const E1_COLS: Array<[string, string]> = [
      ['bylaw_max_units', 'units_max'], ['bylaw_max_density', 'density_max'],
      ['bylaw_pct_commercial_max', 'pct_commercial_max'], ['bylaw_pct_residential_max', 'pct_residential_max'],
      ['bylaw_pct_employment_max', 'pct_employment_max'], ['bylaw_pct_office_max', 'pct_office_max'],
      ['bylaw_min_frontage_m', 'frontage_min_m'], ['bylaw_min_area_sqm', 'area_min_sqm'],
      ['bylaw_standard_setback_m', 'standard_setback'],
    ];
    const E1_CASES: Array<[string, number | null, number]> = [
      ['sliver LARGER than dominant', 5, 9], ['sliver SMALLER than dominant', 5, 2], ['dominant NULL, sliver non-NULL', null, 2],
    ];

    // A1 — per-column, per-case: the value must come from the area-dominant row, never
    // from the sliver. RED today for the MIN-smaller (dominant 5 vs sliver 2), MAX-larger
    // (dominant 5 vs sliver 9) and NULL-dominant cases; the others are GREEN fences.
    it.each(E1_COLS.flatMap(([col, src], ci) =>
      E1_CASES.map(([caseName, dom, sliver], ki) => [col, src, caseName, dom, sliver, ci * E1_CASES.length + ki] as const),
    ))(
      'A1 — %s: %s → the dominant value (%s)',
      async (col, src, caseName, dom, sliver, i) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const sid = TEST_SRC + 100 + i * 2;
          const pid = TEST_PARCEL + 100 + i;
          // dominant zone: full 10x10 square;
          // units_max / frontage_min_m are insBase's positional $5/$6 columns — route the
          // value there for those two sources and keep `extra` for everything else (a
          // duplicate column in `extra` makes the INSERT name them twice: "column … specified more than once").
          const domIsPos = src === 'units_max' || src === 'frontage_min_m';
          await insBase(c, sid, 'RD', null,
            src === 'units_max' ? dom : null, src === 'frontage_min_m' ? dom : null, box(0, 0, 10, 10),
            domIsPos ? {} : { [src]: dom });
          // sliver zone: overlaps the parcel by a 0.00002°-wide strip (share ≈ 2e-5) — it must not donate its value.
          await insBase(c, sid + 1, 'RD', null,
            src === 'units_max' ? sliver : null, src === 'frontage_min_m' ? sliver : null, box(1.99998, 0, 20, 10),
            domIsPos ? {} : { [src]: sliver });
          await insParcel(c, pid, box(1, 1, 2, 2));
          await enrichParcels(c, { scopeWhere: SCOPE, full: true });
          const p = await getParcel(c, pid);
          expect(Number(p.zoning_dominant_area_share)).toBe(1); // exact — the sliver rounds away at NUMERIC(5,4)
          expect(p.zoning_is_ambiguous).toBe(false);
          expect(p.zoning_base_source_id).toBe(sid);
          if (dom === null) expect(p[col]).toBeNull();
          else expect(Number(p[col])).toBe(dom);
          await c.query('ROLLBACK');
        } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
      },
    );

    it('A3 — a genuine 0.52 / 0.48 split: flagged ambiguous and valued from the 0.52 zone (incl. its NULLs)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 160, 'RD', null, null, 6, box(0, 0, 10, 10), { area_min_sqm: null, standard_setback: 2 });
        await insBase(c, TEST_SRC + 161, 'RD', null, null, 9, box(10, 0, 20, 10), { area_min_sqm: 700, standard_setback: 3 });
        await insParcel(c, TEST_PARCEL + 160, box(9.48, 1, 10.48, 2)); // 0.52 in A
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        const p = await getParcel(c, TEST_PARCEL + 160);
        expect(Math.abs(Number(p.zoning_dominant_area_share) - 0.52)).toBeLessThan(0.001);
        expect(p.zoning_is_ambiguous).toBe(true);
        expect(p.zoning_base_source_id).toBe(TEST_SRC + 160);
        // RED today: MIN/MAX aggregation borrows B's floor/ceiling (frontage MAX→9, area MAX→700, setback MAX→3).
        expect(Number(p.bylaw_min_frontage_m)).toBe(6);
        expect(p.bylaw_min_area_sqm).toBeNull();
        expect(Number(p.bylaw_standard_setback_m)).toBe(2);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    it('A5 — a second full run writes 0 value rows, and on an exact equal-area two-candidate parcel zoning_overlays.base[0] is the dominant row', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 170, 'RM', null, 4, 6, box(0, 0, 10, 10));
        await insBase(c, TEST_SRC + 171, 'RD', null, 8, 9, box(10, 0, 20, 10));
        await insParcel(c, TEST_PARCEL + 170, box(9.5, 1, 10.5, 2)); // exactly 0.5 / 0.5 tie
        await insParcel(c, TEST_PARCEL + 171, box(1, 1, 2, 2));
        await insBase(c, TEST_SRC + 172, 'RD', null, 1, 12, box(1.99998, 0, 5, 10)); // sliver on the RD parcel only
        const r1 = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        expect(r1.updated).toBeGreaterThanOrEqual(2);
        const tie = await getParcel(c, TEST_PARCEL + 170);
        // RED today: equal area → zn_zone ASC: 'RD' < 'RM' (today's base jsonb order is unsorted).
        expect(tie.zoning_base_source_id).toBe(TEST_SRC + 171);
        expect(tie.zoning_overlays.base[0].source_id).toBe(TEST_SRC + 171);
        const before = JSON.stringify(tie.zoning_overlays);
        await new Promise((r) => setTimeout(r, 5));
        const r2 = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        expect(r2.updated).toBe(0);
        const tie2 = await getParcel(c, TEST_PARCEL + 170);
        expect(JSON.stringify(tie2.zoning_overlays)).toBe(before);
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });

    it('A7 — base coverage_max_pct from the dominant row (40), not MIN across candidates (30)', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await insBase(c, TEST_SRC + 180, 'RD', null, null, null, box(0, 0, 10, 10), { coverage_max_pct: 40 });
        await insBase(c, TEST_SRC + 181, 'RD', null, null, null, box(1.99998, 0, 20, 10), { coverage_max_pct: 30 });
        await insParcel(c, TEST_PARCEL + 180, box(1, 1, 2, 2)); // NO coverage overlay
        await enrichParcels(c, { scopeWhere: SCOPE, full: true });
        const p = await getParcel(c, TEST_PARCEL + 180);
        expect(Number(p.bylaw_max_coverage_pct)).toBe(40); // RED today: base coverage is MIN(40,30) → 30
        await c.query('ROLLBACK');
      } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); } // rollback even when an assertion threw (no open txn leaks to the next test)
    });
  });
});
