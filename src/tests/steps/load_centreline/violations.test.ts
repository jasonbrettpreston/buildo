// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① — PH-7 test design, prove red)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5 (compute shape), §1.2a (P1–P5), §1.4 (write classes)
// SPEC LINK: docs/specs/01-pipeline/124_step_opt_policy.md Rules 1–13 (Rule 3: every literal is a declared config.logic_variables[] entry with a seed row; Rule 10: verdict row-derived; Rule 12: recovery.interrupted truthful)
// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3/§9 (the source producer contract)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (chain_sources — the load_centreline step row)
//
// Batch-2 row 3.2 — `load_centreline`, the INGESTOR archetype's FOURTH member (after `load_ravines`,
// `address_points` and `parcels`) — R-PACE-1 compressed form. Commit ① lands this RED suite + its
// fixture + the commit-① assessment report (`docs/reports/2026-09-24-batch2-p3-2-load-centreline-assessment.md`)
// + POST/PRE goldens; commit ② lands the descriptor + compute (`scripts/lib/compute/load-centreline.js`)
// + the frozen shell + seeds; commit ③ is the cutover.
//
// ⚠️ THIS STEP IS THE FIRST CONVERTED CLASS C (`staging_full_replace`). Its two class-C declaration
// hatches — LC-D4 `staleness.on_prior_run_error` and LC-D5 `recovery.interrupted` — are asserted here
// as DECLARED POSTURES that flip at ④a/④b, NOT as today's corpus shape. (Orchestrator ① review-pass
// correction: LC-D5 in this worktree's ledger is the `recovery.interrupted` declaration gap, NOT the
// plan-of-record's original LC-D5 — the F-C1 empty-guard `features_inserted:0` finding, which is
// restored under LC-D14 below, since the plan file was absent from this worktree when the engine ran.)
//
// ⚠️ EVERY `it` BELOW IS `it.fails(...)` AND RED FOR THE RIGHT REASON. Each opens by asserting the
// FUTURE artifact it reads exists (`artifact()` → `expect(existsSync).toBe(true)` with the path in the
// message), so the failure names the missing artifact rather than surfacing as a TS or import error.
// The RED value is in the TITLE per the `parcels` ① (`8360fc32`) convention.
//
// ⚠️ THE LEGACY LOADER IS NEVER `require`d — it is the ORACLE (`scripts/load-centreline.js`, 726 lines)
// and it becomes a shell at ②. Every expected value below is derived from the oracle's TEXT (read, not
// executed) and re-derived independently rather than transcribed through an in-process require of a
// script that calls `pipeline.run()`.
//
// Artifacts asserted against (plan of record `.cursor/batch2_p3_2_load_centreline_active_task.md` — ⚠️
// MEASURED 2026-09-24: that file is NOT present in this worktree; every "plan §N" citation is
// transcribed from the three engine briefs that cite it and from the commit-① assessment report §1–§6,
// which DOES carry them):
//   scripts/load-centreline.descriptor.json  — class C staging_full_replace, retract:"all", the 19 write
//                                              cols + created_at db_default, externals[0] shapefile_zip
//                                              key_property "CENTREL2", network retries 2 + the two
//                                              *_from_config seats, recovery, staleness, checks[]
//   scripts/lib/compute/load-centreline.js   — coerceKey shapeRecord dedupeBySourceId
//                                              validatorCounterDelta buildLoadMeta checks
//   scripts/load-centreline.js               — the §5.1 frozen shape (SPEC LINK kept, lock 63)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const STEP_DIR_REL = 'src/tests/steps/load_centreline';

const STEP_REL = 'scripts/load-centreline.js';
const DESCRIPTOR_REL = 'scripts/load-centreline.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/load-centreline.js';
const RECORDS_REL = `${STEP_DIR_REL}/fixtures/centreline-records.json`;
const SEED_REL = 'scripts/seeds/logic_variables.json';

/** Spec 62 L4 / Spec 47 §A.5 — 65 collided with enrich-parcels, 63 is the next free gap [READ load-centreline.js:41]. */
const LOCK_ID = 63;
/** The written table [READ load-centreline.js:590, :621, :623, :686-698; migrations/173_create_toronto_centreline.sql:74-98]. */
const WRITE_TABLE = 'toronto_centreline';
/** The 19 `cols` the replace binds [READ load-centreline.js:592-596] — source_dataset_version + updated_at are written by the step too. */
const WRITE_COLUMNS_19 = [
  'source_id', 'geom', 'linear_name_full', 'linear_name', 'linear_name_type', 'linear_name_dir',
  'feature_code_desc', 'jurisdiction', 'from_intersection_id', 'to_intersection_id',
  'lo_num_l', 'hi_num_l', 'lo_num_r', 'hi_num_r', 'parity_l', 'parity_r',
  'oneway_dir_code_desc', 'source_dataset_version', 'updated_at',
];
/**
 * `emitCentrelineMeta` declares 20 columns — the 19 above PLUS `created_at`, which the step never
 * writes (it is omitted from `cols`, so it takes the column DB default `now()`) [READ
 * load-centreline.js:686-698; assessment §1.2]. `id` is the serial PK and is NOT declared.
 */
