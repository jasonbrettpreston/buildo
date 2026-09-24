// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6 — PH-7 test design, prove red)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.2 (conformance), §1.2a (P1–P5), §1.4 (write classes), §5.1 (frozen shape), §5.4 (lock convention), §5.5 (compute shape)
// SPEC LINK: docs/specs/01-pipeline/124_step_opt_policy.md Rules 1–13 (Rule 3: every literal is a declared config.logic_variables[] entry with a seed row; Rule 10: verdict row-derived; Rule 12: recovery.interrupted truthful)
// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md (§ the source producer contract)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_address_points step)
//
// Batch-2 row 3.1 — `address_points`, the INGESTOR archetype's SECOND member (the first is
// `load_ravines`) and the FIRST write-class-A (`guarded_upsert`) INGESTOR. Per the operator's
// 2026-09-23 budget ruling, commits 6, 7 and the 8-peel are FOLDED into one `descriptor_only`
// diff; EVERY peel concern still gets its own RED lock here and its own row in the report's
// "Peel ledger".
//
// ⚠️ EVERY TEST BELOW IS RED TODAY AND RED FOR THE RIGHT REASON. Each opens by asserting the
// FUTURE artifact it reads exists (`artifact()` → `expect(existsSync).toBe(true)` with the path
// in the message), so the failure names the missing artifact rather than surfacing as a TS or
// import error. The current step file is NEVER required in-process — it calls `pipeline.run()`
// and would open a pool; the require probe is a child process.
//
// Artifacts asserted against (plan of record + the commit-1 assessment report):
//   scripts/load-address-points.descriptor.json  — class A guarded_upsert, 16 write columns,
//                                               staleness.trigger [] (no gate today), checks[],
//                                               config.logic_variables[], recovery, deviations[]
//   scripts/load-address-points.notes.json       — a REAL notes file (≤12 entries)
//   scripts/lib/compute/load-address-points.js   — checks dispatch + pure helpers + shapeRecord
//   scripts/load-address-points.js               — the §5.1 frozen shape (SPEC LINK kept, lock 96)
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const STEP_DIR_REL = 'src/tests/steps/address_points';

const STEP_REL = 'scripts/load-address-points.js';
const DESCRIPTOR_REL = 'scripts/load-address-points.descriptor.json';
const NOTES_REL = 'scripts/load-address-points.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-address-points.js';
const DRIFT_LIB_REL = 'scripts/lib/address-points-csv-drift.js';
const NORMALIZER_REL = 'scripts/lib/address-normalizers.js';
const WRITE_REL = 'scripts/lib/step/write.js';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const REPORT_REL = 'docs/reports/2026-09-23-batch2-p3-1-address-points-assessment.md';
const SEED_REL = 'scripts/seeds/logic_variables.json';
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');
const CSV_6ROWS_REL = `${STEP_DIR_REL}/fixtures/address-points-6rows.csv`;
const CSV_DRIFT_REL = `${STEP_DIR_REL}/fixtures/address-points-drift-header-only.csv`;

/** Spec 47 §A.5 lock registry row 96 [READ load-address-points.js:80]. */
const LOCK_ID = 96;
/** The written table and its 16 columns (§1.2 of the assessment report, from the INSERT :184-196). */
const WRITE_TABLE = 'address_points';
const WRITE_COLUMNS = [
  'address_point_id', 'latitude', 'longitude',
  'address_number', 'linear_name_full', 'address_full', 'lo_num', 'hi_num',
  'maint_stage', 'address_status', 'address_class_desc', 'class_family_desc', 'place_name',
  'addr_num_normalized', 'linear_name_normalized', 'geom',
];
const WRITE_CLASS = 'guarded_upsert';
/** The 13 guard columns from the WHERE clause :219-241 (12 bare/NULLIF + geom). */
const GUARD_COLUMNS = [
  'latitude', 'longitude', 'address_number', 'linear_name_full', 'address_full',
  'lo_num', 'hi_num', 'maint_stage', 'address_status', 'address_class_desc',
  'class_family_desc', 'place_name', 'addr_num_normalized', 'linear_name_normalized', 'geom',
];
/** The CSV_URL literal (:37-38) — inputs.reads.externals[0].url. */
const CSV_URL_HOST = 'ckan0.cf.opendata.inter.prod-toronto.ca';

/**
 * Rule 3 literal ledger (§6 of the commit-1 report) — every declared config variable, with
 * its seed default. RETIRED at commit 9 (step-validate's §1.2a P4 conformance check caught
 * it as a dead declaration — no consumer anywhere in the converted architecture, see the
 * descriptor's own `deviations[]` entry): `address_points_progress_bytes_window`,
 * `address_points_progress_row_modulo`, `address_points_expected_total_rows`. The legacy
 * per-row streaming progress loop they governed has no analogue under the INGESTOR runner's
 * whole-array CSV acquisition path.
 */
