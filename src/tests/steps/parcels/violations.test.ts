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
/** The written table and its 18 named columns + geom = 19 (WF3 lot-size 2026-10-01 adds lot_size_source; report §1.2, from the INSERT :297-301). */
const WRITE_TABLE = 'parcels';
const WRITE_COLUMNS = [
  'parcel_id', 'feature_type',
  'address_number', 'linear_name_full',
  'addr_num_normalized', 'street_name_normalized', 'street_type_normalized',
  'stated_area_raw', 'lot_size_sqm', 'lot_size_sqft', 'lot_size_source',
  'frontage_m', 'frontage_ft', 'depth_m', 'depth_ft',
  'geometry', 'date_effective', 'is_irregular',
  'geom',
];
const WRITE_CLASS = 'guarded_upsert';
/**
 * WF3 2026-09-28 (A+W): `write_discipline.guard_columns` is now the NINE declared entries —
 * the eight legacy columns plus `geometry`, the raw jsonb source. The ten-term WHERE clause's
 * FIRST term, `parcels.geom IS DISTINCT FROM EXCLUDED.geom`, is still NOT declared here: the
 * shared codegen (scripts/lib/step/write.js `changeOfGuardColumns`) adds it automatically and
 * FIRST, because `geom` is now the watched column of all three `outputs.invalidates[]` entries
 * below (deduplicated against this list). Do not RESTORE the legacy shape here: the pre-WF3
 * pin (`geometry` the auto-added watched column, NEVER declared) let the write guard see only
 * the raw source, so it converged neither the 9,855 NULL geoms the legacy INSERT left nor the
 * 16 rows the make_valid repair arm would rewrite.
 *
 * WF3 lot-size 2026-10-01: `lot_size_source` joins as the second entry (preserve_null guard
 * form) so a stated value equal to a backfilled one still flips provenance.
 */
const GUARD_COLUMNS = [
  'lot_size_sqm', 'lot_size_source', 'feature_type',
  'address_number', 'linear_name_full', 'addr_num_normalized',
  'street_name_normalized', 'street_type_normalized', 'date_effective',
  'geometry',
];
/** The five TEXT address columns declared `on_empty:"preserve"` (plan D1 REVISED, prerequisite 0m). */
const PRESERVE_COLUMNS = [
  'address_number', 'linear_name_full', 'addr_num_normalized',
  'street_name_normalized', 'street_type_normalized',
];
/** The one non-text column declared `on_empty:"preserve_null"` (prerequisite 0m follow-on). */
const PRESERVE_NULL_COLUMN = 'date_effective';
/**
 * The FULL `on_empty:"preserve_null"` set (WF3 lot-size 2026-10-01): date_effective plus the
 * three lot columns. `lot_size_sqm`/`lot_size_sqft` so a NULL parse never overwrites a
 * geom_backfill value, and `lot_size_source` so a stated value equal to a backfilled one
 * still flips provenance.
 */
const PRESERVE_NULL_COLUMNS = ['date_effective', 'lot_size_sqm', 'lot_size_sqft', 'lot_size_source'];
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
  // Spec 124 Rule 3 (McDonald's Airtight L1, 2026-09-26) — externalizes the null_address_pct
  // WARN bound (null_address_pct, raw-fraction scale). NOT added to NEW_CONFIG_VARS below:
  // since WF3 2026-09-28 the compute no longer reads it at all — the check reports the measured
  // fraction as `value` and the verdict resolves this var via the descriptor's
  // `limit_from_config` (exercised by the checks below and pct-checks-evaluate.logic.test.ts).
  parcels_null_address_pct_max: 0.1,
};
/** New variables this step mints (sources_parcels_floor is SHARED, pre-existing). */
const NEW_CONFIG_VARS = [
  'parcels_irregularity_threshold',
  'parcels_skip_rate_max_pct',
  'parcels_download_timeout_ms',
];
/** The SHARED variable (Rule 3: reuse the existing key, do not mint a second — report §6, PR-D5 pin). */
const SHARED_FLOOR_VAR = 'sources_parcels_floor';
/** The declared check ids (Rule 5, report §1.5 auditRows + §2 drift/null-address rows) — the
 *  full eight (WF3 lot-size adds the INFO stated_area_unparsed row), in descriptor order (the
 *  compute dispatch also carries the INFO-severity descriptive rows, geom_parse_failures +
 *  shaped_skipped, not just the five gating checks). */
const CHECK_IDS = [
  'csv_header_drift',
  'null_address_pct',
  'skip_rate_pct',
  'rows_read_floor',
  'records_errors',
  'geom_parse_failures',
  'shaped_skipped',
  'stated_area_unparsed',
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

// THE SHARED CODEGEN (plan D1 REVISED, 2026-09-24) — the library that DEFAULT-codegens
// the guarded upsert from the descriptor's declared `columns[].on_empty` +
// `outputs.invalidates[].set_null_on_change_of` axes. No compute in this step authors
// SQL text any more (operator ruling: compute-authored SQL is rejected for an
// INGESTOR); the fence below drives THIS library against THIS descriptor, exactly the
// way `src/tests/step-library.logic.test.ts` T5/T7 drive it against their own fixture.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const writeLib = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js')) as {
  buildWritePlan: (writeSpec: unknown, descriptor: unknown) => { upsertSqlFor: (n: number) => string; guard_columns: string[] };
};

