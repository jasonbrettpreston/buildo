// 🔗 SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md
//             docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1
//
// RE-HOMED AT ② (batch-2 row 3.6, 2026-09-27) — the frozen shell replaced
// the 488-line `scripts/load-massing.js`, so these locks no longer read text
// that exists. The INTENT of every `it` survives, unchanged and unweakened;
// only the SUBJECT moved. NOTHING was deleted.
//
// Where the legacy intents live now:
//   · The S7/S8 post-INSERT UPDATE passes became DECLARED COLUMNS computed by
//     the geometry validator AT INSERT: `footprint_area_sqm`/`footprint_area_sqft`
//     via `derived_from_geometry` (prerequisite 0u, `insert_only`), and `geom`
//     via `geometry_srid: 3857` + `geometry_repair: "none"` (prerequisites
//     0t/0i, `insert_only`). There is no second statement and no JS arithmetic.
//   · The subject is therefore `scripts/load-massing.descriptor.json` plus the
//     statement `write.buildWritePlan(d.outputs.writes[0], d)` renders — the
//     SAME plan the executor issues, which is strictly stronger than a regex
//     over a 488-line file.
//
// Why this test exists (WF2 #C 2026-05-09):
//   The previous version of load-massing.js detected the shapefile's
//   Web Mercator (EPSG:3857) projection and explicitly NULLED the area:
//     const isProjected = ring[0] && (Math.abs(ring[0][0]) > 180 || ...);
//     const areaSqm = isProjected ? null : shoelaceArea(ring);   // ← bug
//   Result: all 427,077 rows shipped with NULL footprint_area_sqm. The
//   Spec 83 §3 cost model fell back to lot-size for every permit.
//
//   The fix removed the JS-side area calculation entirely; the conversion
//   (row 3.6 ②) removed the JS area PATH entirely. This test catches
//   regressions at both the descriptor level and the rendered-SQL level.
//
// The semantic regression-lock lives at
// src/tests/db/building-footprints-area.db.test.ts.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface Column { name: string; written?: string; bind?: string }
interface MassingDescriptor { outputs: { writes: Array<{ columns: Column[] }> } }
interface WritePlan { validation_sql: string; upsert_sql: string; guard_columns: string[] }

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const write = require('../../scripts/lib/step/write.js') as {
  buildWritePlan: (writeSpec: unknown, descriptor: unknown) => WritePlan;
};
const compute = require('../../scripts/lib/compute/load-massing.js') as {
  shapeRecord: (record: unknown, seam: unknown) => Record<string, unknown> | null;
};
/* eslint-enable @typescript-eslint/no-require-imports */

