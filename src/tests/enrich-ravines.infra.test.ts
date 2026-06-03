// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §9, §11.1
//
// Infra tests for enrich-ravines.js, two layers:
//  (A) Source-contract — the script wires the §8d/§9 behaviors (consumer protocol,
//      assertPreconditions incl. L14, Enrich-archetype emit, emitMeta read-set
//      WITHOUT lead_id, §11.1 SQL form).
//  (B) DB-backed §11.1 — real PostGIS: a parcel inside a ravine → is_in_ravine=true,
//      distance ≤ 0; an outside parcel → false, distance > 0; idempotent re-run;
//      L14 empty-ravines precondition HALT.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './db/setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const er = require('../../scripts/enrich-ravines.js');

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../scripts/enrich-ravines.js'), 'utf8');

// ── (A) Source-contract ─────────────────────────────────────────────────────
describe('enrich-ravines.js — source contract (Spec 59 §8d/§9)', () => {
  it('lock 60 + reads the chain-scoped producer sources:load_ravines, completed_at DESC', () => {
    expect(SCRIPT).toMatch(/ADVISORY_LOCK_ID\s*=\s*60/);
    expect(SCRIPT).toContain("'sources:load_ravines'");
    expect(SCRIPT).toMatch(/ORDER BY completed_at DESC/);
  });

  it('§11.1 SQL: ST_Intersects boolean + index-accelerated LATERAL KNN (materialized centroid), geom-scoped', () => {
    expect(SCRIPT).toContain('ST_Intersects(pc.geom, r.geom)');
    expect(SCRIPT).toMatch(/pc\.cg <-> r\.geom::geography/); // binds idx_ravines_geog_gist (not the slow inline-centroid form)
    expect(SCRIPT).toContain('AS MATERIALIZED');
    expect(SCRIPT).toContain('WHERE p.geom IS NOT NULL');
    expect(SCRIPT).toContain('IS DISTINCT FROM');
  });

  it('assertPreconditions guards BOTH ravines indexes + parcels GIST + SRID + L14 empty-ravines', () => {
    expect(SCRIPT).toContain('idx_parcels_geom_gist');
    expect(SCRIPT).toContain('idx_ravines_geom_gist'); // planar (DeepSeek HIGH)
    expect(SCRIPT).toContain('idx_ravines_geog_gist'); // geography
    expect(SCRIPT).toMatch(/Find_SRID\([^)]*parcels[^)]*geom/);
    expect(SCRIPT).toMatch(/COUNT\(\*\)[^;]*FROM ravines/); // L14
  });

  it('Enrich archetype emit + emitMeta read-set is id/geom only (NO lead_id — Observability BUG-2)', () => {
    expect(SCRIPT).toMatch(/records_total:\s*null/);
    expect(SCRIPT).toMatch(/records_updated:\s*result\.updated/);
    expect(SCRIPT).toMatch(/parcels:\s*\['id', 'geom'\]/);
    expect(SCRIPT).not.toMatch(/parcels:\s*\[[^\]]*lead_id/);
  });

  it('consumer-protocol gate strings present (spec_version pin, empty-guard, drift, lineage)', () => {
    expect(SCRIPT).toContain('spec_version');
    expect(SCRIPT).toContain('delete_skipped_empty_guard');
    expect(SCRIPT).toContain('mass_delete_check_passed');
    expect(SCRIPT).toContain('source_dataset_version is null/empty');
  });
});

// ── (B) DB-backed §11.1 spatial-join behavior ───────────────────────────────
describe.skipIf(!dbAvailable())('enrich-ravines.js — §11.1 spatial join (real PostGIS)', () => {
  const pool = getTestPool()!;
  // A ravine box covering lon -79.41..-79.39, lat 43.69..43.71.
  const RAVINE = "ST_Multi(ST_GeomFromText('POLYGON((-79.41 43.69,-79.39 43.69,-79.39 43.71,-79.41 43.71,-79.41 43.69))',4326))";
  // Parcel INSIDE the box (centroid inside).
  const INSIDE = "ST_GeomFromText('POLYGON((-79.401 43.699,-79.399 43.699,-79.399 43.701,-79.401 43.701,-79.401 43.699))',4326)";
  // Parcel far OUTSIDE the box.
  const OUTSIDE = "ST_GeomFromText('POLYGON((-79.31 43.80,-79.30 43.80,-79.30 43.81,-79.31 43.81,-79.31 43.80))',4326)";

  afterAll(async () => {
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'RAV-INFRA-%'");
    await pool.query('DELETE FROM ravines WHERE source_id >= 990100');
    await pool.end();
  });

  it('enriches an inside parcel (true, distance ≤ 0) and an outside parcel (false, distance > 0); idempotent re-run', async () => {
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'RAV-INFRA-%'");
    await pool.query('DELETE FROM ravines WHERE source_id >= 990100');
    await pool.query(`INSERT INTO ravines (source_id, geom, source_dataset_version) VALUES (990101, ${RAVINE}, 'tv1')`);
    await pool.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('RAV-INFRA-IN', ${INSIDE}), ('RAV-INFRA-OUT', ${OUTSIDE})`);

    const upd1 = await pool.query(er.ENRICH_SQL, ['tv1']);
    expect(upd1.rowCount).toBeGreaterThanOrEqual(2);

    const { rows } = await pool.query(
      `SELECT parcel_id, is_in_ravine_protection_area AS inr, ravine_distance_m AS dist, ravine_dataset_version_when_enriched AS ver
         FROM parcels WHERE parcel_id LIKE 'RAV-INFRA-%' ORDER BY parcel_id`,
    );
    const inside = rows.find((r) => r.parcel_id === 'RAV-INFRA-IN');
    const outside = rows.find((r) => r.parcel_id === 'RAV-INFRA-OUT');
    expect(inside.inr).toBe(true);
    expect(Number(inside.dist)).toBeLessThanOrEqual(0); // L2: 0 inside, negative if intersecting
    expect(inside.ver).toBe('tv1');
    expect(outside.inr).toBe(false);
    expect(Number(outside.dist)).toBeGreaterThan(0);
    expect(outside.ver).toBe('tv1');

    // Idempotency: same version + unchanged geometry → IS DISTINCT FROM guard → 0 rows.
    const upd2 = await pool.query(er.ENRICH_SQL, ['tv1']);
    expect(upd2.rowCount).toBe(0);
  });

  it('assertPreconditions HALTs (L14) when the ravines table is empty', async () => {
    // Unconditionally clear ALL ravines so the L14 guard is genuinely exercised
    // (a `if (count===0)` wrapper could vacuously pass if seed rows lingered — Code Reviewer DEFER-3).
    await pool.query('DELETE FROM ravines');
    expect.assertions(1);
    await expect(er.assertPreconditions(pool)).rejects.toThrow(/ravines table is empty/);
  });
});