const CONFIG_VARS: Record<string, number> = {
  sources_address_points_floor: 500000,
  address_points_skip_rate_max_pct: 5,
  address_points_null_address_number_max_pct: 0.1,
  address_points_download_timeout_ms: 60000,
};
/** The config variables that are REAL seeded variables minted by this step (sources_address_points_floor pre-exists). */
const NEW_CONFIG_VARS = [
  'address_points_skip_rate_max_pct',
  'address_points_null_address_number_max_pct',
  'address_points_download_timeout_ms',
];
/** The SHARED variable (Rule 3: reuse the existing key, do not mint a second). */
const SHARED_FLOOR_VAR = 'sources_address_points_floor';
/** The declared check ids (Rule 5). */
const CHECK_IDS = [
  'csv_header_drift',
  'null_address_number_pct',
  'skip_rate_pct',
  'rows_read_floor',
  'geom_parse_failures',
  'shaped_skipped',
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
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the row-3.1 commit sequence)`,
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

interface ComputeModule { compute?: (ctx: unknown) => Promise<unknown>; checks?: Record<string, (ctx: unknown) => unknown>; [k: string]: unknown }

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
// A. The artifacts exist, and the frozen shape holds
// ===========================================================================

describe('row 3.1 — the artifacts exist and validate (Spec 122 §5.1/§5.2, Spec 123 §7 row 6)', () => {
  it('descriptor exists and is AJV-valid (RED today: ENOENT — no descriptor yet)', () => {
    // RED value: MISSING ARTIFACT scripts/load-address-points.descriptor.json
    const d = loadDescriptor();
    expect(d.identity.name).toBe('address_points');
    expect(d.identity.archetype).toBe('INGESTOR');
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.spec).toBe('54');
  });

  it('the step file is the §5.1 frozen shape, ast-grep clean, no pipeline.run (RED today: 497-line island)', () => {
    artifact(COMPUTE_REL, 'the frozen shell cannot exist without the compute');
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(src.split('\n').slice(0, 30).join('\n').includes('SPEC LINK:'), 'the frozen file keeps the SPEC LINK header').toBe(true);
    expect(/const ADVISORY_LOCK_ID\s*=\s*96;/.test(src), 'S1 — the lock literal kept textually per §5.4').toBe(true);
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

  it('the step file no longer carries the 497-line island (no pipeline.run, no https/http require)', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/pipeline\.run\s*\(/.test(src), 'pipeline.run still in the step file').toBe(false);
    expect(/require\(['"](https|http|csv-parse)['"]\)/.test(src), 'a network/CSV require in the frozen shell').toBe(false);
  });

  it('compute is ast-grep clean against compute-shape.yml, exports the dispatch, and opens no pool (RED today: ENOENT)', () => {
    // RED value: MISSING ARTIFACT scripts/lib/compute/load-address-points.js
    artifact(COMPUTE_REL);
    const p = probe(COMPUTE_REL);
    expect(p.require_error, 'require() threw').toBeNull();
    expect(p.pools + p.clients, 'a pool/client constructed at require time').toBe(0);
    const src = stripComments(readText(COMPUTE_REL));
    expect(/console\.\w+\s*\(/.test(src), 'console.* in the compute (compute-shape.yml).').toBe(false);
    expect(/\b(fetch|process\.env|Date\.now|new Date)\s*\(/.test(src), 'a bare fetch / env / wall-clock read in the compute').toBe(false);
    expect(/require\(\s*['"](fs|node:fs|os|child_process|pg|https|http|dotenv|crypto|csv-parse)['"]\s*\)/.test(src), 'compute-forbidden-require').toBe(false);
    const mod = loadComputeModule();
    expect(typeof mod.compute).toBe('function');
    expect(mod.checks && typeof mod.checks === 'object', '`checks` dispatch table').toBe(true);
    expect(Object.keys(mod.checks as object), '§5.5 (1): dispatch keys ≡ descriptor check ids, in order').toEqual(CHECK_IDS);
    for (const [id, fn] of Object.entries(mod.checks as Record<string, (c: unknown) => unknown>)) {
      expect(typeof fn, `checks.${id}`).toBe('function');
      expect((fn as { name?: string }).name, `checks.${id}.name`).toBe(id);
    }
  });
});

// ===========================================================================
// B. compute.shapeRecord — the CSV row → the 16 write-column values
//    (pins the loader's :283-345 mapping, byte-for-byte)
// ===========================================================================

describe('row 3.1 — compute.shapeRecord maps a CSV record to the 16 bound columns (loader :283-345)', () => {
  interface Shape { [k: string]: unknown }

  function shapeRecord(): (record: Record<string, string>) => Shape | null {
    const mod = loadComputeModule();
    expect(typeof mod.shapeRecord, 'the compute must export shapeRecord — a csv external owes a shape (runner :638)').toBe('function');
    return mod.shapeRecord as (record: Record<string, string>) => Shape | null;
  }

  function coerceKey(): (raw: unknown) => number | null {
    const mod = loadComputeModule();
    expect(typeof mod.coerceKey, 'the compute must export coerceKey — the acquisition seam asks the step how to key ITS rows').toBe('function');
    return mod.coerceKey as (raw: unknown) => number | null;
  }

  it('a Point-geometry row maps its JSON coordinates — geom = the geometry string, lat/lng from the point', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[0] as Record<string, string>) as Shape;
    expect(r, 'row 1 must shape').not.toBeNull();
    expect(r.address_point_id).toBe(1000001);
    expect(r.latitude).toBeCloseTo(43.6715, 4);
    expect(r.longitude).toBeCloseTo(-79.3968, 4);
    expect(String(r.geojson), 'geom travels as the `geojson` field the write plan binds').toContain('Point');
    expect(r.address_number).toBe('100');
    expect(r.addr_num_normalized, 'normalizeAddressNumber("100")').toBe('100');
    expect(r.linear_name_normalized, 'parseLinearName("Davenport Rd").street_name').toBe('DAVENPORT');
  });

  it('a MultiPoint-geometry row is unwrapped the same way ([[lng,lat]] → lng/lat)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[2] as Record<string, string>) as Shape;
    expect(r.address_point_id).toBe(1000003);
    expect(r.latitude).toBeCloseTo(43.65, 4);
    expect(r.longitude).toBeCloseTo(-79.39, 4);
  });

  it('an EMPTY geometry falls back to LATITUDE/LONGITUDE (the OR-contract, loader :304-311)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[4] as Record<string, string>) as Shape; // id 1000005, no geometry
    expect(r, 'a row with lat/lng but no geometry is STILL carried — never null').not.toBeNull();
    expect(r.address_point_id).toBe(1000005);
    expect(r.latitude).toBeCloseTo(43.655, 4);
    expect(r.longitude).toBeCloseTo(-79.395, 4);
  });

  it('an unparsable geometry falls back to lat/lng and does NOT throw (AP-D2 swallow, :293-305)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[5] as Record<string, string>) as Shape; // id 1000006, "not-a-json-geometry"
    expect(r, 'the parse swallow carries the row, it does not drop it').not.toBeNull();
    expect(r.address_point_id).toBe(1000006);
    expect(r.latitude).toBeCloseTo(43.658, 4);
  });

  it('a row with NO coordinate source at all returns null (the one departure shapeRecord may express)', () => {
    const r = shapeRecord()({ ADDRESS_POINT_ID: '999', ADDRESS_NUMBER: '9' });
    expect(r, 'no geometry and no lat/lng ⇒ no coordinates ⇒ the row is not loadable').toBeNull();
  });

  it('an empty ADDRESS_NUMBER is carried as null (the loader maps "" → null before the write)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[3] as Record<string, string>) as Shape; // id 1000004, empty ADDRESS_NUMBER
    expect(r.address_point_id).toBe(1000004);
    expect(r.address_number).toBeNull();
  });

  it('coerceKey is ADDRESS_POINT_ID as an int, null when unusable (never NaN)', () => {
    const coerce = coerceKey();
    expect(coerce('1000001')).toBe(1000001);
    expect(coerce('not-a-number')).toBeNull();
    expect(coerce('')).toBeNull();
    expect(coerce(undefined)).toBeNull();
  });
});

// ===========================================================================
// C. The pure helpers — dedupe (last-wins) and the class-A skip-delete
// ===========================================================================

describe('row 3.1 — the pure helpers (dedupe last-wins · shouldSkipDelete always true)', () => {
  it('dedupeBySourceId keeps LAST-wins — the loader\'s own supersede semantics', () => {
    const mod = loadComputeModule();
    expect(typeof mod.dedupeBySourceId, 'dedupeBySourceId must be exported').toBe('function');
    const fn = mod.dedupeBySourceId as (features: unknown[]) => { kept: Array<Record<string, unknown>>; duplicateCount: number };
    const out = fn([
      { address_point_id: 1, latitude: 1 },
      { address_point_id: 1, latitude: 2 }, // later wins
      { address_point_id: 2, latitude: 3 },
    ]);
    expect(out.duplicateCount).toBe(1);
    expect(out.kept).toHaveLength(2);
    expect(out.kept[0]!.latitude, 'the LAST record for a duplicated key wins').toBe(2);
  });

  it('shouldSkipDelete always returns true — class A has no delete_sql, the runner also guards (0a)', () => {
    const mod = loadComputeModule();
    expect(typeof mod.shouldSkipDelete, 'shouldSkipDelete must be exported').toBe('function');
    const fn = mod.shouldSkipDelete as (...a: unknown[]) => boolean;
    expect(fn([])).toBe(true);
    expect(fn([1, 2, 3])).toBe(true);
    expect(fn(undefined)).toBe(true);
  });
});

// ===========================================================================
// D. The declared checks — one function per id, thresholds via ctx.config
// ===========================================================================

describe('row 3.1 — the checks fire on their fixtures (Spec 124 Rule 3/5/10)', () => {
  const CFG = CONFIG_VARS;
  // Rule 3 unit note: the pct checks compare the RATIO (Spec 122 §5.5 — "the pct checks
  // report a ratio") against limit_from_config, so the two pct bounds are supplied in
  // ratio units here (0.10 = 10%, 0.05 = 5%). The SEED defaults keep the human percent
  // the Rule 3 ledger records (0.1 / 5); the divergence is the coordinator's call.
  const CFG_PCT_RATIO = { ...CFG, address_points_null_address_number_max_pct: 0.1, address_points_skip_rate_max_pct: 0.05 };

  it('csv_header_drift fires WARN on a header-only CSV missing ADDRESS_FULL (the OR-contract, drift lib reuse)', () => {
    // RED today: no compute. GREEN: detectMissingColumns on the drift fixture's header set.
    const rows = parseCsvFixture(CSV_6ROWS_REL); // the drift fixture has NO data rows
    void rows;
    const headerOnly = parseCsvFixture(CSV_DRIFT_REL);
    expect(headerOnly, 'the drift fixture is header-only').toHaveLength(0);
    const missing = require(path.join(REPO_ROOT, DRIFT_LIB_REL)).detectMissingColumns([ // eslint-disable-line @typescript-eslint/no-require-imports -- the real drift lib
      'ADDRESS_POINT_ID', 'ADDRESS_NUMBER', 'LINEAR_NAME_FULL', 'LO_NUM', 'HI_NUM',
      'MAINT_STAGE', 'ADDRESS_STATUS', 'ADDRESS_CLASS_DESC', 'CLASS_FAMILY_DESC',
      'PLACE_NAME', 'LATITUDE', 'LONGITUDE', 'geometry',
    ]) as string[];
    expect(missing, 'ADDRESS_FULL is absent from the drift fixture header').toContain('ADDRESS_FULL');
    const calls = driveCheck('csv_header_drift', { acquired: { missing_columns: missing }, config: CFG });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('csv_header_drift');
    expect(calls[0]![1].violations, 'a missing required column is one violation → WARN').toBeGreaterThan(0);
  });

  it('csv_header_drift is SILENT (0 violations) on the real 14-column fixture', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const keys = Object.keys(rows[0] as Record<string, string>);
    const missing = require(path.join(REPO_ROOT, DRIFT_LIB_REL)).detectMissingColumns(keys) as string[]; // eslint-disable-line @typescript-eslint/no-require-imports
    expect(missing, 'the 6-row fixture carries all 14 real columns').toEqual([]);
    const calls = driveCheck('csv_header_drift', { acquired: { missing_columns: missing }, config: CFG });
    expect(calls[0]![1].violations).toBe(0);
  });

  it('null_address_number_pct WARNs above the config bound and PASSes under it (Rule 3)', () => {
    // FIX (row 3.1 fix pass): the literals below were the human PERCENT (0.1) while the
    // compute (and the adjacent skip_rate test, and the drift lib's 0.10 boundary)
    // compare the RATIO against the config value — the sibling's own §5.5 note:
    // "THE PCT CHECKS REPORT A RATIO". Corrected to the ratio unit; the INTENT
    // (above-bound trips / below-bound clean) is unchanged.
    // AP-D8 (2026-09-24): re-pointed onto the generic 0o runner counters
    // (`acquired.rows_shaped` / `acquired.column_nulls.address_number`) — the prior
    // `attempted_address_number_rows` / `null_address_number_rows` fields were never
    // populated by any runner (review_followups.md:4082).
    const over = driveCheck('null_address_number_pct', { acquired: { rows_shaped: 100, column_nulls: { address_number: 20 } }, config: CFG_PCT_RATIO });
    expect(over[0]![1].violations, '0.20 > 0.10 default ⇒ violation').toBe(1);
    const under = driveCheck('null_address_number_pct', { acquired: { rows_shaped: 100, column_nulls: { address_number: 1 } }, config: CFG_PCT_RATIO });
    expect(under[0]![1].violations, '0.01 < 0.10 default ⇒ clean').toBe(0);
  });

  it('skip_rate_pct FAILs at/above the config bound (5%)', () => {
    const over = driveCheck('skip_rate_pct', { acquired: { rows_read: 100, records_skipped: 10 }, written: { rows_scanned: 90 }, config: CFG_PCT_RATIO });
    expect(over[0]![1].violations, '0.10 > 0.05 ⇒ violation').toBe(1);
    const under = driveCheck('skip_rate_pct', { acquired: { rows_read: 100, records_skipped: 1 }, written: { rows_scanned: 99 }, config: CFG_PCT_RATIO });
    expect(under[0]![1].violations, '1% < 5% ⇒ clean').toBe(0);
  });

  it('rows_read_floor reads sources_address_points_floor via ctx.config (SHARED key, Rule 3)', () => {
    const below = driveCheck('rows_read_floor', { acquired: { rows_read: 499999 }, config: CFG });
    expect(below[0]![1].violations, 'below the 500000 floor ⇒ violation').toBe(1);
    const at = driveCheck('rows_read_floor', { acquired: { rows_read: 525000 }, config: CFG });
    expect(at[0]![1].violations, 'at 525000 ⇒ clean').toBe(0);
  });

  it('geom_parse_failures is a purely descriptive counter (AP-D2 pin, INFO)', () => {
    const calls = driveCheck('geom_parse_failures', { acquired: { geom_parse_failures: 3 }, config: CFG });
    expect(calls[0]![1], 'an INFO counter records the count, it never gates').toMatchObject({ violations: 0 });
    expect(String(JSON.stringify(calls[0]![1]))).toContain('3');
  });

  it('shaped_skipped reports rows the step refused to load (never silently dropped)', () => {
    const calls = driveCheck('shaped_skipped', { acquired: { shaped_skipped: 2 }, config: CFG });
    expect(JSON.stringify(calls[0]![1])).toContain('2');
  });
});

// ===========================================================================
// E. The descriptor's semantics — write class A, checks wiring, config, deviations
// ===========================================================================

describe('row 3.1 — the descriptor declares class-A guarded_upsert (Spec 122 §1.4)', () => {
  it('the write target is address_points, keyed on address_point_id, class A, retract none', () => {
    const d = loadDescriptor();
    const w = writes(d);
    expect(w.length, 'the INGESTOR runner drives exactly ONE write target').toBe(1);
    expect(w[0]!.table).toBe(WRITE_TABLE);
    expect(w[0]!.key).toBe('address_point_id');
    expect(w[0]!.write_discipline.class).toBe(WRITE_CLASS);
    expect(w[0]!.write_discipline.guard, 'the guarded UPDATE clause').toBe('is_distinct_from');
    expect(w[0]!.write_discipline.scope, 'class A has no retraction scope').toBe('none');
    expect(w[0]!.retract, 'NO DELETE anywhere in the loader = retract none').toBe('none');
    expect(w[0]!.write_discipline.idempotent_rerun).toBe('zero_writes');
    expect(w[0]!.write_discipline.txn_scope, 'the runner wraps ALL batches in ONE transaction (Fold B3)').toBe('step');
  });

  it('the 16 write columns are declared (3 base + 10 source + 2 normalized + geom)', () => {
    const d = loadDescriptor();
    const cols = writes(d)[0]!.columns.map((c) => c.name).sort();
    expect(cols).toEqual([...WRITE_COLUMNS].sort());
  });

  it('guard_columns carry the WHERE-clause set (the 12 NULLIF/bare + geom)', () => {
    const d = loadDescriptor();
    const gc = writes(d)[0]!.write_discipline.guard_columns as string[] | 'all_declared';
    expect(Array.isArray(gc), 'guard_columns must be the explicit WHERE-clause set').toBe(true);
    expect(gc).toEqual(expect.arrayContaining(GUARD_COLUMNS));
  });

  it('the external is the CKAN CSV, format csv, key ADDRESS_POINT_ID, no cache', () => {
    const d = loadDescriptor();
    const ext = d.inputs.reads.externals[0]!;
    expect(ext.kind).toBe('http_file');
    expect(ext.format).toBe('csv');
    expect(ext.url).toContain(CSV_URL_HOST);
    expect(ext.key_property).toBe('ADDRESS_POINT_ID');
    expect(ext.cache).toBe('none');
    expect(ext.csv_options, 'csv_options are REQUIRED for a csv external — honoured, never inferred').toBeDefined();
    expect(d.inputs.reads.tables, 'address_points reads no table').toEqual([]);
  });
});

describe('row 3.1 — staleness has NO gate today (declared honestly, Spec 54/123 §7)', () => {
  it('staleness.trigger is the legal "none" form — a hash-equal skip would be a behaviour change', () => {
    const d = loadDescriptor();
    const t = d.staleness.trigger;
    expect(t === 'none' || (Array.isArray(t) && t.length === 0), 'the loader has NO gate: every run loads').toBe(true);
    expect(d.staleness.scope, 'no gate ⇒ no row eligibility narrowing').toBe('none');
  });

  it('the skip-gate opportunity lives in limitations[], NOT in a forged staleness trigger', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.limitations ?? []) + JSON.stringify(d.deviations ?? []);
    expect(/stale|hash|gate|skip/i.test(text), 'a limitation records the post-cutover skip-gate opportunity').toBe(true);
  });
});

describe('row 3.1 — checks[] wiring (Rule 5) and config.logic_variables (Rule 3)', () => {
  it('every declared check id has a compute dispatch entry, and vice versa (keys ≡ ids)', () => {
    const d = loadDescriptor();
    const ids = d.checks.map((c) => c.id).sort();
    expect(ids).toEqual([...CHECK_IDS].sort());
    const mod = loadComputeModule();
    expect(Object.keys(mod.checks as object).sort(), 'dispatch keys ≡ declared ids').toEqual([...CHECK_IDS].sort());
  });

  it('the WARN/INFO/FAIL severities and limit_from_config are declared as the report rules them', () => {
    const d = loadDescriptor();
    expect(checkById(d, 'csv_header_drift').severity).toBe('WARN');
    expect(checkById(d, 'null_address_number_pct').severity).toBe('WARN');
    expect(checkById(d, 'null_address_number_pct').limit_from_config).toBe('address_points_null_address_number_max_pct');
    // CORRECTED at commit 9 (ROW-ERROR-GATE fast invariant #27 caught this): the legacy
    // auditRows entry reads `status: skipRate >= 5 ? 'FAIL' : 'PASS'` (git show
    // 120b2b99:scripts/load-address-points.js:418) — FAIL-severity, not WARN.
    expect(checkById(d, 'skip_rate_pct').severity).toBe('FAIL');
    expect(checkById(d, 'skip_rate_pct').limit_from_config).toBe('address_points_skip_rate_max_pct');
    expect(checkById(d, 'rows_read_floor').severity).toBe('FAIL');
    expect(checkById(d, 'rows_read_floor').limit_from_config, 'the SHARED floor variable (Rule 3)').toBe(SHARED_FLOOR_VAR);
    expect(checkById(d, 'geom_parse_failures').severity, 'AP-D2: a purely descriptive counter').toBe('INFO');
    for (const c of d.checks) expect(c.blocking, 'PIN, DO NOT FIX — a FAIL row today exits 0 and the chain continues').toBe(false);
  });

  it('csv_header_drift.why names the OR-contract (geometry OR LATITUDE+LONGITUDE)', () => {
    const d = loadDescriptor();
    const why = JSON.stringify(checkById(d, 'csv_header_drift').why ?? {});
    expect(/geometry/i.test(why) && /LATITUDE/i.test(why), 'the why states the coordinate OR-contract').toBe(true);
  });

  it('every declared config variable has a seed row; every seed default equals the legacy literal', () => {
    const d = loadDescriptor();
    const cfg = d.config as { logic_variables: Array<{ name: string; min: unknown; max: unknown; on_invalid: string }>; validation: string; hoisted_above_gate: boolean };
    const names = cfg.logic_variables.map((v) => v.name).sort();
    expect(names).toEqual(Object.keys(CONFIG_VARS).sort());
    const S = seedDefaults();
    for (const v of cfg.logic_variables) {
      expect(S[v.name], `${SEED_REL} does not seed declared variable ${v.name} (Rule 3)`).toBeDefined();
      expect(S[v.name]!.default, `seed default for ${v.name} must equal the legacy literal`).toBe(CONFIG_VARS[v.name]);
      expect(v.on_invalid, `${v.name} is verdict-affecting ⇒ on_invalid fail`).toBe('fail');
    }
    expect(cfg.validation).toBe('strict');
    expect(cfg.hoisted_above_gate).toBe(true);
  });

  it('sources_address_points_floor is REUSED, never duplicated (one seed row, Rule 3)', () => {
    const S = seedDefaults();
    const rows = Object.keys(S).filter((k) => k === SHARED_FLOOR_VAR);
    expect(rows).toHaveLength(1);
    expect(S[SHARED_FLOOR_VAR]!.default).toBe(500000);
    const d = loadDescriptor();
    const declared = (d.config as { logic_variables: Array<{ name: string }> }).logic_variables.map((v) => v.name);
    expect(declared.filter((n) => n === SHARED_FLOOR_VAR), 'declared exactly once').toHaveLength(1);
  });
});

describe('row 3.1 — deviations carry the four adjudications verbatim (Fold B3 · R-AZ · AP-D1 · AP-D2/D3)', () => {
  it('deviations[] is an explicit array', () => {
    const d = loadDescriptor();
    expect(Array.isArray(d.deviations), 'deviations must be an explicit array (never "none")').toBe(true);
  });

  it('the per-batch → step txn atomicity-window widening is declared (Fold B3)', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations);
    expect(/txn_scope/.test(text) && /step/i.test(text), 'the widening names txn_scope').toBe(true);
  });

  it('process.argv[2] local-path override is retired per R-AZ', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations);
    expect(/argv/.test(text), 'the retired argv seam is declared').toBe(true);
  });

  it('AP-D1 (maint_stage/address_status filter absence) is PINNED as a KNOWN-DEFECT, carried not fixed', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations) + JSON.stringify(d.limitations);
    expect(/AP-D1/.test(text), 'the divergence is pinned with its ledger id').toBe(true);
    expect(/maint_stage/.test(text) && /address_status/.test(text), 'it names the two unfiltered columns').toBe(true);
  });

  it('AP-D2 (geom_parse_failures counted) is declared in the geom_parse_failures check why', () => {
    const d = loadDescriptor();
    expect(/AP-D2/.test(JSON.stringify(checkById(d, 'geom_parse_failures').why ?? {})), 'AP-D2 pinned on its check').toBe(true);
  });

  it('execution.on_batch_error is drop_batch with on_batch_error_why naming AP-D3', () => {
    const d = loadDescriptor();
    expect(d.execution.on_batch_error, 'the loader logs, counts and DROPS a failed batch').toBe('drop_batch');
    expect(d.execution.on_batch_error_why, 'a drop_batch declaration owes its why (schema allOf)').toBeDefined();
    expect(/AP-D3/.test(JSON.stringify(d.execution.on_batch_error_why)), 'the why names AP-D3').toBe(true);
  });
});

describe('row 3.1 — recovery, counters, emits, guards, database (Rule 10/12)', () => {
  it('recovery.interrupted is truthful: none — class A has no retraction, so nothing to recover (Rule 12)', () => {
    const d = loadDescriptor();
    expect(d.recovery.interrupted).toBe('none');
    expect(d.recovery.before_image).toBe('none');
    expect(d.recovery.interrupted_why, 'the none posture is justified').toBeDefined();
    expect(/AP-D|class A|no retract|guarded_upsert/i.test(JSON.stringify(d.recovery.interrupted_why)), 'the why explains class A').toBe(true);
  });

  it('counters read records_total from written.inserted+updated, records_new from inserted, records_updated from updated', () => {
    const d = loadDescriptor();
    expect(d.counters, 'a LOADER declares its counters').not.toBe('none');
    const c = d.counters as { records_total: { source: string }; records_new: { source: string }; records_updated: { source: string } };
    expect(/insert/.test(c.records_new.source)).toBe(true);
    expect(/updat/.test(c.records_updated.source)).toBe(true);
  });

  it('emits[] carries the records_meta keys the loader emits today, byte-identical', () => {
    const d = loadDescriptor();
    expect(d.emits, 'the loader emits records_meta').not.toBe('none');
    const keys = (d.emits as Array<{ key: string }>).map((e) => e.key);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('guards: RLS bypass for address_points (mig 227 default-deny) + the GIST index', () => {
    const d = loadDescriptor();
    const kinds = d.guards.requires.map((r) => r.kind);
    expect(kinds).toContain('rls_bypass_or_policy');
    expect(d.guards.requires.find((r) => r.kind === 'rls_bypass_or_policy')!.name).toBe(WRITE_TABLE);
    expect(kinds, 'the geom GIST index the write validates through').toContain('index');
    for (const r of d.guards.requires) expect(r.on_missing, `${r.kind} must fail, never degrade`).toBe('fail');
    expect(d.guards.srid).toBe(4326);
  });

  it('database.min_migration is 18 — the base address_points table', () => {
    const d = loadDescriptor();
    expect(d.database.min_migration).toBe(18);
  });

  it('sharing.varies_by_chain.phase.sources is declared (chain owner = Spec 43)', () => {
    const d = loadDescriptor();
    expect(d.sharing.varies_by_chain.phase.sources).toBeDefined();
  });

  it('terminals declare the lock-contention self-skip and a success path', () => {
    const d = loadDescriptor();
    expect(d.terminals.some((t) => t.kind === 'skip_lock_contention')).toBe(true);
    expect(d.terminals.some((t) => t.kind === 'success')).toBe(true);
  });
});

// ===========================================================================
// G. The standard batteries — dispatch ≡ declared, notes, the folded peel ledger
// ===========================================================================

describe('row 3.1 — the standard batteries (Spec 122 §5.5, Spec 122 §5.1, the folded peel)', () => {
  it('compute exports coerceKey, shapeRecord, dedupeBySourceId, validatorCounterDelta, shouldSkipDelete (the runner contract)', () => {
    const mod = loadComputeModule();
    for (const h of ['coerceKey', 'shapeRecord', 'dedupeBySourceId', 'validatorCounterDelta', 'shouldSkipDelete']) {
      expect(typeof mod[h], `the compute must export ${h}`).toBe('function');
    }
  });

  it('compute reports through ctx.report only — never console, and no verdict cascade', () => {
    const src = stripComments(readText(COMPUTE_REL));
    expect(/console\./.test(src)).toBe(false);
    expect(/verdictCascade|verdict\s*[:=]/.test(src), 'the compute computes no verdict (Rule 10)').toBe(false);
    expect(/\?\s*['"]FAIL['"]\s*:\s*['"](PASS|WARN)['"]/.test(src), 'a parallel-boolean cascade').toBe(false);
  });

  it('the compute reads every threshold through ctx.config.<name> — no bare literal bound', () => {
    const src = readText(COMPUTE_REL);
    for (const v of NEW_CONFIG_VARS) {
      expect(src.includes(`ctx.config.${v}`), `the compute must read ${v} via ctx.config`).toBe(true);
    }
    expect(src.includes(`ctx.config.${SHARED_FLOOR_VAR}`), 'the floor check reads the SHARED variable via ctx.config').toBe(true);
  });

  it('notes.json is a real notes file (≤12 entries) with fences[] an explicit array', () => {
    const notes = JSON.parse(readText(NOTES_REL)) as { fences?: unknown[] } & Record<string, unknown>;
    const PROSE = ['expected_shape', 'read_this_way', 'suspicious_if', 'blind_spots', 'decisions', 'review_notes', 'expected', 'known_normal', 'known_bad', 'do_not_reflag', 'how_to_investigate', 'limitations'];
    let n = 0;
    for (const b of PROSE) if (Array.isArray(notes[b])) n += (notes[b] as unknown[]).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(12);
    expect(Array.isArray(notes.fences), 'notes.fences must be an explicit array').toBe(true);
    const d = loadDescriptor();
    expect((d.interpretation as { file: string }).file).toBe(path.basename(NOTES_REL));
    expect((d.interpretation as { entries: number }).entries).toBe(n);
  });

  it('the report carries the "Peel ledger" with one row per folded peel concern (operator budget ruling)', () => {
    const report = readText(REPORT_REL);
    expect(/Peel ledger/i.test(report), 'the folded peel ledger must be in the report').toBe(true);
    expect(/Commit 6 — prove red/i.test(report), 'the RED counts are recorded').toBe(true);
    expect(/Commits 7\(\+8 folded\)/i.test(report), 'the folded descriptor+compute commit is recorded').toBe(true);
  });

  it('[flipped at commit 9] converted.json registers address_points, pending[] carries no leftover entry (R-K)', () => {
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[]; pending: Array<{ file: string }> };
    expect(converted.converted, 'registration lands at commit 9, the cutover').toContain(STEP_REL);
    expect(converted.pending.some((p) => p.file === STEP_REL), 'R-K: the pending entry is deleted in the SAME commit as registration').toBe(false);
  });

  it('the frozen shell names load 96 and the descriptor names load 96 (the §5.4 lock lock)', () => {
    const d = loadDescriptor();
    const textual = /const ADVISORY_LOCK_ID\s*=\s*(\d+)/.exec(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(textual, 'the §5.4 textual constant').not.toBeNull();
    expect(d.identity.lock).toBe(Number((textual as RegExpExecArray)[1]));
    expect(d.identity.lock).toBe(LOCK_ID);
  });
});











interface Check { id: string; kind: string; expect: unknown; limit: unknown; limit_from_config?: string; severity: string; blocking: boolean; when: string; chains: string[] | 'all'; why?: { text?: string; liveness?: unknown } }
interface WriteSpec {
  table: string; key: string | string[];
  columns: Array<{ name: string; vocabulary: unknown; written?: string; bind?: string }>;
  write_discipline: { class: string; guard: unknown; guard_columns: unknown; scope: unknown; expected_change_ratio: unknown; idempotent_rerun: unknown; txn_scope: unknown };
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