describe('massing Web Mercator area pipeline (WF2 #C 2026-05-09; RE-HOMED at ②, row 3.6, 2026-09-27)', () => {
  let descriptor: MassingDescriptor;
  let plan: WritePlan;

  beforeAll(() => {
    descriptor = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../scripts/load-massing.descriptor.json'), 'utf-8'),
    ) as MassingDescriptor;
    plan = write.buildWritePlan(descriptor.outputs.writes[0], descriptor);
  });

  it('does NOT use the `isProjected ? null : shoelaceArea(ring)` shortcut (the WF2 #C bug class)', () => {
    // The previous code nulled the area whenever the input was projected. The JS
    // area path is GONE ENTIRELY now: neither the frozen shell nor the compute
    // module may carry a `shoelaceArea`/`isProjected` branch, and `shapeRecord`
    // returns no `footprint_area_sqm` key at all (area is the validator's, at
    // INSERT, over `geom`).
    const shell = fs.readFileSync(path.resolve(__dirname, '../../scripts/load-massing.js'), 'utf-8');
    const computeSrc = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/lib/compute/load-massing.js'),
      'utf-8',
    );
    expect(shell).not.toMatch(/shoelaceArea|isProjected/);
    expect(computeSrc).not.toMatch(/shoelaceArea|isProjected/);
    // A tiny 3857 square: shapeRecord still shapes height/stories/centroid, but
    // it must not author the area.
    const square3857 = JSON.stringify({
      type: 'Polygon',
      coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]],
    });
    const shaped = compute.shapeRecord(
      { MAX_HEIGHT: 3 },
      { geojson: square3857, config: { massing_story_height_m: 3 } },
    );
    expect(shaped).not.toBeNull();
    expect(shaped).not.toHaveProperty('footprint_area_sqm');
  });

  it('uses a PostGIS area computation (DB-side, projection-aware) — now at INSERT via the validator', () => {
    // The fix, re-homed: a single expression that handles BOTH WGS84 and Web
    // Mercator uniformly via ST_Transform(... 3857 → 4326). It renders into the
    // validator's own `validation_sql`, computed DB-side over `geom`.
    // The legacy single expression ST_Area(ST_Transform(ST_SetSRID(..., 3857), 4326)::geography) is
    // split across the validator's CTEs: `input` performs the 3857 -> 4326 transform ONCE into
    // `geom`, and the derived measure reads that transformed geom as ::geography — the same value
    // (0u `derived_from_geometry`; byte-equality proven in building-footprints-area.db.test.ts).
    expect(plan.validation_sql).toContain('ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(g.geojson), 3857), 4326) AS geom');
    expect(plan.validation_sql).toContain('ROUND((ST_Area(geom::geography))::numeric, 2) AS footprint_area_sqm');
    // The ft² unit factor is the international-foot constant, rendered into SQL
    // (never a JS `Number()` hop), exactly the legacy UPDATE's literal.
    expect(plan.validation_sql).toContain('10.7639104167');
  });

  it('area is idempotent — seeded ONCE, never recomputed for an existing row (the same guarantee, stronger)', () => {
    // Legacy: `WHERE footprint_area_sqm IS NULL` skipped already-populated rows.
    // Converted: both area columns are `written: "insert_only"`, so the row is
    // seeded at INSERT and the conflict UPDATE never touches it — a re-run can
    // never recompute (or NULL-overwrite) an existing row's area.
    const columns = descriptor.outputs.writes[0]!.columns as Array<{ name: string; written: string }>;
    const byName = new Map(columns.map((c) => [c.name, c]));
    expect(byName.get('footprint_area_sqm')!.written).toBe('insert_only');
    expect(byName.get('footprint_area_sqft')!.written).toBe('insert_only');
    // …and the rendered upsert's SET block does not assign either column.
    const setBlock = plan.upsert_sql.match(/DO\s+UPDATE\s+SET([\s\S]*?)WHERE/i)?.[1] ?? '';
    expect(setBlock, 'ON CONFLICT SET block not found').toBeTruthy();
    expect(setBlock).not.toMatch(/footprint_area_sqm\s*=/);
  });

  it('declares writes for footprint_area_sqm + footprint_area_sqft + geom', () => {
    // Per Spec 47 §R11 — the write must declare the columns it seeds so the
    // pipeline observability layer (PIPELINE_META, M-D6) attributes them.
    const names = (descriptor.outputs.writes[0]!.columns as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain('footprint_area_sqm');
    expect(names).toContain('footprint_area_sqft');
    expect(names).toContain('geom');
  });

  it('ON CONFLICT DO UPDATE SET clause does NOT touch footprint_area_sqm/sqft (worktree BUG-2 regression-lock)', () => {
    // WF2 #C 2026-05-09 — worktree review found that
    //   ON CONFLICT DO UPDATE SET footprint_area_sqm = EXCLUDED.footprint_area_sqm
    // would NULL-overwrite every existing row on every quarterly re-load
    // (since EXCLUDED carries NULL post-WF2-#C). The descriptor now encodes the
    // guarantee as `written: "insert_only"`; this reads the RENDERED SET block
    // so a codegen change cannot silently reintroduce the overwrite.
    const setBlock = plan.upsert_sql.match(/DO\s+UPDATE\s+SET([\s\S]*?)WHERE/i)?.[1] ?? '';
    expect(setBlock, 'ON CONFLICT SET block not found').toBeTruthy();
    expect(setBlock).not.toMatch(/footprint_area_sqm\s*=\s*EXCLUDED/i);
    expect(setBlock).not.toMatch(/footprint_area_sqft\s*=\s*EXCLUDED/i);
  });

  it('ON CONFLICT WHERE guard does NOT include footprint_area_sqm IS DISTINCT FROM EXCLUDED (avoids spurious updates)', () => {
    // The WHERE guard's job is to skip no-op updates. Including the area column
    // would ALWAYS evaluate true (existing != NULL) and bypass the no-op skip.
    const whereBlock = plan.upsert_sql.match(/DO\s+UPDATE[\s\S]*?WHERE([\s\S]*?)RETURNING/i)?.[1] ?? '';
    expect(whereBlock, 'ON CONFLICT WHERE block not found').toBeTruthy();
    expect(whereBlock).not.toMatch(/footprint_area_sqm\s+IS\s+DISTINCT\s+FROM\s+EXCLUDED/i);
    // …and the guard is exactly the legacy five predicates (M-D4 pinned).
    expect(plan.guard_columns).toEqual(['geometry', 'max_height_m', 'min_height_m', 'centroid_lat', 'centroid_lng']);
  });

  // WF3 2026-06-10 regression-lock: geom must be populated via the SAME ST_Transform(3857→4326)
  // the area pass uses — NOT migrations 065/098's ST_SetSRID(...,4326) which mislabeled Mercator
  // as WGS84 and made link-massing's ST_Contains fast path match 0 rows (parcel_buildings=0).
  it('populates geom via ST_Transform(... 3857 → 4326) — NOT a bare ST_SetSRID(...,4326) label', () => {
    expect(plan.validation_sql).toContain('ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(g.geojson), 3857), 4326)');
    // `geometry_repair: "none"` (M-D2, legacy parity) — the repair arm is not rendered.
    expect(plan.validation_sql).not.toContain('ST_MakeValid');
    // geom is bound as the WKB geometry the validator writes.
    const geomCol = (descriptor.outputs.writes[0]!.columns as Array<{ name: string; bind?: string }>)
      .find((c) => c.name === 'geom');
    expect(geomCol!.bind).toBe('wkb_geometry');
  });

  it('geom pass is idempotent — seeded at INSERT, never rewritten on conflict', () => {
    // Legacy: `WHERE geom IS NULL`. Converted: `insert_only` + absent from SET.
    const geomCol = (descriptor.outputs.writes[0]!.columns as Array<{ name: string; written: string }>)
      .find((c) => c.name === 'geom');
    expect(geomCol!.written).toBe('insert_only');
    const setBlock = plan.upsert_sql.match(/DO\s+UPDATE\s+SET([\s\S]*?)WHERE/i)?.[1] ?? '';
    expect(setBlock, 'ON CONFLICT SET block not found').toBeTruthy();
    expect(setBlock).not.toMatch(/\bgeom\s*=/);
  });
});
