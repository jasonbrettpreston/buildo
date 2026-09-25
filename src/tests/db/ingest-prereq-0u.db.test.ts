// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (0u, RE-FREEZE #24)
// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2 (the legacy post-INSERT area pass)
//
// INGESTOR prerequisite 0u — LIVE-DB lock for `columns[].derived_from_geometry`.
//
// The codegen's claim (rendered by `geometryValidationSql`) is that the derived area expressions
// produce the SAME numbers as the legacy post-INSERT UPDATE in `scripts/load-massing.js`. This
// suite proves it against a real PostGIS instance, by running the VALIDATOR'S OWN statement
// (built by `buildWritePlan` for W, the founding case's write spec) and comparing each returned
// area STRING against the legacy expression evaluated over the same GeoJSON.
//
// SELECT-only: the statement is a CTE over `unnest($1)` — no table is touched, nothing is written.
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL is set (setup-testcontainer).
//
// Fixtures: the same Web-Mercator 100 m square `building-footprints-area.db.test.ts` uses
// (≈ 5,231 m² once transformed, because Web Mercator over-scales area by 1/cos²(43.65°) ≈ 1.92)
// plus a BOWTIE — a self-intersecting polygon, which is the geometry class the legacy loader
// stored unrepaired and which `geometry_repair:"none"` declares.

import { afterAll, describe, expect, it } from 'vitest';
import path from 'path';
import { dbAvailable, getTestPool } from './setup-testcontainer';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const writeLib = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const LOAD_RAVINES = require(path.join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const pool = getTestPool();

const SQFT_FACTOR = '10.7639104167';

/** W — the founding case's write spec (mirrors `ingest-prereq-0u.logic.test.ts`). */
const W = () => {
  const s = JSON.parse(JSON.stringify(
    (LOAD_RAVINES.outputs as { writes: Array<Record<string, unknown>> }).writes[0],
  )) as Record<string, unknown>;
  s.key_sql_type = 'TEXT';
  s.geometry_srid = 3857;
  s.geometry_repair = 'none';
  const cols = s.columns as Array<Record<string, unknown>>;
  cols.push({
    name: 'footprint_area_sqm',
    vocabulary: 'none',
    written: 'insert_only',
    bind: 'value',
    derived_from_geometry: { measure: 'geodesic_area', unit: 'm2', scale: 2 },
  });
  cols.push({
    name: 'footprint_area_sqft',
    vocabulary: 'none',
    written: 'insert_only',
    bind: 'value',
    derived_from_geometry: { measure: 'geodesic_area', unit: 'ft2', scale: 2 },
  });
  return s;
};

// The same Toronto 100 m Web-Mercator square the WF2 #C suite seeds (≈ 5,231 m² transformed).
const WEB_MERCATOR_SQUARE = {
  type: 'Polygon',
  coordinates: [[
    [-8838157, 5413906],
    [-8838057, 5413906],
    [-8838057, 5414006],
    [-8838157, 5414006],
    [-8838157, 5413906],
  ]],
};

// A BOWTIE — a self-intersecting polygon (two triangles joined at a point). It is INVALID to
// PostGIS, which is exactly the case `geometry_repair:"none"` exists for: the legacy loader
// stored what the source said and measured THAT.
const BOWTIE = {
  type: 'Polygon',
  coordinates: [[
    [-8838157, 5413906],
    [-8838057, 5414006],
    [-8838057, 5413906],
    [-8838157, 5414006],
    [-8838157, 5413906],
  ]],
};

const FIXTURES: Array<[string, unknown]> = [
  ['100m web-mercator square', WEB_MERCATOR_SQUARE],
  ['bowtie (self-intersecting)', BOWTIE],
];

/** The LEGACY expression, verbatim from `scripts/load-massing.js` (`areaUpdateRes`), parameterised. */
const LEGACY_SQL = `SELECT
  ROUND((ST_Area(
    ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1::jsonb::text), 3857), 4326)::geography
  ))::numeric, 2)::text AS area_sqm,
  ROUND((ST_Area(
    ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1::jsonb::text), 3857), 4326)::geography
  ) * ${SQFT_FACTOR})::numeric, 2)::text AS area_sqft`;

describe.skipIf(!dbAvailable())('INGESTOR prerequisite 0u — derived_from_geometry renders the legacy area SQL (live DB)', () => {
  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('validator SQL over a square and a bowtie produces the legacy area strings, per column', async () => {
    if (!pool) return;
    const plan = writeLib.buildWritePlan(W(), LOAD_RAVINES);
    expect(plan.derived_columns).toHaveLength(2);

    for (const [label, geojson] of FIXTURES) {
      // The validator's OWN statement, driven exactly as `validateGeometries` drives it:
      // $1 = the key array, $2 = the ord-aligned GeoJSON array.
      const res = await pool.query<Record<string, unknown>>(plan.validation_sql, [['fixture'], [JSON.stringify(geojson)]]);
      expect(res.rowCount, `${label}: one row per input key`).toBe(1);
      const v = res.rows[0]!;
      // `geometry_repair:"none"` — the bowtie is stored invalid, and IS counted as such.
      expect(v.is_valid_original, `${label}: is_valid_original is the source's own validity`)
        .toBe(label.startsWith('bowtie') ? false : true);

      // The legacy expression over the SAME GeoJSON — the reference the conversion must match.
      const legacy = await pool.query<{ area_sqm: string; area_sqft: string }>(LEGACY_SQL, [JSON.stringify(geojson)]);
      const ref = legacy.rows[0]!;

      // ⚠️ STRING equality, not numeric: node-pg returns `numeric` as a string and the
      // conversion's whole claim is that it never takes a lossy `Number()` hop.
      expect(v.footprint_area_sqm, `${label}: area m²`).toBe(ref.area_sqm);
      expect(v.footprint_area_sqft, `${label}: area ft²`).toBe(ref.area_sqft);
    }
  });

  it('the square is ~5,231 m² (Web Mercator over-scale) and the ft² twin is the factor applied', async () => {
    if (!pool) return;
    const plan = writeLib.buildWritePlan(W(), LOAD_RAVINES);
    const res = await pool.query<{ footprint_area_sqm: string; footprint_area_sqft: string }>(
      plan.validation_sql, [['fixture'], [JSON.stringify(WEB_MERCATOR_SQUARE)]],
    );
    const v = res.rows[0]!;
    const sqm = Number(v.footprint_area_sqm);
    // Web Mercator over-scales area by 1/cos²(43.65°) ≈ 1.92, so a 100 m square reads ~5,231 m²
    // and NOT 10,000 — the pinned boundary of the `building-footprints-area` suite.
    expect(sqm).toBeGreaterThan(5230 * 0.95);
    expect(sqm).toBeLessThan(5230 * 1.05);
    expect(Number(v.footprint_area_sqft)).toBeCloseTo(sqm * Number(SQFT_FACTOR), 1);
  });
});
