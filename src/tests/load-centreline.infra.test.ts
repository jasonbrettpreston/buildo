// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.1, §3.7, §9, §12.1
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4, §5.1, §5.5 (row 3.2 conversion)
//
// Infra tests for load_centreline (Spec 62 §8c), two layers:
//  (A) Source-contract assertions — every §3/§9 behaviour is still WIRED, now across
//      the files the frozen shape splits the step into.
//  (B) Descriptor-contract assertions — the behaviours that stopped being code and
//      became DATA (Spec 122 §1.2a P1). A grep over a step file cannot see those, so
//      they are asserted against the descriptor instead of quietly dropped.
//
// ⚠️ RE-HOMED AT THE ROW 3.2 ② CONVERSION. `scripts/load-centreline.js` is now the
// frozen three-line shape (Spec 122 §5.1), so a source-text assertion over it would
// pass vacuously. Each assertion below moved to the file that now OWNS the
// construct — acquisition to scripts/lib/step/acquire.js, the class-C staging
// replace to scripts/lib/step/write.js, the domain arithmetic to
// scripts/lib/compute/load-centreline.js, the declarations to the descriptor.
// NOTHING was deleted; each `it`'s TITLE intent is preserved (c2e brief item map).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require('../../scripts/load-centreline.descriptor.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ledgerPipelineName } = require('../../scripts/lib/step/index.js');

const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const STEP = read('scripts/load-centreline.js');
const ACQUIRE = read('scripts/lib/step/acquire.js');
const WRITE = read('scripts/lib/step/write.js');
const COMPUTE = read('scripts/lib/compute/load-centreline.js');