const DECLARED_COLUMNS_20 = [...WRITE_COLUMNS_19, 'created_at'];
/** The 18 keys of `function skeletonLoadMeta()` [READ load-centreline.js:676-683]. */
const LOAD_META_KEYS_18 = [
  'spec_version', 'source_dataset_version', 'last_modified', 'etag', 'content_hash',
  'feature_count_raw', 'feature_count_filtered', 'filtered_out_non_street', 'filtered_out_federal',
  'unknown_feature_code_count', 'unknown_jurisdiction_count',
  'features_inserted', 'features_updated', 'features_deleted', 'invalid_geometry_skipped',
  'delete_skipped_empty_guard', 'f_c1_empty_temp_guard_fired', 'drift_check_passed',
];
/** Rule 3 literal ledger (assessment report §6) — the SIX variables this row externalizes, with their seed defaults. */
const CONFIG_VARS: Record<string, number> = {
  load_centreline_dataset_age_warn_days: 7,
  load_centreline_count_drift_fail_pct: 0.5,
  load_centreline_invalid_geometry_fail_pct: 0.05,
  load_centreline_download_timeout_ms: 600000,
  load_centreline_download_retries: 2,
  load_centreline_download_retry_backoff_ms: 0,
};

// ---------------------------------------------------------------------------
// Artifact helpers — the `src/tests/steps/parcels/violations.test.ts` convention (8360fc32)
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the row-3.2 commit sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS loader, the ONE compiler
  const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
    validateDescriptor: (x: unknown) => unknown;
  };
  validateDescriptor(d); // throws with the AJV error list — the loader property (§4.2)
  return d;
}

interface ComputeModule {
  compute?: (ctx: unknown) => Promise<unknown>;
  checks?: Record<string, (ctx: unknown) => unknown>;
  [k: string]: unknown;
}

function loadComputeModule(): ComputeModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule | ((ctx: unknown) => Promise<unknown>);
  return (typeof mod === 'function' ? { ...mod, compute: mod } : mod) as ComputeModule;
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'an INGESTOR may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

function checkById(d: Descriptor, id: string): Check {
  const c = d.checks.find((x) => x.id === id);
  expect(c, `descriptor declares no check "${id}"`).toBeDefined();
  return c as Check;
}

function seedDefaults(): Record<string, { default: number }> {
  return JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8')) as Record<string, { default: number }>;
}

/** The fixture's own records — `[{why, record, geojson}]`, the DBF keys `const DBF = {` maps. */
interface FixtureEntry { why: string; record: Record<string, unknown>; geojson: string }

function records(): FixtureEntry[] {
  return JSON.parse(readText(RECORDS_REL)) as FixtureEntry[];
}

/** Drive ONE check function from the compute's dispatch table, capturing its `report()` calls (the `load-ravines.js` idiom). */
function driveCheck(checkId: string, ctx: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const mod = loadComputeModule();
  const fn = (mod.checks ?? {})[checkId];
  expect(typeof fn, `the compute dispatch carries no function for check "${checkId}"`).toBe('function');
  const calls: Array<[string, Record<string, unknown>]> = [];
  (fn as (c: unknown) => unknown)({
    ...ctx,
    report: (id: string, o: Record<string, unknown>) => { calls.push([id, o]); },
  } as never);
  return calls;
}

interface Check { id: string; kind: string; limit: unknown; limit_from_config?: string; severity: string; blocking: boolean; when: string; on_warn?: string; chains: string[] | 'all' }
interface WriteSpec {
  table: string; key: string | string[]; key_sql_type?: string; geometry_kind?: string;
  columns: Array<{ name: string; written?: string; bind?: string }>;
  write_discipline: { class: string; guard: unknown; scope: unknown; idempotent_rerun: unknown; txn_scope: unknown };
  retract: string; replay: string;
}
interface Descriptor {
  identity: { name: string; lock: number; spec: string; spec_version: string; archetype: string };
  inputs: { reads: { externals: Array<{ id: string; kind: string; format: string; url?: string; key_property?: string; on_head_error?: string }> } };
  outputs: 'none' | { writes: WriteSpec[] };
  staleness: { on_prior_run_error?: string; on_prior_run_error_why?: unknown };
  execution: { network: { retries: number; retries_from_config?: string; retry_backoff_from_config?: string } };
  checks: Check[];
  override: 'none' | { accept_anomaly?: Array<{ env: string; check_id: string }> };
  emits: 'none' | Array<{ key: string; type: string; consumers: string[]; skeleton?: unknown }>;
  recovery: { interrupted: string; interrupted_why?: unknown };
  config: 'none' | { logic_variables: Array<{ name: string; min: unknown; max: unknown; on_invalid: string }>; validation: string; hoisted_above_gate: boolean };
}

export type { Descriptor, Check, WriteSpec };

// ===========================================================================
// 1. The artifacts exist, and the frozen shape holds (Spec 122 §5.1/§5.2)
// ===========================================================================

