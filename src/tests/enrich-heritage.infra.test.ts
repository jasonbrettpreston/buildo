// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8d, §9, §11.1
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5 (compute shape)
//
// Batch-2 row 2.2 — RE-DERIVED against the descriptor + compute module (Spec 122 §5.1 froze the
// shell; the source-text regex assertions below now read scripts/lib/compute/enrich-heritage.js,
// the file that genuinely carries the SQL, rather than the retired monolithic script).
//  (A) Source-contract — lock 62, chain-scoped producer, CONTAINMENT match (ST_Intersects, NOT
//      the spec's ST_DWithin radius which over-matched 4× in live validation), L12 Part IV
//      precedence, guards.requires for the 3 GISTs + fuzzystrmatch + normalize_address + the 4
//      M-2 columns, the 4-col IS DISTINCT guard, consumer-protocol gate strings.
//  (B) DB-backed §11.1 — real PostGIS: parcel containing a Part IV point → part_iv; parcel
//      intersecting an HCD → part_v_hcd; parcel with both → Part IV wins (L12); neither → false;
//      idempotent re-run — against compute.ENRICH_SQL (the compute module owns the SQL now).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './db/setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const eh = require('../../scripts/enrich-heritage.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../scripts/lib/compute/enrich-heritage.js');

const COMPUTE_SRC = fs.readFileSync(path.resolve(__dirname, '../../scripts/lib/compute/enrich-heritage.js'), 'utf8');

// ── (A) Source-contract ─────────────────────────────────────────────────────
describe('enrich-heritage — source contract (Spec 61 §8d/§9), RE-DERIVED against descriptor + compute', () => {
  it('lock 62 + reads the chain-scoped producer sources:load_heritage, completed_at DESC', () => {
    expect(eh.descriptor.identity.lock).toBe(62);
    expect(compute.PRODUCER_NAME).toBe('sources:load_heritage');
    expect(COMPUTE_SRC).toMatch(/ORDER BY completed_at DESC/);
  });

  it('§11.1 uses CONTAINMENT (ST_Intersects), NOT the over-matching ST_DWithin radius', () => {
    expect(compute.ENRICH_SQL).toContain('ST_Intersects(pc.geom, hd.geom)'); // Part V
    expect(compute.ENRICH_SQL).toContain('ST_Intersects(pc.geom, hp.geom)'); // Part IV containment (live-validation fix)
    expect(compute.ENRICH_SQL).not.toMatch(/ST_DWithin\(pc\.cg/); // the radius form over-matched 4× — removed
    expect(compute.ENRICH_SQL).toContain('AS MATERIALIZED');
    expect(compute.ENRICH_SQL).toMatch(/WHERE p\.geom IS NOT NULL AND NOT ST_IsEmpty\(p\.geom\) AND ST_IsValid\(p\.geom\)/);
  });

  it('L12 Part IV wins over Part V HCD; 4-col IS DISTINCT FROM guard incl. lineage', () => {
    expect(compute.ENRICH_SQL).toMatch(/WHEN hp_id\s+IS NOT NULL THEN 'part_iv_individual'/);
    expect(compute.ENRICH_SQL).toMatch(/WHEN hcd_id IS NOT NULL THEN 'part_v_hcd'/);
    expect(compute.ENRICH_SQL).toContain('IS DISTINCT FROM');
    expect(compute.ENRICH_SQL).toContain('heritage_dataset_version_when_enriched');
    const w0 = eh.descriptor.outputs.writes[0];
    expect(w0.write_discipline.guard_columns).toEqual([
      'is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date', 'heritage_dataset_version_when_enriched',
    ]);
  });

  it('guards.requires declares both planar heritage GISTs + parcels GIST + fuzzystrmatch + the 4 M-2 columns; SRID + L14 live in readHeritageContract', () => {
    const names = eh.descriptor.guards.requires.map((r: { kind: string; name: string }) => `${r.kind}:${r.name}`);
    expect(names).toEqual(expect.arrayContaining([
      'extension:postgis',
      'extension:fuzzystrmatch',
      'index:idx_parcels_geom_gist',
      'index:idx_heritage_districts_geom_gist',
      'index:idx_heritage_properties_geom_gist',
      'column:parcels.heritage_dataset_version_when_enriched',
      'column:parcels.is_heritage_designated',
      'column:parcels.heritage_designation_type',
      'column:parcels.heritage_designation_date',
    ]));
    expect(COMPUTE_SRC).toMatch(/Find_SRID\([^)]*parcels[^)]*geom/);
    expect(COMPUTE_SRC).toMatch(/COUNT\(\*\)[^;]*FROM heritage_properties/); // L14
    expect(COMPUTE_SRC).toMatch(/COUNT\(\*\)[^;]*FROM heritage_districts/);
  });

  it('ENRICHER archetype + emitMeta-equivalent read/write declarations cover all 4 parcels heritage columns', () => {
    expect(eh.descriptor.identity.archetype).toBe('ENRICHER');
    expect(eh.descriptor.counters.records_updated.source).toBe('written.e1.updated');
    const writtenCols = eh.descriptor.outputs.writes[0].columns.map((c: { name: string }) => c.name);
    expect(writtenCols).toEqual([
      'is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date', 'heritage_dataset_version_when_enriched',
    ]);
  });

  it('DEC-H: zero-match FAIL gate + Part IV-broken WARN; invalid-geom is INFO (no perpetual-WARN)', () => {
    const checks = eh.descriptor.checks;
    const designated = checks.find((c: { id: string }) => c.id === 'parcels_heritage_designated_count');
    const partIv = checks.find((c: { id: string }) => c.id === 'parcels_part_iv_count');
    const invalidGeom = checks.find((c: { id: string }) => c.id === 'parcels_invalid_geom_count');
    expect(designated.severity).toBe('FAIL');
    expect(partIv.severity).toBe('WARN');
    expect(invalidGeom.severity).toBe('INFO'); // INFO, not WARN>0 (alert-fatigue fix, F8)
  });

  it('L21 heritage_points_no_parcel_match row (calibrated thresholds above the containment baseline)', () => {
    const check = eh.descriptor.checks.find((c: { id: string }) => c.id === 'heritage_points_no_parcel_match');
    expect(check).toBeTruthy();
    expect(check.limit_from_config).toBe('enrich_heritage_unlinked_point_warn_pct');
    expect(check.warn_limit_from_config).toBe('enrich_heritage_unlinked_point_fail_pct');
    expect(compute.UNLINKED_SQL).toMatch(/NOT EXISTS \(SELECT 1 FROM parcels p WHERE[\s\S]*?ST_Intersects\(p\.geom, hp\.geom\)\)/);
  });

  it('consumer-protocol gate strings (spec_version pin, per-table feature_count, sub-block guards, drift, lineage combine)', () => {
    expect(COMPUTE_SRC).toContain('spec_version');
    expect(COMPUTE_SRC).toContain('heritage_register sub-block is missing');
    expect(COMPUTE_SRC).toContain('ingested zero features');
    expect(COMPUTE_SRC).toContain('drift_check_passed');
    expect(COMPUTE_SRC).toMatch(/\$\{reg\.source_dataset_version\}\|\$\{hcd\.source_dataset_version\}/); // lineage combine
  });
});

