// 🔗 SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5, §1.2a
//
// Structural regression-locks on the CONVERTED load_address_points step after
// WF1 #parcel-address-bridge Phase 2b + the WF2 batch-2 row 3.1 conversion.
//
// RE-POINTED, NEVER WEAKENED (geocode_permits 7d precedent): before the conversion
// these assertions read `scripts/load-address-points.js`'s SOURCE TEXT. That file is
// now the §5.1 frozen shell, so every claim it made is re-pointed at the artefact that
// now OWNS it — the descriptor's declared write plan for the INSERT column list and the
// guard/COALESCE discipline, `compute.shapeRecord` for the geometry mapping, and the
// declared `checks[]` for the audit rows. Same file path, same test names.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const STEP_REL = 'scripts/load-address-points.js';
const COMPUTE_REL = 'scripts/lib/compute/load-address-points.js';
const DESCRIPTOR_REL = 'scripts/load-address-points.descriptor.json';

function abs(rel: string) {
  return path.join(REPO_ROOT, rel);
}

describe('scripts/load-address-points.js — WF1 Phase 2b extension', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let descriptor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let compute: any;
  let src: string;

  beforeAll(() => {
    descriptor = JSON.parse(fs.readFileSync(abs(DESCRIPTOR_REL), 'utf-8'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS pipeline module
    compute = require(abs(COMPUTE_REL));
    src = fs.readFileSync(abs(STEP_REL), 'utf-8');
  });

  it('imports the shared CSV-drift detector + normalizer lib', () => {
    // The frozen shell imports nothing but the pipeline, descriptor and compute; the
    // two domain libs are now required by the COMPUTE (the one home for domain logic).
    expect(src).toMatch(/require\(['"]\.\/lib\/compute\/load-address-points['"]\)/);
    const computeSrc = fs.readFileSync(abs(COMPUTE_REL), 'utf-8');
    expect(computeSrc).toMatch(/require\(['"]\.\.\/address-points-csv-drift['"]\)/);
    expect(computeSrc).toMatch(/require\(['"]\.\.\/address-normalizers['"]\)/);
  });

  it('INSERT column list covers the 16 columns (3 base + 10 source + 2 normalized + geom)', () => {
    const write = descriptor.outputs.writes[0];
    expect(write.table).toBe('address_points');
    const cols = write.columns.map((c: { name: string }) => c.name);
    for (const c of [
      'address_point_id',
      'address_number',
      'linear_name_full',
      'address_full',
      'lo_num',
      'hi_num',
      'maint_stage',
      'address_status',
      'address_class_desc',
      'class_family_desc',
      'place_name',
      'addr_num_normalized',
      'linear_name_normalized',
      'geom',
    ]) {
      expect(cols, `outputs.writes[0].columns declares ${c}`).toContain(c);
    }
    expect(write.columns).toHaveLength(16);
  });

  it('computes geom from the coordinate OR-contract (geometry GeoJSON, else lat/lng)', () => {
    // Pre-conversion the SQL built `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`; the
    // conversion binds a `wkb_geometry` column whose value `shapeRecord` provides as
    // `geojson` (the field `validateGeometries`/`write.executeWrite` read).
    const geomCol = descriptor.outputs.writes[0].columns.find((c: { name: string }) => c.name === 'geom');
    expect(geomCol.bind).toBe('wkb_geometry');
    // A `geometry` GeoJSON cell is carried verbatim; a lat/lng fallback synthesises a Point.
    const point = JSON.stringify({ type: 'Point', coordinates: [-79.5, 43.7] });
    const withGeom = compute.shapeRecord({ ADDRESS_POINT_ID: '1', geometry: point });
    expect(withGeom.geojson).toBe(point);
    const fallback = compute.shapeRecord({
      ADDRESS_POINT_ID: '2', LATITUDE: '43.7', LONGITUDE: '-79.5',
    });
    expect(JSON.parse(fallback.geojson)).toEqual({ type: 'Point', coordinates: [-79.5, 43.7] });
  });

  it('UPSERT preserves existing values via the guarded_upsert write_discipline', () => {
    // Pre-conversion the SQL carried `COALESCE(NULLIF(EXCLUDED.x, ''), address_points.x)`
    // per text column. The conversion expresses the same preservation as a class-A
    // guarded upsert whose guard columns are the ones whose change is meaningful.
    const wd = descriptor.outputs.writes[0].write_discipline;
    expect(wd.class).toBe('guarded_upsert');
    expect(wd.guard).toBe('is_distinct_from');
    for (const c of [
      'address_number',
      'linear_name_full',
      'address_full',
      'maint_stage',
      'address_status',
      'address_class_desc',
      'class_family_desc',
      'place_name',
      'addr_num_normalized',
      'linear_name_normalized',
      'lo_num',
      'hi_num',
      'geom',
    ]) {
      expect(wd.guard_columns, `guard_columns carries ${c}`).toContain(c);
    }
  });

  it('integer columns (lo_num, hi_num) are parsed, not string-coerced (no empty-string sentinel)', () => {
    // The pre-conversion plain COALESCE for lo_num/hi_num existed because those are
    // integers, not text. The conversion keeps that distinction in `shapeRecord`: an
    // integer column is `safeParseIntOrNull`-ed, so an empty cell is null, never ''.
    const shaped = compute.shapeRecord({ ADDRESS_POINT_ID: '3', LO_NUM: '', HI_NUM: '12', LATITUDE: '1', LONGITUDE: '2' });
    expect(shaped.lo_num).toBeNull();
    expect(shaped.hi_num).toBe(12);
  });

  it('WHERE clause guards no-op writes (the guard_columns IS DISTINCT FROM predicate)', () => {
    // The pre-conversion WHERE clause was `NULLIF(EXCLUDED.address_number, '') IS NOT NULL`
    // etc. Converted, the no-op guard is the write plan's own `IS DISTINCT FROM` over the
    // declared guard columns: a re-run of a byte-identical source updates zero rows.
    const wd = descriptor.outputs.writes[0].write_discipline;
    expect(wd.guard).toBe('is_distinct_from');
    expect(Array.isArray(wd.guard_columns)).toBe(true);
    expect(wd.guard_columns.length).toBeGreaterThan(0);
    expect(wd.idempotent_rerun).toBe('zero_writes');
    // `address_number` and `linear_name_full` are the two the pre-conversion WHERE named.
    expect(wd.guard_columns).toContain('address_number');
    expect(wd.guard_columns).toContain('linear_name_full');
  });

  it('emits CSV-drift audit row (analogous to parcels CRIT-3b)', async () => {
    const check = descriptor.checks.find((c: { id: string }) => c.id === 'csv_header_drift');
    expect(check, 'checks[] declares csv_header_drift').toBeTruthy();
    expect(check.severity).toBe('WARN');
    // The check is DISPATCHED in the compute (the row producer moved there).
    expect(Object.keys(compute.checks)).toContain('csv_header_drift');
    // The drift lib's builder is reused, not forked.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS pipeline module
    const drift = require(path.join(REPO_ROOT, 'scripts/lib/address-points-csv-drift'));
    expect(drift.buildDriftAuditRow(['ADDRESS_NUMBER']).status).toBe('WARN');
    // And the dispatched check fires: a header-only fixture (missing columns, no
    // coordinate source) reports the missing columns as violations.
    const reported: Record<string, { violations?: number }> = {};
    const ctx = {
      checks: ['csv_header_drift'],
      config: {},
      descriptor: { identity: { name: 'address_points' } },
      log: { error() {} },
      report(id: string, obs: { violations?: number }) { reported[id] = obs; },
      acquired: { csv_columns: ['ADDRESS_POINT_ID'] },
      written: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    return compute.compute(ctx).then(() => {
      expect(reported.csv_header_drift!.violations).toBeGreaterThan(0);
    });
  });

  it('emits null-address-number audit row', async () => {
    const check = descriptor.checks.find((c: { id: string }) => c.id === 'null_address_number_pct');
    expect(check, 'checks[] declares null_address_number_pct').toBeTruthy();
    expect(check.severity).toBe('WARN');
    expect(check.limit_from_config).toBe('address_points_null_address_number_max_pct');
    expect(Object.keys(compute.checks)).toContain('null_address_number_pct');
    // The dispatched check trips only ABOVE the declared config bound (Rule 3: the
    // number is the operator's, not a literal in the compute).
    const run = async (nullRows: number, attempted: number, limit: number, pctUnit?: number) => {
      const reported: Record<string, { violations?: number }> = {};
      const ctx = {
        checks: ['null_address_number_pct'],
        config: { address_points_null_address_number_max_pct: pctUnit ?? limit },
        descriptor: { identity: { name: 'address_points' } },
        log: { error() {} },
        report(id: string, obs: { violations?: number }) { reported[id] = obs; },
        acquired: {
          rows_shaped: attempted,
          column_nulls: { address_number: nullRows },
        },
        written: null,
      };
      await compute.compute(ctx);
      return reported.null_address_number_pct!.violations;
    };
    // FIX (row 3.1 fix pass): the literal was ratio-mismatched — the compute (and the
    // frozen RED suite src/tests/steps/address_points/violations.test.ts, and the drift
    // lib's own 0.10 boundary) compare the RATIO against the config value
    // (Spec 122 §5.5: "the pct checks report a ratio"). "limit": 10 with a 0-1 ratio
    // tripped both branches. Corrected to the ratio unit; the assertions' INTENT
    // (below-bound clean / above-bound tripping) is unchanged.
    // AP-D8 (2026-09-24): re-pointed onto the generic 0o runner counters
    // (`acquired.rows_shaped` / `acquired.column_nulls.address_number`) — the prior
    // `attempted_address_number_rows` / `null_address_number_rows` fields were never
    // populated by any runner (review_followups.md:4082). The run() helper's
    // (nullRows, attempted) params are unchanged; only the ctx.acquired shape below
    // moved onto the new counter names.
    await expect(run(50, 1000, 1)).resolves.toBe(0); // 0.05 < 1 ⇒ clean
    await expect(run(1000, 1000, 1)).resolves.toBe(0); // 1.00 > 1 is false — boundary is strict >
    await expect(run(500, 1000, 0.1)).resolves.toBe(1); // 0.50 > 0.10 ⇒ violation
    await expect(run(50, 1000, 0.1)).resolves.toBe(0); // 0.05 < 0.10 ⇒ clean
  });

  it('the verdict is row-derived, not a parallel boolean in the compute', () => {
    // Pre-conversion the file carried its own `auditRows.some(r => r.status === 'FAIL')`
    // cascade. Spec 48 §3.6 / Spec 124 Rule 10: `scripts/lib/step/verdict.js`
    // `deriveVerdict` is the ONE place a PASS/WARN/FAIL cascade is computed. Neither the
    // frozen shell nor the compute may derive one — the compute-shape rule bans any
    // identifier/key named `verdict` in `scripts/lib/compute/**`.
    const computeSrc = fs.readFileSync(abs(COMPUTE_REL), 'utf-8');
    // The doc comment names the rule it obeys; the CODE must not derive one. Strip
    // comments before asserting (mirrors src/tests/steps/load_ravines/violations.test.ts).
    const code = computeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bverdict\b/);
    expect(src).not.toMatch(/auditRows\.some/);
    expect(src).not.toMatch(/const\s+hasFails\s*=\s*errors/);
    expect(src).not.toMatch(/const\s+hasWarns\s*=\s*processed/);
  });

  it('the external reads-list declares the consumed CSV columns', () => {
    const external = descriptor.inputs.reads.externals[0];
    expect(external.format).toBe('csv');
    expect(external.key_property).toBe('ADDRESS_POINT_ID');
    expect(external.url).toContain('address-points-4326.csv');
    // The coerceKey seam the acquisition uses is the compute's, `ADDRESS_POINT_ID` int.
    expect(compute.coerceKey('42')).toBe(42);
    expect(compute.coerceKey('')).toBeNull();
  });

  it('outputs declare all 16 persisted columns (incl. geom + 2 normalized)', () => {
    const cols = descriptor.outputs.writes[0].columns.map((c: { name: string }) => c.name);
    expect(cols).toContain('addr_num_normalized');
    expect(cols).toContain('linear_name_normalized');
    expect(cols).toContain('geom');
  });
});