describe('row 3.2 — the artifacts exist and validate (Spec 122 §5.1, Spec 123 §7 row 6)', () => {
  it.fails('descriptor exists and is AJV-valid (RED today: ENOENT — no descriptor yet) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    expect(d.identity.name).toBe('load_centreline');
    expect(d.identity.archetype).toBe('INGESTOR');
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.spec).toBe('62');
    expect(d.identity.spec_version, 'L10 — the producer contract version pin; the spec §3.1 code block\'s "1.0" is stale').toBe('1.1');
  });

  it.fails('externals[0] is a CKAN shapefile_zip keyed on CENTREL2 with on_head_error "warn_row" (0r rung, the ingest-prereq-0r precedent names THIS loader) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    const ext = d.inputs.reads.externals[0]!;
    expect(ext.kind).toBe('http_file');
    expect(ext.format, 'a zipped shapefile, NOT a csv — this is the shapefile-attribute INGESTOR the runner grew shapeRecord for').toBe('shapefile_zip');
    expect(ext.id).toBe('ckan:toronto-centreline-tcl-shp');
    expect(ext.url).toContain('ckan0.cf.opendata.inter.prod-toronto.ca');
    expect(ext.key_property, 'the DBF key field [READ load-centreline.js:87 CENTREL2]').toBe('CENTREL2');
    expect(ext.on_head_error, 'HEAD 4xx/5xx -> WARN + proceed, never skip [READ load-centreline.js:433-439]').toBe('warn_row');
  });

  it.fails('writes[0] is class C staging_full_replace, retract "all", key source_id BIGINT, geometry_kind line (the FIRST converted class C) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    const w = writes(d);
    expect(w.length, 'the INGESTOR runner drives exactly ONE write target').toBe(1);
    expect(w[0]!.table).toBe(WRITE_TABLE);
    expect(w[0]!.key).toBe('source_id');
    expect(w[0]!.key_sql_type, 'the validator AND the departure cast read the DECLARED type [READ write.js DEFAULT_KEY_SQL_TYPE / key_sql_type]').toBe('BIGINT');
    expect(w[0]!.geometry_kind, 'GEOMETRY(LineString, 4326) — enrich-centreline requires a true LineString, never a Multi').toBe('line');
    expect(w[0]!.write_discipline.class, 'staging-table full replace: 47K rows >> a single-batch param limit [READ load-centreline.js:588-625]').toBe('staging_full_replace');
    expect(w[0]!.retract, 'the unconditional whole-table DELETE IS a full retraction [READ load-centreline.js:621]').toBe('all');
    expect(w[0]!.write_discipline.txn_scope, 'the staged INSERT, DELETE and INSERT…SELECT commit together [READ load-centreline.js:588]').toBe('step');
  });

  it.fails('columns[] declare the 19 written columns + created_at as db_default — and NOT id (the serial PK) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    const cols = writes(d)[0]!.columns as Array<{ name: string; written?: string }>;
    expect(cols.map((c) => c.name).sort()).toEqual([...DECLARED_COLUMNS_20].sort());
    const byName = new Map(cols.map((c) => [c.name, c.written]));
    expect(byName.get('created_at'), 'created_at is omitted from `cols[19]` and so takes the column default now() [READ load-centreline.js:592-596, :687]').toBe('db_default');
    for (const name of WRITE_COLUMNS_19) {
      expect(byName.get(name), `${name} is bound by the step`).toBe('step');
    }
    expect(cols.some((c) => c.name === 'id'), 'id is the BIGSERIAL PK — declared nowhere [READ migrations/173_create_toronto_centreline.sql:75]').toBe(false);
  });

  it.fails('emits[0] is centreline_load -> ["enrich_centreline"], network retries 2 (Fold IC-8: attempts = retries + 1 = 3), recovery and staleness declare the two class-C hatches (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    expect(d.emits, 'the loader emits records_meta.centreline_load').not.toBe('none');
    const e = (d.emits as Array<{ key: string; type: string; consumers: string[] }>)[0]!;
    expect(e.key).toBe('centreline_load');
    expect(e.consumers, 'enrich-centreline.js reads it and HALTs on its fields (DO NOT add a second consumer)').toEqual(['enrich_centreline']);
    expect(d.execution.network.retries, 'legacy `attempts = 3` splits as retries 2 + backoff 0 — byte-equal [READ load-centreline.js:306-315]').toBe(2);
    expect(d.execution.network.retries_from_config).toBe('load_centreline_download_retries');
    expect(d.execution.network.retry_backoff_from_config, 'the legacy retry loop sleeps: never [READ load-centreline.js:309-315]').toBe('load_centreline_download_retry_backoff_ms');
    expect(d.recovery.interrupted, 'LC-D5 — every run IS a full replace, so a crash posture that claims incremental resume would be a lie (flips at ④b)').toBe('force_full_on_next_run');
    expect(d.recovery.interrupted_why, 'LC-D5 is a PIN — the posture is justified, not asserted').toBeDefined();
    expect(d.staleness.on_prior_run_error, 'LC-D4 — both skip paths re-emit the prior block regardless (flips at ④a)').toBe('warn_row');
    expect(d.staleness.on_prior_run_error_why, 'LC-D4 is a PIN — the posture is justified, not asserted').toBeDefined();
  });

  it.fails('the step file has become the §5.1 frozen shape: pipeline.step, module.exports, no pipeline.run (RED today: the 726-line legacy) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    artifact(COMPUTE_REL, 'the frozen shell cannot exist without the compute');
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(src.split('\n').slice(0, 40).join('\n').includes('SPEC LINK:'), 'the frozen file keeps its SPEC LINK header').toBe(true);
    expect(/const ADVISORY_LOCK_ID\s*=\s*63;/.test(src), 'S1 — the lock literal kept textually per §5.4').toBe(true);
    expect(/module\.exports\s*=\s*pipeline\.step\(\s*descriptor\s*,\s*compute\s*\)/.test(src), 'the §5.1 export form').toBe(true);
    expect(/pipeline\.run\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), 'pipeline.run must be gone — the library owns exit semantics').toBe(false);
  });

  it.fails('the compute exports coerceKey shapeRecord dedupeBySourceId validatorCounterDelta buildLoadMeta checks (RED today: ENOENT) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const mod = loadComputeModule();
    for (const h of ['coerceKey', 'shapeRecord', 'dedupeBySourceId', 'validatorCounterDelta', 'buildLoadMeta']) {
      expect(typeof mod[h], `the compute must export ${h}`).toBe('function');
    }
    expect(mod.checks && typeof mod.checks === 'object', 'the §5.5 (1) dispatch table').toBe(true);
    expect(typeof mod.compute, '`compute(ctx)` iterates ctx.checks and does nothing else').toBe('function');
  });
});

