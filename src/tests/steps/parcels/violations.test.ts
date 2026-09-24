// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① — PH-7 test design, prove red)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.2 (conformance), §1.2a (P1–P5), §1.4 (write classes), §5.1 (frozen shape), §5.4 (lock convention), §5.5 (compute shape)
// SPEC LINK: docs/specs/01-pipeline/124_step_opt_policy.md Rules 1–13 (Rule 3: every literal is a declared config.logic_variables[] entry with a seed row; Rule 10: verdict row-derived; Rule 12: recovery.interrupted truthful), R-AZ
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (the source producer contract)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_parcels step, position 5)
//
// Batch-2 row 3.7 — `parcels`, the INGESTOR archetype's THIRD member (after `load_ravines` and
// `address_points`) — R-PACE-1 compressed form. Commit ① lands this RED suite + fixtures + the
// commit-① assessment report + PRE goldens; commit ② lands the descriptor + compute + frozen
// shell + seeds (POST goldens, zero-diff); commit ③ is the cutover (registration).
//
// ⚠️ EVERY TEST BELOW IS RED TODAY AND RED FOR THE RIGHT REASON. Each opens by asserting the
// FUTURE artifact it reads exists (`artifact()` → `expect(existsSync).toBe(true)` with the path
// in the message), so the failure names the missing artifact rather than surfacing as a TS or
// import error. The current step file is NEVER required in-process — it calls `pipeline.run()`
// and would open a pool; the require probe is a child process.
//
// Artifacts asserted against (plan of record `.cursor/batch2_p3_7_parcels_active_task.md` D1–D6 +
// the commit-① assessment report `docs/reports/2026-09-24-batch2-p3-7-parcels-assessment.md`):
//   scripts/load-parcels.descriptor.json  — class A guarded_upsert, set_source:"compute", 17 + geom
//                                            write columns, 3 outputs.invalidates[] (DEC-FENCE2),
//                                            checks[], config.logic_variables[], recovery, deviations[]
//   scripts/load-parcels.notes.json       — a REAL notes file (≤12 entries), unit constants declared
//   scripts/lib/compute/load-parcels.js   — checks dispatch + pure helpers + shapeRecord + buildWriteSql
//   scripts/load-parcels.js               — the §5.1 frozen shape (SPEC LINK kept, lock 55)
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const STEP_DIR_REL = 'src/tests/steps/parcels';

const STEP_REL = 'scripts/load-parcels.js';
const DESCRIPTOR_REL = 'scripts/load-parcels.descriptor.json';
const NOTES_REL = 'scripts/load-parcels.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-parcels.js';
const DRIFT_LIB_REL = 'scripts/lib/parcels-csv-drift.js';
const NORMALIZER_REL = 'scripts/lib/address-normalizers.js';
const SAFE_MATH_REL = 'scripts/lib/safe-math.js';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const REPORT_REL = 'docs/reports/2026-09-24-batch2-p3-7-parcels-assessment.md';
const SEED_REL = 'scripts/seeds/logic_variables.json';
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');
const CSV_6ROWS_REL = `${STEP_DIR_REL}/fixtures/parcels-6rows.csv`;
const CSV_DRIFT_REL = `${STEP_DIR_REL}/fixtures/parcels-drift-header-only.csv`;
const LEGACY_SQL_REL = `${STEP_DIR_REL}/fixtures/legacy-upsert.sql.txt`;

/** Spec 47 §A.5 lock registry row 55 [READ load-parcels.js:218]. */
const LOCK_ID = 55;
/** The written table and its 17 named columns + geom = 18 (report §1.2, from the INSERT :297-301). */
const WRITE_TABLE = 'parcels';
const WRITE_COLUMNS = [
  'parcel_id', 'feature_type',
  'address_number', 'linear_name_full',
  'addr_num_normalized', 'street_name_normalized', 'street_type_normalized',
  'stated_area_raw', 'lot_size_sqm', 'lot_size_sqft',
  'frontage_m', 'frontage_ft', 'depth_m', 'depth_ft',
  'geometry', 'date_effective', 'is_irregular',
  'geom',
];
const WRITE_CLASS = 'guarded_upsert';
/**
 * The 9 guard columns from the WHERE clause :362-376 — ONE `IS DISTINCT FROM` predicate per
 * OR-term (report §1.4, corrected in the review pass that produced this suite: the report's own
 * itemised list already names 9 items — geometry, lot_size_sqm, feature_type, the 5 address
 * columns, date_effective — 1+1+1+5+1=9; `grep -c 'IS DISTINCT FROM'` over :362-376 [MEASURED
 * 2026-09-24] independently confirms 9, not the plan's "7-disjunct" estimate). `geom` (the
 * PostGIS column) is NOT itself a guard predicate — it is set unconditionally alongside
 * `geometry` whenever the guard passes, driven by the `geometry` jsonb comparison.
 */
const GUARD_COLUMNS = [
  'geometry', 'lot_size_sqm', 'feature_type',
  'address_number', 'linear_name_full', 'addr_num_normalized',
  'street_name_normalized', 'street_type_normalized', 'date_effective',
];
/** The CSV_URL literal (:36-37) — inputs.reads.externals[0].url. */
const CSV_URL_HOST = 'ckan0.cf.opendata.inter.prod-toronto.ca';
/** The 3 DEC-FENCE2 lineage stamps (report §1.3, #418 + WF2 P11-1) — outputs.invalidates[]. */
const INVALIDATE_COLUMNS = [
  'ravine_dataset_version_when_enriched',
  'heritage_dataset_version_when_enriched',
  'centreline_dataset_version_when_enriched',
];

/** Rule 3 literal ledger (report §6) — every declared config variable, with its seed default. */
const CONFIG_VARS: Record<string, number> = {
  parcels_irregularity_threshold: 0.95,
  sources_parcels_floor: 460000,
  parcels_skip_rate_max_pct: 10,
  parcels_download_timeout_ms: 60000,
};
/** New variables this step mints (sources_parcels_floor is SHARED, pre-existing). */
const NEW_CONFIG_VARS = [
  'parcels_irregularity_threshold',
  'parcels_skip_rate_max_pct',
  'parcels_download_timeout_ms',
];
/** The SHARED variable (Rule 3: reuse the existing key, do not mint a second — report §6, PR-D5 pin). */
const SHARED_FLOOR_VAR = 'sources_parcels_floor';
/** The declared check ids (Rule 5, report §1.5 auditRows + §2 drift/null-address rows). */
const CHECK_IDS = [
  'csv_header_drift',
  'null_address_pct',
  'skip_rate_pct',
  'rows_read_floor',
  'records_errors',
];

// ---------------------------------------------------------------------------
// Artifact helpers
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the row-3.7 commit sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d); // throws with the AJV error list — the loader property (§4.2)
  return d;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Collapse all whitespace runs to a single space — the fixture's declared normalisation. */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** The pg.Pool construction spy, as a child process (never require a step in-process). */
