// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8d, §9, §11.1
//
// Infra tests for enrich-heritage.js, two layers:
//  (A) Source-contract — lock 62, chain-scoped producer, CONTAINMENT match
//      (ST_Intersects, NOT the spec's ST_DWithin radius which over-matched 4× in
//      live validation), L12 Part IV precedence, Enrich-archetype emit, the 4-col
//      IS DISTINCT guard + emitMeta writes, consumer-protocol gates, DEC-H gates.
//  (B) DB-backed §11.1 — real PostGIS: parcel containing a Part IV point → part_iv;
//      parcel intersecting an HCD → part_v_hcd; parcel with both → Part IV wins (L12);
//      neither → false; idempotent re-run.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './db/setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const eh = require('../../scripts/enrich-heritage.js');

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../scripts/enrich-heritage.js'), 'utf8');

// ── (A) Source-contract ─────────────────────────────────────────────────────
describe('enrich-heritage.js — source contract (Spec 61 §8d/§9)', () => {
  it('lock 62 + reads the chain-scoped producer sources:load_heritage, completed_at DESC', () => {
    expect(SCRIPT).toMatch(/ADVISORY_LOCK_ID\s*=\s*62/);
    expect(SCRIPT).toContain("'sources:load_heritage'");
    expect(SCRIPT).toMatch(/ORDER BY completed_at DESC/);
  });

  it('§11.1 uses CONTAINMENT (ST_Intersects), NOT the over-matching ST_DWithin radius', () => {
    expect(SCRIPT).toContain('ST_Intersects(pc.geom, hd.geom)'); // Part V
    expect(SCRIPT).toContain('ST_Intersects(pc.geom, hp.geom)'); // Part IV containment (live-validation fix)
    expect(SCRIPT).not.toMatch(/ST_DWithin\(pc\.cg/); // the radius form over-matched 4× — removed
    expect(SCRIPT).toContain('AS MATERIALIZED');
    expect(SCRIPT).toMatch(/WHERE p\.geom IS NOT NULL AND NOT ST_IsEmpty\(p\.geom\) AND ST_IsValid\(p\.geom\)/);
  });

  it('L12 Part IV wins over Part V HCD; 4-col IS DISTINCT FROM guard incl. lineage', () => {
    expect(SCRIPT).toMatch(/WHEN hp_id\s+IS NOT NULL THEN 'part_iv_individual'/);
    expect(SCRIPT).toMatch(/WHEN hcd_id IS NOT NULL THEN 'part_v_hcd'/);
    expect(SCRIPT).toContain('IS DISTINCT FROM');
    expect(SCRIPT).toContain('heritage_dataset_version_when_enriched');
  });

  it('assertPreconditions guards both planar heritage GISTs + parcels GIST + fuzzystrmatch + normalize_address + the 4 M-2 columns + SRID + L14', () => {
    expect(SCRIPT).toContain('idx_parcels_geom_gist');
    expect(SCRIPT).toContain('idx_heritage_districts_geom_gist');
    expect(SCRIPT).toContain('idx_heritage_properties_geom_gist'); // planar (containment), not geog
    expect(SCRIPT).toContain('fuzzystrmatch');
    expect(SCRIPT).toContain('normalize_address');
    expect(SCRIPT).toMatch(/column_name IN \('is_heritage_designated'/); // M-2 column-existence guard
    expect(SCRIPT).toMatch(/Find_SRID\([^)]*parcels[^)]*geom/);
    expect(SCRIPT).toMatch(/COUNT\(\*\)[^;]*FROM heritage_properties/); // L14
    expect(SCRIPT).toMatch(/COUNT\(\*\)[^;]*FROM heritage_districts/);
  });

  it('Enrich archetype + emitMeta writes all 4 parcels heritage columns', () => {
    expect(SCRIPT).toMatch(/records_total:\s*null/);
    expect(SCRIPT).toMatch(/records_updated:\s*result\.updated/);
    expect(SCRIPT).toMatch(/parcels:\s*\[[^\]]*is_heritage_designated[^\]]*heritage_dataset_version_when_enriched/);
  });

  it('DEC-H: zero-match FAIL gate + Part IV-broken WARN; invalid-geom is INFO (no perpetual-WARN)', () => {
    expect(SCRIPT).toMatch(/parcels_heritage_designated_count[\s\S]*?designated === 0 \? 'FAIL' : 'INFO'/);
    expect(SCRIPT).toMatch(/parcels_part_iv_count[\s\S]*?partIv === 0 && partIvSource > 0[\s\S]*?'WARN' : 'INFO'/);
    expect(SCRIPT).toMatch(/parcels_invalid_geom_count[\s\S]*?status: 'INFO'/); // INFO, not WARN>0 (alert-fatigue fix)
  });

  it('L21 heritage_points_no_parcel_match row (calibrated thresholds above the containment baseline)', () => {
    expect(SCRIPT).toContain("metric: 'heritage_points_no_parcel_match'");
    expect(SCRIPT).toMatch(/NOT EXISTS \(SELECT 1 FROM parcels p WHERE[\s\S]*?ST_Intersects\(p\.geom, hp\.geom\)\)/);
    expect(SCRIPT).toMatch(/heritageUnlinkedPointFailPct[\s\S]*?'FAIL'/);
    expect(SCRIPT).toMatch(/heritageUnlinkedPointWarnPct[\s\S]*?'WARN'/);
  });

  it('consumer-protocol gate strings (spec_version pin, per-table feature_count, sub-block guards, drift, lineage combine)', () => {
    expect(SCRIPT).toContain('spec_version');
    expect(SCRIPT).toContain('heritage_register sub-block is missing');
    expect(SCRIPT).toContain('ingested zero features');
    expect(SCRIPT).toContain('drift_check_passed');
    expect(SCRIPT).toMatch(/\$\{reg\.source_dataset_version\}\|\$\{hcd\.source_dataset_version\}/); // lineage combine
  });
});

// ── (B) DB-backed §11.1 spatial-join behavior ───────────────────────────────
describe.skipIf(!dbAvailable())('enrich-heritage.js — §11.1 containment join (real PostGIS)', () => {
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

    const upd1 = await pool.query(eh.ENRICH_SQL, [2, 'hv1']);
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
    const upd2 = await pool.query(eh.ENRICH_SQL, [2, 'hv1']);
    expect(upd2.rowCount).toBe(0);
  });

  it('assertPreconditions HALTs (L14) when heritage_properties is empty', async () => {
    if (!pool) return;
    await pool.query('DELETE FROM heritage_properties');
    expect.assertions(1);
    await expect(eh.assertPreconditions(pool)).rejects.toThrow(/heritage_properties is empty/);
  });
});