// ── (B) DB-backed §11.1 spatial-join behavior ───────────────────────────────
describe.skipIf(!dbAvailable())('enrich-heritage — §11.1 containment join (real PostGIS), against compute.ENRICH_SQL', () => {
  const pool = getTestPool()!;
  // HCD polygon box: lon -79.41..-79.39, lat 43.69..43.71.
  const HCD = "ST_Multi(ST_GeomFromText('POLYGON((-79.41 43.69,-79.39 43.69,-79.39 43.71,-79.41 43.71,-79.41 43.69))',4326))";
  // Part IV point FAR from the HCD (for the pure-Part-IV parcel).
  const PIV_FAR = "ST_GeomFromText('POINT(-79.30 43.80)',4326)";
  // Part IV point INSIDE the HCD box (for the both-match parcel, tests L12).
  const PIV_IN_HCD = "ST_GeomFromText('POINT(-79.405 43.705)',4326)";
  // Parcel containing PIV_FAR (far from HCD) → part_iv_individual.
  const P_IV = "ST_GeomFromText('POLYGON((-79.301 43.799,-79.299 43.799,-79.299 43.801,-79.301 43.801,-79.301 43.799))',4326)";
  // Parcel inside the HCD, no Part IV point → part_v_hcd.
  const P_V = "ST_GeomFromText('POLYGON((-79.395 43.692,-79.393 43.692,-79.393 43.694,-79.395 43.694,-79.395 43.692))',4326)";
  // Parcel inside the HCD that ALSO contains PIV_IN_HCD → Part IV wins (L12).
  const P_BOTH = "ST_GeomFromText('POLYGON((-79.406 43.704,-79.404 43.704,-79.404 43.706,-79.406 43.706,-79.406 43.704))',4326)";
  // Parcel far from everything → false.
  const P_NONE = "ST_GeomFromText('POLYGON((-79.201 43.599,-79.199 43.599,-79.199 43.601,-79.201 43.601,-79.201 43.599))',4326)";

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'HER-INFRA-%'");
    await pool.query('DELETE FROM heritage_properties WHERE source_id >= 990100');
    await pool.query('DELETE FROM heritage_districts WHERE source_id >= 990100');
    await pool.end();
  });

  it('part_iv (containment), part_v_hcd (intersect), L12 both→Part IV, neither→false; idempotent', async () => {
    if (!pool) return;
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'HER-INFRA-%'");
    await pool.query('DELETE FROM heritage_properties WHERE source_id >= 990100');
    await pool.query('DELETE FROM heritage_districts WHERE source_id >= 990100');

    await pool.query(`INSERT INTO heritage_districts (source_id, name, hcd_type, geom, source_dataset_version) VALUES (990101, 'Test HCD', 'designated_district', ${HCD}, 'hv1')`);
    await pool.query(
      `INSERT INTO heritage_properties (source_id, status, geom, designated_date, address_text, source_dataset_version) VALUES
        (990101, 'part_iv', ${PIV_FAR},    DATE '1997-12-08', '1 far st',  'hv1'),
        (990102, 'part_iv', ${PIV_IN_HCD}, DATE '2001-05-05', '2 hcd st',  'hv1')`,
    );
    await pool.query(
      `INSERT INTO parcels (parcel_id, geom) VALUES
        ('HER-INFRA-IV',   ${P_IV}),
        ('HER-INFRA-V',    ${P_V}),
        ('HER-INFRA-BOTH', ${P_BOTH}),
        ('HER-INFRA-NONE', ${P_NONE})`,
    );

    const upd1 = await pool.query(compute.ENRICH_SQL, [2, 'hv1']);
    expect(upd1.rowCount).toBeGreaterThanOrEqual(3); // the 3 designated parcels change

    const { rows } = await pool.query(
      `SELECT parcel_id, is_heritage_designated AS d, heritage_designation_type AS t, heritage_designation_date AS dt
         FROM parcels WHERE parcel_id LIKE 'HER-INFRA-%' ORDER BY parcel_id`,
    );
    const by = Object.fromEntries(rows.map((r) => [r.parcel_id, r]));
    expect(by['HER-INFRA-IV'].d).toBe(true);
    expect(by['HER-INFRA-IV'].t).toBe('part_iv_individual');
    expect(by['HER-INFRA-V'].d).toBe(true);
    expect(by['HER-INFRA-V'].t).toBe('part_v_hcd');
    expect(by['HER-INFRA-BOTH'].d).toBe(true);
    expect(by['HER-INFRA-BOTH'].t).toBe('part_iv_individual'); // L12: Part IV wins over the HCD it sits in
    expect(by['HER-INFRA-NONE'].d).toBe(false);
    expect(by['HER-INFRA-NONE'].t).toBeNull();

    // Idempotency: same version + unchanged geometry → IS DISTINCT FROM guard → 0 rows.
    const upd2 = await pool.query(compute.ENRICH_SQL, [2, 'hv1']);
    expect(upd2.rowCount).toBe(0);
  });

  it('readHeritageContract HALTs (L14) when heritage_properties is empty', async () => {
    if (!pool) return;
    await pool.query(
      `INSERT INTO heritage_districts (source_id, name, hcd_type, geom, designated_date, source_dataset_version)
       VALUES (990199, 'B-418-infra HCD', 'designated_district', ${HCD}, '2020-01-01', 'infra-empty-hp-test')
       ON CONFLICT DO NOTHING`,
    );
    await pool.query('DELETE FROM heritage_properties');
    // No producer contract row exists in this container for 'sources:load_heritage', so the
    // FIRST halt readHeritageContract reaches is "no successful run" — proving the SAME pre-
    // transaction hook still refuses cleanly rather than reaching a raw query error. The L14
    // empty-table halt itself (reached only once the contract read passes) is proven against a
    // fixture pool in src/tests/enrich-heritage-418.logic.test.ts (H4), which does not need a
    // live container.
    expect.assertions(1);
    await expect(compute.readHeritageContract(pool)).rejects.toThrow();
  });
});