function probe(rel: string): { pools: number; clients: number; require_error: string | null; has_descriptor: boolean; compute_type: string } {
  const raw = execFileSync('node', [PROBE, rel], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 });
  return JSON.parse(raw) as { pools: number; clients: number; require_error: string | null; has_descriptor: boolean; compute_type: string };
}

function checkById(d: Descriptor, id: string): Check {
  const c = d.checks.find((x) => x.id === id);
  expect(c, `descriptor declares no check "${id}"`).toBeDefined();
  return c as Check;
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'an INGESTOR may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

function seedDefaults(): Record<string, { default: number }> {
  return JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8')) as Record<string, { default: number }>;
}

interface ComputeModule {
  compute?: (ctx: unknown) => Promise<unknown>;
  checks?: Record<string, (ctx: unknown) => unknown>;
  buildWriteSql?: (row: Record<string, unknown>, hasPostGIS: boolean) => { sql: string; params: unknown[] };
  [k: string]: unknown;
}

function loadComputeModule(): ComputeModule {
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule | ((ctx: unknown) => Promise<unknown>); // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  return (typeof mod === 'function' ? { ...mod, compute: mod } : mod) as ComputeModule;
}

// ONE compiler, the same one pipeline.step() validates with.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

/** Run the A2 step-shape rule over explicit paths (mirrors step-conformance.infra.test.ts). */
function runStepShape(files: string[]): Array<{ file: string; rule: string; line: number }> {
  const bin = process.platform === 'win32'
    ? path.join(REPO_ROOT, 'node_modules/@ast-grep/cli-win32-x64-msvc/ast-grep.exe')
    : path.join(REPO_ROOT, 'node_modules/.bin/ast-grep');
  let stdout = '';
  try {
    stdout = execFileSync(bin, ['scan', '--rule', 'scripts/ast-grep-rules/step-shape.yml', '--report-style=short', '--color=never', ...files], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    stdout = (err as { stdout?: string }).stdout ?? '';
  }
  const LINE = /^(.+?):(\d+):(\d+): (?:error|warning|note|info)\[([\w-]+)\]:/;
  const out: Array<{ file: string; rule: string; line: number }> = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (m) out.push({ file: (m[1] as string).replace(/\\/g, '/'), rule: m[4] as string, line: Number(m[2]) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The CSV fixture driver — parses the real 6-row fixture into records
// ---------------------------------------------------------------------------

/** A tiny hand CSV reader: quotes are doubled, `"` wraps a field. Good enough for a reviewed fixture. */
function parseCsvFixture(rel: string): Array<Record<string, string>> {
  const text = fs.readFileSync(artifact(rel), 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n').filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0] as string);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Drive ONE check function from the compute's dispatch table, capturing its report() calls. */
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

// ===========================================================================
// 1. The artifacts exist, and the frozen shape holds
// ===========================================================================

describe('row 3.7 — the artifacts exist and validate (Spec 122 §5.1/§5.2, Spec 123 §7 row 6)', () => {
  it.fails('descriptor exists and is AJV-valid (RED today: ENOENT — no descriptor yet) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/load-parcels.descriptor.json
    const d = loadDescriptor();
    expect(d.identity.name).toBe('parcels');
    expect(d.identity.archetype).toBe('INGESTOR');
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.spec).toBe('55');
  });

  it.fails('the descriptor declares the CSV external, csv_options, key_property PARCELID (plan D2) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const ext = d.inputs.reads.externals[0]!;
    expect(ext.kind).toBe('http_file');
    expect(ext.format).toBe('csv');
    expect(ext.url).toContain(CSV_URL_HOST);
    expect(ext.key_property).toBe('PARCELID');
    expect(ext.csv_options, 'csv_options are REQUIRED for a csv external — honoured, never inferred').toBeDefined();
    const csvOpts = ext.csv_options as { bom?: boolean; relax_quotes?: boolean };
    expect(csvOpts.bom).toBe(false);
    expect(csvOpts.relax_quotes).toBe(true);
  });

  it.fails('outputs.writes[0] is class A guarded_upsert, set_source "compute", key parcel_id, geometry_kind polygon (plan D1) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const w = writes(d);
    expect(w.length, 'the INGESTOR runner drives exactly ONE write target').toBe(1);
    expect(w[0]!.table).toBe(WRITE_TABLE);
    expect(w[0]!.key).toBe('parcel_id');
    expect(w[0]!.geometry_kind, 'a polygon write, unlike address_points\' point').toBe('polygon');
    expect(w[0]!.write_discipline.class).toBe(WRITE_CLASS);
    expect(w[0]!.write_discipline.set_source, 'plan D1 — the RECORDER pilot 8 / LG-27 seam').toBe('compute');
    expect(w[0]!.retract, 'NO DELETE anywhere in the loader = retract none').toBe('none');
    expect(w[0]!.write_discipline.txn_scope, 'plan D1 — the runner wraps ALL batches in ONE step transaction, declared deviation').toBe('step');
  });

  it.fails('the 17 write columns + geom are declared, and outputs.invalidates[] carries the 3 DEC-FENCE2 stamps (plan D1) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const cols = writes(d)[0]!.columns.map((c) => c.name).sort();
    expect(cols).toEqual([...WRITE_COLUMNS].sort());
    const outs = d.outputs as { invalidates: Array<{ table: string; column: string; when: string }> };
    expect(outs.invalidates, 'plan D1 — three outputs.invalidates[] entries, one per DEC-FENCE2 stamp').toHaveLength(3);
    const names = outs.invalidates.map((i) => i.column).sort();
    expect(names).toEqual([...INVALIDATE_COLUMNS].sort());
    for (const inv of outs.invalidates) {
      expect(inv.table).toBe('parcels');
      expect(/geometry.*IS DISTINCT FROM|DEC-FENCE2|#418/i.test(inv.when), 'the when names the geometry-change gate').toBe(true);
    }
  });

  it.fails('guard_columns carry the 9-term WHERE-clause set (report §1.4, tree wins over the plan\'s "7-disjunct") (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const gc = writes(d)[0]!.write_discipline.guard_columns as string[] | 'all_declared';
    expect(Array.isArray(gc), 'guard_columns must be the explicit WHERE-clause set').toBe(true);
    expect((gc as string[]).sort()).toEqual([...GUARD_COLUMNS].sort());
  });

  it.fails('execution.on_batch_error is drop_batch (PR-D1 pin) and network declares the shared timeout var (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.execution.on_batch_error).toBe('drop_batch');
    expect(d.execution.on_batch_error_why).toBeDefined();
    expect(/PR-D1|#68|batch.*drop/i.test(JSON.stringify(d.execution.on_batch_error_why))).toBe(true);
    expect(d.execution.network.timeout_from_config).toBe('parcels_download_timeout_ms');
  });

  it.fails('override is "none" and recovery.interrupted is "none" (class A has no retraction to recover, Rule 12) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.override).toBe('none');
    expect(d.recovery.interrupted).toBe('none');
    expect(d.recovery.interrupted_why).toBeDefined();
  });

  it.fails('the step file is the §5.1 frozen shape, ast-grep clean, no pipeline.run (RED today: 585-line legacy) (flips at: commit ②)', () => {
    artifact(COMPUTE_REL, 'the frozen shell cannot exist without the compute');
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(src.split('\n').slice(0, 30).join('\n').includes('SPEC LINK:'), 'the frozen file keeps the SPEC LINK header').toBe(true);
    expect(/const ADVISORY_LOCK_ID\s*=\s*55;/.test(src), 'S1 — the lock literal kept textually per §5.4').toBe(true);
    expect(/module\.exports\s*=\s*pipeline\.step\(descriptor,\s*compute\)/.test(src)).toBe(true);
    expect(/module\.exports\.descriptor\s*=\s*descriptor/.test(src)).toBe(true);
    expect(/module\.exports\.compute\s*=\s*compute/.test(src)).toBe(true);
    expect(/process\.env|fetch\s*\(|require\(['"]fs['"]\)/.test(stripComments(src)), 'env/fetch/fs in the frozen-shape file').toBe(false);
    expect(runStepShape([STEP_REL]), 'ast-grep step-shape violations on the converted step').toEqual([]);
    const p = probe(STEP_REL);
    expect(p.require_error).toBeNull();
    expect(p.pools + p.clients).toBe(0);
    expect(p.has_descriptor && p.compute_type === 'function').toBe(true);
  });

  it.fails('the step file no longer carries the 585-line island (no pipeline.run, no https/http/csv-parse require) (flips at: commit ②)', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/pipeline\.run\s*\(/.test(src), 'pipeline.run still in the step file').toBe(false);
    expect(/require\(['"](https|http|csv-parse)['"]\)/.test(src), 'a network/CSV require in the frozen shell').toBe(false);
  });

  it.fails('compute is ast-grep clean against compute-shape.yml, exports the dispatch, and opens no pool (RED today: ENOENT) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-parcels.js
    artifact(COMPUTE_REL);
    const p = probe(COMPUTE_REL);
    expect(p.require_error, 'require() threw').toBeNull();
    expect(p.pools + p.clients, 'a pool/client constructed at require time').toBe(0);
    const src = stripComments(readText(COMPUTE_REL));
    expect(/console\.\w+\s*\(/.test(src), 'console.* in the compute (compute-shape.yml).').toBe(false);
    expect(/\b(fetch|process\.env|Date\.now)\s*\(/.test(src), 'a bare fetch / env / wall-clock read in the compute').toBe(false);
    // The wall-clock expiry predicate (report §4, the seam map's own finding: "there ARE clock
    // semantics to declare") is a legitimate `new Date()` read inside shapeRecord — NOT banned
    // here the way a bare Date.now() timing call would be; only the OTHER four forbidden
    // requires are checked for compute-purity.
    expect(/require\(\s*['"](fs|node:fs|os|child_process|pg|https|http|dotenv|crypto|csv-parse)['"]\s*\)/.test(src), 'compute-forbidden-require').toBe(false);
    const mod = loadComputeModule();
    expect(typeof mod.compute).toBe('function');
    expect(mod.checks && typeof mod.checks === 'object', '`checks` dispatch table').toBe(true);
    expect(Object.keys(mod.checks as object).sort(), '§5.5 (1): dispatch keys ≡ descriptor check ids').toEqual([...CHECK_IDS].sort());
    for (const [id, fn] of Object.entries(mod.checks as Record<string, (c: unknown) => unknown>)) {
      expect(typeof fn, `checks.${id}`).toBe('function');
      expect((fn as { name?: string }).name, `checks.${id}.name`).toBe(id);
    }
  });

  it.fails('compute exports coerceKey, shapeRecord, dedupeBySourceId, validatorCounterDelta, shouldSkipDelete, buildWriteSql (the runner contract + LG-27 escape hatch) (flips at: commit ②)', () => {
    const mod = loadComputeModule();
    for (const h of ['coerceKey', 'shapeRecord', 'dedupeBySourceId', 'validatorCounterDelta', 'shouldSkipDelete', 'buildWriteSql']) {
      expect(typeof mod[h], `the compute must export ${h}`).toBe('function');
    }
  });
});

// ===========================================================================
// 2. buildWriteSql — the DEC-FENCE2 fence, verbatim against fixtures/legacy-upsert.sql.txt
//    (report §1.1 D1, §1.3, §1.4; whitespace-normalised compare, per the c1b brief's own allowance)
// ===========================================================================

describe('row 3.7 — buildWriteSql reproduces the legacy UPSERT verbatim (fixtures/legacy-upsert.sql.txt)', () => {
  /** Extract a fenced fragment from the legacy fixture and assert the SAME normalised text appears
   *  in buildWriteSql's own output — both sides read from the ONE fixture, so there is no second,
   *  independently-typed copy of the SQL to drift out of sync. */
  function fenceFragments(): string[] {
    const legacy = normalizeWs(fs.readFileSync(artifact(LEGACY_SQL_REL), 'utf8'));
    const FRAGMENTS = [
      'address_number = COALESCE(NULLIF(EXCLUDED.address_number, \'\'), parcels.address_number)',
      'linear_name_full = COALESCE(NULLIF(EXCLUDED.linear_name_full, \'\'), parcels.linear_name_full)',
      'addr_num_normalized = COALESCE(NULLIF(EXCLUDED.addr_num_normalized, \'\'), parcels.addr_num_normalized)',
      'street_name_normalized = COALESCE(NULLIF(EXCLUDED.street_name_normalized, \'\'), parcels.street_name_normalized)',
      'street_type_normalized = COALESCE(NULLIF(EXCLUDED.street_type_normalized, \'\'), parcels.street_type_normalized)',
      'ravine_dataset_version_when_enriched = CASE WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb THEN NULL ELSE parcels.ravine_dataset_version_when_enriched END',
      'heritage_dataset_version_when_enriched = CASE WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb THEN NULL ELSE parcels.heritage_dataset_version_when_enriched END',
      'centreline_dataset_version_when_enriched = CASE WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb THEN NULL ELSE parcels.centreline_dataset_version_when_enriched END',
      'WHERE parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb',
      'OR parcels.lot_size_sqm IS DISTINCT FROM EXCLUDED.lot_size_sqm',
      'OR parcels.feature_type IS DISTINCT FROM EXCLUDED.feature_type',
      'ON CONFLICT (parcel_id)',
      'RETURNING (xmax = 0) AS is_insert',
    ];
    // Sanity: every fragment we are about to demand of buildWriteSql is genuinely present in the
    // fixture itself (never assert a fragment that drifted out of the fixture's own text).
    for (const f of FRAGMENTS) {
      expect(legacy.includes(normalizeWs(f)), `fixture drift: "${f}" not found in legacy-upsert.sql.txt`).toBe(true);
    }
    return FRAGMENTS;
  }

  it('the legacy fixture exists and contains the full guarded UPSERT text (RED today: ENOENT)', () => {
    // RED value: MISSING ARTIFACT src/tests/steps/parcels/fixtures/legacy-upsert.sql.txt
    const legacy = readText(LEGACY_SQL_REL);
    expect(legacy).toContain('INSERT INTO parcels (');
    expect(legacy).toContain('ON CONFLICT (parcel_id)');
    expect(legacy).toContain('RETURNING (xmax = 0) AS is_insert');
  });

  it.fails('buildWriteSql(row, hasPostGIS) generates INSERT + ON CONFLICT DO UPDATE, with ST_SetSRID when PostGIS is present (RED today: ENOENT — no compute yet) (flips at: commit ②)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-parcels.js
    const mod = loadComputeModule();
    const buildWriteSql = mod.buildWriteSql as (row: Record<string, unknown>, hasPostGIS: boolean) => { sql: string; params: unknown[] };
    expect(typeof buildWriteSql, 'compute.js must export buildWriteSql (LG-27, set_source:"compute")').toBe('function');
    const sampleRow = {
      parcel_id: '9000001', feature_type: 'PARCEL',
      address_number: '100', linear_name_full: 'Davenport Rd',
      addr_num_normalized: '100', street_name_normalized: 'DAVENPORT', street_type_normalized: 'RD',
      stated_area_raw: '300.00 sq.m', lot_size_sqm: 300, lot_size_sqft: 3229.17,
      frontage_m: 14.4, frontage_ft: 47.24, depth_m: 20.84, depth_ft: 68.37,
      geometry: { type: 'Polygon', coordinates: [[[-79.401, 43.65], [-79.4, 43.65], [-79.4, 43.6505], [-79.401, 43.6505], [-79.401, 43.65]]] },
      date_effective: '2020-01-01', is_irregular: false,
    };
    const { sql, params } = buildWriteSql(sampleRow, true);
    expect(Array.isArray(params)).toBe(true);
    const normalized = normalizeWs(sql);
    expect(normalized).toContain(normalizeWs('INSERT INTO parcels ('));
    expect(normalized).toContain(normalizeWs('ON CONFLICT (parcel_id)'));
    expect(normalized).toContain(normalizeWs('ST_SetSRID(ST_GeomFromGeoJSON'));
    for (const frag of fenceFragments()) {
      expect(normalized, `buildWriteSql output is missing the fenced fragment: ${frag}`).toContain(normalizeWs(frag));
    }
  });

  it.fails('buildWriteSql(row, hasPostGIS=false) omits the geom line entirely (the PostGIS-absent two-arm behaviour, report §1.2) (flips at: commit ②)', () => {
    const mod = loadComputeModule();
    const buildWriteSql = mod.buildWriteSql as (row: Record<string, unknown>, hasPostGIS: boolean) => { sql: string; params: unknown[] };
    const { sql } = buildWriteSql({ parcel_id: '1', feature_type: 'PARCEL' }, false);
    expect(normalizeWs(sql)).not.toContain('ST_SetSRID');
  });

  it.fails('the generated SQL structurally forbids DELETE/TRUNCATE (class A, retract:"none") (flips at: commit ②)', () => {
    const mod = loadComputeModule();
    const buildWriteSql = mod.buildWriteSql as (row: Record<string, unknown>, hasPostGIS: boolean) => { sql: string; params: unknown[] };
    const { sql } = buildWriteSql({ parcel_id: '1', feature_type: 'PARCEL' }, true);
    expect(/\bDELETE\b|\bTRUNCATE\b/i.test(sql)).toBe(false);
  });
});

// ===========================================================================
// 3. compute.shapeRecord — the CSV row → the 17-bound-column shape (loader :467-545)
// ===========================================================================

describe('row 3.7 — compute.shapeRecord maps a CSV record to the bound columns (loader :467-545)', () => {
  interface Shape { [k: string]: unknown }

  function shapeRecord(): (record: Record<string, string>) => Shape | null {
    const mod = loadComputeModule();
    expect(typeof mod.shapeRecord, 'the compute must export shapeRecord — a csv external owes a shape (runner :638)').toBe('function');
    return mod.shapeRecord as (record: Record<string, string>) => Shape | null;
  }

  function coerceKey(): (raw: unknown) => string | null {
    const mod = loadComputeModule();
    expect(typeof mod.coerceKey, 'the compute must export coerceKey — the acquisition seam asks the step how to key ITS rows').toBe('function');
    return mod.coerceKey as (raw: unknown) => string | null;
  }

  it.fails('row 1 — a stated-area rectangle shapes its 17 columns + geojson (frontage/depth pinned via the mirrored MBR math, NOT the unexported legacy fn) (flips at: commit ②)', () => {
    // Expected numbers independently computed (not required from the legacy script — its
    // helpers are unexported and requiring load-parcels.js in-process fires pipeline.run as a
    // side effect) by re-deriving the SAME documented algorithm (extractRing/minimumBoundingRect/
    // shoelaceArea, loader :59-156) against this fixture's own ring, per the c1b brief's
    // instruction to pin expected values independently rather than transcribe the legacy fn.
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[0] as Record<string, string>) as Shape;
    expect(r, 'row 1 must shape').not.toBeNull();
    expect(r.parcel_id).toBe('9000001');
    expect(r.feature_type).toBe('PARCEL');
    expect(r.address_number).toBe('100');
    expect(r.linear_name_full).toBe('Davenport Rd');
    expect(r.addr_num_normalized, 'normalizeAddressNumber("100")').toBe('100');
    expect(r.street_name_normalized, 'parseLinearName("Davenport Rd").street_name').toBe('DAVENPORT');
    expect(r.street_type_normalized, 'parseLinearName("Davenport Rd").street_type').toBe('RD');
    expect(r.lot_size_sqm, 'from STATEDAREA "300.00 sq.m", NOT from polygon area').toBe(300);
    expect(r.lot_size_sqft).toBeCloseTo(3229.17, 2);
    expect(r.frontage_m).toBeCloseTo(14.4, 1);
    expect(r.depth_m).toBeCloseTo(20.84, 1);
    expect(r.frontage_ft).toBeCloseTo(47.24, 1);
    expect(r.depth_ft).toBeCloseTo(68.37, 1);
    expect(r.is_irregular, 'an axis-aligned rectangle: polyArea/mbrArea ratio ~1.0, not < 0.95').toBe(false);
    expect(String(r.geojson), 'the parsed geometry travels as the `geojson` field the write plan binds').toContain('Polygon');
    expect(r.date_effective).toBe('2020-01-01');
  });

  it.fails('row 2 — a trapezoid with NO stated area: lot_size_sqm/sqft are null (NEVER derived from polygon area), frontage/depth use the polygon-derived scale, is_irregular true (flips at: commit ②)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[1] as Record<string, string>) as Shape;
    expect(r, 'row 2 must shape').not.toBeNull();
    expect(r.parcel_id).toBe('9000002');
    // Loader :503-505: lot_size_sqm is EXCLUSIVELY parseStatedArea(STATEDAREA); it is never
    // backfilled from polygonArea even though estimateLotDimensions uses polygonArea internally
    // as the `trueArea` fallback for the frontage/depth SCALE when STATEDAREA is absent.
    expect(r.lot_size_sqm, 'STATEDAREA is blank — lot_size_sqm is null, never polygon-derived').toBeNull();
    expect(r.lot_size_sqft).toBeNull();
    expect(r.frontage_m).toBeCloseTo(48.2, 1);
    expect(r.depth_m).toBeCloseTo(139.49, 1);
    expect(r.is_irregular, 'a trapezoid: polyArea/mbrArea ratio 0.75 < 0.95').toBe(true);
  });

  it.fails('row 3 — a second stated-area-less rectangle: is_irregular false, DATE_EXPIRY blank never triggers the expiry skip (flips at: commit ②)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[2] as Record<string, string>) as Shape;
    expect(r, 'row 3 must shape — a blank DATE_EXPIRY is not a skip condition (loader :494, `if (dateExpiry && ...)`)').not.toBeNull();
    expect(r.parcel_id).toBe('9000003');
    expect(r.frontage_m).toBeCloseTo(33.4, 1);
    expect(r.depth_m).toBeCloseTo(80.56, 1);
    expect(r.is_irregular).toBe(false);
  });

  it.fails('row 4 — FEATURE_TYPE=CORRIDOR is excluded, returns null (loader :486-490, shaped_skipped) (flips at: commit ②)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[3] as Record<string, string>);
    expect(r, 'a CORRIDOR feature type is never loaded').toBeNull();
  });

  it.fails('row 5 — an expired DATE_EXPIRY (not the 3000-01-01 sentinel) is excluded, returns null (loader :492-497) (flips at: commit ②)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[4] as Record<string, string>);
    expect(r, 'a past, non-sentinel DATE_EXPIRY is never loaded').toBeNull();
  });

  it.fails('row 6 — unparsable geometry does NOT skip the row (correction: the row-3.7 brief\'s "unparsable-geometry rows -> null" claim does not match the tree — parseGeoJSON [:169-176] catches and returns null, and NOTHING downstream `continue`s on it; the row IS shaped, with a null geometry/geojson and null frontage/depth, exactly mirroring address_points\' own AP-D2 swallow) (flips at: commit ②)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[5] as Record<string, string>) as Shape;
    expect(r, 'the parse swallow carries the row, it does not drop it — only feature-type/expiry/empty-PARCELID `continue` (loader :487,:495,:500)').not.toBeNull();
    expect(r.parcel_id).toBe('9000006');
    expect(r.geojson == null || r.geojson === 'null', 'an unparsable geometry string carries as null').toBeTruthy();
    expect(r.frontage_m).toBeNull();
    expect(r.depth_m).toBeNull();
    expect(r.is_irregular, 'estimateLotDimensions(null, ...) returns null -> is_irregular defaults false (loader :520)').toBe(false);
  });

  it.fails('coerceKey is PARCELID trimmed, null when unusable (never empty string) — loader :499 (flips at: commit ②)', () => {
    const coerce = coerceKey();
    expect(coerce('9000001')).toBe('9000001');
    expect(coerce('  9000002  ')).toBe('9000002');
    expect(coerce('')).toBeNull();
    expect(coerce(undefined)).toBeNull();
  });
});

// ===========================================================================
// 4. The pure helpers — dedupe (last-wins) and the class-A skip-delete
// ===========================================================================

describe('row 3.7 — the pure helpers (dedupe last-wins · shouldSkipDelete always true)', () => {
  it.fails('dedupeBySourceId keeps LAST-wins — the loader\'s own supersede semantics (flips at: commit ②)', () => {
    const mod = loadComputeModule();
    expect(typeof mod.dedupeBySourceId, 'dedupeBySourceId must be exported').toBe('function');
    const fn = mod.dedupeBySourceId as (features: unknown[]) => { kept: Array<Record<string, unknown>>; duplicateCount: number };
    const out = fn([
      { parcel_id: '1', lot_size_sqm: 100 },
      { parcel_id: '1', lot_size_sqm: 200 }, // later wins
      { parcel_id: '2', lot_size_sqm: 300 },
    ]);
    expect(out.duplicateCount).toBe(1);
    expect(out.kept).toHaveLength(2);
    expect(out.kept[0]!.lot_size_sqm, 'the LAST record for a duplicated key wins').toBe(200);
  });

  it.fails('shouldSkipDelete always returns true — class A has no delete_sql, the runner also guards (prerequisite 0a) (flips at: commit ②)', () => {
    const mod = loadComputeModule();
    expect(typeof mod.shouldSkipDelete, 'shouldSkipDelete must be exported').toBe('function');
    const fn = mod.shouldSkipDelete as (...a: unknown[]) => boolean;
    expect(fn([])).toBe(true);
    expect(fn([1, 2, 3])).toBe(true);
    expect(fn(undefined)).toBe(true);
  });
});

// ===========================================================================
// 5. The declared checks — one function per id, thresholds via ctx.config
// ===========================================================================

describe('row 3.7 — the checks fire on their fixtures (Spec 124 Rule 3/5/10, report §1.5/§2)', () => {
  const CFG = CONFIG_VARS;

  it.fails('csv_header_drift fires WARN on a header-only CSV missing `geometry` (the drift-lib reuse, report §2) (flips at: commit ②)', () => {
    // RED today: no compute. GREEN: detectMissingColumns on the drift fixture's header set.
    const headerOnly = parseCsvFixture(CSV_DRIFT_REL);
    expect(headerOnly, 'the drift fixture is header-only').toHaveLength(0);
    const missing = require(path.join(REPO_ROOT, DRIFT_LIB_REL)).detectMissingColumns([ // eslint-disable-line @typescript-eslint/no-require-imports -- the real drift lib
      'PARCELID', 'FEATURE_TYPE', 'STATEDAREA', 'ADDRESS_NUMBER', 'LINEAR_NAME_FULL', 'DATE_EFFECTIVE', 'DATE_EXPIRY',
    ]) as string[];
    expect(missing, 'geometry is a REQUIRED_CSV_COLUMNS entry absent from the drift fixture header').toContain('geometry');
    const calls = driveCheck('csv_header_drift', { acquired: { missing_columns: missing }, config: CFG });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('csv_header_drift');
    expect(calls[0]![1].violations, 'a missing required column is one violation — WARN, not FAIL (drift-lib :53-65)').toBeGreaterThan(0);
  });

  it.fails('csv_header_drift is SILENT (0 violations) on the real 8-column fixture (flips at: commit ②)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const keys = Object.keys(rows[0] as Record<string, string>);
    const missing = require(path.join(REPO_ROOT, DRIFT_LIB_REL)).detectMissingColumns(keys) as string[]; // eslint-disable-line @typescript-eslint/no-require-imports
    expect(missing, 'the 6-row fixture carries all 4 REQUIRED_CSV_COLUMNS').toEqual([]);
    const calls = driveCheck('csv_header_drift', { acquired: { missing_columns: missing }, config: CFG });
    expect(calls[0]![1].violations).toBe(0);
  });

  it.fails('skip_rate_pct FAILs at/above the config bound (loader :421, "< 10%", NOT WARN — this row is legacy FAIL, unlike rows_read below) (flips at: commit ②)', () => {
    const over = driveCheck('skip_rate_pct', { acquired: { rows_read: 100, records_skipped: 15 }, config: CFG });
    expect(over[0]![1].violations, '15% >= 10% ⇒ violation').toBeGreaterThan(0);
    const under = driveCheck('skip_rate_pct', { acquired: { rows_read: 100, records_skipped: 1 }, config: CFG });
    expect(under[0]![1].violations, '1% < 10% ⇒ clean').toBe(0);
  });

  it.fails('rows_read_floor reads sources_parcels_floor via ctx.config (SHARED key, Rule 3, report §6 PR-D5 pin — the loader\'s own WARN stays WARN, never promoted to FAIL) (flips at: commit ②)', () => {
    const below = driveCheck('rows_read_floor', { acquired: { rows_read: 449999 }, config: CFG });
    expect(below[0]![1].violations, 'below the loader\'s legacy 450000 WARN threshold ⇒ violation').toBeGreaterThan(0);
    const at = driveCheck('rows_read_floor', { acquired: { rows_read: 498479 }, config: CFG });
    expect(at[0]![1].violations, 'at the measured live row count ⇒ clean').toBe(0);
  });

  it.fails('records_errors FAILs above 0 (loader :422, "== 0") (flips at: commit ②)', () => {
    const zero = driveCheck('records_errors', { acquired: { errors: 0 }, config: CFG });
    expect(zero[0]![1].violations).toBe(0);
    const one = driveCheck('records_errors', { acquired: { errors: 1 }, config: CFG });
    expect(one[0]![1].violations).toBeGreaterThan(0);
  });

  it.fails('the severities match the legacy exactly: rows_read WARN (never promoted), skip_rate FAIL, records_errors FAIL, csv_header_drift WARN (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(checkById(d, 'rows_read_floor').severity, 'report §1.5 AP-D6 trap: the legacy loader WARNs at :416, NOT FAIL — do not mirror address_points\' correction here').toBe('WARN');
    expect(checkById(d, 'skip_rate_pct').severity).toBe('FAIL');
    expect(checkById(d, 'records_errors').severity).toBe('FAIL');
    expect(checkById(d, 'csv_header_drift').severity).toBe('WARN');
    for (const c of d.checks) expect(c.blocking, 'PIN, DO NOT FIX — a FAIL row today exits 0 and the chain continues').toBe(false);
  });

  it.fails('the rows_read_floor check uses the R-T addendum `value_min` form, not `"viol == 0"` (the address_points AP-D6 trap, report §6 warning) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const c = checkById(d, 'rows_read_floor');
    expect(String(c.limit)).toMatch(/value_min/);
    expect(c.limit_from_config).toBe(SHARED_FLOOR_VAR);
  });
});