// ── (A) Source-contract assertions ────────────────────────────────────────
describe('load_centreline — source contract (Spec 62 §8c), across the four files', () => {
  it('lock 63 stays a TEXTUAL constant in the step file (§5.4 registry loops read it as text) + the descriptor agrees', () => {
    expect(STEP).toMatch(/ADVISORY_LOCK_ID\s*=\s*63/);
    expect(descriptor.identity.lock).toBe(63);
  });

  it('the shell is pipeline.step(descriptor, compute), never the legacy pipeline.run(...) call', () => {
    expect(STEP).toContain('pipeline.step(descriptor, compute)');
    expect(STEP).not.toMatch(/pipeline\.run\(/);
    // MARKETPLACE_KEY retired (LC-D3: config lives in config.logic_variables, not a
    // marketplace-config read) — PIPELINE_NAME retired too (LC-D16, corrected c2e:
    // the chain-scoped name is derived, asserted below via ledgerPipelineName).
    expect(STEP).not.toContain('MARKETPLACE_KEY');
    expect(STEP).not.toContain("PIPELINE_NAME = 'sources:load_centreline'");
  });

  it('the chain-scoped prior-run name is DERIVED, and — LC-D16 corrected at c2e — a standalone read uses the SAME name as legacy (no divergence, VERIFY-INT-4)', () => {
    expect(ledgerPipelineName(descriptor, 'sources')).toBe('sources:load_centreline');
    // A standalone run (chainId null, no PIPELINE_CHAIN) falls back to the declared
    // invocation chain ("sources") rather than reading bare — byte-identical to the
    // legacy hard-coded PIPELINE_NAME for BOTH call shapes.
    expect(ledgerPipelineName(descriptor, null)).toBe('sources:load_centreline');
  });

  it('SPEC_VERSION pinned to 1.1 (identity.spec_version, L10 re-baseline)', () => {
    expect(descriptor.identity.spec_version).toBe('1.1');
    expect(descriptor.emits.find((e: { key: string }) => e.key === 'centreline_load').skeleton.spec_version).toBe('1.1');
  });

  it('L26 staging-table full-replace (INCLUDING DEFAULTS INCLUDING CONSTRAINTS; DELETE then INSERT-from-temp), class C staging_full_replace', () => {
    expect(WRITE).toContain('CREATE TEMP TABLE ${staging} (LIKE ${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP');
    expect(WRITE).toContain('DELETE FROM ${table};');
    expect(WRITE).toMatch(/INSERT INTO \$\{table\}[^;]*SELECT[^;]*FROM \$\{staging\}/);
    expect(descriptor.outputs.writes[0].write_discipline.class).toBe('staging_full_replace');
    expect(descriptor.outputs.writes[0].write_discipline.txn_scope).toBe('step');
    // full-replace ⇒ records_updated is always 0 (never a per-row UPDATE) — the
    // frozen §9 producer block pins it, and the runtime counter is sourced from
    // that same emit field (records_meta.centreline_load.features_updated), not a
    // phantom written.updated.
    expect(descriptor.emits.find((e: { key: string }) => e.key === 'centreline_load').skeleton.features_updated).toBe(0);
    expect(descriptor.counters.records_updated.source).toBe('records_meta.centreline_load.features_updated');
    expect(COMPUTE).toMatch(/features_updated:\s*0,?\s*\/\/ staging-CTE full-replace/);
  });

  it('L15 F-C1 dual-mode guard (first-run empty = FAIL; subsequent-run empty = WARN + preserve), pre_write, no transaction opened', () => {
    const firstRun = descriptor.checks.find((c: { id: string }) => c.id === 'f_c1_empty_temp_guard_fired_first_run');
    const laterRun = descriptor.checks.find((c: { id: string }) => c.id === 'f_c1_empty_temp_guard_fired');
    expect(firstRun.severity).toBe('FAIL');
    expect(firstRun.when).toBe('pre_write');
    expect(laterRun.severity).toBe('WARN');
    expect(laterRun.when).toBe('pre_write');
    expect(laterRun.on_warn).toBe('skip_write');
    expect(COMPUTE).toContain('f_c1_empty_temp_guard_fired_first_run');
    expect(COMPUTE).toContain('f_c1_empty_temp_guard_fired(ctx)');
    expect(COMPUTE).toContain('carriedCount(ctx.acquired) === 0 && !ctx.prior');
    // The executor's OWN empty-set guard runs before any DELETE/INSERT (defense in
    // depth alongside the declared pre_write floor checks above).
    expect(WRITE).toMatch(/if \(carried\.length === 0\)/);
    expect(WRITE).toContain('empty-set guard');
  });

  it('geometry validated via the shared library validator (geometry_kind "line") — NOT an inline VALIDATION_SQL, NOT geometry-validator.js', () => {
    expect(descriptor.outputs.writes[0].geometry_kind).toBe('line');
    expect(WRITE).toContain("line: \"('ST_LineString')\"");
    expect(STEP).not.toMatch(/require\([^)]*geometry-validator/);
    expect(COMPUTE).not.toMatch(/require\([^)]*geometry-validator/);
    expect(STEP).not.toContain('const VALIDATION_SQL');
  });

  it('LC-D12: geometry validation runs as ONE call over the whole validated set, NOT 5K-row chunks (the address_points single-call precedent)', () => {
    expect(STEP).not.toMatch(/VALIDATION_CHUNK/);
    expect(COMPUTE).not.toMatch(/VALIDATION_CHUNK/);
    const dev = descriptor.deviations.find((d: { from: string }) => /VALIDATION_CHUNK/.test(d.from));
    expect(dev, 'LC-D12 must be a declared deviation').toBeTruthy();
    expect(dev.why.text).toMatch(/LC-D12/);
  });

  it('F13: validateShapefileColumns is invoked per shaped record (shapeRecord)', () => {
    expect(COMPUTE).toContain('validateShapefileColumns(props)');
    expect(COMPUTE).toContain('function shapeRecord(');
  });

  it('emits the 20-column write target (§9) reading the single CKAN external', () => {
    expect(descriptor.inputs.reads.externals[0].id).toBe('ckan:toronto-centreline-tcl-shp');
    expect(descriptor.inputs.reads.externals[0].format).toBe('shapefile_zip');
    expect(descriptor.outputs.writes[0].table).toBe('toronto_centreline');
    expect(descriptor.outputs.writes[0].columns).toHaveLength(20); // 19 step-written cols + created_at db_default
    expect(descriptor.outputs.writes[0].columns.map((c: { name: string }) => c.name)).toContain('created_at');
  });

  it('unhappy paths wired (F9): HEAD-fail → library warn_row + proceed, download/parse → failed_acquisition, L8 skipped-pct → FAIL', () => {
    expect(descriptor.inputs.reads.externals[0].on_head_error).toBe('warn_row');
    expect(ACQUIRE).toMatch(/on_head_error !== 'warn_row'\) throw err/);
    expect(ACQUIRE).toMatch(/HEAD failed, proceeding without validators/);
    const failedAcq = descriptor.terminals.find((t: { id: string }) => t.id === 'failed_acquisition');
    expect(failedAcq.kind).toBe('fail_error');
    expect(failedAcq.status).toBe('failed');
    const l8 = descriptor.checks.find((c: { id: string }) => c.id === 'centreline_geometry_skipped_pct');
    expect(l8.severity).toBe('FAIL');
    expect(l8.when).toBe('pre_write');
  });

  it('L25 sets are lowercase + normalized via trim().toLowerCase() (F14); FEDERAL excluded', () => {
    expect(COMPUTE).toContain("'major arterial'"); // include set lowercase
    expect(COMPUTE).toMatch(/\.trim\(\)\.toLowerCase\(\)/);
    expect(COMPUTE).toMatch(/ju === 'federal'/);
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
  });

  it('dedupes by source_id before the VALUES list (ON CONFLICT cannot affect a row twice)', () => {
    expect(COMPUTE).toContain('dedupeBySourceId');
  });
});

