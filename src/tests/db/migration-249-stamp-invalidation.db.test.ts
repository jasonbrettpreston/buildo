// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.4, §6.6.1 (LDG-10 class 4, O2-A)
// SPEC LINK: migrations/249_parcels_stamp_geom_invalidation.sql (the fifth arm)
// SPEC LINK: migrations/245_parcels_centroid_geom_invalidation.sql (the four arms it keeps)
//
// LDG-10 Step 1 — THE DATASET-VERSION STAMP INVALIDATOR. Red-first proof (T4 in
// .cursor/wf1_ldg10_pins_invalidation_active_task.md).
//
// THE DEFECT. The three lineage stamps parcels.{ravine,heritage,centreline}_dataset_version_when_enriched
// are invalidated only inside load_parcels' own UPSERT (set_null_on_change_of, #418). Any other write
// that moves a parcel leaves the stamps current-looking, and the enrichers' `IS DISTINCT FROM
// <producer version>` scope never revisits the parcel. Migration 249 adds the fifth arm to the
// geometry-change trigger function so every write path invalidates them.
//
// ⛔ TRAP ① (from the 245 test): a fresh parcel already has NULL stamps, so "move it and expect NULL"
// is green with or without the fix. Every case STAMPS non-NULL values first and asserts them.
// ⛔ TRAP ②: the arm must sit inside the IS DISTINCT FROM guard — case ③ re-SETs the same geometry
// and expects the stamps KEPT.
// ⛔ TRAP ③: an UPDATE whose SET list omits geom and geometry never fires the trigger.
// ⛔ TRAP ④ (plan-altitude Integration seat): the stamp arm watches `geom` ONLY. A change to the raw
// `geometry` jsonb alone must KEEP the stamps (the enrichers read geom; load_parcels' DEC-FENCE2,
// f54dcf97, locked by load-parcels-geom-guard.db.test.ts T-g). Since migration 251 (operator ruling
// Q2) it keeps massing/zoning/centroid too while geom is non-NULL; case ④ is that lock.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/migration-249-stamp-invalidation.db.test.ts --no-file-parallelism

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const FX = 'LDG10STAMP';
const FX_PARCEL_ID = (n: number) => `${FX}${n}`;
const STAMPS = [
  'ravine_dataset_version_when_enriched',
  'heritage_dataset_version_when_enriched',
  'centreline_dataset_version_when_enriched',
] as const;