// ===========================================================================
// 6. Rule 3 — every literal is a declared config.logic_variables[] entry with a seed row
// ===========================================================================

describe('row 3.7 — Rule 3 literal ledger (report §6): logic_variables ≡ seeds, no bare compute literals', () => {
  it.fails('every declared config variable has a seed row; every seed default equals the report §6 ledger (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const cfg = d.config as { logic_variables: Array<{ name: string; min: unknown; max: unknown; on_invalid: string }>; validation: string; hoisted_above_gate: boolean };
    const names = cfg.logic_variables.map((v) => v.name).sort();
    expect(names).toEqual(Object.keys(CONFIG_VARS).sort());
    const S = seedDefaults();
    for (const v of cfg.logic_variables) {
      expect(S[v.name], `${SEED_REL} does not seed declared variable ${v.name} (Rule 3)`).toBeDefined();
      expect(S[v.name]!.default, `seed default for ${v.name} must equal the report §6 ledger`).toBe(CONFIG_VARS[v.name]);
      expect(v.on_invalid, `${v.name} is verdict-affecting ⇒ on_invalid fail`).toBe('fail');
    }
    expect(cfg.validation).toBe('strict');
    expect(cfg.hoisted_above_gate).toBe(true);
  });

  it.fails('sources_parcels_floor is REUSED, never duplicated (one seed row at 460000, Rule 3) (flips at: commit ②)', () => {
    const S = seedDefaults();
    const rows = Object.keys(S).filter((k) => k === SHARED_FLOOR_VAR);
    expect(rows).toHaveLength(1);
    expect(S[SHARED_FLOOR_VAR]!.default, 'report §6 — MEASURED against the seed file, 460000').toBe(460000);
    const d = loadDescriptor();
    const declared = (d.config as { logic_variables: Array<{ name: string }> }).logic_variables.map((v) => v.name);
    expect(declared.filter((n) => n === SHARED_FLOOR_VAR), 'declared exactly once').toHaveLength(1);
  });

  it.fails('the compute reads every threshold through ctx.config.<name> — no bare literal bound (flips at: commit ②)', () => {
    const src = readText(COMPUTE_REL);
    for (const v of NEW_CONFIG_VARS) {
      expect(src.includes(`ctx.config.${v}`), `the compute must read ${v} via ctx.config`).toBe(true);
    }
    expect(src.includes(`ctx.config.${SHARED_FLOOR_VAR}`), 'the floor check reads the SHARED variable via ctx.config').toBe(true);
    // The IRREGULARITY_THRESHOLD (0.95) must be a config read inside shapeRecord too, not the
    // bare module-level constant the legacy script hard-coded at :99.
    expect(/0\.95/.test(src.replace(/ctx\.config\.parcels_irregularity_threshold/g, '')), 'no bare 0.95 literal survives outside the config read').toBe(false);
  });

  it.fails('notes.json declares SQM_TO_SQFT/M_TO_FT as unit constants, NOT logic_variables (plan D3 — no config.constants schema field, corrected in this review pass) (flips at: commit ②)', () => {
    const notes = JSON.parse(readText(NOTES_REL)) as Record<string, unknown>;
    const blob = JSON.stringify(notes);
    expect(/SQM_TO_SQFT|10\.7639/.test(blob), 'the sq.m -> sq.ft unit constant is declared').toBe(true);
    expect(/M_TO_FT|3\.28084/.test(blob), 'the metre -> foot unit constant is declared').toBe(true);
    expect(/unit.constant|physics/i.test(blob), 'the reasoning (no admin knob for physics) is stated').toBe(true);
    const d = loadDescriptor();
    const cfg = (d.config as { logic_variables: Array<{ name: string }> }).logic_variables.map((v) => v.name);
    expect(cfg).not.toContain('SQM_TO_SQFT');
    expect(cfg).not.toContain('M_TO_FT');
  });

  it.fails('notes.json is a real notes file (≤12 entries) with fences[] an explicit array (flips at: commit ②)', () => {
    const notes = JSON.parse(readText(NOTES_REL)) as { fences?: unknown[] } & Record<string, unknown>;
    const PROSE = ['expected_shape', 'read_this_way', 'suspicious_if', 'blind_spots', 'decisions', 'review_notes', 'expected', 'known_normal', 'known_bad', 'do_not_reflag', 'how_to_investigate', 'limitations', 'constants'];
    let n = 0;
    for (const b of PROSE) if (Array.isArray(notes[b])) n += (notes[b] as unknown[]).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(12);
    expect(Array.isArray(notes.fences), 'notes.fences must be an explicit array').toBe(true);
    const d = loadDescriptor();
    expect((d.interpretation as { file: string }).file).toBe(path.basename(NOTES_REL));
  });
});

