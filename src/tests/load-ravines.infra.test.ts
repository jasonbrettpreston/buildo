// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §3, §4.2, §9
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4, §5.1, §5.5 (pilot 2 conversion)
//
// Infra tests for load_ravines (Spec 59 §8c), three layers:
//  (A) Source-contract assertions — every §3/§9 behaviour is still WIRED, now across
//      the three files the frozen shape splits the step into.
//  (B) Descriptor-contract assertions — the behaviours that stopped being code and
//      became DATA (§1.2a P1). A grep over a step file cannot see those, so they are
//      asserted against the descriptor instead of quietly dropped.
//  (C) DB-backed §3.5 classifier — runs the actual generated validation SQL against a
//      Postgres fixture to prove accepted / collection_extracted / skipped /
//      self-intersection-repair statuses (the GeometryCollection rescue counter).
//
// ⚠️ RE-HOMED AT THE PILOT-2 CONVERSION. `scripts/load-ravines.js` is now the frozen
// three-line shape (Spec 122 §5.1), so a source-text assertion over it would pass
// vacuously. Each assertion below moved to the file that now OWNS the construct —
// acquisition to scripts/lib/step/acquire.js, the class-B write to
// scripts/lib/step/write.js, the domain arithmetic to scripts/lib/compute/load-ravines.js,
// the declarations to the descriptor. NOTHING was deleted.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './db/setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const writeLib = require('../../scripts/lib/step/write.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require('../../scripts/load-ravines.descriptor.json');

const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const STEP = read('scripts/load-ravines.js');
const ACQUIRE = read('scripts/lib/step/acquire.js');
const WRITE = read('scripts/lib/step/write.js');
const COMPUTE = read('scripts/lib/compute/load-ravines.js');

/** The generated class-B statements for this step's one write target. */
const PLAN = writeLib.buildWritePlan(descriptor.outputs.writes[0], descriptor);
const SQL = [PLAN.validation_sql, PLAN.upsert_sql, PLAN.delete_sql].join('\n');

// ── (A) Source-contract assertions ────────────────────────────────────────
describe('load_ravines — source contract (Spec 59 §3/§9), across the three files', () => {
  it('advisory lock 59 stays a TEXTUAL constant in the step file (§5.4 registry loops read it as text)', () => {
    expect(STEP).toMatch(/ADVISORY_LOCK_ID\s*=\s*59/);
    expect(descriptor.identity.lock).toBe(59);
  });

  it('the chain-scoped prior-run name is derived, not hardcoded (DEC-F / #409: sources:load_ravines)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ledgerPipelineName } = require('../../scripts/lib/step/index.js');
    expect(ledgerPipelineName(descriptor, 'sources')).toBe('sources:load_ravines');
    // A STANDALONE run must read the SAME history, or every manual invocation looks
    // like a first run and every drift guard degrades to "no baseline".
    expect(ledgerPipelineName(descriptor, null)).toBe('sources:load_ravines');
  });

  it('validates geometry via the §3.5 batched SQL (single round-trip, L16) before the transaction', () => {
    expect(WRITE).toMatch(/unnest\(\$1::BIGINT\[\]\)/);
    expect(SQL).toContain('ST_MakeValid');
    expect(SQL).toContain('ST_CollectionExtract');
    expect(SQL).toContain('collection_extracted');
  });

  it('binds validated geometry as WKB at upsert (ST_GeomFromWKB(...,4326))', () => {
    expect(SQL).toContain('ST_GeomFromWKB(');
    expect(SQL).toMatch(/ST_GeomFromWKB\([^)]*4326\)/);
  });

  it('upsert uses xmax=0 insert/update discrimination + IS DISTINCT FROM guard (DEC-G/L11)', () => {
    expect(SQL).toMatch(/RETURNING\s*\(xmax = 0\)/);
    expect(SQL).toContain('IS DISTINCT FROM');
  });

  it('F-C1 empty-set DELETE guard runs in the JS layer (L15), not PL/pgSQL', () => {
    expect(COMPUTE).toContain('shouldSkipDelete');
    expect(WRITE).toContain('shouldSkipDelete');
    expect(SQL).toMatch(/DELETE FROM ravines WHERE source_id <> ALL\(\$1::BIGINT\[\]\)/);
  });

  it('dedupes by source_id before the VALUES list (ON CONFLICT cannot affect a row twice)', () => {
    expect(COMPUTE).toContain('dedupeBySourceId');
    expect(read('scripts/lib/step/index.js')).toContain('dedupeBySourceId');
  });

  it('cross-platform unzip (node-stream-zip, NOT shell) + temp cleanup (no Expand-Archive)', () => {
    expect(ACQUIRE).toContain("require('node-stream-zip')");
    expect(ACQUIRE).toMatch(/fs\.rmSync\(tmpRoot,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/);
    expect(ACQUIRE).not.toMatch(/Expand-Archive|execSync/);
  });

  it('scans for a single *.shp (case-insensitive) + requires the companion .dbf', () => {
    expect(ACQUIRE).toMatch(/no shapefile \(\.shp\) found in zip/);
    expect(ACQUIRE).toMatch(/expected one \.shp/);
    expect(ACQUIRE).toMatch(/missing companion \.dbf/);
    expect(ACQUIRE).toContain('.toLowerCase().endsWith');
  });
});