// ===========================================================================
// 2. compute.shapeRecord — the DBF record → the L25-classified row (loader :343-395)
// ===========================================================================

describe('row 3.2 — compute.shapeRecord classifies and normalizes a DBF record (loader :343-395)', () => {
  type Shape = Record<string, unknown>;
  /**
   * The 0n INGESTOR seam, verbatim from the runner's own call site — `shapeRecord(f.record,
   * { geojson: f.geojson, config, run_at: runAt, tag: tagRecord })` [READ
   * scripts/lib/step/index.js:813]. `config` is `{}` for every case below: shapeRecord must not
   * read a threshold to decide whether a street is a street (Rule 3 — the L25 lists are CODE
   * structure, not operator knobs; assessment §3 #11/#12 disposition `preserved-in-compute`).
   */
  const SEAM = { config: {}, run_at: new Date('2026-09-24T12:00:00.000Z') };

  /** Call shapeRecord with a fresh tag spy, returning both the row and the tags it fired. */
  function shape(idx: number): { row: Shape | string | null; tags: string[] } {
    const mod = loadComputeModule();
    expect(typeof mod.shapeRecord, 'a shapefile INGESTOR with attributes owes a shapeRecord [READ scripts/lib/step/index.js:813]').toBe('function');
    const fn = mod.shapeRecord as (record: Record<string, unknown>, seam: Record<string, unknown>) => Shape | string | null;
    const tags: string[] = [];
    const e = records()[idx]!;
    const row = fn(e.record, { ...SEAM, geojson: e.geojson, tag: (name: string) => { tags.push(name); } });
    return { row, tags };
  }

  it.fails('record 1 — a "Local"/CITY OF TORONTO street shapes: feature_code_desc "Local", linear_name_type null, from_intersection_id 13465051, geojson === ctx.geojson (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const { row } = shape(0);
    expect(row, 'a clean street is never skipped').not.toBeNull();
    const r = row as Shape;
    expect(r.feature_code_desc, 'the TRIMMED raw value for an INCLUDE-listed class — never the lower-case Set member').toBe('Local');
    expect(r.linear_name_type, 'LINEAR_27 is whitespace-only, and `txt()` maps blank -> null [READ load-centreline.js:384]').toBeNull();
    expect(r.from_intersection_id, 'FROM_IN31 "13465051" -> BIGINT [READ load-centreline.js:149-152]').toBe(13465051);
    expect(r.geojson, 'the shapefile geometry travels through as the EXACT string the acquisition seam handed IN — never re-serialized').toBe(records()[0]!.geojson);
    expect(r.jurisdiction).toBe('CITY OF TORONTO');
    expect(r.source_id ?? r.centreline_id, 'the key survives the shape call (the runner re-keys on plan.keys[0])').toBe(60078796);
  });

  it.fails('record 2 — "Trail" + "FEDERAL" returns the STRING "non_street": the EXCLUDE test runs BEFORE the federal test (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const { row } = shape(1);
    expect(row, 'an EXCLUDE-listed class is dropped by reason, never by null [READ scripts/lib/step/index.js:815-821]').toBe('non_street');
  });

  it.fails('record 3 — "Local" + " federal " (padded, lower-case) returns the STRING "federal" (F14 normalization) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const { row } = shape(2);
    expect(row).toBe('federal');
  });

  it.fails('record 4 — "Mystery Road" is KEPT with feature_code_desc "unknown_operator_review" and TAGS unknown_feature_code (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const { row, tags } = shape(3);
    expect(row, 'an unknown class is never dropped — it is sentinelled and counted [READ load-centreline.js:82, :176-179]').not.toBeNull();
    expect((row as Shape).feature_code_desc).toBe('unknown_operator_review');
    expect(tags, 'the tag is the observability half of the sentinel').toContain('unknown_feature_code');
  });

  it.fails('record 5 — "Collector" + "" is KEPT with jurisdiction "UNKNOWN" and TAGS unknown_jurisdiction (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const { row, tags } = shape(4);
    expect(row).not.toBeNull();
    expect((row as Shape).jurisdiction).toBe('UNKNOWN');
    expect(tags).toContain('unknown_jurisdiction');
  });

  it.fails('record 6 — "  Major Arterial " is KEPT with the trimmed feature_code_desc "Major Arterial" (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const { row } = shape(5);
    expect((row as Shape).feature_code_desc, 'the Set membership is normalized (F14); the STORED value is the trimmed raw').toBe('Major Arterial');
  });

  it.fails('a record missing FEATURE36 THROWS /missing expected attribute field/ (F13) — LC-D10: a missing CENTREL2 never reaches shapeRecord at all (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const mod = loadComputeModule();
    const fn = mod.shapeRecord as (record: Record<string, unknown>, seam: Record<string, unknown>) => unknown;
    const { FEATURE36: _dropped, ...withoutFeatureCode } = records()[5]!.record;
    let thrown: Error | null = null;
    try {
      fn(withoutFeatureCode, { ...SEAM, geojson: records()[5]!.geojson, tag: () => {} });
    } catch (err) { thrown = err as Error; }
    expect(thrown, 'the #426 CKAN-rename lesson: F13 asserts the expected DBF fields [READ load-centreline.js:183-194]').not.toBeNull();
    expect((thrown as Error).message, 'the throw propagates out of shapeRecord — it is not swallowed into a skip').toMatch(/missing expected attribute field/);
    // LC-D10 (assessment §3.1): `parseShapefile` coerces the key BEFORE shapeRecord and DROPS bad
    // keys [READ scripts/lib/step/acquire.js:328], so a renamed CENTREL2 means shapeRecord never
    // runs and F13 CANNOT fire on the key path. That terminal is the staged-rows floor's
    // `fail_check`, NOT legacy's `centreline_acquisition_error` — declared, not re-engineered.
  });
});