// ===========================================================================
// 7. Deviations — txn_scope widening, argv retirement, PR-D1..PR-D4 named (plan D4)
// ===========================================================================

describe('row 3.7 — deviations carry the plan\'s D1/D3/D4 adjudications verbatim', () => {
  it.fails('deviations[] is an explicit array (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(Array.isArray(d.deviations), 'deviations must be an explicit array (never "none")').toBe(true);
  });

  it.fails('the per-batch → step txn atomicity-window widening is declared (plan D1) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations);
    expect(/txn_scope/.test(text) && /step/i.test(text), 'the widening names txn_scope').toBe(true);
  });

  it.fails('process.argv[2] local-path override is retired per R-AZ (report §3 row 3) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations);
    expect(/argv/.test(text), 'the retired argv seam is declared').toBe(true);
    expect(/R-AZ/.test(text)).toBe(true);
  });

  it.fails('PR-D1 (batch drop, #68) is pinned as a KNOWN-DEFECT, carried not fixed (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations) + JSON.stringify(d.limitations);
    expect(/PR-D1/.test(text), 'the divergence is pinned with its ledger id').toBe(true);
  });

  it.fails('PR-D2 (parcels_null_address_pct structurally-unsatisfiable WARN) is a named limitation, the check is NOT retired (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations) + JSON.stringify(d.limitations);
    expect(/PR-D2/.test(text)).toBe(true);
    const ids = d.checks.map((c) => c.id);
    expect(ids, 'the null-address check stays declared, per plan D4 — retiring it would hide the strip').toContain('null_address_pct');
  });

  it.fails('PR-D3 (CKAN coordinate jitter) and PR-D4 (centroid invalidation gap, OUT of scope) are named limitations (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations) + JSON.stringify(d.limitations);
    expect(/PR-D3/.test(text)).toBe(true);
    expect(/PR-D4/.test(text)).toBe(true);
  });

  it.fails('the retired progress-cadence literals (10*1024*1024, 50000, 484000) are declared retired, dead under the whole-array model (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations);
    expect(/progress|cadence|whole.array/i.test(text)).toBe(true);
  });
});