// ── (B) Declarations that used to be code ─────────────────────────────────
describe('load_centreline — the behaviours that became descriptor data (Spec 122 §1.2a P1)', () => {
  const checkIds: string[] = descriptor.checks.map((c: { id: string }) => c.id);

  it('emits every §9-anchored audit row as a DECLARED check (LC-D2/LC-D9/LC-D13 posture split)', () => {
    for (const m of [
      'dataset_source_license', 'centreline_load_skipped', 'centreline_dataset_age_days',
      'centreline_feature_count_raw', 'centreline_bad_centreline_id_count', 'centreline_null_geometry_count',
      'centreline_unknown_feature_code_count', 'centreline_unknown_jurisdiction_count',
      'centreline_duplicate_centreline_id_count', 'centreline_feature_count_filtered',
      'centreline_count_drift_pct', 'centreline_geometry_skipped_pct',
      'f_c1_empty_temp_guard_fired_first_run', 'f_c1_empty_temp_guard_fired',
      'centreline_geometry_collection_extracted', 'centreline_delete_skipped_empty_guard',
      'centreline_features_inserted', 'centreline_features_deleted',
    ]) {
      expect(checkIds, `§9 audit row ${m} has no declared check`).toContain(m);
    }
    expect(checkIds).toContain('centreline_override_feature_count_drift_present');
    expect(checkIds).toContain('centreline_no_cache_validators');
  });

  it('L7 override enables execution but the audit row stays FAIL (verdict not suppressed, LC-D7/A-5)', () => {
    const accepts = descriptor.override.accept_anomaly as Array<{ env: string; check_id: string }>;
    expect(accepts.map((a) => a.env)).toEqual(['CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT']);
    for (const a of accepts) {
      const check = descriptor.checks.find((c: { id: string }) => c.id === a.check_id);
      expect(check.severity, `${a.env} must accept a FAIL check`).toBe('FAIL');
    }
    // L8 (geometry-skipped) has NO override hatch — the legacy has none either.
    expect(accepts.some((a) => a.check_id === 'centreline_geometry_skipped_pct')).toBe(false);
  });

  it('L7 drift without CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT terminates the run as failed, write skipped', () => {
    const terminal = descriptor.terminals.find((t: { id: string }) => t.id === 'failed_count_drift');
    expect(terminal.kind).toBe('fail_check');
    expect(terminal.status).toBe('failed');
    const acceptedTerminal = descriptor.terminals.find((t: { id: string }) => t.id === 'loaded_anomaly_accepted');
    expect(acceptedTerminal.status).toBe('completed_with_errors');
  });

  it('centreline_dataset_age_days is reported on the skip path and every failure path, not just success (when: "pre")', () => {
    const age = descriptor.checks.find((c: { id: string }) => c.id === 'centreline_dataset_age_days');
    expect(age.when).toBe('pre');
    expect(descriptor.checks.filter((c: { when: string }) => c.when === 'pre').length).toBeGreaterThanOrEqual(3);
  });

  it('freezes the 18-field records_meta.centreline_load contract (§9) as the declared emit skeleton', () => {
    const skeleton = descriptor.emits.find((e: { key: string }) => e.key === 'centreline_load').skeleton;
    for (const k of [
      'spec_version', 'source_dataset_version', 'last_modified', 'etag', 'content_hash',
      'feature_count_raw', 'feature_count_filtered', 'filtered_out_non_street', 'filtered_out_federal',
      'unknown_feature_code_count', 'unknown_jurisdiction_count', 'features_inserted', 'features_updated',
      'features_deleted', 'invalid_geometry_skipped', 'delete_skipped_empty_guard',
      'f_c1_empty_temp_guard_fired', 'drift_check_passed',
    ]) {
      expect(Object.keys(skeleton), `§9 field ${k}`).toContain(k);
      expect(COMPUTE, `§9 field ${k} must still be emitted by the compute`).toContain(`${k}:`);
    }
    expect(Object.keys(skeleton)).toHaveLength(18);
  });

  it('the geometry column binds WKB at write time (ST_GeomFromWKB(...,4326))', () => {
    expect(WRITE).toContain('ST_GeomFromWKB(');
    const bind = descriptor.outputs.writes[0].columns.find((c: { name: string }) => c.name === 'geom').bind;
    expect(bind).toBe('wkb_geometry');
  });

  it('guard: "none" is the DECLARED, grandfathered write-discipline for the class-C whole-table replace', () => {
    expect(descriptor.outputs.writes[0].write_discipline.guard).toBe('none');
    expect(descriptor.outputs.writes[0].write_discipline.guard_why.text).toMatch(/whole-table replace/);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const grandfathered = require('../../scripts/steps/_schema/grandfathered.json');
    const entry = grandfathered.steps.load_centreline;
    expect(entry.paths['outputs.writes[].write_discipline.guard']).toBe('none');
    expect(entry.paths['outputs.writes[].write_discipline.class']).toBe('staging_full_replace');
  });

  it('force-reload override (CENTRELINE_FORCE_RELOAD) bypasses BOTH staleness gates — declared deviation LC-D6, replacing the retired CENTRELINE_LOCAL_ZIP seam', () => {
    expect(descriptor.override.force_run).toBe('CENTRELINE_FORCE_RELOAD');
    const dev = descriptor.deviations.find((d: { from: string }) => /CENTRELINE_LOCAL_ZIP/.test(d.from));
    expect(dev, 'CENTRELINE_LOCAL_ZIP retirement must be a declared deviation (LC-D6/LC-D11)').toBeTruthy();
  });
});