// ===========================================================================
// 3. coerceKey, and the BIGINT key join through the runner's validator
// ===========================================================================

describe('row 3.2 — coerceKey and the BIGINT key join (loader :141-146; write.js validateGeometries)', () => {
  function coerceKey(): (raw: unknown) => number | null {
    const mod = loadComputeModule();
    expect(typeof mod.coerceKey, 'the acquisition seam asks the step how to key ITS rows [READ scripts/lib/step/acquire.js:328]').toBe('function');
    return mod.coerceKey as (raw: unknown) => number | null;
  }

  it.fails('coerceKey is a POSITIVE integer or null — "123" -> 123; "0", "-5", "abc", null -> null (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const coerce = coerceKey();
    expect(coerce('123')).toBe(123);
    expect(coerce('0'), 'source_id is the UNIQUE PK and the delete-cast key: 0 is never a centreline id').toBeNull();
    expect(coerce('-5')).toBeNull();
    expect(coerce('abc'), 'a non-numeric CENTREL2 is a COUNTED loss (bad_key_count), never a fabricated row').toBeNull();
    expect(coerce(null)).toBeNull();
    expect(coerce('  60078796  '), 'the DBF arrives from a CKAN zip — padding tolerance is part of the coercion').toBe(60078796);
  });

  it.fails('write.validateGeometries carries 3/3 BIGINT-keyed rows when the stub returns node-pg\'s STRING int8 keys (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS write lib
    const writeLib = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js')) as {
      buildWritePlan: (w: unknown, desc: unknown) => { validation_sql: string | null };
      validateGeometries: (pool: unknown, plan: unknown, features: unknown[], classify: (s: string, v: boolean) => unknown, ctx: unknown) => Promise<{ carried: Array<{ geom?: string }>; skipped: number }>;
    };
    const mod = loadComputeModule();
    const classify = mod.validatorCounterDelta as (s: string, v: boolean) => unknown;
    expect(typeof classify).toBe('function');
    const plan = writeLib.buildWritePlan(writes(d)[0], d);
    expect(plan.validation_sql, 'a line-kind plan MUST carry its validator SQL — the kind selects the repair/accept arm').toContain('unnest($1::BIGINT[])');
    // node-pg's defaults deliver `int8` as a STRING (this repo installs no setTypeParser), so the
    // stub's row keys are the STRINGS below — the join is normalized on BOTH sides, not Number()-ed.
    const pool = {
      query: async () => ({
        rows: [
          { source_key: '60078796', status: 'accepted', is_valid_original: true, geom_wkb: 'W1' },
          { source_key: '1', status: 'accepted', is_valid_original: true, geom_wkb: 'W2' },
          { source_key: '30000000', status: 'accepted', is_valid_original: true, geom_wkb: 'W3' },
        ],
      }),
    };
    const features = [
      { source_id: 60078796, geojson: '{}' },
      { source_id: 1, geojson: '{}' },
      { source_id: 30000000, geojson: '{}' },
    ];
    return writeLib
      .validateGeometries(pool, plan, features, classify, { log: { warn() {}, info() {} }, tag: 'load_centreline' })
      .then((out) => {
        expect(out.carried, 'all THREE rows are carried — a BIGINT feature key joins node-pg\'s STRING int8 row key').toHaveLength(3);
        expect(out.skipped, 'not one row is counted skipped').toBe(0);
        expect(out.carried.map((r) => r.geom), 'the WKB travels under the plan\'s own geometry column name').toEqual(['W1', 'W2', 'W3']);
      });
  });
});