// ===========================================================================
// 8. Recovery, counters, emits, guards, database (Rule 10/12)
// ===========================================================================

describe('row 3.7 — recovery, counters, emits, guards, database (Rule 10/12)', () => {
  it.fails('recovery.interrupted is truthful: none — class A has no retraction, so nothing to recover (Rule 12) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.recovery.interrupted).toBe('none');
    expect(d.recovery.before_image).toBe('none');
    expect(d.recovery.interrupted_why, 'the none posture is justified').toBeDefined();
    expect(/class A|no retract|guarded_upsert/i.test(JSON.stringify(d.recovery.interrupted_why))).toBe(true);
  });

  it.fails('counters read records_total from written.inserted+updated, records_new from inserted, records_updated from updated (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.counters, 'a LOADER declares its counters').not.toBe('none');
    const c = d.counters as { records_total: { source: string }; records_new: { source: string }; records_updated: { source: string } };
    expect(/insert/.test(c.records_new.source)).toBe(true);
    expect(/updat/.test(c.records_updated.source)).toBe(true);
  });

  it.fails('emits[] carries the records_meta keys the loader emits today, byte-identical (report §1.5) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.emits, 'the loader emits records_meta').not.toBe('none');
    const keys = (d.emits as Array<{ key: string }>).map((e) => e.key);
    expect(keys.length).toBeGreaterThan(0);
  });

  it.fails('guards: the geom GIST index the write validates through, srid 4326 (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.guards.srid).toBe(4326);
    for (const r of d.guards.requires) expect(r.on_missing, `${r.kind} must fail, never degrade`).toBe('fail');
  });

  it.fails('database.min_migration names the base parcels table (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(typeof d.database.min_migration === 'number').toBe(true);
  });

  it.fails('sharing.varies_by_chain.phase.sources is declared (chain owner = Spec 43, position 5) (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.sharing.varies_by_chain.phase.sources).toBeDefined();
  });

  it.fails('terminals declare the lock-contention self-skip and a success path (flips at: commit ②)', () => {
    const d = loadDescriptor();
    expect(d.terminals.some((t) => t.kind === 'skip_lock_contention')).toBe(true);
    expect(d.terminals.some((t) => t.kind === 'success')).toBe(true);
  });
});