describe.skipIf(!dbAvailable())('migration 249 — geometry change invalidates the three dataset-version stamps', () => {
  if (!pool) {
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ~30 m polygons in the Atlantic, ~1 km apart per n — never near a real Toronto fixture.
  function farBox(n: number): string {
    const x0 = -36 + n * 0.01;
    const y0 = 44 + n * 0.01;
    const d = 0.0003;
    return JSON.stringify({
      type: 'Polygon',
      coordinates: [[[x0, y0], [x0 + d, y0], [x0 + d, y0 + d], [x0, y0 + d], [x0, y0]]],
    });
  }

  async function insParcel(pid: string, geomJson: string): Promise<number> {
    const { rows } = await pool!.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326)) RETURNING id`,
      [pid, geomJson],
    );
    return rows[0].id as number;
  }

  /** Stamp all seven invalidated columns non-NULL (⛔ TRAP ①) and assert the stamp landed. */
  async function stampAll(id: number): Promise<void> {
    await pool!.query(
      `UPDATE parcels
          SET ravine_dataset_version_when_enriched = 'rav-v1',
              heritage_dataset_version_when_enriched = 'her-v1|her-v1',
              centreline_dataset_version_when_enriched = 'cl-v1',
              centroid_lat = 44.5, centroid_lng = -36.5,
              massing_enriched_at = NOW(), zoning_enriched_at = NOW()
        WHERE id = $1`,
      [id],
    );
    const row = await readRow(id);
    for (const s of STAMPS) expect(row[s], `precondition: ${s} must be non-NULL before provocation`).not.toBeNull();
    expect(row.centroid_lat, 'precondition: centroid stamped').not.toBeNull();
    expect(row.massing_enriched_at, 'precondition: massing watermark stamped').not.toBeNull();
    expect(row.zoning_enriched_at, 'precondition: zoning watermark stamped').not.toBeNull();
  }

  async function readRow(id: number) {
    const { rows } = await pool!.query(
      `SELECT ravine_dataset_version_when_enriched, heritage_dataset_version_when_enriched,
              centreline_dataset_version_when_enriched, centroid_lat, centroid_lng,
              massing_enriched_at, zoning_enriched_at
         FROM parcels WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  async function cleanup(): Promise<void> {
    await pool!.query(`DELETE FROM parcels WHERE parcel_id LIKE $1`, [`${FX}%`]);
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool!.end();
  });

  describe('① a geometry move NULLs all three stamps (red before migration 249)', () => {
    it('moving geom AND geometry NULLs ravine, heritage and centreline stamps', async () => {
      const id = await insParcel(FX_PARCEL_ID(1), farBox(1));
      await stampAll(id);
      await pool!.query(
        `UPDATE parcels SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), geometry = $2::jsonb WHERE id = $1`,
        [id, farBox(2)],
      );
      const row = await readRow(id);
      for (const s of STAMPS) expect(row[s], `${s} must be NULLed by a geometry move`).toBeNull();
    });

    it('the same invalidation fires when ONLY geom is in the SET list', async () => {
      const id = await insParcel(FX_PARCEL_ID(3), farBox(3));
      await stampAll(id);
      await pool!.query(
        `UPDATE parcels SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326) WHERE id = $1`,
        [id, farBox(4)],
      );
      const row = await readRow(id);
      for (const s of STAMPS) expect(row[s], `${s} must be NULLed when only geom moves`).toBeNull();
    });

  });

  describe('② the four existing arms (migrations 242/245) survive the CREATE OR REPLACE', () => {
    it('a geometry move still NULLs massing_enriched_at, zoning_enriched_at, centroid_lat and centroid_lng', async () => {
      const id = await insParcel(FX_PARCEL_ID(7), farBox(7));
      await stampAll(id);
      await pool!.query(
        `UPDATE parcels SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), geometry = $2::jsonb WHERE id = $1`,
        [id, farBox(8)],
      );
      const row = await readRow(id);
      expect(row.massing_enriched_at).toBeNull();
      expect(row.zoning_enriched_at).toBeNull();
      expect(row.centroid_lat).toBeNull();
      expect(row.centroid_lng).toBeNull();
    });

    it('parcels still has exactly one enabled trigger, BEFORE UPDATE OF geom, geometry, bound to the function', async () => {
      const { rows } = await pool!.query(
        `SELECT t.tgname, t.tgenabled, p.proname, pg_get_triggerdef(t.oid) AS def
           FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE t.tgrelid = 'parcels'::regclass AND NOT t.tgisinternal`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].tgname).toBe('trg_parcels_geom_invalidation');
      expect(['O', 'A']).toContain(rows[0].tgenabled);
      expect(rows[0].proname).toBe('trg_parcels_invalidate_on_geom_change');
      expect(rows[0].def).toMatch(/BEFORE UPDATE OF geom, geometry ON public\.parcels/);
    });
  });

  describe('③ the IS DISTINCT FROM guard keeps valid stamps (⛔ TRAP ②, ⛔ TRAP ③)', () => {
    it('re-SETting geom and geometry to their CURRENT values keeps all three stamps', async () => {
      const id = await insParcel(FX_PARCEL_ID(9), farBox(9));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET geom = geom, geometry = geometry WHERE id = $1`, [id]);
      const row = await readRow(id);
      expect(row.ravine_dataset_version_when_enriched).toBe('rav-v1');
      expect(row.heritage_dataset_version_when_enriched).toBe('her-v1|her-v1');
      expect(row.centreline_dataset_version_when_enriched).toBe('cl-v1');
    });

    it('an UPDATE that touches neither geom nor geometry keeps all three stamps', async () => {
      const id = await insParcel(FX_PARCEL_ID(11), farBox(11));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET feature_type = 'TEST2' WHERE id = $1`, [id]);
      const row = await readRow(id);
      for (const s of STAMPS) expect(row[s], `${s} must survive a non-geometry UPDATE`).not.toBeNull();
    });

    it('re-deriving geom and re-serialising geometry to EQUAL values (the bulk-reload write shape) keeps all three stamps', async () => {
      const id = await insParcel(FX_PARCEL_ID(13), farBox(13));
      await stampAll(id);
      // WKB round-trip of geom and a key-reordered geometry object: different bytes on the wire, equal values.
      await pool!.query(
        `UPDATE parcels
            SET geom = ST_SetSRID(ST_GeomFromWKB(ST_AsBinary(geom)), 4326),
                geometry = jsonb_build_object('coordinates', geometry->'coordinates', 'type', geometry->'type')
          WHERE id = $1`,
        [id],
      );
      const row = await readRow(id);
      expect(row.ravine_dataset_version_when_enriched).toBe('rav-v1');
      expect(row.heritage_dataset_version_when_enriched).toBe('her-v1|her-v1');
      expect(row.centreline_dataset_version_when_enriched).toBe('cl-v1');
      expect(row.centroid_lat, 'the outer guard is a no-op on equal values too').not.toBeNull();
    });
  });

  describe('④ a geometry-jsonb-only change invalidates nothing while geom is unchanged (migration 251, operator ruling Q2)', () => {
    it('changing ONLY the geometry jsonb KEEPS massing/zoning/centroid AND the ravine, heritage and centreline stamps', async () => {
      const id = await insParcel(FX_PARCEL_ID(5), farBox(5));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET geometry = $2::jsonb WHERE id = $1`, [id, farBox(6)]);
      const row = await readRow(id);
      // RETIRED KNOWINGLY (WF3 parcels geom drift, Commit 1). Before 251: massing/zoning/centroid
      // NULLed by the outer guard, stamps kept. After: all KEPT — geom (what every consumer reads)
      // did not change. The NULL expectation survives in migration-251-geom-tolerance L14.
      expect(row.massing_enriched_at, 'geom unchanged ⇒ massing watermark kept').not.toBeNull();
      expect(row.zoning_enriched_at, 'geom unchanged ⇒ zoning watermark kept').not.toBeNull();
      expect(row.centroid_lat, 'geom unchanged ⇒ centroid kept').not.toBeNull();
      expect(row.ravine_dataset_version_when_enriched, 'geom unchanged ⇒ stamp kept').toBe('rav-v1');
      expect(row.heritage_dataset_version_when_enriched, 'geom unchanged ⇒ stamp kept').toBe('her-v1|her-v1');
      expect(row.centreline_dataset_version_when_enriched, 'geom unchanged ⇒ stamp kept').toBe('cl-v1');
    });
  });
});