// ===========================================================================
// 4. validatorCounterDelta — status → the {skipped, carry, collectionExtracted} delta
// ===========================================================================

describe('row 3.2 — validatorCounterDelta maps a validator status to the counter delta (loader :218-220; LC-D8)', () => {
  function delta(): (status: string, isValidOriginal: boolean) => { skipped: number; carry: boolean; collectionExtracted?: number } {
    const mod = loadComputeModule();
    expect(typeof mod.validatorCounterDelta, 'the runner hands THIS function to write.validateGeometries [READ scripts/lib/step/index.js:837]').toBe('function');
    return mod.validatorCounterDelta as (s: string, v: boolean) => { skipped: number; carry: boolean; collectionExtracted?: number };
  }

  it.fails('accepted ⇒ carry, 0 skipped (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    expect(delta()('accepted', true)).toEqual({ skipped: 0, carry: true });
  });

  it.fails('collection_extracted ⇒ {carry:false, skipped:1, collectionExtracted:1} — LC-D8: the LEGACY skipped any non-LineString repair, so a single-member MultiLineString residue is a pinned DEFECT, not a carry (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const d = delta()('collection_extracted', true);
    expect(d.carry, 'carrying a Multi into a GEOMETRY(LineString) column is a write error, and the target rejects it anyway').toBe(false);
    expect(d.skipped).toBe(1);
    expect(d.collectionExtracted, 'the counter is DECLARED so the LC-D8 residue is observable — no library option can carry the row instead').toBe(1);
  });

  it.fails('skipped_null and skipped_unsupported_type ⇒ skipped 1, no carry (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    for (const status of ['skipped_null', 'skipped_unsupported_type']) {
      const d = delta()(status, false);
      expect(d.skipped, `${status} is a loss`).toBe(1);
      expect(d.carry, `${status} never reaches the write`).toBe(false);
    }
  });
});

// ===========================================================================
// 5. The declared checks — one function per id, thresholds via ctx.config (Spec 124 Rule 3/5/10)
// ===========================================================================

describe('row 3.2 — the checks fire on their inputs (report §1.3/§6)', () => {
  const CFG = CONFIG_VARS;
  /** The prior run's `centreline_load` block — the baseline every drift ratio is taken against. */
  const PRIOR = { feature_count_filtered: 47363 };

  it.fails('centreline_count_drift_pct reports 0.578 for 20000 filtered vs the prior run\'s 47363, and 0 with no prior (loader :197-201, :523) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const withPrior = driveCheck('centreline_count_drift_pct', { acquired: { feature_count_filtered: 20000 }, prior: PRIOR, config: CFG });
    expect(withPrior).toHaveLength(1);
    expect(withPrior[0]![0]).toBe('centreline_count_drift_pct');
    expect(withPrior[0]![1].value, '|20000 - 47363| / 47363 = 0.5777…').toBeCloseTo(0.578, 3);
    const firstRun = driveCheck('centreline_count_drift_pct', { acquired: { feature_count_filtered: 20000 }, prior: null, config: CFG });
    expect(firstRun[0]![1].value, 'no baselined prior run IS no drift, BY DEFINITION rather than by measurement').toBe(0);
  });

  it.fails('centreline_count_drift_pct is a pre_write FAIL reading load_centreline_count_drift_fail_pct with a STRICT > limit (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const c = checkById(loadDescriptor(), 'centreline_count_drift_pct');
    expect(c.when, 'the FAIL must abort BEFORE the DELETE — the write is skipped entirely, the prior load survives').toBe('pre_write');
    expect(c.severity).toBe('FAIL');
    expect(c.limit_from_config).toBe('load_centreline_count_drift_fail_pct');
    expect(String(c.limit), 'legacy `countDeltaPct > config…` — strictly greater, NOT `pct <= 0.5`').toMatch(/>\s*0\.5/);
  });

  it.fails('centreline_geometry_skipped_pct reports 3/47 = 0.0638, and 0 at 0 features (no division by zero) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const over = driveCheck('centreline_geometry_skipped_pct', { acquired: { feature_count_filtered: 47, invalid_geometry_skipped: 3 }, config: CFG });
    expect(over[0]![1].value).toBeCloseTo(0.0638, 3);
    const empty = driveCheck('centreline_geometry_skipped_pct', { acquired: { feature_count_filtered: 0, invalid_geometry_skipped: 0 }, config: CFG });
    expect(empty[0]![1].value, 'the legacy guards `featureCount > 0 ? … : 0` [READ load-centreline.js:553]').toBe(0);
  });

  it.fails('F-C1 fires f_c1_empty_temp_guard_fired_first_run as FAIL when 0 rows were carried and there is NO prior run (loader :563-573) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const mod = loadComputeModule();
    const ids = Object.keys((mod.checks ?? {})).filter((id) => /f_c1/.test(id));
    expect(ids.length, 'the F-C1 guard is declared — its dual mode is the load-bearing defence against an empty table').toBeGreaterThan(0);
    const firstRun = driveCheck('f_c1_empty_temp_guard_fired_first_run', { acquired: { carried_count: 0 }, written: null, prior: null, config: CFG });
    expect(firstRun[0]![1].violations, 'an empty source on the FIRST run must block the deploy').toBeGreaterThan(0);
    const notFirstRun = driveCheck('f_c1_empty_temp_guard_fired_first_run', { acquired: { carried_count: 5 }, written: null, prior: null, config: CFG });
    expect(notFirstRun[0]![1].violations, 'a non-empty carry never trips the first-run floor').toBe(0);
  });

  it.fails('F-C1 fires f_c1_empty_temp_guard_fired as WARN with on_warn:"skip_write" when 0 rows were carried and a prior run exists (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    const c = checkById(d, 'f_c1_empty_temp_guard_fired');
    expect(c.when).toBe('pre_write');
    expect(c.severity, 'a LATER empty run PRESERVES the table — it warns, it does not fail [READ load-centreline.js:575-581]').toBe('WARN');
    expect(c.on_warn, 'the write must be SKIPPED, not merely flagged: the DELETE would empty the table').toBe('skip_write');
    const withPrior = driveCheck('f_c1_empty_temp_guard_fired', { acquired: { carried_count: 0 }, written: null, prior: PRIOR, config: CFG });
    expect(withPrior[0]![1].violations).toBeGreaterThan(0);
    const carried = driveCheck('f_c1_empty_temp_guard_fired', { acquired: { carried_count: 5 }, written: { replace_skipped_empty_guard: false }, prior: PRIOR, config: CFG });
    expect(carried[0]![1].violations, 'a normal run trips NEITHER F-C1 arm').toBe(0);
  });

  it.fails('override.accept_anomaly carries CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT on the drift check (LC-D7 — the operator escape hatch is NOT dropped) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    expect(d.override, 'an INGESTOR with a FAIL check must not declare override:"none"').not.toBe('none');
    const o = d.override as { accept_anomaly?: Array<{ env: string; check_id: string }> };
    expect(Array.isArray(o.accept_anomaly)).toBe(true);
    const entry = (o.accept_anomaly ?? []).find((e) => e.env === 'CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT');
    expect(entry, 'the legacy env test `=== "1"` is preserved as the declared override anchor [READ load-centreline.js:412]').toBeDefined();
    expect(entry!.check_id, 'acceptance moves the RUN STATUS, never the FAIL row').toBe('centreline_count_drift_pct');
  });
});