// ===========================================================================
// 9. Legacy infra tests — the in-place re-point rule (plan D5), and the converted.json pending entry
// ===========================================================================

describe('row 3.7 — legacy infra tests stay at their paths (D5, in-place re-point rule)', () => {
  it('legacy src/tests/load-parcels.parse.smoke.test.ts still exists (unchanged path — re-pointed at commit ②, unchanged at ①)', () => {
    expect(fs.existsSync(abs('src/tests/load-parcels.parse.smoke.test.ts')), 'D5: never moved, never deleted').toBe(true);
  });

  it('legacy src/tests/load-parcels.csv-drift.logic.test.ts still exists (D5: the drift lib is not rewritten, this test is unchanged)', () => {
    expect(fs.existsSync(abs('src/tests/load-parcels.csv-drift.logic.test.ts'))).toBe(true);
  });

  it('the 3 unregistered libs — parcels-csv-drift.js, address-normalizers.js, safe-math.js — exist today and are registered under Spec 55 at commit ③, not here (plan D6)', () => {
    expect(fs.existsSync(abs(DRIFT_LIB_REL))).toBe(true);
    expect(fs.existsSync(abs(NORMALIZER_REL))).toBe(true);
    expect(fs.existsSync(abs(SAFE_MATH_REL))).toBe(true);
  });
});