/** Strip `-- ...` SQL line comments (the legacy fixture carries prose comments the generated SQL never emits). */
function stripSqlComments(s: string): string {
  return s.replace(/--[^\n]*\n/g, '\n');
}

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
  it('descriptor exists and is AJV-valid (RED today: ENOENT — no descriptor yet)', () => {
    // RED value: MISSING ARTIFACT scripts/load-parcels.descriptor.json
    const d = loadDescriptor();
    expect(d.identity.name).toBe('parcels');
    expect(d.identity.archetype).toBe('INGESTOR');
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.spec).toBe('55');
  });

  it('the descriptor declares the CSV external, csv_options, key_property PARCELID (plan D2)', () => {
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

  it('outputs.writes[0] is class A guarded_upsert, DEFAULT codegen (no set_source — plan D1 REVISED), key parcel_id, geometry_kind polygon', () => {
    const d = loadDescriptor();
    const w = writes(d);
    expect(w.length, 'the INGESTOR runner drives exactly ONE write target').toBe(1);
    expect(w[0]!.table).toBe(WRITE_TABLE);
    expect(w[0]!.key).toBe('parcel_id');
    expect(w[0]!.geometry_kind, 'a polygon write, unlike address_points\' point').toBe('polygon');
    expect(w[0]!.write_discipline.class).toBe(WRITE_CLASS);
    expect(
      w[0]!.write_discipline.set_source,
      'plan D1 REVISED (operator ruling 2026-09-24) — compute-authored SQL is rejected for an INGESTOR; the DEFAULT codegen carries no set_source',
    ).toBeUndefined();
    expect(w[0]!.retract, 'NO DELETE anywhere in the loader = retract none').toBe('none');
    expect(w[0]!.write_discipline.txn_scope, 'plan D1 — the runner wraps ALL batches in ONE step transaction, declared deviation').toBe('step');
  });

  it('the 18 write columns + geom are declared, and outputs.invalidates[] carries the 3 DEC-FENCE2 stamps with set_null_on_change_of:"geom" (plan D1 REVISED prerequisite 0l; watch column moved to the derived geom, WF3 2026-09-28)', () => {
    const d = loadDescriptor();
    const cols = writes(d)[0]!.columns.filter((c) => c.written !== 'db_default').map((c) => c.name).sort();
    expect(cols).toEqual([...WRITE_COLUMNS].sort());
    // FLEET-2 unproduced reads (fold 14 db_default channel): parcels.id (SERIAL) is declared so the src reads of it
    // resolve to this producer, and the step never writes it — the ONLY db_default column here.
    expect(writes(d)[0]!.columns.filter((c) => c.written === 'db_default').map((c) => c.name)).toEqual(['id']);
    const outs = d.outputs as { invalidates: Array<{ table: string; column: string; when: string; set_null_on_change_of?: string }> };
    expect(outs.invalidates, 'plan D1 — three outputs.invalidates[] entries, one per DEC-FENCE2 stamp').toHaveLength(3);
    const names = outs.invalidates.map((i) => i.column).sort();
    expect(names).toEqual([...INVALIDATE_COLUMNS].sort());
    for (const inv of outs.invalidates) {
      expect(inv.table).toBe('parcels');
      expect(/geom.*IS DISTINCT FROM|DEC-FENCE2|#418/i.test(inv.when), 'the when names the geom-change gate').toBe(true);
      expect(
        inv.set_null_on_change_of,
        'prerequisite 0l — the codegen EXECUTES this entry only when set_null_on_change_of names the watched column (WF3 2026-09-28: the watched column is the derived `geom`, the shape the enrichers read)',
      ).toBe('geom');
    }
  });

  it('columns[] declare on_empty:"preserve" on the five address columns and on_empty:"preserve_null" on date_effective + the three lot columns (plan D1 REVISED prerequisites 0m/0m-follow-on; WF3 lot-size 2026-10-01)', () => {
    const d = loadDescriptor();
    const cols = writes(d)[0]!.columns as Array<{ name: string; on_empty?: string }>;
    const byName = new Map(cols.map((c) => [c.name, c.on_empty]));
    for (const name of PRESERVE_COLUMNS) {
      expect(byName.get(name), `${name} must declare on_empty:"preserve"`).toBe('preserve');
    }
    expect(byName.get(PRESERVE_NULL_COLUMN), 'date_effective has no empty-string representation — preserve_null, not preserve').toBe('preserve_null');
    for (const name of PRESERVE_NULL_COLUMNS) {
      expect(byName.get(name), `${name} must declare on_empty:"preserve_null" (WF3 lot-size 2026-10-01 — a NULL parse never overwrites a backfilled lot / a stated value flips provenance)`).toBe('preserve_null');
    }
    // No OTHER column declares either mode — this is a per-column axis, not a class-wide switch.
    const declaredOnEmpty = cols.filter((c) => c.on_empty !== undefined).map((c) => c.name).sort();
    expect(declaredOnEmpty).toEqual([...PRESERVE_COLUMNS, ...PRESERVE_NULL_COLUMNS].sort());
  });

  it('guard_columns carry the 10-item DECLARED set (WF3 2026-09-28: the eight legacy columns + `geometry`, the raw jsonb source; WF3 lot-size 2026-10-01 adds `lot_size_source`; `geom` is the eleventh RUNTIME term, added automatically, FIRST, via invalidates[].set_null_on_change_of)', () => {
    const d = loadDescriptor();
    const gc = writes(d)[0]!.write_discipline.guard_columns as string[] | 'all_declared';
    expect(Array.isArray(gc), 'guard_columns must be the explicit WHERE-clause set').toBe(true);
    expect((gc as string[]).sort()).toEqual([...GUARD_COLUMNS].sort());
    expect((gc as string[]).includes('geometry'), 'WF3 2026-09-28 — `geometry`, the raw jsonb source, is DECLARED as a plain structural guard term').toBe(true);
  });

  it('execution.on_batch_error is fail_step (PR-D1 FIXED-BY-RUNNER, MQ-B5 (a)) and network declares the shared timeout var', () => {
    const d = loadDescriptor();
    // MQ-B5 (a) (2026-10-05): the Spec 123 §3.1 flip — executeWrite has no catch inside its one transaction.
    expect(d.execution.on_batch_error).toBe('fail_step');
    expect(d.execution.on_batch_error_why).toBeUndefined();
    expect(d.execution.network.timeout_from_config).toBe('parcels_download_timeout_ms');
  });

  it('override declares no live hatch (force_full/force_run/dry_run all "none" — no env-var override exists for this step) and recovery.interrupted is "none" (class A has no retraction to recover, Rule 12)', () => {
    const d = loadDescriptor();
    // The schema legally allows the bare string "none" OR the object form with all three
    // fields "none" (address_points precedent uses the object form too, since it is the
    // more precise declaration of "three override kinds exist, none of them are wired").
    if (typeof d.override === 'string') {
      expect(d.override).toBe('none');
    } else {
      const o = d.override as { force_full: string; force_run: string; dry_run: string };
      expect(o.force_full).toBe('none');
      expect(o.force_run).toBe('none');
      expect(o.dry_run).toBe('none');
    }
    expect(d.recovery.interrupted).toBe('none');
    expect(d.recovery.interrupted_why).toBeDefined();
  });

  it('the step file is the §5.1 frozen shape, ast-grep clean, no pipeline.run (RED today: 585-line legacy)', () => {
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

  it('the step file no longer carries the 585-line island (no pipeline.run, no https/http/csv-parse require)', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/pipeline\.run\s*\(/.test(src), 'pipeline.run still in the step file').toBe(false);
    expect(/require\(['"](https|http|csv-parse)['"]\)/.test(src), 'a network/CSV require in the frozen shell').toBe(false);
  });

  it('compute is ast-grep clean against compute-shape.yml, exports the dispatch, and opens no pool (RED today: ENOENT)', () => {
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

  it('compute exports coerceKey, shapeRecord, dedupeBySourceId, validatorCounterDelta, shouldSkipDelete — the runner contract (plan D1 REVISED: no buildWriteSql, DEFAULT codegen authors the statement)', () => {
    const mod = loadComputeModule();
    for (const h of ['coerceKey', 'shapeRecord', 'dedupeBySourceId', 'validatorCounterDelta', 'shouldSkipDelete']) {
      expect(typeof mod[h], `the compute must export ${h}`).toBe('function');
    }
    expect(mod.buildWriteSql, 'plan D1 REVISED — compute-authored SQL is rejected for an INGESTOR; no buildWriteSql export').toBeUndefined();
  });
});

// ===========================================================================
// 2. write.buildWritePlan — the DEC-FENCE2 fence, verbatim against
//    fixtures/legacy-upsert.sql.txt, reproduced by the SHARED codegen from THIS
//    descriptor's declared on_empty/set_null_on_change_of axes (plan D1 REVISED,
//    2026-09-24 — compute-authored SQL is rejected for an INGESTOR). The same fence
//    src/tests/step-library.logic.test.ts's T5/T7 prove against their OWN fixture;
//    this describe block re-proves it against THIS descriptor + THIS legacy file.
// ===========================================================================

describe('row 3.7 — write.buildWritePlan reproduces the legacy UPSERT verbatim (fixtures/legacy-upsert.sql.txt)', () => {
  /**
   * WF3 2026-09-28 — the TWO declared deltas from the legacy text (knowingly retired legacy
   * pins; the fixture file itself stays byte-identical as the historical record):
   *   (a) the watched predicate moves from the raw jsonb source to the derived geom
   *       (`parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb` →
   *        `parcels.geom IS DISTINCT FROM EXCLUDED.geom`) — the WHERE's first term + 3 CASE arms;
   *   (b) the WHERE gains `OR parcels.geometry IS DISTINCT FROM EXCLUDED.geometry` after the
   *       date_effective term (the raw jsonb source stays a plain structural guard term).
   * WF3 lot-size 2026-10-01 — a THIRD declared delta (c): the two lot columns' SET/SET-guard
   * forms move from `= EXCLUDED.<col>` / `<col> IS DISTINCT FROM EXCLUDED.<col>` to the
   * preserve_null COALESCE forms, a third SET arm for `lot_size_source` joins, and the WHERE
   * gains the lot_size_source guard term — the three lot columns declared `preserve_null`.
   * Each replacement must match exactly as often as stated (4, 1 and the (c) counts), so any
   * further drift in either the fixture or the codegen still reddens the comparison. Input:
   * whitespace-normalised.
   */
  function applyWf3Deltas(legacyNorm: string): string {
    const oldWatched = /parcels\.geometry::jsonb IS DISTINCT FROM EXCLUDED\.geometry::jsonb/g;
    expect((legacyNorm.match(oldWatched) ?? []).length, 'delta (a): 1 WHERE term + 3 CASE arms').toBe(4);
    const dateTerm = normalizeWs('OR (EXCLUDED.date_effective IS NOT NULL AND parcels.date_effective IS DISTINCT FROM EXCLUDED.date_effective)');
    expect(legacyNorm.split(dateTerm).length - 1, 'delta (b): the date_effective term the geometry term follows').toBe(1);
    // delta (c) — WF3 lot-size 2026-10-01: the two legacy lot SET arms become preserve_null
    // COALESCEs, a third (lot_size_source) SET arm joins them, and the lot_size_sqm WHERE term
    // becomes the preserve_null guard form plus a lot_size_source guard term.
    const lotSet = normalizeWs('lot_size_sqm = EXCLUDED.lot_size_sqm, lot_size_sqft = EXCLUDED.lot_size_sqft,');
    expect(legacyNorm.split(lotSet).length - 1, 'delta (c): the two legacy lot SET arms').toBe(1);
    const lotSqmGuard = normalizeWs('OR parcels.lot_size_sqm IS DISTINCT FROM EXCLUDED.lot_size_sqm');
    expect(legacyNorm.split(lotSqmGuard).length - 1, 'delta (c): the legacy lot_size_sqm WHERE term').toBe(1);
    return legacyNorm
      .replace(oldWatched, 'parcels.geom IS DISTINCT FROM EXCLUDED.geom')
      .replace(dateTerm, `${dateTerm} OR parcels.geometry IS DISTINCT FROM EXCLUDED.geometry`)
      .replace(
        lotSet,
        normalizeWs('lot_size_sqm = COALESCE(EXCLUDED.lot_size_sqm, parcels.lot_size_sqm), '
          + 'lot_size_sqft = COALESCE(EXCLUDED.lot_size_sqft, parcels.lot_size_sqft), '
          + 'lot_size_source = COALESCE(EXCLUDED.lot_size_source, parcels.lot_size_source),'),
      )
      .replace(
        lotSqmGuard,
        normalizeWs('OR (EXCLUDED.lot_size_sqm IS NOT NULL AND parcels.lot_size_sqm IS DISTINCT FROM EXCLUDED.lot_size_sqm) '
          + 'OR (EXCLUDED.lot_size_source IS NOT NULL AND parcels.lot_size_source IS DISTINCT FROM EXCLUDED.lot_size_source)'),
      );
  }

  /** Extract a fenced fragment from the legacy fixture and assert the SAME normalised text appears
   *  in the generated statement — both sides read from the ONE fixture, so there is no second,
   *  independently-typed copy of the SQL to drift out of sync. */
  function fenceFragments(): string[] {
    // The fixture, after the two declared WF3-2026-09-28 deltas (`applyWf3Deltas`).
    const legacyDelta = applyWf3Deltas(normalizeWs(fs.readFileSync(artifact(LEGACY_SQL_REL), 'utf8')));
    const FRAGMENTS = [
      'address_number = COALESCE(NULLIF(EXCLUDED.address_number, \'\'), parcels.address_number)',
      'linear_name_full = COALESCE(NULLIF(EXCLUDED.linear_name_full, \'\'), parcels.linear_name_full)',
      'addr_num_normalized = COALESCE(NULLIF(EXCLUDED.addr_num_normalized, \'\'), parcels.addr_num_normalized)',
      'street_name_normalized = COALESCE(NULLIF(EXCLUDED.street_name_normalized, \'\'), parcels.street_name_normalized)',
      'street_type_normalized = COALESCE(NULLIF(EXCLUDED.street_type_normalized, \'\'), parcels.street_type_normalized)',
      'date_effective = COALESCE(EXCLUDED.date_effective, parcels.date_effective)',
      'ravine_dataset_version_when_enriched = CASE WHEN parcels.geom IS DISTINCT FROM EXCLUDED.geom THEN NULL ELSE parcels.ravine_dataset_version_when_enriched END',
      'heritage_dataset_version_when_enriched = CASE WHEN parcels.geom IS DISTINCT FROM EXCLUDED.geom THEN NULL ELSE parcels.heritage_dataset_version_when_enriched END',
      'centreline_dataset_version_when_enriched = CASE WHEN parcels.geom IS DISTINCT FROM EXCLUDED.geom THEN NULL ELSE parcels.centreline_dataset_version_when_enriched END',
      'WHERE parcels.geom IS DISTINCT FROM EXCLUDED.geom',
      'lot_size_sqm = COALESCE(EXCLUDED.lot_size_sqm, parcels.lot_size_sqm)',
      'lot_size_sqft = COALESCE(EXCLUDED.lot_size_sqft, parcels.lot_size_sqft)',
      'lot_size_source = COALESCE(EXCLUDED.lot_size_source, parcels.lot_size_source)',
      'OR (EXCLUDED.lot_size_sqm IS NOT NULL AND parcels.lot_size_sqm IS DISTINCT FROM EXCLUDED.lot_size_sqm)',
      'OR (EXCLUDED.lot_size_source IS NOT NULL AND parcels.lot_size_source IS DISTINCT FROM EXCLUDED.lot_size_source)',
      'OR parcels.feature_type IS DISTINCT FROM EXCLUDED.feature_type',
      'OR (EXCLUDED.date_effective IS NOT NULL AND parcels.date_effective IS DISTINCT FROM EXCLUDED.date_effective)',
      'OR parcels.geometry IS DISTINCT FROM EXCLUDED.geometry',
      'ON CONFLICT (parcel_id)',
      'RETURNING (xmax = 0) AS is_insert',
    ];
    // Sanity: every fragment we are about to demand of the generated statement is genuinely
    // present in the fixture itself (never assert a fragment that drifted out of the fixture's
    // own text), after the two declared WF3-2026-09-28 deltas.
    for (const f of FRAGMENTS) {
      expect(legacyDelta.includes(normalizeWs(f)), `fixture drift: "${f}" not found in legacy-upsert.sql.txt (post-WF3 deltas)`).toBe(true);
    }
    return FRAGMENTS;
  }

  it('the legacy fixture exists and contains the full guarded UPSERT text', () => {
    const legacy = readText(LEGACY_SQL_REL);
    expect(legacy).toContain('INSERT INTO parcels (');
    expect(legacy).toContain('ON CONFLICT (parcel_id)');
    expect(legacy).toContain('RETURNING (xmax = 0) AS is_insert');
  });

  it('write.buildWritePlan(writes[0], descriptor).upsertSqlFor(1) reproduces the legacy tail EXCEPT the two declared WF3-2026-09-28 deltas (watched column `geom`; `geometry` a plain jsonb guard term) and MINUS the legacy ${geomLine} arm (out of scope for prerequisites 0l/0m, T5/T7\'s own exclusion) — the DECLARED on_empty + set_null_on_change_of axes are the ONLY source of the SET/WHERE text', () => {
    const d = loadDescriptor();
    const writeSpec = writes(d)[0]!;
    const plan = writeLib.buildWritePlan(writeSpec, d);
    const sql = plan.upsertSqlFor(1);
    // `geom`'s own SET arm (`geom = EXCLUDED.geom,`) is the standard wkb_geometry
    // default-codegen slot for the PostGIS column — it did not exist in the legacy
    // statement (which set `geom` via the conditional ${geomLine} arm instead) and is
    // orthogonal to the on_empty/set_null_on_change_of axes under test here, exactly
    // as T5/T7 exclude the `${geomLine}` slot from their own comparison.
    const actualTail = sql.slice(sql.indexOf('\nON CONFLICT')).replace(/;$/, '');
    // Both sides are compared WITHOUT SQL comments: the legacy fixture already goes through stripSqlComments, and the
    // codegen's only comment is the db_default note for parcels.id (FLEET-2) — a comment is not executable SQL.
    const actualNorm = normalizeWs(stripSqlComments(actualTail).replace('geom = EXCLUDED.geom,', ''));

    // The fixture is the HISTORICAL record and stays byte-identical; the comparison applies
    // EXACTLY the two declared WF3-2026-09-28 deltas to it (`applyWf3Deltas`, knowingly
    // retired legacy pins), so any third drift stays red.
    let legacy = stripSqlComments(fs.readFileSync(artifact(LEGACY_SQL_REL), 'utf8'));
    legacy = legacy.replace(/\$\{geomLine\}\s*/, '');
    const legacyTail = legacy.slice(legacy.indexOf('ON CONFLICT'));
    const legacyNorm = applyWf3Deltas(normalizeWs(legacyTail));

    expect(actualNorm, 'the shared codegen, driven ONLY by declared axes, must reproduce the legacy statement byte-for-byte (whitespace-normalised) EXCEPT the two declared WF3-2026-09-28 deltas — cite step-library.logic.test.ts T7').toBe(legacyNorm);
    for (const frag of fenceFragments()) {
      expect(actualNorm, `generated SQL is missing the fenced fragment: ${frag}`).toContain(normalizeWs(frag));
    }
  });

  it('WF3 2026-09-28: the guard and DEC-FENCE2 watch the derived geom — upsertSqlFor(1) carries `parcels.geom IS DISTINCT FROM EXCLUDED.geom` in the WHERE and in each of the three stamp CASE arms (RED today: the guard watches `geometry` only, so a geom-only change never writes nor nulls the stamps)', () => {
    const d = loadDescriptor();
    const sql = writeLib.buildWritePlan(writes(d)[0], d).upsertSqlFor(1);
    const where = sql.slice(sql.indexOf('\n  WHERE '));
    expect(where, 'the WHERE opens on the watched derived column').toContain(
      'parcels.geom IS DISTINCT FROM EXCLUDED.geom',
    );
    expect(where, 'the raw jsonb source stays a guard term beside it').toContain(
      'parcels.geometry IS DISTINCT FROM EXCLUDED.geometry',
    );
    for (const stamp of INVALIDATE_COLUMNS) {
      expect(sql, `DEC-FENCE2 arm for ${stamp}`).toMatch(
        new RegExp(
          `${stamp} = CASE WHEN parcels\\.geom IS DISTINCT FROM EXCLUDED\\.geom THEN NULL ELSE parcels\\.${stamp} END`,
        ),
      );
    }
  });

  it('the generated statement structurally forbids DELETE/TRUNCATE (class A, retract:"none")', () => {
    const d = loadDescriptor();
    const writeSpec = writes(d)[0]!;
    const sql = writeLib.buildWritePlan(writeSpec, d).upsertSqlFor(1);
    expect(/\bDELETE\b|\bTRUNCATE\b/i.test(sql)).toBe(false);
  });
});

// ===========================================================================
// 3. compute.shapeRecord — the CSV row → the 17-bound-column shape (loader :467-545)
// ===========================================================================

describe('row 3.7 — compute.shapeRecord maps a CSV record to the bound columns (loader :467-545)', () => {
  interface Shape { [k: string]: unknown }

  /**
   * The seam `shapeRecord`'s own JSDoc now documents (`{ geojson, config, run_at }`) — injected
   * explicitly here because this describe block unit-tests `shapeRecord` as a PURE FUNCTION in
   * isolation, not `runIngestPhase`'s own wiring. RECONCILED (the ① report's finding is now
   * STALE-RESOLVED): INGESTOR prerequisite 0n (`fbd839c5`) landed `runIngestPhase` passing
   * `{ geojson, config, run_at }` to `compute.shapeRecord` — the expiry filter and the
   * `is_irregular` threshold both read live values in production; neither is dead any more.
   * `run_at` is a `Date` (the runner's `clockNow`, never a pre-formatted ISO string) so the
   * compute derives "today" via `isoDateFromRunAt`'s pure epoch-day arithmetic, never
   * `new Date()` (compute-shape's wall-clock ban).
   */
  const SHAPE_SEAM = { config: CONFIG_VARS, run_at: new Date('2026-09-24T12:00:00.000Z') };

  function shapeRecord(): (record: Record<string, string>, seam?: Record<string, unknown>) => Shape | null {
    const mod = loadComputeModule();
    expect(typeof mod.shapeRecord, 'the compute must export shapeRecord — a csv external owes a shape (runner :638)').toBe('function');
    const fn = mod.shapeRecord as (record: Record<string, string>, seam?: Record<string, unknown>) => Shape | null;
    return (record, seam) => fn(record, { ...SHAPE_SEAM, ...seam });
  }

  function coerceKey(): (raw: unknown) => string | null {
    const mod = loadComputeModule();
    expect(typeof mod.coerceKey, 'the compute must export coerceKey — the acquisition seam asks the step how to key ITS rows').toBe('function');
    return mod.coerceKey as (raw: unknown) => string | null;
  }

  it('row 1 — a stated-area rectangle shapes its 17 columns + geojson (frontage/depth pinned via the mirrored MBR math, NOT the unexported legacy fn)', () => {
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

  it('row 2 — a trapezoid with NO stated area: lot_size_sqm/sqft are null (NEVER derived from polygon area), frontage/depth use the polygon-derived scale, is_irregular true', () => {
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

  it('WF3 lot-size — parseStatedArea accepts bare numbers as m² and sq.ft converted; never geometry', () => {
    // WF3 lot-size 2026-10-01 (Spec 55:56-57). The legacy parser (`^([\d.]+)\s*sq\.m`) dropped
    // the ~10.1K bare-number STATEDAREA values to NULL; a bare number IS a stated area in m²
    // (98.5% agree with ST_Area(geom::geography)), and `<n> sq.ft` converts via SQM_TO_SQFT.
    // This test drives the parser TOO — a shapeRecord-only assertion would pass on a compute that
    // still dropped bare numbers.
    const mod = loadComputeModule();
    expect(typeof mod.parseStatedArea, 'the compute must export parseStatedArea so the acceptance rules are unit-drivable').toBe('function');
    const parse = mod.parseStatedArea as (raw: unknown) => number | null;
    const table: Array<[string, number | null]> = [
      ['300.00 sq.m', 300],
      ['500.00sq.m', 500],
      ['17366.998291 sq.m', 17366.998291],
      ['sq.m', null],
      ['412.5', 412.5],
      ['.5', 0.5],
      ['  1200  ', 1200],
      ['1000 sq.ft', 1000 / 10.7639],
      ['12 SQ.FT', 12 / 10.7639],
      ['0', null],
      ['0 sq.m', null],
      ['-1.5 sq.m', null],
      ['1,000', null],
      ['unknown', null],
      ['None', null],
      ['', null],
    ];
    for (const [raw, want] of table) {
      const got = parse(raw);
      if (want === null) {
        expect(got, `parseStatedArea(${JSON.stringify(raw)}) must be NULL — no stated area`).toBeNull();
      } else {
        expect(got, `parseStatedArea(${JSON.stringify(raw)})`).not.toBeNull();
        expect(got as number).toBeCloseTo(want, 4);
      }
    }
    expect(parse(null), 'a null cell (column absent) must not throw').toBeNull();

    // shapeRecord carries the provenance column: 'stated' when the parser returned a value,
    // NULL otherwise — the descriptor's new written column (WF3 lot-size 2026-10-01).
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const stated = shapeRecord()(rows[0] as Record<string, string>) as Shape;
    expect(stated.lot_size_sqm, 'row 1 STATEDAREA "300.00 sq.m"').toBe(300);
    expect(stated.lot_size_source, 'a parsed stated lot stamps provenance').toBe('stated');
    const blank = shapeRecord()(rows[1] as Record<string, string>) as Shape;
    expect(blank.lot_size_sqm, 'row 2 STATEDAREA is blank').toBeNull();
    expect(blank.lot_size_source, 'a blank STATEDAREA has no provenance').toBeNull();
    // The seam proved end-to-end: shapeRecord reads the SAME parser, so a bare number restores.
    const bare = shapeRecord()({ ...(rows[0] as Record<string, string>), STATEDAREA: '412.5' }) as Shape;
    expect(bare.lot_size_sqm, 'a bare number is a stated area in m²').toBeCloseTo(412.5, 4);
    expect(bare.lot_size_sqft, '412.5 m² → sq.ft via SQM_TO_SQFT').toBeCloseTo(4440.11, 2);
    expect(bare.lot_size_source).toBe('stated');
  });

  it('WF3 lot-size — shapeRecord tags each STATEDAREA it could not parse (`stated_area_unparsed`), and tags nothing for an accepted or absent value', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const record = (statedArea: string) => ({ ...(rows[0] as Record<string, string>), STATEDAREA: statedArea });
    const tagsFor = (statedArea: string): string[] => {
      const tags: string[] = [];
      const fn = shapeRecord();
      fn(record(statedArea), { tag: (t: string) => { tags.push(t); } });
      return tags;
    };
    // Every such row is a silent NULL today — the tag makes an unknown format visible (INFO check).
    const unknownTags = tagsFor('unknown');
    expect(unknownTags.filter((t) => t === 'stated_area_unparsed'), 'an unparsable STATEDAREA tags exactly once').toHaveLength(1);
    expect(tagsFor('300.00 sq.m'), 'an accepted value is not a violation').not.toContain('stated_area_unparsed');
    expect(tagsFor(''), 'a blank STATEDAREA is absent, not unparsed').not.toContain('stated_area_unparsed');
  });

  it('row 3 — a second stated-area-less rectangle: is_irregular false, DATE_EXPIRY blank never triggers the expiry skip', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[2] as Record<string, string>) as Shape;
    expect(r, 'row 3 must shape — a blank DATE_EXPIRY is not a skip condition (loader :494, `if (dateExpiry && ...)`)').not.toBeNull();
    expect(r.parcel_id).toBe('9000003');
    expect(r.frontage_m).toBeCloseTo(33.4, 1);
    expect(r.depth_m).toBeCloseTo(80.56, 1);
    expect(r.is_irregular).toBe(false);
  });

  it('row 4 — FEATURE_TYPE=CORRIDOR is excluded, returns null (loader :486-490, shaped_skipped)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[3] as Record<string, string>);
    expect(r, 'a CORRIDOR feature type is never loaded').toBeNull();
  });

  it('row 5 — an expired DATE_EXPIRY (not the 3000-01-01 sentinel) is excluded, returns null (loader :492-497)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[4] as Record<string, string>);
    expect(r, 'a past, non-sentinel DATE_EXPIRY is never loaded').toBeNull();
  });

  it('the expiry comparison is STRICTLY before the run date, at the boundary — DATE_EXPIRY == run_at\'s calendar date is NOT expired, matching the legacy `dateExpiry < new Date().toISOString().slice(0,10)` read (git show 9b414ef7:scripts/load-parcels.js:493)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const onBoundary = { ...(rows[4] as Record<string, string>), DATE_EXPIRY: '2026-09-24' };
    const r = shapeRecord()(onBoundary, { run_at: new Date('2026-09-24T12:00:00.000Z') });
    expect(r, 'DATE_EXPIRY equal to today is NOT strictly before today — the row loads').not.toBeNull();

    const dayAfter = { ...(rows[4] as Record<string, string>), DATE_EXPIRY: '2026-09-25' };
    const r2 = shapeRecord()(dayAfter, { run_at: new Date('2026-09-24T12:00:00.000Z') });
    expect(r2, 'DATE_EXPIRY one day in the FUTURE is not expired either').not.toBeNull();
  });

  it('row 6 — unparsable geometry does NOT skip the row (correction: the row-3.7 brief\'s "unparsable-geometry rows -> null" claim does not match the tree — parseGeoJSON [:169-176] catches and returns null, and NOTHING downstream `continue`s on it; the row IS shaped, with a null geometry/geojson and null frontage/depth, exactly mirroring address_points\' own AP-D2 swallow)', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const r = shapeRecord()(rows[5] as Record<string, string>) as Shape;
    expect(r, 'the parse swallow carries the row, it does not drop it — only feature-type/expiry/empty-PARCELID `continue` (loader :487,:495,:500)').not.toBeNull();
    expect(r.parcel_id).toBe('9000006');
    expect(r.geojson == null || r.geojson === 'null', 'an unparsable geometry string carries as null').toBeTruthy();
    expect(r.frontage_m).toBeNull();
    expect(r.depth_m).toBeNull();
    expect(r.is_irregular, 'estimateLotDimensions(null, ...) returns null -> is_irregular defaults false (loader :520)').toBe(false);
  });

  it('coerceKey is PARCELID trimmed, null when unusable (never empty string) — loader :499', () => {
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
  it('dedupeBySourceId keeps LAST-wins — the loader\'s own supersede semantics', () => {
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

  it('shouldSkipDelete always returns true — class A has no delete_sql, the runner also guards (prerequisite 0a)', () => {
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

  it('csv_header_drift fires WARN on a header-only CSV missing `geometry` (the drift-lib reuse, report §2)', () => {
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

  it('csv_header_drift is SILENT (0 violations) on the real 8-column fixture', () => {
    const rows = parseCsvFixture(CSV_6ROWS_REL);
    const keys = Object.keys(rows[0] as Record<string, string>);
    const missing = require(path.join(REPO_ROOT, DRIFT_LIB_REL)).detectMissingColumns(keys) as string[]; // eslint-disable-line @typescript-eslint/no-require-imports
    expect(missing, 'the 6-row fixture carries all 4 REQUIRED_CSV_COLUMNS').toEqual([]);
    const calls = driveCheck('csv_header_drift', { acquired: { missing_columns: missing }, config: CFG });
    expect(calls[0]![1].violations).toBe(0);
  });

  it('skip_rate_pct FAILs at/above the config bound (loader :421, "< 10%", NOT WARN — this row is legacy FAIL, unlike rows_read below)', () => {
    // WF3 2026-09-28: re-pointed from the 0/1 flag to value + the verdict row (verdict.js compares a pct bound to `violations` first, so the flag, not the ratio, was compared).
    const check = checkById(loadDescriptor(), 'skip_rate_pct');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS verdict library
    const verdict = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
      checkRow: (c: unknown, o: unknown, onErr: string, cfg: unknown) => { status: string };
    };
    const over = driveCheck('skip_rate_pct', { acquired: { rows_read: 100, records_skipped: 15 }, config: CFG });
    expect(over[0]![1].value, '15% ⇒ the measured percent').toBe(15);
    expect(over[0]![1].violations, 'WF3: the flag is gone').toBeUndefined();
    expect(verdict.checkRow(check, over[0]![1], 'fail_step', CFG).status, '15 > 10 ⇒ FAIL').toBe('FAIL');
    const under = driveCheck('skip_rate_pct', { acquired: { rows_read: 100, records_skipped: 1 }, config: CFG });
    expect(under[0]![1].value, '1% ⇒ the measured percent').toBe(1);
    expect(verdict.checkRow(check, under[0]![1], 'fail_step', CFG).status, '1 <= 10 ⇒ PASS').toBe('PASS');
  });

  it('rows_read_floor reads sources_parcels_floor via ctx.config (SHARED key, Rule 3, report §6 PR-D5 pin — the loader\'s own WARN stays WARN, never promoted to FAIL)', () => {
    const below = driveCheck('rows_read_floor', { acquired: { rows_read: 449999 }, config: CFG });
    expect(below[0]![1].violations, 'below the loader\'s legacy 450000 WARN threshold ⇒ violation').toBeGreaterThan(0);
    const at = driveCheck('rows_read_floor', { acquired: { rows_read: 498479 }, config: CFG });
    expect(at[0]![1].violations, 'at the measured live row count ⇒ clean').toBe(0);
  });

  it('null_address_pct reads the GENERIC runner counters (prerequisite 0o rename, commit ③) — rows_shaped / column_nulls.address_number, WARN at >= 10%', () => {
    // WF3 2026-09-28: re-pointed from the 0/1 flag to value + the verdict row (verdict.js compares a pct bound to `violations` first, so the flag, not the ratio, was compared).
    const check = checkById(loadDescriptor(), 'null_address_pct');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS verdict library
    const verdict = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
      checkRow: (c: unknown, o: unknown, onErr: string, cfg: unknown) => { status: string };
    };
    const over = driveCheck('null_address_pct', { acquired: { rows_shaped: 100, column_nulls: { address_number: 20 } }, config: CFG });
    expect(over[0]![1].value, '20/100 = 0.2 ⇒ the measured fraction').toBe(0.2);
    expect(over[0]![1].violations, 'WF3: the flag is gone').toBeUndefined();
    expect(verdict.checkRow(check, over[0]![1], 'fail_step', CFG).status, '0.2 > 0.1 ⇒ WARN').toBe('WARN');
    const under = driveCheck('null_address_pct', { acquired: { rows_shaped: 100, column_nulls: { address_number: 1 } }, config: CFG });
    expect(under[0]![1].value, '1/100 = 0.01 ⇒ the measured fraction').toBe(0.01);
    expect(verdict.checkRow(check, under[0]![1], 'fail_step', CFG).status, '0.01 <= 0.1 ⇒ PASS').toBe('PASS');
  });

  it('null_address_pct is silent (value 0, detail null, no violations key, no throw) when the runner counters are absent — the pre-0o short-circuit stays a safe no-op, never a crash', () => {
    const empty = driveCheck('null_address_pct', { acquired: {}, config: CFG });
    expect(empty[0]![1].value).toBe(0);
    expect(empty[0]![1].detail).toBeNull();
    expect(empty[0]![1].violations, 'WF3: the flag is gone').toBeUndefined();
  });

  it('records_errors FAILs above 0 (loader :422, "== 0")', () => {
    const zero = driveCheck('records_errors', { acquired: { errors: 0 }, config: CFG });
    expect(zero[0]![1].violations).toBe(0);
    const one = driveCheck('records_errors', { acquired: { errors: 1 }, config: CFG });
    expect(one[0]![1].violations).toBeGreaterThan(0);
  });

  it('the severities match the legacy exactly: rows_read WARN (never promoted), skip_rate FAIL, records_errors FAIL, csv_header_drift WARN', () => {
    const d = loadDescriptor();
    expect(checkById(d, 'rows_read_floor').severity, 'report §1.5 AP-D6 trap: the legacy loader WARNs at :416, NOT FAIL — do not mirror address_points\' correction here').toBe('WARN');
    expect(checkById(d, 'skip_rate_pct').severity).toBe('FAIL');
    expect(checkById(d, 'records_errors').severity).toBe('FAIL');
    expect(checkById(d, 'csv_header_drift').severity).toBe('WARN');
    for (const c of d.checks) expect(c.blocking, 'PIN, DO NOT FIX — a FAIL row today exits 0 and the chain continues').toBe(false);
  });

  it('the rows_read_floor check uses the R-T addendum `value_min` form, not `"viol == 0"` (the address_points AP-D6 trap, report §6 warning)', () => {
    const d = loadDescriptor();
    const c = checkById(d, 'rows_read_floor');
    expect(String(c.limit)).toMatch(/value_min/);
    expect(c.limit_from_config).toBe(SHARED_FLOOR_VAR);
  });

  it('stated_area_unparsed reports the loader tag count as detail (WF3 lot-size 2026-10-01) — 3 in a fixture ctx, 0 when shaped_tags is absent', () => {
    // Same shape as shaped_skipped/geom_parse_failures: the INGESTOR's checks read ctx.acquired only
    // (no DB access), and the count arrives via the `stated_area_unparsed` seam tag the runner collects.
    const withTags = driveCheck('stated_area_unparsed', {
      acquired: { shaped_tags: { stated_area_unparsed: 3 } },
      config: CFG,
    });
    expect(withTags).toHaveLength(1);
    expect(withTags[0]![0]).toBe('stated_area_unparsed');
    expect(withTags[0]![1].violations, 'an INFO descriptive row never gates').toBe(0);
    expect(withTags[0]![1].detail).toBe(3);

    const absent = driveCheck('stated_area_unparsed', { acquired: {}, config: CFG });
    expect(absent[0]![1].violations).toBe(0);
    expect(absent[0]![1].detail).toBe(0);
  });
});

// ===========================================================================
// 6. Rule 3 — every literal is a declared config.logic_variables[] entry with a seed row
// ===========================================================================

describe('row 3.7 — Rule 3 literal ledger (report §6): logic_variables ≡ seeds, no bare compute literals', () => {
  it('every declared config variable has a seed row; every seed default equals the report §6 ledger', () => {
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

  it('sources_parcels_floor is REUSED, never duplicated (one seed row at 460000, Rule 3)', () => {
    const S = seedDefaults();
    const rows = Object.keys(S).filter((k) => k === SHARED_FLOOR_VAR);
    expect(rows).toHaveLength(1);
    expect(S[SHARED_FLOOR_VAR]!.default, 'report §6 — MEASURED against the seed file, 460000').toBe(460000);
    const d = loadDescriptor();
    const declared = (d.config as { logic_variables: Array<{ name: string }> }).logic_variables.map((v) => v.name);
    expect(declared.filter((n) => n === SHARED_FLOOR_VAR), 'declared exactly once').toHaveLength(1);
  });

  it('the compute reads every threshold through ctx.config.<name> — no bare literal bound', () => {
    const src = readText(COMPUTE_REL);
    for (const v of NEW_CONFIG_VARS) {
      if (v === 'parcels_skip_rate_max_pct') {
        // WF3 2026-09-28: skip_rate_pct no longer compares against this variable itself —
        // the verdict (verdict.js `pct <=`, via checks[].limit_from_config) is the only
        // comparator; the check reports the measured ratio as `value`. The threshold is
        // still read from ctx.config, inside verdict.js instead of here.
        expect(readText(COMPUTE_REL).includes('ctx.config.' + v), 'WF3: the compute no longer compares against the bound itself').toBe(false);
        const descriptor = loadDescriptor();
        const skipCheck = checkById(descriptor, 'skip_rate_pct');
        expect(skipCheck.limit_from_config, 'the verdict reads the bound via ctx.config (limit_from_config)').toBe(v);
        continue;
      }
      expect(src.includes(`ctx.config.${v}`), `the compute must read ${v} via ctx.config`).toBe(true);
    }
    expect(src.includes(`ctx.config.${SHARED_FLOOR_VAR}`), 'the floor check reads the SHARED variable via ctx.config').toBe(true);
    // The IRREGULARITY_THRESHOLD (0.95) must be a config read inside shapeRecord too, not the
    // bare module-level constant the legacy script hard-coded at :99.
    expect(/0\.95/.test(src.replace(/ctx\.config\.parcels_irregularity_threshold/g, '')), 'no bare 0.95 literal survives outside the config read').toBe(false);
  });

  it('notes.json declares SQM_TO_SQFT/M_TO_FT as unit constants, NOT logic_variables (plan D3 — no config.constants schema field, corrected in this review pass)', () => {
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

  it('notes.json is a real notes file (≤12 entries) with fences[] an explicit array', () => {
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
  it('deviations[] is an explicit array', () => {
    const d = loadDescriptor();
    expect(Array.isArray(d.deviations), 'deviations must be an explicit array (never "none")').toBe(true);
  });

  it('the per-batch → step txn atomicity-window widening is declared (plan D1)', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations);
    expect(/txn_scope/.test(text) && /step/i.test(text), 'the widening names txn_scope').toBe(true);
  });

  it('process.argv[2] local-path override is retired per R-AZ (report §3 row 3)', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations);
    expect(/argv/.test(text), 'the retired argv seam is declared').toBe(true);
    expect(/R-AZ/.test(text)).toBe(true);
  });

  it('PR-D1 (batch drop, #68) is closed FIXED-BY-RUNNER and recorded as a deviation (MQ-B5 (a))', () => {
    const d = loadDescriptor();
    expect(/PR-D1/.test(JSON.stringify(d.deviations)) && /MQ-B5 \(a\)/.test(JSON.stringify(d.deviations)), 'the PR-D1 retirement is a deviations[] row naming its ruling').toBe(true);
  });

  it('PR-D2 (parcels_null_address_pct structurally-unsatisfiable WARN) is a named limitation, the check is NOT retired', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations) + JSON.stringify(d.limitations);
    expect(/PR-D2/.test(text)).toBe(true);
    const ids = d.checks.map((c) => c.id);
    expect(ids, 'the null-address check stays declared, per plan D4 — retiring it would hide the strip').toContain('null_address_pct');
  });

  it('PR-D3 (CKAN coordinate jitter) and PR-D4 (centroid invalidation gap, OUT of scope) are named limitations', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations) + JSON.stringify(d.limitations);
    expect(/PR-D3/.test(text)).toBe(true);
    expect(/PR-D4/.test(text)).toBe(true);
  });

  it('the retired progress-cadence literals (10*1024*1024, 50000, 484000) are declared retired, dead under the whole-array model', () => {
    const d = loadDescriptor();
    const text = JSON.stringify(d.deviations);
    expect(/progress|cadence|whole.array/i.test(text)).toBe(true);
  });
});

// ===========================================================================
// 8. Recovery, counters, emits, guards, database (Rule 10/12)
// ===========================================================================

describe('row 3.7 — recovery, counters, emits, guards, database (Rule 10/12)', () => {
  it('recovery.interrupted is truthful: none — class A has no retraction, so nothing to recover (Rule 12)', () => {
    const d = loadDescriptor();
    expect(d.recovery.interrupted).toBe('none');
    expect(d.recovery.before_image).toBe('none');
    expect(d.recovery.interrupted_why, 'the none posture is justified').toBeDefined();
    expect(/class A|no retract|guarded_upsert/i.test(JSON.stringify(d.recovery.interrupted_why))).toBe(true);
  });

  it('counters read records_total from written.inserted+updated, records_new from inserted, records_updated from updated', () => {
    const d = loadDescriptor();
    expect(d.counters, 'a LOADER declares its counters').not.toBe('none');
    const c = d.counters as { records_total: { source: string }; records_new: { source: string }; records_updated: { source: string } };
    expect(/insert/.test(c.records_new.source)).toBe(true);
    expect(/updat/.test(c.records_updated.source)).toBe(true);
  });

  it('emits[] carries the records_meta keys the loader emits today, byte-identical (report §1.5)', () => {
    const d = loadDescriptor();
    expect(d.emits, 'the loader emits records_meta').not.toBe('none');
    const keys = (d.emits as Array<{ key: string }>).map((e) => e.key);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('guards: the geom GIST index the write validates through, srid 4326', () => {
    const d = loadDescriptor();
    expect(d.guards.srid).toBe(4326);
    for (const r of d.guards.requires) expect(r.on_missing, `${r.kind} must fail, never degrade`).toBe('fail');
  });

  it('database.min_migration names the base parcels table', () => {
    const d = loadDescriptor();
    expect(typeof d.database.min_migration === 'number').toBe(true);
  });

  it('sharing.varies_by_chain.phase.sources is declared (chain owner = Spec 43, position 5)', () => {
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

describe('row 3.7 — converted.json.pending carried the shape_clean stage entry through commit ②, R-K.1', () => {
  // RETIRED 2026-09-24 (batch2 row 3.7 CUTOVER, commit ③): the unconditional "a pending
  // entry must exist at stage shape_clean" assertion this describe block carried through
  // commit ② is retired now that cutover has landed — matching address_points' own
  // disposition at ITS cutover (src/tests/steps/address_points/violations.test.ts never
  // carried the unconditional form at all, only the R-K "no leftover entry" lock below).
  // The pending-entry's existence/stage was proven at commit ② (1414cb73) and is git
  // history now, not a live invariant to keep re-asserting.
  it('[flipped at commit ③] converted.json registers parcels, pending[] carries no leftover entry (R-K)', () => {
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[]; pending: Array<{ file: string }> };
    expect(converted.converted, 'registered at commit ③').toContain(STEP_REL);
    expect(converted.pending.some((p) => p.file === STEP_REL), 'R-K: the pending entry is deleted in the SAME commit as registration').toBe(false);
  });
});

describe('row 3.7 — the frozen shell names lock 55 and the descriptor names lock 55 (the §5.4 lock lock)', () => {
  it('the textual ADVISORY_LOCK_ID constant and the descriptor identity.lock agree', () => {
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
  interpretation: { file: string } | 'none';
  recovery: { reset: unknown; resume: unknown; force: unknown; rollback: unknown; verify_clean: unknown; cascades: unknown; interrupted: string; interrupted_why: unknown; before_image: string; before_image_why: unknown };
  database: { class: unknown; min_migration: number | 'none'; assert_current_database: string };
  counters: 'none' | { records_total: { source: string; scoped_by: unknown }; records_new: { source: string }; records_updated: { source: string } };
  config: 'none' | { logic_variables: Array<{ name: string; min: number | 'none'; max: number | 'none'; on_invalid: string }>; validation: string; hoisted_above_gate: boolean };
  sharing: { chains: unknown; shared: unknown; slug_forms: unknown; varies_by_chain: { checks: unknown; phase: Record<string, unknown>; audit_table: unknown; scope: unknown }; on_contention: string };
  terminals: Array<{ id: string; kind: string; status: string; records_meta: Record<string, string> | string }>;
}