// ===========================================================================
// 6. buildLoadMeta — the frozen §9 producer block (18 keys)
// ===========================================================================

describe('row 3.2 — buildLoadMeta reproduces the frozen §9 producer block (loader :630-683)', () => {
  /** A minimal shaped COMPLETED run: the three seams a load meta is built from. */
  const ACQUIRED = {
    source_dataset_version: '80496e679ef7a2ae8b2e87eb986142a0',
    last_modified: '2026-07-08T04:12:00.000Z',
    etag: null,
    content_hash: '80496e679ef7a2ae8b2e87eb986142a0',
    feature_count_raw: 64388,
    feature_count_filtered: 47363,
    filtered_out_non_street: 17025,
    filtered_out_federal: 0,
    unknown_feature_code_count: 1,
    unknown_jurisdiction_count: 94,
    invalid_geometry_skipped: 0,
  };
  const WRITTEN = { inserted: 47363, updated: 0, deleted: 47368, replace_skipped_empty_guard: false };

  function build(ctx: Record<string, unknown>): Record<string, unknown> {
    const mod = loadComputeModule();
    expect(typeof mod.buildLoadMeta, 'the frozen §9 producer block is built by a NAMED export, not inline in compute()').toBe('function');
    const fn = mod.buildLoadMeta as (c: unknown) => Record<string, unknown>;
    return fn({
      acquired: ACQUIRED, written: WRITTEN, prior: null, config: CONFIG_VARS,
      descriptor: { identity: { name: 'load_centreline', spec_version: '1.1' } },
      ...ctx,
    }) as Record<string, unknown>;
  }

  it.fails('keys are EXACTLY the 18 of `function skeletonLoadMeta()` — no more, no fewer (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    expect(Object.keys(build({})).sort()).toEqual([...LOAD_META_KEYS_18].sort());
  });

  it.fails('spec_version is the pinned "1.1", features_updated is 0 (a full replace never UPDATEs), source_dataset_version is the content hash (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const m = build({});
    expect(m.spec_version, 'set LAST, the BUG-2 rule — a prior spread must never overwrite the pin').toBe('1.1');
    expect(m.features_updated).toBe(0);
    expect(m.source_dataset_version, 'contentHash || etag || sha1(lastModified) || String(runAt) — the hash wins when present [READ load-centreline.js:585]').toBe(ACQUIRED.content_hash);
    expect(m.feature_count_filtered).toBe(47363);
    expect(m.features_deleted, 'the DELETE rowCount is the PRE-state table size — an inter-run coupling, declared not masked (assessment §7 #4)').toBe(47368);
  });

  it.fails('the F-C1 WARN path spreads the PRIOR block and pins features_inserted 0 + delete_skipped_empty_guard true (LC-D14 PIN, flips ④b) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const m = build({
      written: { inserted: 0, updated: 0, deleted: 0, replace_skipped_empty_guard: true },
      prior: { feature_count_filtered: 47363, content_hash: 'priorhash', features_inserted: 47363, delete_skipped_empty_guard: false, spec_version: '1.1' },
    });
    expect(m.delete_skipped_empty_guard, 'the executor refused the DELETE — the flag is how the suppression reaches the audit row and the consumer').toBe(true);
    expect(m.features_inserted).toBe(0);
    expect(m.content_hash, 'the prior lineage survives the preserve — the table still holds the PRIOR load byte for byte').toBe('priorhash');
    expect(m.spec_version, 'the pin is applied AFTER the prior spread (BUG-2)').toBe('1.1');
    expect(Object.keys(m).length, 'a spread must not grow the frozen block').toBe(18);
  });
});