describe('row 3.7 — converted.json.pending carries the red_suite stage entry (R-K.1) — [flipped at commit ③]', () => {
  it('a pending entry for scripts/load-parcels.js exists at stage "red_suite", registers_at commit ③', () => {
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as {
      converted: string[];
      pending: Array<{ file: string; registers_at: string; stage: string }>;
    };
    const entry = converted.pending.find((p) => p.file === STEP_REL);
    expect(entry, 'the pending entry for scripts/load-parcels.js must exist').toBeDefined();
    expect(entry!.stage, 'RED today — no descriptor exists yet, stage must stay red_suite').toBe('red_suite');
    expect(entry!.registers_at).toMatch(/commit ③/);
    expect(converted.converted, 'not registered until commit ③').not.toContain(STEP_REL);
  });

  it('[flipped at commit ③] converted.json registers parcels, pending[] carries no leftover entry (R-K)', () => {
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[]; pending: Array<{ file: string }> };
    if (!converted.converted.includes(STEP_REL)) return; // not yet cut over — this it() is a future lock, not a RED assertion today
    expect(converted.pending.some((p) => p.file === STEP_REL), 'R-K: the pending entry is deleted in the SAME commit as registration').toBe(false);
  });
});

describe('row 3.7 — the frozen shell names lock 55 and the descriptor names lock 55 (the §5.4 lock lock)', () => {
  it.fails('the textual ADVISORY_LOCK_ID constant and the descriptor identity.lock agree (flips at: commit ②)', () => {
    const d = loadDescriptor();
    const textual = /const ADVISORY_LOCK_ID\s*=\s*(\d+)/.exec(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(textual, 'the §5.4 textual constant').not.toBeNull();
    expect(d.identity.lock).toBe(Number((textual as RegExpExecArray)[1]));
    expect(d.identity.lock).toBe(LOCK_ID);
  });
});

// ===========================================================================
// 10. The commit-① assessment report itself
// ===========================================================================

describe('row 3.7 — the commit-① assessment report exists and carries its required sections', () => {
  it('the report exists and names the compressed-form marker + the 3 unregistered libs + the #430 reconciliation', () => {
    const report = readText(REPORT_REL);
    expect(/Commit form: compressed \(R-PACE-1\)/.test(report)).toBe(true);
    expect(/parcels-csv-drift\.js/.test(report)).toBe(true);
    expect(/address-normalizers\.js/.test(report)).toBe(true);
    expect(/#430/.test(report)).toBe(true);
    expect(/PR-D1/.test(report) && /PR-D2/.test(report) && /PR-D3/.test(report) && /PR-D4/.test(report)).toBe(true);
  });
});

interface Check { id: string; kind: string; expect: unknown; limit: unknown; limit_from_config?: string; severity: string; blocking: boolean; when: string; chains: string[] | 'all'; why?: { text?: string; liveness?: unknown } }
interface WriteSpec {
  table: string; key: string | string[]; geometry_kind?: string;
  columns: Array<{ name: string; vocabulary: unknown; written?: string; bind?: string }>;
  write_discipline: { class: string; guard: unknown; guard_columns: unknown; scope: unknown; expected_change_ratio: unknown; idempotent_rerun: unknown; txn_scope: unknown; set_source?: string };
  retract: string; replay: string;
}
interface Descriptor {
  identity: { name: string; display_name: string; lock: number; spec: string; archetype: string };
  inputs: { reads: { steps: unknown[]; tables: Array<{ table: string }>; externals: Array<{ id: string; kind: string; format: string; url?: string; csv_options?: unknown; key_property?: string; cache?: string }> }; expect_nonempty: boolean; on_missing: string };
  outputs: 'none' | { writes: WriteSpec[]; cascades: unknown; invalidates: unknown; publish: unknown; write_inventory: unknown };
  staleness: { scope: string; trigger: 'none' | Array<{ signal: string; position: string; external?: string }>; mode_select: string; checkpoint: unknown; interval: unknown; fingerprint: string; fingerprint_inputs: unknown; logic_version: string; on_fingerprint_change: string };
  guards: { requires: Array<{ kind: string; name: string; on_missing: string }>; srid: number | 'none'; empty_source: string; schema_drift: string };
  execution: { budget: string; txn_scope: string; txn_budget: string; chunked: boolean; statement_timeout: unknown; step_timeout: string; batch: unknown; needs_disk_mb: unknown; partial_fill: string; on_row_error: string; on_batch_error: string; on_batch_error_why?: unknown; on_check_error: string; on_degrade: string; criticality: string; network: { egress: string[]; timeout: unknown; timeout_from_config?: string; retries: number; redact: string }; invocation: Record<string, unknown>; maintenance: unknown };
  checks: Check[];
  invariants: unknown;
  plausibility: unknown;
  override: 'none' | { force_full: string; force_run: string; dry_run: string };
  emits: 'none' | Array<{ key: string; type: string; consumers: string[]; skeleton?: unknown }>;
  deviations: unknown;
  limitations: unknown;
  interpretation: { file: string; entries: number } | 'none';
  recovery: { reset: unknown; resume: unknown; force: unknown; rollback: unknown; verify_clean: unknown; cascades: unknown; interrupted: string; interrupted_why: unknown; before_image: string; before_image_why: unknown };
  database: { class: unknown; min_migration: number | 'none'; assert_current_database: string };
  counters: 'none' | { records_total: { source: string; scoped_by: unknown }; records_new: { source: string }; records_updated: { source: string } };
  config: 'none' | { logic_variables: Array<{ name: string; min: number | 'none'; max: number | 'none'; on_invalid: string }>; validation: string; hoisted_above_gate: boolean };
  sharing: { chains: unknown; shared: unknown; slug_forms: unknown; varies_by_chain: { checks: unknown; phase: Record<string, unknown>; audit_table: unknown; scope: unknown }; on_contention: string };
  terminals: Array<{ id: string; kind: string; status: string; records_meta: Record<string, string> | string }>;
}
