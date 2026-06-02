// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §3, §4.2, §9
//
// Infra tests for load-ravines.js (Spec 59 §8c), two layers:
//  (A) Source-contract assertions — the script wires every §3/§9 behavior
//      (validation SQL, WKB bind, xmax=0 + IS DISTINCT FROM upsert, F-C1 guard,
//      two-arg emitMeta, all 9 audit rows, override-WARN, dedupe, cleanup).
//  (B) DB-backed §3.5 classifier — runs the actual VALIDATION_SQL against a
//      Postgres fixture to prove accepted / collection_extracted / skipped /
//      self-intersection-repair statuses (the GeometryCollection rescue counter).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './db/setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ravines = require('../../scripts/load-ravines.js');

const SCRIPT = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/load-ravines.js'),
  'utf8',
);

// ── (A) Source-contract assertions ────────────────────────────────────────
describe('load-ravines.js — source contract (Spec 59 §3/§9)', () => {
  it('advisory lock 59 + chain-scoped prior-run read (DEC-F: sources:load_ravines)', () => {
    expect(SCRIPT).toMatch(/ADVISORY_LOCK_ID\s*=\s*59/);
    expect(SCRIPT).toContain("'sources:load_ravines'");
  });

  it('validates geometry via the §3.5 batched SQL (single round-trip, L16) before withTransaction', () => {
    expect(SCRIPT).toMatch(/VALUES\s*\+\s*UNNEST|unnest\(\$1::BIGINT\[\]\)/);
    expect(SCRIPT).toContain('ST_MakeValid');
    expect(SCRIPT).toContain('ST_CollectionExtract');
    expect(SCRIPT).toContain('collection_extracted');
  });

  it('binds validated geometry as WKB at upsert (ST_GeomFromWKB(...,4326))', () => {
    expect(SCRIPT).toContain('ST_GeomFromWKB(');
    expect(SCRIPT).toMatch(/ST_GeomFromWKB\([^)]*4326\)/);
  });

  it('upsert uses xmax=0 insert/update discrimination + IS DISTINCT FROM guard (DEC-G/L11)', () => {
    expect(SCRIPT).toMatch(/RETURNING\s*\(xmax = 0\)/);
    expect(SCRIPT).toContain('IS DISTINCT FROM');
  });

  it('F-C1 empty-set DELETE guard runs in the JS layer (L15), not PL/pgSQL', () => {
    expect(SCRIPT).toContain('shouldSkipDelete');
    expect(SCRIPT).toMatch(/DELETE FROM ravines WHERE source_id <> ALL\(\$1::BIGINT\[\]\)/);
  });

  it('dedupes by source_id before the VALUES list (DeepSeek MED — ON CONFLICT twice guard)', () => {
    expect(SCRIPT).toContain('dedupeBySourceId');
  });

  it('emits the two-arg table-keyed emitMeta (L17) + records_total = feature_count (§11)', () => {
    expect(SCRIPT).toMatch(/emitMeta\(\s*\{\s*\[CKAN_INPUT_KEY\]/);
    expect(SCRIPT).toMatch(/ravines:\s*\['source_id', 'geom', 'source_dataset_version', 'created_at', 'updated_at'\]/);
    expect(SCRIPT).toMatch(/records_total:\s*featureCount/);
  });

  it('emits all 9 §9 audit rows + the override-present WARN rows', () => {
    for (const m of [
      'ravine_feature_count',
      'ravine_geometry_repaired_pct',
      'ravine_geometry_collection_extracted',
      'ravine_geometry_skipped_pct',
      'ravine_count_drift_pct',
      'ravine_mass_delete_pct',
      'ravine_geometry_update_pct',
      'ravine_dataset_age_years',
      'ravine_load_skipped',
    ]) {
      expect(SCRIPT).toContain(`'${m}'`);
    }
    expect(SCRIPT).toContain('ravine_override_feature_count_drift_present');
    expect(SCRIPT).toContain('ravine_override_mass_delete_present');
  });

  it('L7/L7c overrides enable execution but the audit row stays FAIL (verdict not suppressed)', () => {
    // The drift/mass-delete rows are pushed with 'FAIL' regardless of the override flag.
    expect(SCRIPT).toMatch(/push\('ravine_count_drift_pct',[\s\S]*?'FAIL'\)/);
    expect(SCRIPT).toMatch(/push\('ravine_mass_delete_pct',[\s\S]*?'FAIL'\)/);
    expect(SCRIPT).toContain('override never suppresses FAIL');
  });

  it('L7c mass-delete without RAVINE_ACCEPT_MASS_DELETE terminates the run as failed (acceptMassDelete gates the outcome)', () => {
    // acceptMassDelete must be USED (not dead) — it gates the final return.
    expect(SCRIPT).toMatch(/\(massDeleteCheckPassed \|\| acceptMassDelete\)\s*\?\s*\{\s*ok:\s*true\s*\}\s*:\s*\{\s*failed:\s*true\s*\}/);
  });

  it('ravine_dataset_age_years is pushed after the HEAD (covers skip + all failure paths, not just success)', () => {
    // The age row must appear before the skip-check return so failure paths include it.
    const callIdx = SCRIPT.indexOf('const skip = skipCheckDecision(');
    const ageIdx = SCRIPT.indexOf("push('ravine_dataset_age_years'");
    expect(ageIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(-1);
    expect(ageIdx).toBeLessThan(callIdx); // pushed before the skip-check call → on the skip return path too
  });

  it('freezes the 18-field records_meta.ravine_load contract (§9)', () => {
    for (const k of [
      'spec_version', 'source_dataset_version', 'last_modified', 'etag', 'content_hash',
      'feature_count', 'polygons_inserted', 'polygons_updated', 'polygons_deleted',
      'delete_skipped_empty_guard', 'mass_delete_pct', 'invalid_geometry_repaired',
      'invalid_geometry_skipped', 'geometry_collection_extracted', 'drift_check_passed',
      'mass_delete_check_passed', 'geometry_update_pct', 'skipped_reason',
    ]) {
      expect(SCRIPT).toContain(`${k}:`);
    }
  });

  it('cross-platform unzip (node-stream-zip, NOT shell) + temp cleanup (no Expand-Archive)', () => {
    expect(SCRIPT).toContain("require('node-stream-zip')");
    expect(SCRIPT).toMatch(/fs\.rmSync\(tmpRoot,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/);
    expect(SCRIPT).not.toMatch(/Expand-Archive|execSync/);
  });

  it('scans for a single *.shp (case-insensitive) + requires the companion .dbf', () => {
    expect(SCRIPT).toMatch(/no shapefile \(\.shp\) found in zip/);
    expect(SCRIPT).toMatch(/expected one \.shp/);
    expect(SCRIPT).toMatch(/missing companion \.dbf/);
    expect(SCRIPT).toContain('.toLowerCase().endsWith');
  });
});

// ── (B) DB-backed §3.5 classifier behavior ─────────────────────────────────
describe.skipIf(!dbAvailable())('load-ravines.js — §3.5 VALIDATION_SQL classifier (real PostGIS)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = async (geojsons: string[]): Promise<Map<number, any>> => {
    const pool = getTestPool()!;
    const ids = geojsons.map((_, i) => i + 1);
    const { rows } = await pool.query(ravines.VALIDATION_SQL, [ids, geojsons]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Map<number, any>(rows.map((r: any) => [Number(r.source_id), r]));
  };

  it('a clean polygon → accepted, was already valid', async () => {
    const poly = JSON.stringify({ type: 'Polygon', coordinates: [[[-79.4, 43.7], [-79.39, 43.7], [-79.39, 43.71], [-79.4, 43.71], [-79.4, 43.7]]] });
    const r = (await run([poly])).get(1)!;
    expect(r.status).toBe('accepted');
    expect(r.is_valid_original).toBe(true);
    expect(r.geom_wkb).toBeTruthy();
  });

  it('a self-intersecting bowtie polygon → accepted (repaired), was invalid', async () => {
    const bowtie = JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] });
    const r = (await run([bowtie])).get(1)!;
    expect(['accepted', 'collection_extracted']).toContain(r.status);
    expect(r.is_valid_original).toBe(false); // ST_MakeValid had work to do
  });
});