// ===========================================================================
// 7. Rule 3 — every literal is a declared config.logic_variables[] entry with a seed row
// ===========================================================================

describe('row 3.2 — Rule 3 literal ledger (report §6): logic_variables ⊇ the six, no bare compute literals', () => {
  it.fails('the descriptor declares all SIX variables with the report §6 bounds and on_invalid postures (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    expect(d.config, 'a step with externalized literals may not declare config:"none"').not.toBe('none');
    const cfg = d.config as { logic_variables: Array<{ name: string; min: unknown; max: unknown; on_invalid: string }>; validation: string; hoisted_above_gate: boolean };
    const names = cfg.logic_variables.map((v) => v.name);
    for (const v of Object.keys(CONFIG_VARS)) {
      expect(names, `${v} must be declared`).toContain(v);
    }
    const byName = new Map(cfg.logic_variables.map((v) => [v.name, v]));
    expect(byName.get('load_centreline_count_drift_fail_pct')!.on_invalid, 'a malformed VALUE must halt, not silently loosen a FAIL gate').toBe('fail');
    expect(byName.get('load_centreline_invalid_geometry_fail_pct')!.on_invalid).toBe('fail');
    expect(byName.get('load_centreline_download_retries')!.max, '0/10/clamp — a knob an operator may tune but never a verdict').toBe(10);
    expect(byName.get('load_centreline_download_retry_backoff_ms')!.on_invalid).toBe('clamp');
    expect(cfg.validation).toBe('strict');
    expect(cfg.hoisted_above_gate).toBe(true);
  });

  it.fails('every declared variable has a seed row whose default equals the report §6 ledger (LC-D3 seals at ②) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    const cfg = d.config as { logic_variables: Array<{ name: string }> };
    const S = seedDefaults();
    for (const v of cfg.logic_variables) {
      expect(S[v.name], `${SEED_REL} does not seed declared variable ${v.name} (Rule 3). LC-D3: NONE of these are seeded today`).toBeDefined();
      expect(S[v.name]!.default, `seed default for ${v.name}`).toBe(CONFIG_VARS[v.name]);
    }
  });

  it.fails('the compute carries NO bare 40000 / 5000 / 0.05 / 0.5 literal outside a ctx.config read (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-centreline.js
    const src = readText(COMPUTE_REL);
    const stripped = src.replace(/ctx\.config\.\w+/g, 'CONFIG_READ');
    for (const literal of ['40000', '5000', '0.05', '0.5']) {
      expect(new RegExp(`(^|[^\\w.])${literal.replace('.', '\\.')}([^\\w]|$)`).test(stripped), `bare ${literal} survives outside a ctx.config read (40000 = the retired centrelineMinFeatureCount, 5000 = the retired VALIDATION_CHUNK) — LC-D3/LC-D12`).toBe(false);
    }
  });
});

// ===========================================================================
// 8. LC-D1/LC-D2 — the two spec-vs-code divergences are NOT re-engineered here
// ===========================================================================

describe('row 3.2 — LC-D1/LC-D2: no geometry_update / mass_delete check, and the dup/bad-id rows WARN only', () => {
  it.fails('no declared check id matches /geometry_update|mass_delete/ (LC-D1 — the code has no such arms; Spec 62 is corrected at ②) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    const offenders = d.checks.map((c) => c.id).filter((id) => /geometry_update|mass_delete/.test(id));
    expect(offenders, 'load_ravines carries these because ITS legacy script aborts on them; load-centreline\'s does not [READ load-centreline.js:523-529]').toEqual([]);
  });

  it.fails('centreline_duplicate_centreline_id_count and centreline_bad_centreline_id_count are WARN, never FAIL (LC-D2) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-centreline.descriptor.json
    const d = loadDescriptor();
    expect(checkById(d, 'centreline_duplicate_centreline_id_count').severity, 'the loader WARNS and dedupeBySourceId keeps the FIRST [READ load-centreline.js:204-215, :516]').toBe('WARN');
    expect(checkById(d, 'centreline_bad_centreline_id_count').severity, 'a bad CENTREL2 is a counted loss, not a run-stopper [READ load-centreline.js:509]').toBe('WARN');
  });
});