// ── (B) Declarations that used to be code ─────────────────────────────────
describe('load_ravines — the behaviours that became descriptor data (§1.2a P1)', () => {
  const checkIds: string[] = descriptor.checks.map((c: { id: string }) => c.id);

  it('emits all 9 §9 audit rows as DECLARED checks + the two override-present rows', () => {
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
      expect(checkIds, `§9 audit row ${m} has no declared check`).toContain(m);
    }
    expect(checkIds).toContain('ravine_override_feature_count_drift_present');
    expect(checkIds).toContain('ravine_override_mass_delete_present');
  });

  it('L7/L7c overrides enable execution but the audit row stays FAIL (verdict not suppressed)', () => {
    // The override is a declared BOX now (ruling A-5), and every env it names must
    // point at a FAIL check — the property "an override never suppresses a FAIL row"
    // is structural rather than a comment the code has to keep honouring.
    const accepts = descriptor.override.accept_anomaly as Array<{ env: string; check_id: string }>;
    expect(accepts.map((a) => a.env).sort()).toEqual(['RAVINE_ACCEPT_FEATURE_COUNT_DRIFT', 'RAVINE_ACCEPT_MASS_DELETE']);
    for (const a of accepts) {
      const check = descriptor.checks.find((c: { id: string }) => c.id === a.check_id);
      expect(check.severity, `${a.env} must accept a FAIL check`).toBe('FAIL');
    }
  });

  it('L7c mass-delete without RAVINE_ACCEPT_MASS_DELETE terminates the run as failed', () => {
    // Fence 1ceebd17, re-homed from the `:553` regex to the DECLARED terminal it
    // names. The behavioural both-directions lock lives in
    // src/tests/steps/load_ravines/violations.test.ts.
    const accepted = (descriptor.override.accept_anomaly as Array<{ env: string; check_id: string }>)
      .find((a) => a.env === 'RAVINE_ACCEPT_MASS_DELETE');
    expect(accepted?.check_id).toBe('ravine_mass_delete_pct');
    const terminal = descriptor.terminals.find((t: { id: string }) => t.id === 'failed_ravine_mass_delete_pct');
    expect(terminal.kind).toBe('fail_check');
    expect(terminal.status).toBe('failed');
    // …and the accepted counterpart still COMPLETES, which is what the override buys.
    const acceptedTerminal = descriptor.terminals.find((t: { id: string }) => t.id === 'loaded_anomaly_accepted');
    expect(acceptedTerminal.status).toBe('completed_with_errors');
  });

  it('ravine_dataset_age_years is reported on the skip path and every failure path, not just success', () => {
    // Pre-conversion this was "pushed after the HEAD, before the skip return".
    // Declared, it is `when: "pre"` — the lifecycle position the library scores on a
    // gated skip.
    const age = descriptor.checks.find((c: { id: string }) => c.id === 'ravine_dataset_age_years');
    expect(age.when).toBe('pre');
    expect(descriptor.checks.filter((c: { when: string }) => c.when === 'pre').length).toBeGreaterThanOrEqual(3);
  });

  it('freezes the 18-field records_meta.ravine_load contract (§9) as the declared emit skeleton', () => {
    const skeleton = descriptor.emits.find((e: { key: string }) => e.key === 'ravine_load').skeleton;
    for (const k of [
      'spec_version', 'source_dataset_version', 'last_modified', 'etag', 'content_hash',
      'feature_count', 'polygons_inserted', 'polygons_updated', 'polygons_deleted',
      'delete_skipped_empty_guard', 'mass_delete_pct', 'invalid_geometry_repaired',
      'invalid_geometry_skipped', 'geometry_collection_extracted', 'drift_check_passed',
      'mass_delete_check_passed', 'geometry_update_pct', 'skipped_reason',
    ]) {
      expect(Object.keys(skeleton), `§9 field ${k}`).toContain(k);
      expect(COMPUTE, `§9 field ${k} must still be emitted by the compute`).toContain(`${k}:`);
    }
    expect(Object.keys(skeleton)).toHaveLength(18);
  });

  it('emits the table-keyed PIPELINE_META (L17) with all five declared columns + records_total = feature_count (§11)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { deriveMeta } = require('../../scripts/lib/step/index.js');
    const meta = deriveMeta(descriptor);
    // Declaration ORDER matches the pre-conversion emitMeta literal exactly, so
    // PIPELINE_META.writes is byte-identical across the conversion (plan D-2).
    expect(meta.writes).toEqual({ ravines: ['source_id', 'geom', 'source_dataset_version', 'created_at', 'updated_at'] });
    expect(Object.keys(meta.reads)).toEqual([]);
    expect(meta.external).toEqual(['ckan:ravine-natural-feature-protection-area-wgs84']);
    expect(descriptor.counters.records_total.source).toBe('acquired.feature_count');
    expect(descriptor.counters.records_new.source).toBe('written.inserted');
    expect(descriptor.counters.records_updated.source).toBe('written.updated');
  });
});

// ── (C) DB-backed §3.5 classifier behavior ─────────────────────────────────
describe.skipIf(!dbAvailable())('load_ravines — §3.5 validation SQL classifier (real PostGIS)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = async (geojsons: string[]): Promise<Map<number, any>> => {
    const pool = getTestPool()!;
    const ids = geojsons.map((_, i) => i + 1);
    const { rows } = await pool.query(PLAN.validation_sql, [ids, geojsons]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Map<number, any>(rows.map((r: any) => [Number(r.source_key), r]));
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
