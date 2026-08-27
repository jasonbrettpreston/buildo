// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6 — PH-7 test design, prove red), §6.1 (G4d both-directions locks), §5.2 (the per-step checklist)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.2 (conformance), §1.2a (P1–P5), §1.4 (write_discipline per target), §1.5 (staleness 3 axes + fingerprint_inputs), §1.7 (sharing), §5.1 (frozen shape), §5.4 (lock-test convention), §8.2 (LINK representative)
// SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.4–§3.4b (notes.json), §14 (conversion workflow), §15 (step testing), §9.2 (load-bearing intent)
// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2–§3 (geom contract, core logic, the --full gate), docs/specs/01-pipeline/60_shared_steps.md §3, docs/specs/01-pipeline/65_enrich_parcels.md MB-7
//
// Pilot 3 — `link_massing`, the LINK representative (Spec 122 §8.2) and the FIRST pilot that joins two
// domain tables (`parcels` × `building_footprints`) and writes a JUNCTION (`parcel_buildings`) through
// TWO ordered write targets on one table. The 55-A hard gate (44 claims, k=PER_STEP) + the 5 55-B
// monotone partials (k=MIXED, `#181` N/A-reasoned) + the G4d fence locks, one `it` per claim, claim
// number and text in the test name (generator: `node scripts/violations/plan-claims.mjs --json`,
// `scope === 'PER_STEP' && k === 'PER_STEP'`). The 6 55-C items (#160/#161/#168/#177/#178/#179) are
// NOT gated here; #160 is surfaced in the assessment (plan: "a C-block programme gate at C1").
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Each one opens by asserting
// the FUTURE artifact it reads exists (`artifact()` → `expect(existsSync).toBe(true)` with the path
// in the message), so the failure names the missing artifact rather than surfacing as a TypeScript
// or import error. Nothing here requires the CURRENT step file in-process — it still calls
// `pipeline.run()` and would open a pool. The require probe is a child process.
//
// The artifacts this file asserts against (named in .cursor/active_task.md, commits 1–9, Folds A/B,
// Status rulings A-1…A-8 with the A-8 OVERRIDE — the JS fallback path is RETIRED, not pinned):
//   scripts/link-massing.descriptor.json     — `execution.shape:"link"` (A-1); `outputs.writes[]` = TWO
//                                               entries on parcel_buildings IN ORDER: E1 `set_based_scoped`
//                                               (`guard:"none"` + `guard_why` + `scope` + `declared_drift`),
//                                               E2 `guarded_upsert` with `guard_columns` EXACTLY the four
//                                               (D-5) + `retract:"all"` + `retract_when:"full_only"` (W1);
//                                               composite key [parcel_id, building_id] (D-7); `config`
//                                               declares T1–T7 with `limit_from_config` on the verdict
//                                               bound (T4); `guards.requires` = postgis extension (fail,
//                                               A-8 override) + the partial unique index + 2 GiST + the FK
//                                               pair + 2 btree + `rls_bypass_or_policy` (A-7);
//                                               `execution.invocation` ≡ manifest chain_args (finding 5);
//                                               counters from `written.e2.*` (D-8); `geom` declared on
//                                               both read tables (D-1); `building_footprints_count` emitted
//                                               as type string (Fold A); checks all `blocking:false`;
//                                               `hoisted_above_gate:true` (A-5); `deviations[]`; ≥10 terminals
//   scripts/link-massing.notes.json          — a REAL notes file (≤12 entries), `fences[]` for the
//                                               adjudicated fix-commits (G3: the 30 `fix(` corpus)
//   scripts/lib/compute/link-massing.js      — `checks` dispatch ≡ descriptor ids; `buildMatchSql(descriptor)`
//                                               pure SQL-text builder (A-2 option 2); NO JS fallback path
//                                               (A-8 OVERRIDE: no haversine / grid / turf / reproject);
//                                               no fs/pg/pipeline/argv/env
//   scripts/lib/step/staleness.js            — LG-7/LG-10: reads argv `--full` / `override.force_full` →
//                                               `mode_select: tri_state`
//   scripts/lib/step/write.js                — LG-2/LG-3: composite key + ordered targets + `retract_when`
//   scripts/lib/step/index.js                — LG-1: `runLinkPhase`, `pre_write` gate BEFORE writes[0]
//   scripts/steps/_schema/grandfathered.json — Fold B item 2: lists link_massing for `guard:"none"`
//   scripts/link-massing.js                  — the §5.1 frozen shape (lock 91 textual, S1)
//   scripts/steps/_schema/converted.json     — 3rd entry (commit 9)
//   docs/reports/2026-08-27-pilot3-link-massing-assessment.md — PH-0/3/5/6 report (commits 1–4)
//   docs/reports/golden/link_massing/*.json  — capture-step-golden docs (commit 5), THREE invocations
//                                               (sources --full · permits · standalone), `table_state`
//                                               projected (no id/linked_at) + ordered by the declared key
//                                               (A-4), `invariants.json` (Fold B item 7)
//
// Shape decisions recorded here because the schema is silent:
//   · `fences[]` lives in link-massing.notes.json under the top-level key `fences`. Each entry:
//     {const, value, incident, commit, lock_test}.
//   · The self-consumed emit (`code_version`, `building_footprints_count`) names the manifest slug
//     `link_massing` as its consumer; the reader after conversion is scripts/lib/massing-full-gate.js
//     (`fingerprint_inputs`), so BOTH the descriptor and that file must carry the two field names.
//   · The must-fail world (#165) is the ctx contract A-1(a) implies: `ctx.written` is PER-TARGET keyed
//     (`e1`, `e2` — LG-5), `ctx.matched` carries the join counters the compute observes, `ctx.cumulative`
//     the link-rate numerator/denominator, `ctx.prior` the prior run's self-consumed block, `ctx.gate`
//     the tri-state decision. Sabotage is keyed by the CONFIG VARIABLE a check is bound to, then by id.
//   · Golden invocation docs are found by BASENAME PREFIX (`sources-full.` · `permits.` · `standalone.`)
//     or by (chain, args) content; `pre/` and `post/` hold the old/new sides.
//   · The report's machine-readable tables are found by HEADER, not position (Intent Ledger · Line
//     accounting · Non-determinism inventory · Boundary freeze · Commit ledger), and it must contain
//     the literal "740 lines".
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const THIS_FILE_REL = 'src/tests/steps/link_massing/violations.test.ts';
const STEP_DIR_REL = 'src/tests/steps/link_massing';

const STEP_REL = 'scripts/link-massing.js';
const DESCRIPTOR_REL = 'scripts/link-massing.descriptor.json';
const NOTES_REL = 'scripts/link-massing.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/link-massing.js';
const STALENESS_REL = 'scripts/lib/step/staleness.js';
const WRITE_REL = 'scripts/lib/step/write.js';
const INDEX_REL = 'scripts/lib/step/index.js';
const GATE_LIB_REL = 'scripts/lib/massing-full-gate.js';
const GRANDFATHERED_REL = 'scripts/steps/_schema/grandfathered.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const REPORT_REL = 'docs/reports/2026-08-27-pilot3-link-massing-assessment.md';
const GOLDEN_DIR_REL = 'docs/reports/golden/link_massing';
const GOLDEN_HARNESS_REL = 'scripts/analysis/capture-step-golden.js';
const MANIFEST_REL = 'scripts/manifest.json';
const SEED_REL = 'scripts/seeds/logic_variables.json';
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');
const COMPUTE_STUB_REL = 'scripts/steps/_schema/fixtures/shape/_compute-stub.js';
const REVIEW_CLIS = ['scripts/gemini-review.js', 'scripts/deepseek-review.js'];

/** G0 — the frozen line count of scripts/link-massing.js (`wc -l`, 2026-08-27). */
const FROZEN_LINES = 740;
/** S1 — the step's advisory lock (Spec 47 §A.5 registry; pipeline-advisory-lock.infra.test.ts:77). */
const LOCK_ID = 91;
/** D-13 / A-7 — the latest DDL this step depends on: 081 (idx_parcel_buildings_one_primary); 039 is the GiST pair. */
const MIN_MIGRATION = 81;
/** LG-6 / G0 — at least the 10 exit paths the plan enumerates (8 exit constructs + lock contention + pre_write). */
const TERMINAL_COUNT_MIN = 10;
/** The junction and its 7 step-written columns (D-2; `id` is the serial and is never declared as written). */
const WRITE_TABLE = 'parcel_buildings';
const WRITE_COLUMNS = ['parcel_id', 'building_id', 'is_primary', 'structure_type', 'match_type', 'confidence', 'linked_at'];
const WRITE_KEY = ['parcel_id', 'building_id'];
/** D-5 — THE guard set. `linked_at` is in the SET list and NEVER in the guard (b36d0596). */
const GUARD_COLUMNS = ['is_primary', 'structure_type', 'match_type', 'confidence'];
const RUN_CLOCK_COLUMN = 'linked_at';
/** Fold B item 1 — the two ordered write targets. */
const E1_CLASS = 'set_based_scoped';
const E2_CLASS = 'guarded_upsert';
/** E1 — the override env (E1 in the P4 inventory has a home: override.force_full). */
const FORCE_FULL_ENV = 'LINK_MASSING_FORCE_FULL';
/** A-7 — live catalog 2026-08-27 (pg_indexes / pg_constraint on parcel_buildings). */
const RLS_REQUIREMENT_KIND = 'rls_bypass_or_policy';
const REQUIRED_NAMES = [
  'postgis',
  'idx_parcel_buildings_one_primary',
  'idx_parcels_geom_gist',
  'idx_building_footprints_geom_gist',
  'parcel_buildings_parcel_id_fkey',
  'parcel_buildings_building_id_fkey',
  'idx_parcel_buildings_parcel',
  'idx_parcel_buildings_building',
];
/** Cross-layer contract (3) — the self-consumed gate fields read by evaluateMassingFullGate. */
const SELF_CONSUMED_FIELDS = ['code_version', 'building_footprints_count'];
const SELF_CONSUMER_SLUG = 'link_massing';
/** D-4 — the INFO metric ids that must survive as declared INFO checks (chain.logic.test.ts asserts the last by name). */
const INFO_METRIC_IDS = ['parcels_processed', 'run_matched', 'match_centroid_in_parcel', 'match_nearest_fallback', 'no_match', 'parcel_buildings_written'];

/** P4 — T1–T7 by the plan's names. T4 is the verdict bound (`limit_from_config`). */
const CONFIG_VARS = {
  T1: 'massing_shed_threshold_sqm',
  T2: 'massing_garage_max_sqm',
  T3: 'massing_nearest_max_distance_m',
  T4: 'link_massing_link_rate_fail_pct',
  T5: 'link_massing_centroid_confidence',
  T6: 'link_massing_nearest_confidence',
  T7: 'link_massing_grid_degrees',
} as const;
const LIMIT_FROM_CONFIG_VARS: string[] = [CONFIG_VARS.T4];
/** A-8 OVERRIDE — T7 is the JS-path grid literal; with that path RETIRED it is declared and recorded, never read by the compute. */
const RETIRED_PATH_VARS = new Set<string>([CONFIG_VARS.T7]);

/** A-2 option 2 — the pure exports of the compute. */
const PURE_HELPERS = ['buildMatchSql', 'classifyStructure'];

/**
 * A-8 OVERRIDE — the JS fallback path identifiers (read from scripts/link-massing.js :48-160 and
 * :420-660 on 2026-08-27). None may survive in the compute: no second code path.
 */
const JS_PATH_TOKENS = [
  'haversineDistance', 'haversine', 'gridKey', 'gridNeighbourKeys', 'GRID_SIZE', 'mercatorToWgs84', 'reprojectGeometry',
  'MERCATOR_ORIGIN', 'booleanPointInPolygon', 'turfPoint', '@turf/', 'streamQuery', 'searchRadius', 'gridSpan', 'rbush',
];

/** The adjudicated fence commits this file locks (G3: from the 30 `fix(` corpus; the Severity: footer grep is 0). */
const FENCE_COMMITS = ['5bb31faf', 'b36d0596', 'b16c036d', 'd324ab27'];

/** Spec 120 §14.3 — the closed disposition vocabulary of the Intent Ledger. */
const LEDGER_DISPOSITIONS = [
  'preserved-in-runner', 'preserved-in-validator', 'preserved-in-compute',
  'encoded-as-descriptor-field', 'encoded-as-deviation', 'knowingly-retired',
];
const NONDET_DISPOSITIONS = ['must-match-exactly', 'normalize-then-match', 'excluded-with-reason'];
const LINE_CATEGORIES = ['runner-owned', 'validator-owned', 'descriptor-encoded', 'compute', 'dead (proved)', 'duplicate'];
const NOTES_PROSE_BLOCKS = [
  'expected_shape', 'read_this_way', 'suspicious_if', 'blind_spots', 'decisions', 'review_notes',
  'expected', 'known_normal', 'known_bad', 'do_not_reflag', 'how_to_investigate', 'limitations',
];
const NOTES_MEASURED_EXEMPT = new Set(['decisions']);
const NOTES_CAP = 12;

// ⚠️ #183 partial — the inline fixtures below were reviewed on this date (goes red 180 days later BY DESIGN).
const FIXTURE_REVIEWED = '2026-08-27';
const FIXTURE_MAX_AGE_DAYS = 180;

/** Measured live 2026-08-27 (127.0.0.1:54322/postgres, 242 migrations). */
const LIVE_ROWS = 520_492;
const LIVE_LINKED_PARCELS = 485_135;
const LIVE_PARCELS_WITH_CENTROID = 486_530;
const LIVE_BUILDING_FOOTPRINTS = 427_077;
const LIVE_TAIL = 1_395;
const LIVE_CODE_VERSION = 'v2-building-centroid-in-parcel';

// ONE compiler, the same one pipeline.step() validates with.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { buildAuditTable } = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
  buildAuditTable: (descriptor: Descriptor, chainId: string | null, observations: Record<string, unknown>) => { rows: AuditRow[]; audit_table: { verdict: string } };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CURRENT write.js (green half of D-5 / F2)
const currentWrite = require(path.join(REPO_ROOT, WRITE_REL)) as {
  resolveGuardColumns: (writeSpec: { key: string | string[]; write_discipline: { guard_columns: unknown } }, stepColumns: string[]) => string[];
};

// ---------------------------------------------------------------------------
// Types (the slice of step.schema.json — plus the C3 pre-pull fields — this file reads)
// ---------------------------------------------------------------------------

interface AuditRow { metric: string; value: unknown; threshold: unknown; status: string }
interface Check {
  id: string; kind: string; expect: unknown; limit: unknown; limit_from_config?: string;
  severity: string; blocking: boolean; when: string; chains: string[] | 'all'; why?: { text?: string };
}
interface WriteDiscipline {
  class: string; guard: unknown; guard_columns: unknown; guard_why?: unknown; scope: unknown;
  expected_change_ratio: unknown; idempotent_rerun: unknown; idempotent_rerun_why?: unknown; declared_drift?: unknown; txn_scope: unknown;
}
interface WriteSpec {
  table: string; key: string | string[]; columns: Array<{ name: string; written?: string }>;
  write_discipline: WriteDiscipline; retract: string; retract_when?: string; replay: string;
}
interface Requirement { kind: string; name: string; on_missing: string }
interface Descriptor {
  identity: { name: string; lock: number; spec_version: string; archetype: string };
  inputs: { reads: { steps: Array<{ step?: string; name?: string }>; tables: Array<{ table: string; columns?: string[] }>; externals: Array<{ id: string; url?: string }> } };
  outputs: 'none' | { writes: WriteSpec[]; invalidates: unknown };
  staleness: { trigger: 'none' | Array<{ signal: string; position: string }>; mode_select: string; fingerprint_inputs: string[] | 'none' };
  guards: { requires: Requirement[]; srid: number | 'none'; empty_source: unknown };
  execution: { shape?: string; on_check_error: string; network: unknown; txn_scope: string; batch: unknown; invocation: Record<string, { argv: string[]; env?: Record<string, string> }> | 'none' };
  checks: Check[];
  override: 'none' | { force_full: string; force_run: string; dry_run: string };
  emits: 'none' | Array<{ key: string; type: string; consumers: string[] }>;
  deviations: unknown;
  limitations: unknown;
  interpretation: { file: string; entries: number } | 'none';
  database: { min_migration: number | 'none' };
  counters: 'none' | { records_total: { source: string; scoped_by: unknown }; records_new: { source: string }; records_updated: { source: string } };
  config: 'none' | { logic_variables: Array<{ name: string; min: number | 'none'; max: number | 'none'; on_invalid: string }>; hoisted_above_gate: boolean };
  sharing: { varies_by_chain: { checks: unknown; phase?: unknown }; slug_forms?: unknown };
  terminals: Array<{ id: string; kind: string; status: string; records_meta: Record<string, string> | string }>;
}
interface NotesEntry { measured?: { value?: unknown; date?: string; query?: string }; detected_by?: string; check?: string; [k: string]: unknown }
interface Notes {
  fences?: Array<{ const: string; value: unknown; incident: string; commit: string; lock_test: string }>;
  counts?: { open_blind_spots?: number; unpromoted_suspicious_if?: number };
  [block: string]: unknown;
}
interface TableState { table: string; row_count: number; content_hash: string | null; order_by?: string | string[]; columns?: string[]; projection?: string[] }
interface GoldenDoc {
  harness: string; chain: string | null; nondeterminism: string[]; normalised: unknown;
  table_state?: TableState[]; invariants?: Array<{ name: string; value: unknown }>; args?: unknown; env?: Record<string, string>; file: string;
}
type ComputeFn = (ctx: unknown) => Promise<{ records_meta?: Record<string, unknown> } | void>;
interface ComputeModule { compute?: ComputeFn; checks?: Record<string, (ctx: unknown) => unknown>; [k: string]: unknown }

// ---------------------------------------------------------------------------
// Artifact helpers — every claim test opens with one of these
// ---------------------------------------------------------------------------

function abs(rel: string): string { return path.join(REPO_ROOT, rel); }

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the pilot-3 commit sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string { return fs.readFileSync(artifact(rel), 'utf8'); }

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d); // throws with the AJV error list — the loader property (§4.2)
  return d;
}

function loadNotes(): Notes { return JSON.parse(readText(NOTES_REL)) as Notes; }
function computeSource(): string { return readText(COMPUTE_REL); }

/** A compute module exports the FUNCTION with the dispatch table + pure helpers hung off it (pilot-2 fold note). */
function loadComputeModule(): ComputeModule {
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule | ComputeFn; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  return (typeof mod === 'function' ? { ...mod, compute: mod } : mod) as ComputeModule;
}

function loadCompute(): ComputeFn {
  const mod = loadComputeModule();
  expect(typeof mod.compute, `${COMPUTE_REL} must export \`compute\` (a function)`).toBe('function');
  return mod.compute as ComputeFn;
}

function loadComputeStub(): ComputeFn {
  return require(abs(COMPUTE_STUB_REL)) as ComputeFn; // eslint-disable-line @typescript-eslint/no-require-imports -- CJS fixture stub
}

/** A library module, required only after its existence is asserted (the growth is FUTURE; the file is not). */
function loadLib(rel: string): Record<string, unknown> {
  return require(artifact(rel, 'Fold B library growth, commit 7')) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-require-imports -- the CJS library module
}

/** The pg.Pool construction spy, as a child process (never require a step in-process). */
function probe(rel: string): { pools: number; clients: number; require_error: string | null; has_descriptor: boolean; compute_type: string } {
  const raw = execFileSync('node', [PROBE, rel], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 });
  return JSON.parse(raw) as { pools: number; clients: number; require_error: string | null; has_descriptor: boolean; compute_type: string };
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 }).trim();
  } catch {
    return '';
  }
}

/** Unix time of the FIRST commit touching `rel` (0 = never committed). */
function firstCommitTime(rel: string, pickaxe?: string): number {
  const args = ['log', '--reverse', '--format=%ct'];
  if (pickaxe) args.push(`-S${pickaxe}`);
  args.push('--', rel);
  const first = git(args).split(/\r?\n/)[0] ?? '';
  return first ? Number(first) : 0;
}

/** Strip block + line comments (roughly) so a token grep sees CODE, not prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** `string_agg(<expr>, '|' ORDER BY …)` — ORDER BY must sit INSIDE the aggregate's own parentheses (nested parens tolerated: A-4's projected rowTextExpr(...)). */
function stringAggOrdered(q: string): boolean {
  const start = q.search(/\bstring_agg\s*\(/i);
  if (start < 0) return false;
  let depth = 0;
  for (let i = q.indexOf('(', start); i < q.length; i++) {
    const ch = q[i];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return /ORDER BY/i.test(q.slice(start, i)); }
  }
  return false;
}

function walk(dirAbs: string, out: string[] = []): string[] {
  if (!fs.existsSync(dirAbs)) return out;
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const p = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function stepTestDirFiles(): string[] {
  return walk(abs(STEP_DIR_REL)).map((p) => path.relative(REPO_ROOT, p).replace(/\\/g, '/'));
}

function notesEntries(notes: Notes): Array<{ block: string; entry: NotesEntry }> {
  const out: Array<{ block: string; entry: NotesEntry }> = [];
  for (const block of NOTES_PROSE_BLOCKS) {
    const arr = notes[block];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr as NotesEntry[]) out.push({ block, entry });
  }
  return out;
}

function isNone(v: unknown): boolean { return typeof v === 'string' && /^none\b/i.test(v); }
function daysBetween(a: Date, b: Date): number { return Math.abs(a.getTime() - b.getTime()) / 86_400_000; }

function staleEntries(entries: Array<{ block: string; entry: NotesEntry }>, now: Date, months = 6): string[] {
  const out: string[] = [];
  for (const { block, entry } of entries) {
    const date = entry.measured?.date;
    if (!date) continue;
    if (daysBetween(now, new Date(date)) > months * 30.4375) out.push(`${block}: measured ${date}`);
  }
  return out;
}

function checkById(d: Descriptor, id: string): Check {
  const c = d.checks.find((x) => x.id === id);
  expect(c, `descriptor declares no check "${id}"`).toBeDefined();
  return c as Check;
}

function checkByVar(d: Descriptor, varName: string): Check {
  const c = d.checks.find((x) => x.limit_from_config === varName);
  expect(c, `no check carries limit_from_config: "${varName}"`).toBeDefined();
  return c as Check;
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'a LINK may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

/** Fold B item 1 — E1 is the is_primary clear, E2 the guarded upsert; BOTH on the junction, in that order. */
function writeTargets(d: Descriptor): { e1: WriteSpec; e2: WriteSpec } {
  const w = writes(d);
  expect(w.length, 'D-6: TWO outputs.writes[] entries on parcel_buildings (E1 clear · E2 upsert)').toBe(2);
  const [e1, e2] = w as [WriteSpec, WriteSpec];
  expect(e1.table).toBe(WRITE_TABLE);
  expect(e2.table).toBe(WRITE_TABLE);
  expect(e1.write_discipline.class, 'writes[0] = E1 set_based_scoped (the is_primary=false clear, B-8)').toBe(E1_CLASS);
  expect(e2.write_discipline.class, 'writes[1] = E2 guarded_upsert (W3)').toBe(E2_CLASS);
  return { e1, e2 };
}

function emitsOf(d: Descriptor): Array<{ key: string; type: string; consumers: string[] }> {
  expect(d.emits, 'emits must declare the self-consumed gate fields').not.toBe('none');
  return d.emits as Array<{ key: string; type: string; consumers: string[] }>;
}

function manifest(): { scripts: Record<string, { file: string; chain_args?: Record<string, string[]> }>; chains: Record<string, string[]> } {
  return JSON.parse(fs.readFileSync(abs(MANIFEST_REL), 'utf8')) as ReturnType<typeof manifest>;
}

function consumerFile(consumer: string): string {
  if (/\.(js|ts|mjs|cjs|py)$/.test(consumer)) return consumer;
  const m = manifest();
  const inSomeChain = Object.values(m.chains).some((slugs) => slugs.includes(consumer));
  expect(inSomeChain, `consumer slug "${consumer}" is in no manifest chain`).toBe(true);
  return m.scripts[consumer]?.file ?? consumer;
}

function strings(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 4) return out;
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) strings(x, out, depth + 1);
  return out;
}

// ---------------------------------------------------------------------------
// Markdown tables in the pilot report — found by HEADER, never by position
// ---------------------------------------------------------------------------

interface MdTable { heading: string; headers: string[]; rows: Array<Record<string, string>> }

function cleanCell(s: string): string { return s.replace(/[`*]/g, '').trim(); }

function mdTables(md: string): MdTable[] {
  const lines = md.split(/\r?\n/);
  const tables: MdTable[] = [];
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^#{1,6}\s/.test(line)) heading = line.replace(/^#+\s*/, '').trim();
    const next = lines[i + 1] ?? '';
    if (line.trim().startsWith('|') && /^\s*\|?\s*:?-{3,}/.test(next)) {
      const headers = line.split('|').slice(1, -1).map((h) => cleanCell(h).toLowerCase());
      const rows: Array<Record<string, string>> = [];
      let j = i + 2;
      for (; j < lines.length && (lines[j] ?? '').trim().startsWith('|'); j++) {
        const cells = (lines[j] ?? '').split('|').slice(1, -1).map(cleanCell);
        const row: Record<string, string> = {};
        headers.forEach((h, k) => { row[h] = cells[k] ?? ''; });
        rows.push(row);
      }
      tables.push({ heading, headers, rows });
      i = j - 1;
    }
  }
  return tables;
}

function reportTable(md: string, want: Array<[string, RegExp]>): { table: MdTable; col: (name: string) => string } {
  const found = mdTables(md).find((t) => want.every(([, re]) => t.headers.some((h) => re.test(h))));
  expect(found, `${REPORT_REL} has no table with columns ${want.map(([n]) => n).join(' · ')} (${mdTables(md).length} tables found)`).toBeDefined();
  const t = found as MdTable;
  const col = (name: string): string => {
    const [, re] = want.find(([n]) => n === name) as [string, RegExp];
    return t.headers.find((h) => re.test(h)) as string;
  };
  return { table: t, col };
}

const INTENT_LEDGER_COLS: Array<[string, RegExp]> = [
  ['construct', /construct/], ['discovered by', /discover/], ['disposition', /^disposition/], ['adjudicated by', /adjudicat|approver/],
];

// ---------------------------------------------------------------------------
// Golden-master captures (commit 5) — THREE invocations (finding 5), discovery by content
// ---------------------------------------------------------------------------

function goldenDocs(): GoldenDoc[] {
  artifact(GOLDEN_DIR_REL, 'golden-master captures, commit 5');
  const docs = walk(abs(GOLDEN_DIR_REL))
    .filter((p) => p.endsWith('.json'))
    .map((p) => ({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as GoldenDoc), file: path.relative(abs(GOLDEN_DIR_REL), p).replace(/\\/g, '/') }))
    .filter((d) => 'harness' in d);
  expect(docs.length, `${GOLDEN_DIR_REL} holds no capture docs`).toBeGreaterThan(0);
  for (const d of docs) expect(d.harness, `${d.file} is not a capture-step-golden doc`).toBe(GOLDEN_HARNESS_REL);
  return docs;
}

/** A-4 — the junction's captured state: count + a COLUMN-PROJECTED hash ORDERED BY the declared key. */
function junctionState(doc: GoldenDoc): TableState {
  const ts = (doc.table_state ?? []).find((t) => t.table === WRITE_TABLE);
  expect(ts, `${doc.file}: no table_state for ${WRITE_TABLE} — a LINK 4-tuple without the junction (D-18 / G8(b))`).toBeDefined();
  const state = ts as TableState;
  const order = Array.isArray(state.order_by) ? state.order_by.join(',') : (state.order_by ?? '');
  expect(/parcel_id[\s\S]*building_id/.test(order), `${doc.file}: table_state.${WRITE_TABLE} must be ORDERED BY the declared key (parcel_id, building_id), never the pk (Fold B item 5)`).toBe(true);
  const projected = state.columns ?? state.projection;
  expect(Array.isArray(projected), `${doc.file}: table_state.${WRITE_TABLE} carries no column projection (A-4: a full-row hash renders id + linked_at)`).toBe(true);
  for (const volatile of ['id', RUN_CLOCK_COLUMN]) expect(projected, `${doc.file}: projection must exclude ${volatile}`).not.toContain(volatile);
  return state;
}

function invariant(doc: GoldenDoc, name: string): number {
  const inv = (doc.invariants ?? []).find((i) => i.name === name);
  expect(inv, `${doc.file}: no invariant ${name} (Fold B item 7)`).toBeDefined();
  return Number((inv as { value: unknown }).value);
}

/** Finding 5 — `sources` runs with --full (manifest chain_args), `permits` bare, standalone with neither. */
const INVOCATIONS: Array<{ name: string; chain: string | null; argv: string[] }> = [
  { name: 'sources-full', chain: 'sources', argv: ['--full'] },
  { name: 'permits', chain: 'permits', argv: [] },
  { name: 'standalone', chain: null, argv: [] },
];
const OLD_RE = /old|before|baseline|run[-_]?\d/i;
const NEW_RE = /new|after|converted/i;

function docsFor(docs: GoldenDoc[], inv: { name: string; chain: string | null; argv: string[] }): GoldenDoc[] {
  return docs.filter((x) => {
    if (path.basename(x.file).startsWith(`${inv.name}.`)) return true;
    const args = JSON.stringify(x.args ?? []);
    return x.chain === inv.chain && (inv.argv.includes('--full') ? args.includes('--full') : !args.includes('--full'));
  });
}
function isOld(d: GoldenDoc): boolean { return d.file.startsWith('pre/') || (OLD_RE.test(path.basename(d.file)) && !NEW_RE.test(path.basename(d.file))); }
function isNew(d: GoldenDoc): boolean { return d.file.startsWith('post/') || NEW_RE.test(path.basename(d.file)); }
/** D-19 — a FORCED FULL capture: `--full` under LINK_MASSING_FORCE_FULL=1 (the gate alone would go incremental). */
function isForcedFull(d: GoldenDoc): boolean {
  return /force/i.test(path.basename(d.file)) || JSON.stringify(d.env ?? {}).includes(FORCE_FULL_ENV) || JSON.stringify(d.args ?? []).includes(FORCE_FULL_ENV);
}

// ---------------------------------------------------------------------------
// The must-fail fixture world (#165 / #163 / #182) — DERIVED from the descriptor + the A-1(a) ctx
// contract. Healthy = the measured steady state (an incremental run over the 1,395 tail, 0 writes).
// ---------------------------------------------------------------------------

interface World {
  matched: {
    parcels_processed: number; parcels_linked: number; centroid_in_parcel: number; nearest: number; no_match: number;
    building_footprints_count: number; invalid_geometry_count: number;
    footprint_exceeds_lot: { centroid_in_parcel: number; nearest: number };
    shared_primary_buildings: number; confidence_off_domain: number; multi_primary_parcels: number;
  };
  cumulative: { linked_parcels: number; parcels_with_centroid: number };
  written: {
    e1: { scanned: number; updated: number };
    e2: { scanned: number; inserted: number; updated: number; retracted: number; rows_changed: number };
    privilege: { bypassrls: boolean; policies: number };
  };
  prior: { code_version: string; building_footprints_count: string } | null;
  gate: { mode: 'full' | 'incremental'; reason: string; explicit_full: boolean };
  overrides: { force_full: boolean };
  elapsed_ms: number;
}

function healthyWorld(): World {
  return {
    matched: {
      parcels_processed: LIVE_TAIL, parcels_linked: 0, centroid_in_parcel: 0, nearest: 0, no_match: LIVE_TAIL,
      building_footprints_count: LIVE_BUILDING_FOOTPRINTS, invalid_geometry_count: 0,
      footprint_exceeds_lot: { centroid_in_parcel: 0, nearest: 0 },
      shared_primary_buildings: 0, confidence_off_domain: 0, multi_primary_parcels: 0,
    },
    cumulative: { linked_parcels: LIVE_LINKED_PARCELS, parcels_with_centroid: LIVE_PARCELS_WITH_CENTROID },
    written: {
      e1: { scanned: 0, updated: 0 },
      e2: { scanned: 0, inserted: 0, updated: 0, retracted: 0, rows_changed: 0 },
      privilege: { bypassrls: true, policies: 0 },
    },
    prior: { code_version: LIVE_CODE_VERSION, building_footprints_count: String(LIVE_BUILDING_FOOTPRINTS) },
    gate: { mode: 'incremental', reason: 'unchanged', explicit_full: true },
    overrides: { force_full: false },
    elapsed_ms: 8_000,
  };
}

/** One sabotage per WARN/FAIL check — by the P4 variable first (T4), then by id pattern. */
const SABOTAGE_BY_VAR: Record<string, (w: World) => void> = {
  [CONFIG_VARS.T4]: (w) => { w.cumulative.linked_parcels = 100_000; }, // 20.6% link rate vs the 50% floor
};
const SABOTAGE_BY_ID: Array<[RegExp, (w: World) => void]> = [
  [/footprint.*(exceed|gt|lot)|coverage|exceeds_lot/i, (w) => { w.matched.footprint_exceeds_lot.nearest = 60_000; w.matched.nearest = 100_000; }], // A-6 (6): the link-stage counter (peel 8b)
  [/multi_primary|one_primary|primary_uniqueness/i, (w) => { w.matched.multi_primary_parcels = 12; }], // invariant (1)
  [/shared_primary/i, (w) => { w.matched.shared_primary_buildings = 66_906; }],
  [/confidence|vocab/i, (w) => { w.matched.confidence_off_domain = 5; }], // invariant (4)
  [/empty|zero_footprint|footprints_count|building_footprints/i, (w) => { w.matched.building_footprints_count = 0; w.gate = { mode: 'full', reason: 'massing_count_changed(427077->0)', explicit_full: true }; }], // D-20: the unguarded W1 against an empty corpus
  [/retract|mass_delete|ghost|full_delete/i, (w) => { w.gate = { mode: 'full', reason: 'code_version_changed', explicit_full: true }; w.written.e2.retracted = LIVE_ROWS; w.written.e2.inserted = 0; w.matched.parcels_processed = LIVE_PARCELS_WITH_CENTROID; w.matched.no_match = LIVE_PARCELS_WITH_CENTROID; }],
  [/privilege|rls|policy/i, (w) => { w.written.privilege = { bypassrls: false, policies: 0 }; }], // A-7: silent 0-row write
  [/invalid_geom|geometry|pip_swallow|swallow/i, (w) => { w.matched.invalid_geometry_count = 40; }], // §1.6 the silent swallow, now counted
  [/rows_changed|change_ratio|churn|drift/i, (w) => { w.written.e2.scanned = LIVE_ROWS; w.written.e2.updated = LIVE_ROWS; w.written.e2.rows_changed = LIVE_ROWS; }], // finding 2 reproduced: every row rewritten
  [/force_full|override/i, (w) => { w.overrides.force_full = true; }],
  [/no_match|unmatched|tail/i, (w) => { w.matched.parcels_processed = 50_000; w.matched.no_match = 50_000; }],
  [/duration|elapsed|budget/i, (w) => { w.elapsed_ms = 90 * 60_000; }],
  [/prior|gate|code_version|mode/i, (w) => { w.prior = null; }],
];

function sabotageFor(c: Check): ((w: World) => void) | undefined {
  if (c.limit_from_config && SABOTAGE_BY_VAR[c.limit_from_config]) return SABOTAGE_BY_VAR[c.limit_from_config];
  const hit = SABOTAGE_BY_ID.find(([re]) => re.test(c.id));
  return hit ? hit[1] : undefined;
}

/** The `ctx.config` a freshly seeded DB yields for the DECLARED names (P4: declared-but-unseeded reds by name). */
function configProjection(d: Descriptor): Readonly<Record<string, number>> {
  if (d.config === 'none') return Object.freeze({});
  const seed = JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8')) as Record<string, { default: number }>;
  const out: Record<string, number> = {};
  for (const v of d.config.logic_variables) {
    expect(seed[v.name], `${SEED_REL} does not seed declared variable ${v.name} (P4 — declared but in NO registry)`).toBeDefined();
    out[v.name] = seed[v.name]!.default;
  }
  return Object.freeze(out);
}

function resolvedDescriptor(d: Descriptor, config: Readonly<Record<string, number>>): Descriptor {
  const checks = d.checks.map((c) => {
    if (!c.limit_from_config) return c;
    const v = config[c.limit_from_config];
    expect(v, `check ${c.id}: limit_from_config "${c.limit_from_config}" is not in ctx.config`).toBeDefined();
    const limit = typeof c.limit === 'string' ? c.limit.replace(/[0-9]*\.?[0-9]+(?=\s*(x median)?$)/, String(v)) : c.limit;
    return { ...c, limit };
  });
  return { ...d, checks };
}

async function runCompute(compute: ComputeFn, d: Descriptor, w: World): Promise<Record<string, string>> {
  const observations: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const declared = new Set(d.checks.map((c) => c.id));
  const config = configProjection(d);
  const resolved = resolvedDescriptor(d, config);
  const ctx = {
    pool: { query: () => { throw new Error('the compute must not touch the pool — the join/write are library-owned (A-1(a)); #175 partial'); } },
    chainId: null,
    runId: null,
    descriptor: resolved,
    checks: resolved.checks.map((c) => c.id),
    fetch: () => { throw new Error('the compute must not fetch — this step has an EMPTY network seam (G5)'); },
    clock: () => Date.parse(`${FIXTURE_REVIEWED}T00:00:00Z`),
    config,
    matched: w.matched,
    cumulative: w.cumulative,
    written: w.written,
    prior: w.prior,
    gate: w.gate,
    overrides: w.overrides,
    elapsed_ms: w.elapsed_ms,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    report(checkId: string, observation: unknown) {
      if (!declared.has(checkId)) throw new Error(`compute reported undeclared check "${checkId}"`);
      observations[checkId] = observation;
    },
  };
  const realLog = console.log;
  const realErr = console.error;
  const realWarn = console.warn;
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  try {
    await compute(ctx);
  } finally {
    console.log = realLog;
    console.error = realErr;
    console.warn = realWarn;
  }
  const built = buildAuditTable(resolved, null, observations);
  const out: Record<string, string> = {};
  for (const r of built.rows) out[r.metric] = r.status;
  return out;
}

async function mustFailWith(compute: ComputeFn, d: Descriptor, id: string, sabotage: (w: World) => void): Promise<{ healthy: string; sabotaged: string }> {
  const healthy = await runCompute(compute, d, healthyWorld());
  const w = healthyWorld();
  sabotage(w);
  const sabotaged = await runCompute(compute, d, w);
  return { healthy: healthy[id] ?? 'absent', sabotaged: sabotaged[id] ?? 'absent' };
}

async function mustFailPair(compute: ComputeFn, d: Descriptor, c: Check): Promise<{ healthy: string; sabotaged: string }> {
  const sabotage = sabotageFor(c);
  expect(sabotage, `no must-fail fixture for check ${c.id} (severity ${c.severity})`).toBeDefined();
  return mustFailWith(compute, d, c.id, sabotage as (w: World) => void);
}

// ---------------------------------------------------------------------------
// The write generator (LG-2/LG-3) — call whatever write.js exports and collect the SQL per target
// ---------------------------------------------------------------------------

function writeGenerator(): (...a: unknown[]) => unknown {
  const lib = loadLib(WRITE_REL);
  const gen = Object.entries(lib).find(([k, v]) => typeof v === 'function' && /buildWritePlan|sql|generate|plan/i.test(k));
  expect(gen, `${WRITE_REL} exports no generator (buildWritePlan / *Sql)`).toBeDefined();
  return (gen as [string, (...a: unknown[]) => unknown])[1];
}

/** The SQL write.js generates for ONE declared target. Throws today for a composite key (LG-2) — that IS the finding. */
function generatedSqlFor(d: Descriptor, w: WriteSpec): string {
  const out = writeGenerator()(w, d);
  const sql = strings(out).join('\n');
  expect(sql.length, `${WRITE_REL} generator returned no SQL for ${w.table}/${w.write_discipline.class}`).toBeGreaterThan(0);
  return sql;
}

// ---------------------------------------------------------------------------
// G4d — the four fences, as pure detectors over a STRUCTURED view of the subject.
// Every detector returns [] when the fence is intact; a non-empty list names what was lost.
// ---------------------------------------------------------------------------

const F1_COMMIT = '5bb31faf';
const F1_CONSTRUCT = 'is_primary cleared for the batch\'s parcels BEFORE the upsert (B-8) — E1 set_based_scoped precedes E2 guarded_upsert, or the partial unique index idx_parcel_buildings_one_primary (mig 081) throws when the primary shifts';
const F2_COMMIT = 'b36d0596';
const F2_CONSTRUCT = 'the IS DISTINCT FROM guard names EXACTLY is_primary/structure_type/match_type/confidence and NEVER linked_at (D-5) — or every one of 520,492 rows rewrites per run and enrich_parcels re-scopes 485,135 parcels';
const F3_COMMIT = 'b16c036d';
const F3_CONSTRUCT = 'the FULL mass-DELETE is scoped IDENTICALLY to the parcels re-evaluated (baseFilter centroid_lat/centroid_lng IS NOT NULL) and runs ONLY in full mode (retract:all + retract_when:full_only) — never an unscoped or incremental retraction';
const F4_COMMIT = 'd324ab27';
const F4_CONSTRUCT = 'the nearest-fallback cap comes from massing_nearest_max_distance_m (T3), never a 50 literal, and the bbox prefilter (ST_Expand) precedes the geography ST_DWithin (B-10)';

/** F1 subject: the ordered write targets (from the descriptor, or reconstructed from source text). */
interface OrderedWrites { targets: Array<{ table: string; cls: string; column?: string | undefined }> }

function detectPrimaryClearFence(i: OrderedWrites): string[] {
  const v: string[] = [];
  const clear = i.targets.findIndex((t) => t.table === WRITE_TABLE && t.cls === E1_CLASS && (t.column ?? 'is_primary') === 'is_primary');
  const upsert = i.targets.findIndex((t) => t.table === WRITE_TABLE && t.cls === E2_CLASS);
  if (clear < 0) v.push('no set_based_scoped is_primary clear on parcel_buildings — B-8 is gone, idx_parcel_buildings_one_primary will throw on a primary shift');
  if (upsert < 0) v.push('no guarded_upsert on parcel_buildings');
  if (clear >= 0 && upsert >= 0 && clear > upsert) v.push('the is_primary clear is declared AFTER the upsert — order is what the fence encodes');
  return v;
}

/** The CURRENT step's write order, read from its source text (the reversion-half subject today). */
function orderedWritesFromSource(text: string): OrderedWrites {
  const targets: Array<{ index: number; table: string; cls: string; column?: string | undefined }> = [];
  const clear = text.search(/UPDATE parcel_buildings SET is_primary = false/);
  const upsert = text.search(/INSERT INTO parcel_buildings[\s\S]*?ON CONFLICT/);
  if (clear >= 0) targets.push({ index: clear, table: WRITE_TABLE, cls: E1_CLASS, column: 'is_primary' });
  if (upsert >= 0) targets.push({ index: upsert, table: WRITE_TABLE, cls: E2_CLASS });
  // `flushInsertBatch` is DEFINED above the PostGIS block but INVOKED after the clear; the
  // invocation is the order that matters, so a call site outranks the definition.
  const call = text.search(/await flushInsertBatch\(pool, insertParams, insertValues\)/);
  if (call >= 0) { const u = targets.find((t) => t.cls === E2_CLASS); if (u) u.index = call; }
  return { targets: targets.sort((a, b) => a.index - b.index).map(({ table, cls, column }) => ({ table, cls, column })) };
}

/** F2 subject: the guard set + the SET list + the guarded-upsert SQL. */
interface GuardInput { guardColumns: string[]; setColumns: string[]; sql: string }

function detectGuardFence(i: GuardInput): string[] {
  const v: string[] = [];
  const sorted = [...i.guardColumns].sort();
  if (JSON.stringify(sorted) !== JSON.stringify([...GUARD_COLUMNS].sort())) v.push(`guard columns are [${i.guardColumns.join(', ')}], not exactly [${GUARD_COLUMNS.join(', ')}]`);
  if (i.guardColumns.includes(RUN_CLOCK_COLUMN)) v.push(`${RUN_CLOCK_COLUMN} is in the guard — EXCLUDED.linked_at = RUN_AT is distinct on EVERY run (the 520,492-row rewrite)`);
  if (!i.setColumns.includes(RUN_CLOCK_COLUMN)) v.push(`${RUN_CLOCK_COLUMN} is not in the SET list — a changed link would keep a stale watermark`);
  if (!/IS DISTINCT FROM/.test(i.sql)) v.push('no IS DISTINCT FROM in the upsert — the guard is gone (b36d0596\'s pre-state: ~479K rows updated per run)');
  const guardedInSql = [...i.sql.matchAll(/parcel_buildings\.(\w+)\s+IS DISTINCT FROM\s+EXCLUDED\.(\w+)/g)].map((m) => m[1] as string);
  if (guardedInSql.length > 0 && guardedInSql.includes(RUN_CLOCK_COLUMN)) v.push(`the generated WHERE guards ${RUN_CLOCK_COLUMN}`);
  return v;
}

/** The CURRENT flushInsertBatch SQL, parsed into the F2 subject. */
function guardFromSource(text: string): GuardInput {
  const m = /INSERT INTO parcel_buildings[\s\S]*?(?:`|;)/.exec(text);
  const sql = m ? m[0] : '';
  const guardColumns = [...sql.matchAll(/parcel_buildings\.(\w+)\s+IS DISTINCT FROM/g)].map((x) => x[1] as string);
  const setColumns = [...sql.matchAll(/^\s*(\w+)\s*=\s*EXCLUDED\.\w+/gm)].map((x) => x[1] as string);
  return { guardColumns, setColumns, sql };
}

/** F3 subject: the retraction statement + whether it is gated on full mode. */
interface RetractionInput { deleteSql: string; fullOnly: boolean }
const BASE_FILTER = 'centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL';

function detectRetractionFence(i: RetractionInput): string[] {
  const v: string[] = [];
  if (!/DELETE FROM parcel_buildings/i.test(i.deleteSql)) { v.push('no FULL-mode retraction at all — ghost links survive a re-link (b16c036d)'); return v; }
  if (!/WHERE\s+parcel_id\s+IN\s*\(\s*SELECT\s+id\s+FROM\s+parcels\s+WHERE/i.test(i.deleteSql)) v.push('the mass-DELETE is not scoped to the parcels being re-evaluated (an unscoped DELETE empties the junction for parcels the run never revisits)');
  if (!i.deleteSql.includes(BASE_FILTER) && !/centroid_lat IS NOT NULL/.test(i.deleteSql)) v.push('the retraction scope is not the baseFilter (centroid_lat/centroid_lng IS NOT NULL) — W1 and the work set diverge');
  if (!i.fullOnly) v.push('the retraction is not gated on FULL mode — an incremental run would delete 520,492 rows and rebuild only the 1,395 tail');
  return v;
}

function retractionFromSource(text: string): RetractionInput {
  // The PostGIS DELETE interpolates `${baseFilter}`; resolve it to the literal the file defines so the
  // detector reads the SCOPE, not the template.
  const def = /const baseFilter = '([^']+)'/.exec(text);
  const resolved = def ? text.replace(/\$\{baseFilter\}/g, def[1] as string) : text;
  const m = /if \(FULL_MODE\) \{[\s\S]*?DELETE FROM parcel_buildings[^`]*/.exec(resolved);
  if (m) return { deleteSql: m[0], fullOnly: true };
  const bare = /DELETE FROM parcel_buildings[^`]*/.exec(resolved);
  return { deleteSql: bare ? bare[0] : '', fullOnly: false };
}

/** F4 subject: the nearest-fallback SQL + where its bound comes from. */
interface NearestInput { sql: string; boundSource: string }

function detectNearestCapFence(i: NearestInput): string[] {
  const v: string[] = [];
  if (!/ST_DWithin\s*\(/i.test(i.sql)) { v.push('no ST_DWithin nearest fallback'); return v; }
  const expand = i.sql.search(/ST_Expand\s*\(/i);
  const dwithin = i.sql.search(/ST_DWithin\s*\(/i);
  if (expand < 0) v.push('no bbox prefilter (bf.geom && ST_Expand) — the geography distance runs a nested loop over all footprints (tasks/lessons.md, B-10)');
  else if (expand > dwithin) v.push('ST_Expand prefilter comes AFTER ST_DWithin — B-10 ordering lost');
  if (/ST_DWithin\s*\([^)]*,\s*50\s*\)/i.test(i.sql)) v.push('the 50 m cap is a literal in the SQL, not the T3 variable (d324ab27 externalised it)');
  if (!/massing_nearest_max_distance_m/.test(i.boundSource)) v.push('the distance bound is not sourced from massing_nearest_max_distance_m');
  if (/\b(NEAREST_MAX_DISTANCE_M|nearestMaxDistanceM)\s*=\s*50\b/.test(i.boundSource)) v.push('the bound is re-hardcoded to 50');
  return v;
}

function nearestFromSource(text: string): NearestInput {
  const m = /SELECT DISTINCT ON \(p\.id\)[\s\S]*?ST_Distance[^`]*/.exec(text);
  return { sql: m ? m[0] : '', boundSource: text };
}

// ===========================================================================
// 55-A — the hard per-conversion gate (44)
// ===========================================================================

describe('55-A — the hard per-conversion gate (44, k=PER_STEP)', () => {
  // ── A.3 Interpretation (§3.4–§3.4b) — the notes.json seven (vacuity risk: a REAL notes file) ──

  it('#30 Cap of 12 prose entries — add a 13th → build fails', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(d.interpretation, 'interpretation must be the {file, entries} object, not "none" — this step has MORE genuine interpretation content than either prior pilot (b16c036 rationale, /78000, the tail)').not.toBe('none');
    const interp = d.interpretation as { file: string; entries: number };
    const entries = notesEntries(notes);
    expect(entries.length, 'prose entries across the capped blocks').toBeLessThanOrEqual(NOTES_CAP);
    expect(entries.length, 'interpretation.entries must equal the real prose count').toBe(interp.entries);
    expect(() => validateDescriptor({ ...d, interpretation: { ...interp, entries: NOTES_CAP + 1 } })).toThrow(/interpretation/);
  });

  it('#31 Exactly two legal resolutions — promote or delete; no overflow file', () => {
    const d = loadDescriptor();
    loadNotes();
    expect((d.interpretation as { file: string }).file).toBe(path.basename(NOTES_REL));
    const dir = fs.readdirSync(abs(path.dirname(STEP_REL)));
    const strays = dir.filter((f) => f.startsWith('link-massing') && !['link-massing.js', 'link-massing.descriptor.json', 'link-massing.notes.json'].includes(f));
    expect(strays, 'an overflow / unknown <slug>.* sibling').toEqual([]);
    expect(Object.keys(loadNotes()).some((k) => /overflow/i.test(k)), 'an overflow block inside notes.json').toBe(false);
  });

  it('#33 `blind_spots[].detected_by` names a check that exists', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    const ids = new Set(d.checks.map((c) => c.id));
    const blind = (notes.blind_spots as NotesEntry[] | undefined) ?? [];
    expect(blind.length, 'A-6 named at least one link-level blind spot (0/42 sanity rules touch parcel_buildings) — it must be recorded').toBeGreaterThan(0);
    for (const b of blind) {
      expect(typeof b.detected_by, 'every blind spot declares detected_by').toBe('string');
      if (!isNone(b.detected_by)) expect(ids.has(b.detected_by as string), `detected_by "${b.detected_by}" is not a declared check`).toBe(true);
    }
    expect(ids.has('no_such_check'), 'negative control').toBe(false);
  });

  it('#34 `detected_by:"none"` is permitted but counted', () => {
    const notes = loadNotes();
    const blind = (notes.blind_spots as NotesEntry[] | undefined) ?? [];
    const open = blind.filter((b) => isNone(b.detected_by)).length;
    expect(notes.counts?.open_blind_spots, 'notes.counts.open_blind_spots must equal the real count').toBe(open);
    const plusOne = [...blind, { what: 'x', detected_by: 'none' }].filter((b) => isNone(b.detected_by)).length;
    expect(plusOne).toBe(open + 1);
  });

  it('#35 Every prose entry carries `measured{value,date,query}`', () => {
    const notes = loadNotes();
    const entries = notesEntries(notes);
    expect(entries.length, 'a notes file with zero prose entries proves nothing').toBeGreaterThan(0);
    for (const { block, entry } of entries) {
      if (NOTES_MEASURED_EXEMPT.has(block)) continue;
      const m = entry.measured;
      expect(m, `${block} entry has no measured{}`).toBeDefined();
      expect(m && 'value' in m, `${block} entry measured.value missing`).toBe(true);
      expect(typeof m?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(m.date), `${block} entry measured.date not ISO`).toBe(true);
      expect(typeof m?.query === 'string' && m.query.length > 0, `${block} entry measured.query missing`).toBe(true);
    }
  });

  it('#37 Unpromoted `suspicious_if` entries are counted', () => {
    const notes = loadNotes();
    const d = loadDescriptor();
    const ids = new Set(d.checks.map((c) => c.id));
    const sus = (notes.suspicious_if as NotesEntry[] | undefined) ?? [];
    const unpromoted = sus.filter((s) => !s.check || isNone(s.check) || !ids.has(s.check)).length;
    expect(notes.counts?.unpromoted_suspicious_if, 'notes.counts.unpromoted_suspicious_if must equal the real count').toBe(unpromoted);
    const plusOne = [...sus, { signal: 'x', check: 'none' }].filter((s) => !s.check || isNone(s.check) || !ids.has(s.check)).length;
    expect(plusOne).toBe(unpromoted + 1);
  });

  it('#38 `review_notes` ship to the reviewer prompt automatically', () => {
    loadNotes();
    for (const cli of REVIEW_CLIS) {
      const src = stripComments(readText(cli));
      expect(src.includes('.notes.json'), `${cli} does not read the sibling notes file`).toBe(true);
      expect(src.includes('review_notes'), `${cli} does not inject review_notes into the prompt`).toBe(true);
    }
  });

  // ── A.12 Conversion workflow (§14) ─────────────────────────────────────────

  it('#148 `deviations[]` and `fences[]` are required; empty must be an explicit `[]` — and the adjudicated fix-commits are fenced', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(Array.isArray(d.deviations), 'descriptor.deviations must be an explicit array').toBe(true);
    expect(Array.isArray(notes.fences), 'notes.fences must be an explicit array').toBe(true);
    const fences = notes.fences as NonNullable<Notes['fences']>;
    const shas = fences.map((f) => f.commit.slice(0, 8));
    for (const c of FENCE_COMMITS) expect(shas, `fence ${c} (adjudicated from the 30 fix( corpus) has no notes.fences entry`).toContain(c);
    for (const f of fences) {
      for (const k of ['const', 'value', 'incident', 'commit', 'lock_test'] as const) expect(k in f, `fence ${f.commit} lacks ${k}`).toBe(true);
      expect(/^[0-9a-f]{7,40}$/.test(f.commit), `fence commit "${f.commit}" is not a SHA`).toBe(true);
      expect(git(['cat-file', '-t', f.commit]), `fence commit ${f.commit} is not in this repo`).toBe('commit');
    }
  });

  it('#149 Gate 0 — script #3 adds zero new bespoke runner paths (no link_massing / parcel_buildings branch in scripts/lib/step or pipeline.js)', () => {
    computeSource();
    for (const rel of [STALENESS_REL, WRITE_REL, INDEX_REL]) artifact(rel, 'Fold B: the LINK growth is generic (runLinkPhase, ordered writes, composite key, tri_state)');
    expect(typeof loadLib(INDEX_REL).runLinkPhase, 'LG-1: index.js exports runLinkPhase (A-1 option (a))').toBe('function');
    const lib = fs.readdirSync(abs('scripts/lib/step')).filter((f) => f.endsWith('.js')).map((f) => `scripts/lib/step/${f}`);
    lib.push('scripts/lib/pipeline.js');
    for (const f of lib) {
      const code = stripComments(fs.readFileSync(abs(f), 'utf8'));
      expect(/link[_-]massing|LINK_MASSING|parcel_buildings|building_footprints|massing-full-gate/.test(code), `${f} carries a step-specific code path`).toBe(false);
    }
  });

  it('#150 Gate 1 — the old script is reproducible against itself (two OLD captures per invocation, identical normalised, incl. the projected junction state)', () => {
    const docs = goldenDocs();
    for (const inv of INVOCATIONS) artifact(`${GOLDEN_DIR_REL}/pre/${inv.name}.json`, `OLD capture for ${inv.name} (commit 5, three invocations)`);
    for (const inv of INVOCATIONS) {
      const old = docsFor(docs, inv).filter(isOld);
      expect(old.length, `${inv.name}: need ≥2 OLD captures (run 1 + run 2), found ${old.length}`).toBeGreaterThanOrEqual(2);
      for (const o of old) {
        const ts = junctionState(o);
        expect(ts.row_count, `${o.file}: parcel_buildings count (invariant 2: 520,492 exact on an incremental rerun / after a FULL relink)`).toBe(LIVE_ROWS);
        expect(typeof ts.content_hash, `${o.file}: projected + key-ordered content hash`).toBe('string');
        expect(invariant(o, 'parcel_buildings_count')).toBe(LIVE_ROWS);
        expect(invariant(o, 'parcel_buildings_duplicate_keys'), 'invariant 1: (parcel_id, building_id) unique BY COUNT').toBe(0);
        expect(invariant(o, 'parcel_buildings_multi_primary_parcels'), 'invariant 1: exactly-one primary BY COUNT').toBe(0);
        expect(invariant(o, 'parcels_with_centroid'), 'invariant 3: a stable denominator').toBe(LIVE_PARCELS_WITH_CENTROID);
        expect(invariant(o, 'link_rate_pct'), 'invariant 3: link_rate ≥ T4').toBeGreaterThanOrEqual(50);
        expect(invariant(o, 'confidence_off_domain'), 'invariant 4: confidence ∈ {0.95, 0.60} only').toBe(0);
      }
      for (const o of old.slice(1)) {
        expect(o.normalised, `${inv.name}: ${o.file} differs from ${old[0]?.file} modulo declared normalisations`).toEqual(old[0]?.normalised);
        expect(o.table_state, `${inv.name}: ${o.file} table_state differs from ${old[0]?.file}`).toEqual(old[0]?.table_state);
      }
    }
  });

  it('#151 The non-determinism inventory is declared before the first diff (git order)', () => {
    goldenDocs();
    const report = readText(REPORT_REL);
    reportTable(report, [['key', /key|field|source/], ['disposition', /disposition/]]);
    const harnessAt = firstCommitTime(GOLDEN_HARNESS_REL, 'VOLATILE_KEYS');
    const reportAt = firstCommitTime(REPORT_REL, 'Non-determinism inventory');
    const inventoryAt = Math.min(...[harnessAt, reportAt].filter((n) => n > 0));
    const goldenAt = firstCommitTime(GOLDEN_DIR_REL);
    expect(reportAt, `${REPORT_REL} has no committed "Non-determinism inventory" section`).toBeGreaterThan(0);
    expect(goldenAt, `${GOLDEN_DIR_REL} is not committed`).toBeGreaterThan(0);
    expect(inventoryAt, 'inventory committed AFTER the first golden capture').toBeLessThanOrEqual(goldenAt);
  });

  it('#6b Every plan item declares a done-test (§12.16) — each of the nine commits (8 = three peels) names one', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['commit', /commit/], ['done-test', /done.?test|test/]]);
    expect(table.rows.length, 'nine commits').toBeGreaterThanOrEqual(9);
    for (const r of table.rows) {
      const t = r[col('done-test')] ?? '';
      expect(t.length > 0 && !/^(none|n\/a|—|-)\b/i.test(t), `commit "${r[col('commit')]}" has no done-test`).toBe(true);
    }
  });

  it('#6a Every claim covering a TABLE declares that table\'s row count (Appendix H) — pipeline_runs + parcels + building_footprints + parcel_buildings', () => {
    const d = loadDescriptor();
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['table', /^table/], ['rows', /rows?\b/]]);
    const touched = new Set(['pipeline_runs', WRITE_TABLE, 'parcels', 'building_footprints', ...d.inputs.reads.tables.map((t) => t.table), ...writes(d).map((w) => w.table)]);
    for (const t of touched) {
      const row = table.rows.find((r) => (r[col('table')] ?? '') === t);
      expect(row, `boundary freeze has no row for table ${t}`).toBeDefined();
      expect(/^\d[\d,]*$/.test((row?.[col('rows')] ?? '').replace(/\s/g, '')), `table ${t} has no integer row count`).toBe(true);
    }
    const junction = table.rows.find((r) => (r[col('table')] ?? '') === WRITE_TABLE);
    expect(Number((junction?.[col('rows')] ?? '').replace(/[,\s]/g, '')), `parcel_buildings row count in the freeze (measured ${LIVE_ROWS})`).toBe(LIVE_ROWS);
    // A-7 / Fold A: the FK pair + the 2 extra btree indexes are part of the freeze.
    for (const name of ['parcel_buildings_parcel_id_fkey', 'parcel_buildings_building_id_fkey', 'idx_parcel_buildings_parcel', 'idx_parcel_buildings_building']) {
      expect(report.includes(name), `the boundary freeze does not name ${name} (A-7)`).toBe(true);
    }
  });

  it('#151a The non-determinism disposition vocabulary is CLOSED — and the junction\'s id / linked_at / count are dispositioned', () => {
    const docs = goldenDocs();
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['key', /key|field|source/], ['disposition', /disposition/]]);
    for (const r of table.rows) {
      expect(NONDET_DISPOSITIONS, `disposition "${r[col('disposition')]}" for ${r[col('key')]} is outside the closed vocabulary`).toContain(r[col('disposition')]);
    }
    const declared = table.rows.map((r) => r[col('key')] ?? '').join(' · ');
    for (const doc of docs) for (const k of doc.nondeterminism) expect(declared.includes(k), `${doc.file} stripped "${k}", which the inventory never declared`).toBe(true);
    for (const k of [`table:${WRITE_TABLE}.id`, `table:${WRITE_TABLE}.${RUN_CLOCK_COLUMN}`, `table:${WRITE_TABLE}.count()`]) {
      expect(declared.replace(/\*/g, '').includes(k), `the inventory does not disposition ${k} (D-18: id is a bigserial, linked_at is RUN_AT — both change on a FULL relink with identical logical output)`).toBe(true);
    }
  });

  it('#152 Gate 2 — Intent Ledger 100% dispositioned, no row `unknown`; every fence SHA present', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, INTENT_LEDGER_COLS);
    expect(table.rows.length, 'an Intent Ledger over a 30-fix( corpus with ~12 named fence candidates').toBeGreaterThanOrEqual(FENCE_COMMITS.length);
    for (const r of table.rows) {
      const disp = (r[col('disposition')] ?? '').toLowerCase();
      expect(LEDGER_DISPOSITIONS.some((x) => disp.startsWith(x)), `"${r[col('construct')]}" disposition "${disp}" is unknown / outside the vocabulary`).toBe(true);
    }
    const ledgerText = table.rows.map((r) => Object.values(r).join(' ')).join('\n');
    for (const c of FENCE_COMMITS) expect(ledgerText.includes(c), `fence commit ${c} has no Intent Ledger row`).toBe(true);
  });

  it('#153 Every `knowingly-retired` row names a human approver — the JS fallback path (A-8 OVERRIDE) and the parallel-boolean cascade are the planned retirements', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, INTENT_LEDGER_COLS);
    const retired = table.rows.filter((x) => /^(proposed\s+)?knowingly-retired/i.test(x[col('disposition')] ?? ''));
    expect(retired.length, 'the ledger names its retirements (A-8: the JS fallback path; D-3: massingAuditRows.some(…) cascade; S11: the 4-form slug array)').toBeGreaterThan(0);
    expect(retired.some((r) => /fallback|haversine|grid|turf|js path/i.test(r[col('construct')] ?? '')), 'A-8 OVERRIDE: the JS fallback path retirement must be a ledger row, with U-5 evidence').toBe(true);
    for (const r of retired) {
      const approver = r[col('adjudicated by')] ?? '';
      expect(approver.length > 0 && !/agent|claude|gemini|deepseek|none|awaiting|pending|tbd/i.test(approver), `retired "${r[col('construct')]}" has no HUMAN approver (§7.1)`).toBe(true);
    }
  });

  it('#154 Gate 3 — a peel commit contains only that peel', () => {
    computeSource();
    const log = git(['log', '--format=%H%x1f%s', '--', '.']).split(/\r?\n/).filter(Boolean);
    const peels = log.filter((l) => /122_step_optimization/.test(l) && /pilot 3 peel [abc]\b/i.test(l));
    expect(peels.length, 'three peel commits (8a gating · 8b verdict/audit · 8c thresholds/checks)').toBeGreaterThanOrEqual(3);
    const allowed = (f: string): boolean =>
      f === COMPUTE_REL || f === DESCRIPTOR_REL || f === NOTES_REL || f.startsWith('scripts/lib/step/') ||
      f === GATE_LIB_REL || f === SEED_REL ||
      f.startsWith('scripts/steps/_schema/') || f.startsWith(STEP_DIR_REL) || f === REPORT_REL || f.startsWith(GOLDEN_DIR_REL) ||
      f === 'docs/reports/generated/122-vocabulary.md' ||
      f === 'docs/reports/review_followups.md' || f === 'docs/reports/defect-ledger.md' ||
      // 8c wires T4–T7 into GROUPS — the four-surface battery demands the admin card entry.
      f === 'src/features/admin-controls/components/GlobalConfigCard.tsx' ||
      /^src\/tests\/(link-massing\.infra|massing\.logic|massing-full-gate\.logic|pipeline-sdk\.logic|chain\.logic|pipeline-logic-vars-coercion\.infra|pipeline-advisory-lock\.infra|step-conformance\.infra|step-library\.logic|admin\.ui|control-panel\.logic)\.test\.tsx?$/.test(f) ||
      f === 'docs/specs/01-pipeline/122_pipeline_step_optimization.md' || f === 'docs/specs/01-pipeline/56_source_massing.md' || f === 'docs/specs/01-pipeline/60_shared_steps.md';
    for (const p of peels) {
      const [hash, subject] = p.split('\x1f') as [string, string];
      const files = git(['show', '--name-only', '--format=', hash]).split(/\r?\n/).filter(Boolean).map((f) => f.replace(/\\/g, '/'));
      const foreign = files.filter((f) => !allowed(f));
      expect(foreign, `${hash.slice(0, 8)} "${subject}" touches non-peel files`).toEqual([]);
      expect(files.includes(STEP_REL), `${hash.slice(0, 8)} edits the frozen-shape step file`).toBe(false);
    }
  });

  it('#155 Gate 4c — line accounting = 100% of the frozen 740 lines; an unassigned line blocks', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['lines', /^lines?$|line range|range/], ['category', /category|owner|disposition/]]);
    expect(report.includes(`${FROZEN_LINES} lines`), `the report must state the frozen line count ("${FROZEN_LINES} lines")`).toBe(true);
    const n = FROZEN_LINES;
    const covered = new Array<number>(n + 1).fill(0);
    for (const r of table.rows) {
      const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec((r[col('lines')] ?? '').trim());
      expect(m, `unparseable line range "${r[col('lines')]}"`).not.toBeNull();
      const a = Number((m as RegExpExecArray)[1]);
      const b = Number((m as RegExpExecArray)[2] ?? a);
      expect(b, `line range ${a}-${b} exceeds the frozen ${n}`).toBeLessThanOrEqual(n);
      expect(LINE_CATEGORIES, `category "${r[col('category')]}" for ${a}-${b}`).toContain((r[col('category')] ?? '').toLowerCase());
      for (let i = a; i <= b; i++) covered[i] = (covered[i] ?? 0) + 1;
    }
    const unassigned: number[] = [];
    const overlapping: number[] = [];
    for (let i = 1; i <= n; i++) {
      if (covered[i] === 0) unassigned.push(i);
      if ((covered[i] ?? 0) > 1) overlapping.push(i);
    }
    expect(unassigned, `unassigned lines of ${n}`).toEqual([]);
    expect(overlapping, 'lines assigned twice').toEqual([]);
    // A-8 OVERRIDE: the JS fallback path (~36% of the file) must be accounted as dead (proved), never as compute.
    const dead = table.rows.filter((r) => /^dead/i.test(r[col('category')] ?? ''));
    expect(dead.length, 'the retired JS fallback path must appear as dead (proved) ranges').toBeGreaterThan(0);
  });

  it('#156 Gate 4d — every fence has a lock test proven in both directions', () => {
    const notes = loadNotes();
    const fences = (notes.fences ?? []) as NonNullable<Notes['fences']>;
    expect(fences.length).toBeGreaterThanOrEqual(FENCE_COMMITS.length);
    for (const f of fences) expect(f.lock_test, `fence ${f.commit} names the wrong lock test`).toBe(THIS_FILE_REL);
    const self = fs.readFileSync(abs(THIS_FILE_REL), 'utf8');
    expect(self.includes('— present in the converted step'), 'the present-direction lock').toBe(true);
    expect(self.includes('— reversion is detectable'), 'the reversion-direction lock').toBe(true);
    for (const detect of [detectPrimaryClearFence, detectGuardFence, detectRetractionFence, detectNearestCapFence]) expect(typeof detect).toBe('function');
  });

  it('#157 Gate 4f — dead code proved dead by instrumentation, never by reading (U-5: buildings_indexed = 0, grid_cells = "N/A (PostGIS)" on every recorded run)', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['lines', /^lines?$|line range|range/], ['category', /category|owner|disposition/], ['evidence', /evidence|proof|run/]]);
    for (const r of table.rows.filter((x) => /^dead/i.test(x[col('category')] ?? ''))) {
      expect(/zero[- ]hit|0 hits?|run(_id| id|s? #?\d)|instrument|buildings_indexed|pipeline_runs/i.test(r[col('evidence')] ?? ''), `dead range ${r[col('lines')]} has no zero-hit run record`).toBe(true);
    }
  });

  it('#158 Gate 5 — the old script is deleted or dated-ticketed (same file, two commits: no pipeline.run(), path registered)', () => {
    computeSource();
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(/pipeline\.run\s*\(/.test(src), `${STEP_REL} still carries the island (pipeline.run)`).toBe(false);
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] };
    expect(converted.converted, `${CONVERTED_REL} does not register ${STEP_REL}`).toContain(STEP_REL);
  });

  it('#159 Idempotence-successor run is a supplement, never the sole gate (old/new pair per invocation ×3, pre/post junction state, one forced FULL)', () => {
    const docs = goldenDocs();
    artifact(`${GOLDEN_DIR_REL}/post`, 'the NEW side of the differential (commit 9)');
    for (const inv of INVOCATIONS) {
      const mine = docsFor(docs, inv);
      const old = mine.filter(isOld);
      const neu = mine.filter(isNew);
      expect(old.length, `${inv.name}: no OLD capture`).toBeGreaterThan(0);
      expect(neu.length, `${inv.name}: no NEW capture (post/)`).toBeGreaterThan(0);
      for (const side of ['pre', 'post']) {
        const p = `${GOLDEN_DIR_REL}/${side}/${inv.name}.json`;
        artifact(p, `${side}-conversion capture for ${inv.name}`);
        junctionState({ ...(JSON.parse(fs.readFileSync(abs(p), 'utf8')) as GoldenDoc), file: p });
      }
    }
    // G8(c) / D-19: exactly the budgeted forced-FULL half — declared, with the 520,492-row result pinned.
    const forced = docs.filter(isForcedFull);
    expect(forced.length, `no forced-FULL capture (${FORCE_FULL_ENV}=1) — the W1 retraction + E1/E2 write path is never exercised (finding 5 / D-19)`).toBeGreaterThan(0);
    for (const f of forced) expect(junctionState(f).row_count, `${f.file}: a forced FULL relink must rebuild exactly ${LIVE_ROWS} rows (A-6: a FULL relink moves none of the 7 numbers)`).toBe(LIVE_ROWS);
  });

  it('#162 The same pass never both discovers and retires a fence', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, INTENT_LEDGER_COLS);
    for (const r of table.rows) {
      const discoverer = (r[col('discovered by')] ?? '').trim().toLowerCase();
      const adjudicator = (r[col('adjudicated by')] ?? '').trim().toLowerCase();
      expect(discoverer.length, `"${r[col('construct')]}" names no discoverer`).toBeGreaterThan(0);
      expect(adjudicator.length > 0 && !/awaiting|pending|tbd/.test(adjudicator), `"${r[col('construct')]}" names no adjudicator yet`).toBe(true);
      expect(discoverer === adjudicator, `"${r[col('construct')]}" was discovered and dispositioned by the same pass (${discoverer})`).toBe(false);
    }
  });

  // ── A.13 Step testing (§15) ─────────────────────────────────────────────────

  it('#163 Tie-breaker 1 — a step test that survives swapping its compute is a runner test in the wrong place', async () => {
    const d = loadDescriptor();
    const stub = loadComputeStub();
    for (const c of d.checks.filter((x) => x.severity !== 'INFO')) {
      let survived: boolean;
      try {
        const { healthy, sabotaged } = await mustFailPair(stub, d, c);
        survived = healthy === 'PASS' && sabotaged === c.severity;
      } catch {
        survived = false;
      }
      expect(survived, `check ${c.id}: the must-fail pair SURVIVED a compute swap`).toBe(false);
    }
  });

  it('#164 Logic tests must not run in production', () => {
    const compute = stripComments(computeSource());
    const step = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    for (const [name, src] of [[COMPUTE_REL, compute], [STEP_REL, step]] as const) {
      expect(/vitest|src\/tests|\.test\.|SABOTAGE|healthyWorld/.test(src), `${name} references the logic-test path`).toBe(false);
    }
    const pkg = JSON.parse(fs.readFileSync(abs('package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(/scripts\//.test(pkg.scripts.test ?? ''), 'npm test must not point at production scripts').toBe(false);
  });

  it('#165 Every declared check has a must-fail fixture (WARN/FAIL: healthy PASS → sabotaged = severity; INFO: INFO both ways)', async () => {
    const d = loadDescriptor();
    const compute = loadCompute();
    const missing = d.checks.filter((c) => c.severity !== 'INFO' && !sabotageFor(c)).map((c) => c.id);
    expect(missing, 'declared WARN/FAIL checks with no sabotage in the must-fail matrix').toEqual([]);
    for (const c of d.checks) {
      if (c.severity === 'INFO') {
        const healthy = await runCompute(compute, d, healthyWorld());
        expect(healthy[c.id], `INFO check ${c.id}: reported and rendered INFO`).toBe('INFO');
        continue;
      }
      const { healthy, sabotaged } = await mustFailPair(compute, d, c);
      expect(healthy, `check ${c.id}: healthy fixture (the 1,395-tail incremental steady state) should PASS`).toBe('PASS');
      expect(sabotaged, `check ${c.id}: its negative fixture PASSES — the check never looked`).toBe(c.severity);
    }
  });

  it('#167 Banned anti-pattern — no step test asserts ledger, lock or transaction behaviour', () => {
    loadDescriptor();
    const banned = ['withAdvisory' + 'Lock(', 'with' + 'Transaction(', 'openLedger' + 'Row', 'finalizeLedger' + 'Row', 'pg_advisory_' + 'xact_lock', 'INSERT INTO ' + 'pipeline_runs', 'finalizeStranded' + 'Run'];
    for (const f of stepTestDirFiles().filter((f) => /\.test\.ts$/.test(f))) {
      const src = stripComments(fs.readFileSync(abs(f), 'utf8'));
      for (const tok of banned) expect(src.includes(tok), `${f} asserts runner behaviour (${tok})`).toBe(false);
    }
  });

  it('#169 Rung 1 inline-WKT is non-negotiable for every azimuth / KNN / area step — this IS a KNN step (nearest fallback): the compute builds ST_* SQL and a rung-1 inline-WKT test exists', () => {
    const src = stripComments(computeSource());
    const spatial = /\bST_\w+|<->|\bknn\b/i.test(src);
    expect(spatial, 'A-2 option 2: buildMatchSql is the spatial predicate (ST_Contains + ST_DWithin) — the compute IS spatial').toBe(true);
    expect(stepTestDirFiles().some((f) => /rung1|inline-wkt/i.test(f)), 'a spatial compute with no rung-1 inline-WKT test under the step dir').toBe(true);
  });

  it('#170 Rung 2 requires rung 1 to exist first', () => {
    computeSource();
    const rung2 = stepTestDirFiles().filter((f) => /rung2|approved/i.test(f));
    if (rung2.length > 0) expect(stepTestDirFiles().some((f) => /rung1|inline-wkt/i.test(f)), 'rung-2 fixtures approved with no rung 1').toBe(true);
    else expect(rung2).toEqual([]);
  });

  it('#171 An approving commit states why each value is right', () => {
    computeSource();
    for (const f of stepTestDirFiles().filter((x) => /rung2|approved/i.test(x))) {
      const body = git(['log', '--format=%B', '--', f]);
      expect(/why|because/i.test(body), `${f} was approved by a commit that does not say why`).toBe(true);
    }
  });

  it('#172 Metamorphic invariants hold — a spatial compute ships a metamorphic suite (predicate flip b16c036: containment is asymmetric)', () => {
    const src = stripComments(computeSource());
    const spatial = /\bST_\w+/i.test(src);
    expect(spatial).toBe(true);
    expect(stepTestDirFiles().some((f) => /metamorphic/i.test(f)), 'a spatial compute with no metamorphic suite').toBe(true);
  });

  it('#173 Every golden snapshot query has an explicit `ORDER BY` — incl. the projected junction hash ordered by the declared key', () => {
    goldenDocs();
    const src = fs.readFileSync(abs(GOLDEN_HARNESS_REL), 'utf8');
    expect(/table_state/.test(src), `${GOLDEN_HARNESS_REL} captures no table_state`).toBe(true);
    expect(/table-order|order_by|orderBy/.test(src), 'A-4: the harness accepts a declared-key ordering (--table-order / descriptor-derived), never the pk').toBe(true);
    const selects = [...src.matchAll(/`([^`]*\bSELECT\b[^`]*)`/gi)].map((m) => m[1] as string);
    expect(selects.length).toBeGreaterThan(0);
    for (const q of selects) {
      if (!/\bFROM\b/i.test(q)) continue;
      if (/\bstring_agg\s*\(/i.test(q)) { expect(stringAggOrdered(q), `unordered content-hash aggregate: ${q.replace(/\s+/g, ' ').trim()}`).toBe(true); continue; }
      if (/\bmax\(|\bcount\(/i.test(q)) continue;
      expect(/\bORDER BY\b/i.test(q), `unordered golden query: ${q.replace(/\s+/g, ' ').trim()}`).toBe(true);
    }
  });

  it('#174 pgTAP carries schema assertions only', () => {
    loadDescriptor();
    const sql = walk(abs('src/tests')).filter((p) => p.endsWith('.sql') && /link[-_]massing|parcel_buildings/.test(fs.readFileSync(p, 'utf8')));
    for (const p of sql) {
      const body = fs.readFileSync(p, 'utf8');
      const calls = [...body.matchAll(/\b(is|isnt|cmp_ok|results_eq|row_eq)\s*\(/g)];
      expect(calls.length, `${path.relative(REPO_ROOT, p)} carries value assertions in pgTAP`).toBe(0);
    }
    expect(sql.every((p) => p.endsWith('.sql')), 'conditionally vacuous when no pgTAP file names this step, executed').toBe(true);
  });

  it('#176 Generator correctness is tested per branch — E1 UPDATE · E2 insert / composite conflict-target / distinct-noop / full-only retraction, over the SQL write.js generates', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|ON CONFLICT)\b/i.test(src), 'hand-written write SQL in the compute — §1.4: the class SELECTS the generated SQL').toBe(false);
    const { e1, e2 } = writeTargets(d);
    const sqlE1 = generatedSqlFor(d, e1);
    expect(/UPDATE\s+parcel_buildings\s+SET\s+is_primary\s*=\s*false/i.test(sqlE1), 'E1: the set-based is_primary clear').toBe(true);
    expect(/WHERE[\s\S]*parcel_id\s*=\s*ANY/i.test(sqlE1), 'E1: scoped to the batch\'s parcels').toBe(true);
    const sqlE2 = generatedSqlFor(d, e2);
    expect(/INSERT INTO\s+parcel_buildings/i.test(sqlE2), 'branch:insert').toBe(true);
    expect(/ON CONFLICT\s*\(\s*parcel_id\s*,\s*building_id\s*\)\s*DO UPDATE/i.test(sqlE2), 'branch:conflict-target — the COMPOSITE key (LG-2)').toBe(true);
    expect(/DO UPDATE SET[\s\S]*linked_at\s*=\s*EXCLUDED\.linked_at/i.test(sqlE2), 'branch:update — linked_at IS in the SET list').toBe(true);
    expect(/WHERE[\s\S]*IS DISTINCT FROM/i.test(sqlE2), 'branch:distinct-noop').toBe(true);
    expect(/DELETE FROM\s+parcel_buildings/i.test(sqlE2), 'W1: the retract:"all" statement is generated for E2').toBe(true);
    expect(/<>\s*ALL/i.test(sqlE2), 'NO departure delete — this is retract:"all", not class B (finding 3)').toBe(false);
    // A-7: the generated column list is exhaustive — the never-written DB defaults ('other', 'polygon', 0.85) must not be adopted silently.
    const insertCols = /INSERT INTO\s+parcel_buildings\s*\(([^)]*)\)/i.exec(sqlE2)?.[1]?.split(',').map((s) => s.trim()) ?? [];
    expect(insertCols.sort()).toEqual([...WRITE_COLUMNS].sort());
  });

  it('#180 Shapefile fixtures — N/A by subject: this step reads no external (a pure DB→DB join); the compute requires no parser', () => {
    const d = loadDescriptor();
    expect(d.inputs.reads.externals, 'a LINK has no externals (finding 1: isIngestStep must NOT claim it)').toEqual([]);
    expect(/require\(['"](shapefile|node-stream-zip)['"]\)/.test(stripComments(computeSource())), 'the compute parses shapefiles').toBe(false);
    expect(stepTestDirFiles().some((x) => /\.(shp|dbf|prj)$/.test(x)), 'conditionally vacuous — no shapefile fixture may exist for a step without an external').toBe(false);
  });

  it('#182 Fixtures are minimal — one row per branch, per check, plus null/empty/boundary', () => {
    const d = loadDescriptor();
    const w = healthyWorld();
    expect(w.cumulative.linked_parcels).toBe(LIVE_LINKED_PARCELS);
    const gated = d.checks.filter((c) => c.severity !== 'INFO');
    expect(gated.map((c) => c.id).filter((id) => !sabotageFor(checkById(d, id))), 'gated checks without a one-sabotage fixture').toEqual([]);
    for (const c of gated) {
      const w2 = healthyWorld();
      (sabotageFor(c) as (w: World) => void)(w2);
      expect(JSON.stringify(w2) === JSON.stringify(healthyWorld()), `sabotage for ${c.id} changes nothing`).toBe(false);
    }
    for (const f of stepTestDirFiles().filter((x) => x.endsWith('.json'))) {
      const parsed = JSON.parse(fs.readFileSync(abs(f), 'utf8')) as unknown;
      const rows = Array.isArray(parsed) ? parsed.length : Array.isArray((parsed as { rows?: unknown[] }).rows) ? ((parsed as { rows: unknown[] }).rows).length : 0;
      expect(rows, `${f} is a ${rows}-row fixture`).toBeLessThanOrEqual(30);
    }
  });

  it('#184 Fixtures live next to their step and are deleted with it', () => {
    loadDescriptor();
    const strays = walk(abs('src/tests'))
      .map((p) => path.relative(REPO_ROOT, p).replace(/\\/g, '/'))
      .filter((f) => !f.startsWith(STEP_DIR_REL) && /fixtures?\//.test(f) && /massing|parcel_buildings/i.test(path.basename(f)));
    expect(strays, 'link_massing fixtures outside the step directory').toEqual([]);
  });

  // ── A.15 Load-bearing intent that must survive conversion (§9.2) ──────────

  it('#199 No step defines its own `verdictCascade` — the massingAuditRows.some(…) parallel-boolean cascade is retired to verdict.js (D-3)', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(/verdictCascade|massingVerdict|verdict\s*[:=]/.test(src), 'the compute computes a verdict').toBe(false);
    expect(/\?\s*['"]FAIL['"]\s*:\s*['"](PASS|WARN)['"]/.test(src), 'a parallel-boolean cascade (some(FAIL) ? FAIL : PASS)').toBe(false);
    expect(/massingLinkRate\s*>=\s*50|>= 50%/.test(src), 'T4: the >= 50 link-rate floor as a bare literal (the P4 violation)').toBe(false);
    for (const t of d.terminals) expect(typeof t.records_meta === 'object' && 'verdict' in t.records_meta, `terminal ${t.id} declares a verdict`).toBe(false);
    const step = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/massingVerdict|verdictCascade/.test(step), 'the frozen-shape step still carries the cascade').toBe(false);
  });

  it('#200 The §11 Counter Semantic Contract — records_total/new/updated from written.e2.* (scanned/inserted/updated), scoped by the composite key; never the 1,395 tail, never a literal 0 (D-8 / LG-5)', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(d.counters, 'a LINK declares its counters (LINK/MATCHER profile: counters scoped by writes.key)').not.toBe('none');
    const c = d.counters as { records_total: { source: string; scoped_by: unknown }; records_new: { source: string }; records_updated: { source: string } };
    expect(c.records_total.source, 'records_total = written.e2.scanned (not `processed`, the permanently-unmatchable tail)').toMatch(/^written\.e2\.scanned$/);
    expect(c.records_new.source, 'records_new = written.e2.inserted (today a hardcoded 0)').toMatch(/^written\.e2\.inserted$/);
    expect(c.records_updated.source, 'records_updated = written.e2.updated').toMatch(/^written\.e2\.updated$/);
    for (const k of ['records_total', 'records_new', 'records_updated'] as const) expect(/^\d+$/.test(c[k].source), `${k}.source is a literal`).toBe(false);
    expect(/parcel_id[\s\S]*building_id|writes\.key|writes\[\d\]\.key/.test(JSON.stringify(c.records_total.scoped_by)), 'scoped_by the composite write key').toBe(true);
    expect(/records_total|records_new|records_updated/.test(src), 'the compute assigns a counter the library derives from `counters` (Fold B item 6: compute returns NO counters)').toBe(false);
  });

  it('#201 `load-massing`\'s `ON CONFLICT` area-column exclusion — here: ON CONFLICT lives ONLY in the generated SQL, never in the compute', () => {
    const src = stripComments(computeSource());
    expect(/ON CONFLICT/i.test(src), 'a hand-written ON CONFLICT in the compute (§1.4 lint)').toBe(false);
    expect(/ON CONFLICT/i.test(stripComments(readText(WRITE_REL))), `${WRITE_REL} generates no ON CONFLICT`).toBe(true);
  });

  it('#202 The `tier_1_exact_address` name freeze', () => {
    const src = stripComments(computeSource());
    const tiers = [...src.matchAll(/tier_1\w*/g)].map((m) => m[0]);
    for (const t of tiers) expect(t).toBe('tier_1_exact_address');
    expect(tiers.every((t) => t === 'tier_1_exact_address'), 'conditionally vacuous for this step, executed').toBe(true);
  });

  it('#203 Frozen `records_meta` producer/consumer blocks — the SELF-CONSUMED gate fields (code_version · building_footprints_count as a STRING) declared, in the success terminal, and read by massing-full-gate.js', () => {
    const d = loadDescriptor();
    const emits = emitsOf(d);
    for (const f of SELF_CONSUMED_FIELDS) {
      const e = emits.find((x) => x.key === f);
      expect(e, `emits[] does not declare ${f} (cross-layer contract 3: the next run's gate reads it)`).toBeDefined();
      expect((e as { consumers: string[] }).consumers, `consumers of ${f} names the manifest slug ${SELF_CONSUMER_SLUG} (self)`).toContain(SELF_CONSUMER_SLUG);
      expect(consumerFile(SELF_CONSUMER_SLUG)).toBe(STEP_REL);
    }
    const bfc = emits.find((x) => x.key === 'building_footprints_count') as { type: string };
    expect(bfc.type, 'Fold A: building_footprints_count is a STRING ("427077") — evaluateMassingFullGate compares String(prevCount); the byte-stable contract keeps the type').toBe('string');
    const success = d.terminals.find((t) => t.kind === 'success');
    expect(success, 'a success terminal').toBeDefined();
    const shape = (success as { records_meta: Record<string, string> }).records_meta;
    for (const f of SELF_CONSUMED_FIELDS) expect(Object.keys(shape), `${f} is not in the success terminal's records_meta shape`).toContain(f);
    // The reader after conversion is the fingerprint input, not the step: both must carry the names.
    const gateSrc = fs.readFileSync(abs(GATE_LIB_REL), 'utf8');
    for (const f of SELF_CONSUMED_FIELDS) expect(gateSrc.includes(f), `${GATE_LIB_REL} does not read ${f}`).toBe(true);
    expect(gateSrc.includes("status = 'completed'"), 'B-6: the gate reads the LAST COMPLETED PRIOR run').toBe(true);
    expect(JSON.stringify(d.staleness.fingerprint_inputs), 'S10 / §1.5: fingerprint_inputs names massing-full-gate.js').toContain(GATE_LIB_REL);
  });

  it('#204 `RUN_AT` captured once — the midnight-cross fence (B-11: DB clock, library-owned, before any write; zero clock reads in the compute)', () => {
    const src = stripComments(computeSource());
    expect(/new Date\s*\(|Date\.now\s*\(/.test(src), 'new Date()/Date.now() in a pipeline compute (G5: the 4 Date.now() elapsed reads go through ctx.clock)').toBe(false);
    expect((src.match(/getDbTimestamp\(/g) ?? []).length, 'the DB clock captured in the compute').toBe(0);
    expect(/\bNOW\(\)/i.test(src), 'a DB-side NOW() write from the compute').toBe(false);
    const lib = [STALENESS_REL, WRITE_REL, INDEX_REL].map((f) => stripComments(readText(f))).join('\n');
    expect((lib.match(/getDbTimestamp\(/g) ?? []).length, 'the library captures the DB clock at most once per run').toBeLessThanOrEqual(1);
    expect((lib.match(/getDbTimestamp\(/g) ?? []).length, 'and at least once — linked_at must be ONE watermark, not two batches straddling a second').toBeGreaterThanOrEqual(1);
  });

  it('#205 Lock-ID uniqueness across manifest ∪ `one-time/` ∪ `backfill/` — lock 91 textual and unique', () => {
    const d = loadDescriptor();
    const textual = /const ADVISORY_LOCK_ID\s*=\s*(\d+)/.exec(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(textual, 'the §5.4 textual constant').not.toBeNull();
    expect(d.identity.lock).toBe(Number((textual as RegExpExecArray)[1]));
    expect(d.identity.lock).toBe(LOCK_ID);
    const holders = walk(abs('scripts'))
      .filter((p) => p.endsWith('.js') && !p.includes(`${path.sep}_schema${path.sep}fixtures${path.sep}`) && !p.includes(`${path.sep}node_modules${path.sep}`))
      .map((p) => path.relative(REPO_ROOT, p).replace(/\\/g, '/'))
      .filter((f) => f !== STEP_REL && new RegExp(`ADVISORY_LOCK_ID\\s*=\\s*${d.identity.lock}\\b`).test(fs.readFileSync(abs(f), 'utf8')));
    expect(holders, `another script also holds lock ${d.identity.lock} (S1: do not renumber — backfill-realtor-permit-trades.infra records a past collision on 91)`).toEqual([]);
  });
});

// ===========================================================================
// 55-B — partial now, closure at the named k (5, k=MIXED)
// ===========================================================================

describe('55-B — monotone partials (5, k=MIXED)', () => {
  it('#36 [PARTIAL] Entries older than N months are flagged `stale_interpretation` — fires on a backdated fixture', () => {
    const notes = loadNotes();
    const entries = notesEntries(notes);
    expect(entries.length).toBeGreaterThan(0);
    const now = new Date();
    expect(staleEntries(entries, now), 'stale entries in the live notes file').toEqual([]);
    const backdated = entries.map(({ block, entry }) => ({ block, entry: { ...entry, measured: { ...(entry.measured ?? {}), date: '2020-01-01' } } }));
    expect(staleEntries(backdated, now).length, 'the detector must fire on a backdated measured.date').toBe(backdated.length);
  });

  it('#175 [PARTIAL] All generated statements PREPARE/EXPLAIN cleanly — the converted subset (E1 + E2 + W1 write.js generates, and buildMatchSql) is syntactically well-formed; the compute issues no SQL', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(/\.query\s*\(|streamQuery\(|withTransaction\s*\(/.test(src), 'a compute issuing SQL').toBe(false);
    const { e1, e2 } = writeTargets(d);
    const mod = loadComputeModule();
    const buildMatchSql = mod.buildMatchSql as (dd: Descriptor) => unknown;
    expect(typeof buildMatchSql, 'buildMatchSql export').toBe('function');
    const sql = [generatedSqlFor(d, e1), generatedSqlFor(d, e2), strings(buildMatchSql(d)).join('\n')].join('\n');
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter((s) => /\b(INSERT|UPDATE|DELETE|SELECT|WITH)\b/i.test(s))) {
      const open = (stmt.match(/\(/g) ?? []).length;
      const close = (stmt.match(/\)/g) ?? []).length;
      expect(open, `unbalanced parentheses in: ${stmt.slice(0, 80)}…`).toBe(close);
      const params = [...new Set([...stmt.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
      params.forEach((p, i) => expect(p, `placeholder gap in: ${stmt.slice(0, 80)}…`).toBe(i + 1));
    }
  });

  it('#181 [PARTIAL] `pg_trgm` precision/recall never regress — N/A BY SUBJECT (conversion #3, arms k=2): this step matches on geometry, not trigrams; the N/A is recorded, not ticked', () => {
    const src = stripComments(computeSource());
    const usesTrgm = /similarity\(|pg_trgm|word_similarity|<%|%>/.test(src);
    expect(usesTrgm, 'link_massing does no fuzzy string matching — the ratchet has no subject here (plan: "record the N/A with its reason rather than a green tick")').toBe(false);
    const report = readText(REPORT_REL);
    expect(/181[\s\S]{0,200}(N\/A|not applicable)/i.test(report) || /(N\/A|not applicable)[\s\S]{0,200}181/i.test(report), 'the assessment must record #181 as N/A by subject with its reason').toBe(true);
  });

  it('#183 [PARTIAL] No fixture exceeds 180 days without review — max-age assertion on the inline fixtures', () => {
    loadDescriptor();
    const age = daysBetween(new Date(), new Date(FIXTURE_REVIEWED));
    expect(age, `the inline must-fail fixtures were last reviewed ${FIXTURE_REVIEWED} — review them and bump FIXTURE_REVIEWED`).toBeLessThanOrEqual(FIXTURE_MAX_AGE_DAYS);
    expect(daysBetween(new Date(), new Date('2025-01-01')) > FIXTURE_MAX_AGE_DAYS, 'the detector fires on a backdated review date').toBe(true);
    for (const f of stepTestDirFiles().filter((x) => x.endsWith('.json'))) {
      const parsed = JSON.parse(fs.readFileSync(abs(f), 'utf8')) as { reviewed?: string };
      expect(typeof parsed.reviewed === 'string' && daysBetween(new Date(), new Date(parsed.reviewed)) <= FIXTURE_MAX_AGE_DAYS, `${f} has no review date within ${FIXTURE_MAX_AGE_DAYS} days`).toBe(true);
    }
  });

  it('#206 [PARTIAL] `records_meta` merge collisions are detected — this step\'s keys vs the chain-level keys, vs pilots 1 AND 2 (three converted producers now), and a two-producer fixture', () => {
    const d = loadDescriptor();
    const runChain = fs.readFileSync(abs('scripts/run-chain.js'), 'utf8');
    const chainKeys = new Set<string>(['pipeline_meta', ...[...runChain.matchAll(/metaObj\.(\w+)\s*=/g)].map((m) => m[1] as string)]);
    expect(chainKeys.size).toBeGreaterThanOrEqual(3);
    const mine = new Set<string>(emitsOf(d).map((e) => e.key));
    for (const t of d.terminals) if (typeof t.records_meta === 'object') for (const k of Object.keys(t.records_meta)) mine.add(k);
    const collisions = (a: Set<string>, b: Set<string>): string[] => [...a].filter((k) => b.has(k));
    expect(collisions(mine, chainKeys), 'this step emits a key the chain merge clobbers').toEqual([]);
    for (const other of ['scripts/quality/assert-schema.descriptor.json', 'scripts/load-ravines.descriptor.json']) {
      const theirs = JSON.parse(fs.readFileSync(abs(other), 'utf8')) as Descriptor;
      const keys = new Set<string>(theirs.emits === 'none' ? [] : theirs.emits.map((e) => e.key));
      expect(collisions(mine, keys), `link_massing emits a key ${other} also emits`).toEqual([]);
    }
    expect(collisions(new Set(['audit_table', 'x']), new Set(['audit_table', 'y'])), 'two-producer fixture').toEqual(['audit_table']);
  });
});

// ===========================================================================
// The three files, one slug — the descriptor (Folds A/B + A-1…A-8 rulings), the compute, the
// frozen shape, the library growth, the grandfather allowlist, the converted registry
// ===========================================================================

describe('the three files, one slug (Spec 122 §4.1 / §5.1 / §5.2) + the Fold B LINK library growth', () => {
  it('descriptor exists, validates, and carries the A-1…A-8 rulings: shape:link, E1/E2 in order, composite key, T1–T7, the A-7 guards, invocation ≡ manifest, counters, geom reads, emits, terminals', () => {
    const d = loadDescriptor();
    expect(d.identity.name).toBe('link_massing');
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.archetype).toBe('LINK');
    // A-1 — the LINK execution shape
    expect(d.execution.shape, 'A-1 option (a): execution.shape "link" selects runLinkPhase').toBe('link');
    expect(d.execution.network, 'G5: the first pilot with an EMPTY network seam').toBe('none');
    // Finding 5 — execution.invocation ≡ manifest chain_args (sources --full, permits bare)
    expect(d.execution.invocation).not.toBe('none');
    const invocation = d.execution.invocation as Record<string, { argv: string[] }>;
    const chainArgs = manifest().scripts.link_massing?.chain_args ?? {};
    expect(invocation.sources?.argv, 'sources invocation argv').toEqual(['--full']);
    expect(invocation.permits?.argv, 'permits invocation argv').toEqual([]);
    for (const chain of ['sources', 'permits']) expect(invocation[chain]?.argv, `execution.invocation.${chain}.argv ≡ manifest.chain_args`).toEqual(chainArgs[chain] ?? []);
    // P4 — T1–T7 declared; T4 verdict-bound via limit_from_config; T3 clamps; T7 recorded (retired path)
    expect(d.config, 'config:"none" while 3 registered + 4 proposed knobs exist').not.toBe('none');
    const cfg = d.config as { logic_variables: Array<{ name: string; on_invalid: string; min: unknown; max: unknown }>; hoisted_above_gate: boolean };
    const names = cfg.logic_variables.map((v) => v.name).sort();
    expect(names).toEqual(Object.values(CONFIG_VARS).sort());
    const byName = Object.fromEntries(cfg.logic_variables.map((v) => [v.name, v]));
    expect(byName[CONFIG_VARS.T3]?.on_invalid, 'T3: clamp (a 0 disables the fallback; a 5,000 nested-loops)').toBe('clamp');
    expect(byName[CONFIG_VARS.T4]?.on_invalid, 'T4 verdict bound: fail').toBe('fail');
    expect(byName[CONFIG_VARS.T5]?.on_invalid, 'T5 written confidence: fail').toBe('fail');
    expect(byName[CONFIG_VARS.T6]?.on_invalid, 'T6 written confidence: fail').toBe('fail');
    for (const v of [CONFIG_VARS.T5, CONFIG_VARS.T6]) expect(byName[v]?.min === 0 && byName[v]?.max === 1, `${v}: bounds [0,1] — confidence is numeric(3,2), the column will not reject a 5 (A-7)`).toBe(true);
    for (const v of Object.values(CONFIG_VARS)) expect(byName[v]?.min !== 'none' && byName[v]?.max !== 'none', `${v} declares both bounds`).toBe(true);
    expect(cfg.hoisted_above_gate, 'A-5 / B-13: config validation ABOVE the gate — the opposite of today, declared as a diff').toBe(true);
    for (const v of LIMIT_FROM_CONFIG_VARS) {
      const bound = d.checks.filter((c) => c.limit_from_config === v);
      expect(bound.length, `${v} must be bound to exactly one check via limit_from_config`).toBe(1);
    }
    expect(checkByVar(d, CONFIG_VARS.T4).severity, 'link_rate below the floor is a FAIL on the PostGIS path').toBe('FAIL');
    // E1 / E2 — override
    expect(d.override).not.toBe('none');
    const o = d.override as { force_full: string; force_run: string };
    expect(o.force_full, 'E1 has a home').toBe(FORCE_FULL_ENV);
    // A-7 — guards.requires: postgis (A-8 override: fail-loud), the partial unique index, 2 GiST, FK pair, 2 btree, RLS
    const req = d.guards.requires;
    const postgis = req.find((r) => r.kind === 'extension' && r.name === 'postgis');
    expect(postgis, 'A-8 OVERRIDE: guards.requires {kind: extension, name: postgis}').toBeDefined();
    expect(postgis?.on_missing, 'on_missing: fail — no degraded algorithm survives').toBe('fail');
    for (const name of REQUIRED_NAMES) expect(req.map((r) => r.name), `guards.requires must name ${name}`).toContain(name);
    const gist = req.find((r) => r.name === 'idx_parcels_geom_gist');
    expect(gist?.on_missing, 'B-4: the parcels GiST precondition is a HALT').toBe('fail');
    const rls = req.filter((r) => r.kind === RLS_REQUIREMENT_KIND);
    expect(rls.map((r) => r.name)).toContain(WRITE_TABLE);
    for (const r of rls) expect(r.on_missing).toBe('fail');
    expect(d.guards.srid, 'S6 → guards.srid').toBe(4326);
    expect(d.guards.empty_source, 'B-2: a zero-work run must not read PASS').not.toBe('none');
    // D-1 — geom declared on BOTH read tables
    const reads = Object.fromEntries(d.inputs.reads.tables.map((t) => [t.table, t.columns ?? []]));
    for (const t of ['parcels', 'building_footprints']) {
      expect(reads[t], `inputs.reads.tables must declare ${t}`).toBeDefined();
      expect(reads[t], `D-1: ${t}.geom is read by the PostGIS join and declared by neither PIPELINE_META today`).toContain('geom');
    }
    expect(reads.parcels).toEqual(expect.arrayContaining(['id', 'centroid_lat', 'centroid_lng']));
    expect(reads.building_footprints).toEqual(expect.arrayContaining(['id', 'footprint_area_sqm', 'centroid_lat', 'centroid_lng']));
    expect(d.inputs.reads.steps.length, 'B-1/B-2: massing + compute_centroids as inputs.reads.steps[]').toBeGreaterThanOrEqual(1);
    // D-6 / D-7 / D-5 — the two ordered targets on the junction
    const { e1, e2 } = writeTargets(d);
    expect(e1.key).toEqual(WRITE_KEY);
    expect(e2.key, 'D-7: the composite key').toEqual(WRITE_KEY);
    expect(e1.write_discipline.guard, 'E1 is the unguarded is_primary clear').toBe('none');
    expect(e1.write_discipline.guard_why, 'guard:none requires guard_why (cites 5bb31faf / B-8)').toBeDefined();
    expect(JSON.stringify(e1.write_discipline.guard_why)).toMatch(/5bb31faf|B-8|one_primary/);
    expect(e1.write_discipline.scope, 'E1 scope: the batch\'s parcels').not.toBe('none');
    expect(e1.write_discipline.declared_drift, 'E1 always rewrites the batch\'s primaries — declared_drift').toBeDefined();
    expect(e2.write_discipline.guard).toBe('is_distinct_from');
    expect(e2.write_discipline.guard_columns, 'D-5: EXPLICIT, never all_declared').toEqual(GUARD_COLUMNS);
    expect(e2.retract, 'W1 is E2\'s retraction').toBe('all');
    expect(e2.retract_when, 'C3 pre-pull: retract_when full_only').toBe('full_only');
    expect(e1.retract, 'the clear retracts nothing').toBe('none');
    expect(e2.columns.map((c) => c.name).sort(), 'all 7 step-written columns (D-2)').toEqual([...WRITE_COLUMNS].sort());
    for (const c of e2.columns) expect(c.written ?? 'step', `${c.name} is written by the step`).toBe('step');
    expect(d.execution.txn_scope).not.toBe('none');
    // D-17 — the LINK profile
    expect(JSON.stringify((d.outputs as { invalidates: unknown }).invalidates), 'outputs.invalidates → parcels.massing_enriched_at (LG-6)').toMatch(/massing_enriched_at/);
    // S10 / LG-7 — staleness: code_version + upstream count, tri_state
    const triggers = d.staleness.trigger as Array<{ signal: string }>;
    expect(Array.isArray(triggers)).toBe(true);
    expect(triggers.some((t) => t.signal === 'code_version'), 'S10: code_version trigger').toBe(true);
    expect(triggers.some((t) => t.signal === 'upstream_ledger'), 'the building_footprints count signal').toBe(true);
    expect(d.staleness.mode_select, 'LG-7/LG-10: the output is a MODE').toBe('tri_state');
    // D-13 — the floor is the DDL, not the head
    expect(d.database.min_migration).toBe(MIN_MIGRATION);
    // D-16 / S11 — sharing
    expect(d.sharing.varies_by_chain.phase, 'S12: an explicit map, never a ternary').toEqual({ sources: 8, permits: 9 });
    expect(d.sharing.slug_forms ?? 'derived', 'S11: slug_forms derived, never declared').toBe('derived');
    // D-4 / D-20 — checks
    for (const c of d.checks) expect(c.blocking, `check ${c.id} is blocking — smuggles a chain-halt into a "no-op diff"`).toBe(false);
    for (const id of INFO_METRIC_IDS) expect(checkById(d, id).severity, `D-4: ${id} survives as an INFO check (parcel_buildings_written is asserted BY NAME in chain.logic.test.ts)`).toBe('INFO');
    expect(d.checks.some((c) => c.when === 'pre_write'), 'D-20: a pre_write mass-retraction guard on W1 (today the FULL DELETE has no guard)').toBe(true);
    // LG-6 — terminals
    expect(d.terminals.length, `G0: ≥${TERMINAL_COUNT_MIN} terminals`).toBeGreaterThanOrEqual(TERMINAL_COUNT_MIN);
    expect(d.terminals.some((x) => x.kind === 'skip_lock_contention'), 'D-14: 6 live skipped rows').toBe(true);
    expect(d.terminals.some((x) => x.status === 'failed'), 'a failed terminal').toBe(true);
    expect(Array.isArray(d.deviations)).toBe(true);
    expect(JSON.stringify(d.limitations), 'C-11: load_massing\'s undeclared cascade into parcel_buildings is recorded').toMatch(/load[_-]massing/);
  });

  it('notes.json is real (≤12 entries, fences for the adjudicated fix-commits) and carries the interpretation that lives only as comments today', () => {
    const notes = loadNotes();
    const entries = notesEntries(notes);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(NOTES_CAP);
    expect((notes.fences ?? []).length).toBeGreaterThanOrEqual(FENCE_COMMITS.length);
    expect(notes.counts, 'counts block').toBeDefined();
    const text = JSON.stringify(notes);
    expect(/35%|yard|lot centroid/.test(text), 'the b16c036 predicate-flip rationale').toBe(true);
    expect(/78000/.test(text), 'the /78000.0 degree-span precedent').toBe(true);
    expect(/1,?395|permanently[- ]unmatchable/.test(text), 'the 1,395-parcel permanently-unmatchable tail (C-8)').toBe(true);
    expect(/cumulative/i.test(text), 'the cumulative-vs-run link-rate choice').toBe(true);
  });

  it('compute exists, exports `checks` (dispatch ≡ descriptor ids, in order) + buildMatchSql (pure SQL text, B-9/B-10 ordering) + classifyStructure; NO JS fallback path; no fs/pg/pipeline/argv/env; opens no pool', () => {
    artifact(COMPUTE_REL);
    const d = loadDescriptor();
    const p = probe(COMPUTE_REL);
    expect(p.require_error, 'require() threw').toBeNull();
    expect(p.pools + p.clients, 'a pool/client constructed at require time').toBe(0);
    const src = stripComments(computeSource());
    expect(/pipeline\.run\s*\(/.test(src)).toBe(false);
    expect(/new\s+(pg\.)?Pool\s*\(/.test(src)).toBe(false);
    expect(/require\(\s*['"](fs|node:fs|os|child_process|pg|dotenv|crypto|zod|@turf\/[\w-]+|\.\.\/pipeline|\.\.\/step|\.\.\/step\/[a-z]+|\.\.\/resolve-db|\.\.\/config-loader|\.\.\/massing-full-gate)['"]\s*\)/.test(src), 'compute-forbidden-require').toBe(false);
    expect(/process\.(env|argv)/.test(src), 'E2 / C-12: no env or argv in the compute (isFullMode() one frame up is the library\'s)').toBe(false);
    expect(/isFullMode\s*\(/.test(src), 'C-12: the indirect argv read must not reach the compute').toBe(false);
    // A-8 OVERRIDE — no second code path
    for (const tok of JS_PATH_TOKENS) expect(src.includes(tok), `A-8 OVERRIDE: JS fallback identifier "${tok}" survives in the compute`).toBe(false);
    expect(/hasPostGIS|has_geom_col|pg_extension/.test(src), 'PostGIS detection is a guards.requires precondition, not a compute branch').toBe(false);
    const mod = loadComputeModule();
    expect(typeof mod.compute).toBe('function');
    expect(mod.checks && typeof mod.checks === 'object', '`checks` dispatch table').toBe(true);
    expect(Object.keys(mod.checks as object), '§5.5 (1): dispatch keys ≡ descriptor check ids, in order').toEqual(d.checks.map((c) => c.id));
    for (const [id, fn] of Object.entries(mod.checks as Record<string, (ctx: unknown) => unknown>)) {
      expect(typeof fn, `checks.${id}`).toBe('function');
      expect(fn.name, `checks.${id}.name`).toBe(id);
    }
    for (const h of PURE_HELPERS) expect(typeof mod[h], `pure helper ${h} is not a named export`).toBe('function');
    for (const gone of ['decideMassingFull', 'evaluateMassingFullGate', 'flushInsertBatch', 'LOGIC_VARS_SCHEMA', 'verdictCascade']) expect(gone in mod, `${gone} must NOT live in the compute (re-homed: staleness / write.js / config.js / verdict.js)`).toBe(false);
    expect(/^\s*\/\/.*SPEC LINK:|\* SPEC LINK:/m.test(fs.readFileSync(abs(COMPUTE_REL), 'utf8').split('\n').slice(0, 30).join('\n')), 'SPEC LINK header').toBe(true);
    // A-2 option 2 — buildMatchSql is pure text with the B-9/B-10 ordering and the T3/T5/T6 values NOT literal
    const buildMatchSql = mod.buildMatchSql as (dd: Descriptor) => unknown;
    const sql = strings(buildMatchSql(d)).join('\n');
    expect(/ST_Contains\s*\(\s*p\.geom\s*,\s*ST_SetSRID\s*\(\s*ST_MakePoint\s*\(\s*bf\.centroid_lng\s*,\s*bf\.centroid_lat\s*\)\s*,\s*4326\s*\)\s*\)/.test(sql), 'b16c036: building-centroid-IN-parcel, never the reverse').toBe(true);
    expect(/bf\.geom\s*&&\s*p\.geom/.test(sql), 'the GiST bbox prefilter on the centroid pass').toBe(true);
    expect(detectNearestCapFence({ sql, boundSource: src }), 'B-10 / F4 over the generated nearest SQL').toEqual([]);
    expect(sql.search(/ST_Contains/) < sql.search(/ST_DWithin/), 'B-9: the nearest fallback comes AFTER the centroid pass').toBe(true);
    expect(/0\.95|0\.60?\b/.test(sql), 'T5/T6: the written confidences are ctx.config reads, not literals in the SQL').toBe(false);
    for (const v of Object.values(CONFIG_VARS)) {
      if (RETIRED_PATH_VARS.has(v) || LIMIT_FROM_CONFIG_VARS.includes(v)) continue;
      expect(src.includes(`ctx.config.${v}`) || src.includes(`config.${v}`), `${v} is not read from ctx.config by the compute`).toBe(true);
    }
    const classify = mod.classifyStructure as (area: number, all: number[], shed: number, garage: number) => string;
    expect(classify(300, [300, 40], 20, 60)).toBe('primary');
    expect(classify(15, [300, 15], 20, 60)).toBe('shed');
  });

  it('the step file is the §5.1 frozen shape (no pipeline.run, no env/argv/fetch/fs, ast-grep silent), SPEC LINK kept, lock 91 textual', () => {
    computeSource();
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(src.split('\n').slice(0, 30).join('\n').includes('SPEC LINK:'), 'the frozen file must keep the SPEC LINK header').toBe(true);
    expect(/const ADVISORY_LOCK_ID\s*=\s*91;/.test(src), 'S1 — kept textually per §5.4 so pipeline-advisory-lock.infra.test.ts:246-253/:294-301 stay green').toBe(true);
    expect(/module\.exports\s*=\s*pipeline\.step\(descriptor,\s*compute\)/.test(src)).toBe(true);
    expect(/module\.exports\.descriptor\s*=\s*descriptor/.test(src)).toBe(true);
    expect(/module\.exports\.compute\s*=\s*compute/.test(src)).toBe(true);
    expect(/process\.env|process\.argv|isFullMode|fetch\s*\(|require\(['"]fs['"]\)|require\(['"]zod['"]\)/.test(stripComments(src)), 'env/argv/fetch/fs/zod in the frozen-shape file').toBe(false);
    expect(runShapeRule([STEP_REL]), 'ast-grep violations on the converted step').toEqual([]);
    const p = probe(STEP_REL);
    expect(p.require_error).toBeNull();
    expect(p.pools + p.clients).toBe(0);
    expect(p.has_descriptor && p.compute_type === 'function').toBe(true);
  });

  it('converted.json registers the step as the 3rd entry (commit 9 arms the shape gate: 3/62)', () => {
    computeSource();
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] };
    expect(converted.converted).toContain(STEP_REL);
    expect(converted.converted.length).toBe(3);
  });

  it('grandfathered.json lists link_massing for guard:"none" (Fold B item 2 — x-banned-for-new gains its enforcer)', () => {
    const g = JSON.parse(readText(GRANDFATHERED_REL)) as Record<string, unknown>;
    const text = JSON.stringify(g);
    expect(/link_massing/.test(text), 'link_massing must be allowlisted for E1\'s guard:"none"').toBe(true);
    expect(/"guard"|guard:none|"none"/.test(text), 'the allowlist names the banned value it grandfathers').toBe(true);
  });

  it('staleness.js — reads argv --full / override.force_full and feeds mode_select tri_state (LG-7 / LG-10); the gate runs pre_compute', () => {
    computeSource(); // the growth lands with the compute at commit 7
    const lib = loadLib(STALENESS_REL);
    const src = stripComments(fs.readFileSync(abs(STALENESS_REL), 'utf8'));
    expect(/['"]--full['"]/.test(src), 'LG-10: after conversion NOBODY reads --full unless staleness.js does').toBe(true);
    expect(/force_full/.test(src), 'override.force_full is consumed here').toBe(true);
    expect(/tri_state/.test(src), 'mode_select: tri_state').toBe(true);
    expect(Object.keys(lib).some((k) => /mode|full/i.test(k) && typeof lib[k] === 'function'), 'staleness.js exports a mode-selecting decision').toBe(true);
    expect(/link[_-]massing|LINK_MASSING/.test(src), 'generic — no step name').toBe(false);
  });

  it('write.js — accepts the composite key, generates ordered targets, honours retract_when (LG-2 / LG-3 / LG-3′)', () => {
    const d = loadDescriptor();
    const src = stripComments(readText(WRITE_REL));
    expect(/composite keys are not supported/.test(src), 'LG-2: the by-name refusal must be gone').toBe(false);
    expect(/retract_when/.test(src), 'LG-3′: retract_when is honoured by the runner').toBe(true);
    expect(/full_only/.test(src)).toBe(true);
    const { e2 } = writeTargets(d);
    expect(() => generatedSqlFor(d, e2), 'buildWritePlan must not throw on (parcel_id, building_id)').not.toThrow();
    expect(/parcel_buildings|link[_-]massing/.test(src), 'write.js is generic').toBe(false);
  });

  it('index.js — runLinkPhase exists and fires the pre_write gate BEFORE writes[0] (D-20: before the FULL mass-DELETE)', () => {
    computeSource(); // the growth lands with the compute at commit 7
    const lib = loadLib(INDEX_REL);
    expect(typeof lib.runLinkPhase).toBe('function');
    const src = stripComments(fs.readFileSync(abs(INDEX_REL), 'utf8'));
    const start = src.search(/async function runLinkPhase\s*\(/);
    expect(start, 'runLinkPhase defined').toBeGreaterThanOrEqual(0);
    const body = src.slice(start);
    const gateAt = body.search(/preWriteGate|pre_write/);
    const firstWriteAt = body.search(/writes\[0\]|retract|executeWrite\s*\(/);
    expect(gateAt, 'the gate is referenced in runLinkPhase').toBeGreaterThanOrEqual(0);
    expect(firstWriteAt).toBeGreaterThanOrEqual(0);
    expect(gateAt < firstWriteAt, 'Fold B item 4: pre_write fires before writes[0]').toBe(true);
    expect(/shape\s*===?\s*['"]link['"]|isLinkStep/.test(src), 'execution.shape "link" selects the phase').toBe(true);
  });
});

/** Run the A2 rules over explicit paths (mirrors step-conformance.infra.test.ts). */
function runShapeRule(files: string[]): Array<{ file: string; rule: string; line: number }> {
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

// ===========================================================================
// G4d fence locks — both directions (Spec 123 §6.1; Spec 120 §14.5 Gate 4d)
//
// The Severity:-footer census is 0 on this file (finding 6); the corpus is the 30 `fix(` commits,
// adjudicated per construct. Present-direction reads the FUTURE descriptor / compute / write plan
// (red today); reversion-direction runs the same detector over TODAY's source text or write.js
// (green today) and over a reverted patch that must make it fire.
// ===========================================================================

describe('G4d fence locks', () => {
  const currentStep = (): string => stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));

  it(`F1 ${F1_COMMIT} — present in the converted step (descriptor order + generated SQL): ${F1_CONSTRUCT}`, () => {
    const d = loadDescriptor();
    const { e1, e2 } = writeTargets(d);
    const subject: OrderedWrites = { targets: writes(d).map((w) => ({ table: w.table, cls: w.write_discipline.class, column: w.write_discipline.class === E1_CLASS ? (w.columns[0]?.name ?? '') : undefined })) };
    expect(detectPrimaryClearFence(subject), 'the descriptor no longer encodes B-8').toEqual([]);
    expect(e1.columns.map((c) => c.name), 'E1 writes is_primary and only is_primary').toEqual(['is_primary']);
    expect(/UPDATE\s+parcel_buildings\s+SET\s+is_primary\s*=\s*false/i.test(generatedSqlFor(d, e1))).toBe(true);
    expect(/ON CONFLICT/i.test(generatedSqlFor(d, e2))).toBe(true);
    expect(d.guards.requires.some((r) => r.name === 'idx_parcel_buildings_one_primary' && r.on_missing === 'fail'), 'the index the clear protects is a declared precondition').toBe(true);
    const fence = (loadNotes().fences ?? []).find((f) => f.commit.startsWith(F1_COMMIT));
    expect(fence, `notes.fences carries ${F1_COMMIT}`).toBeDefined();
  });

  it(`F1 ${F1_COMMIT} — reversion is detectable: dropping or reordering the clear makes the lock fire (over today's source order and a structured reversion)`, () => {
    const current = orderedWritesFromSource(currentStep());
    expect(current.targets.length, 'today\'s PostGIS path carries both the clear and the upsert').toBe(2);
    expect(detectPrimaryClearFence(current), 'the lock fires on the un-reverted subject — it is not measuring the fence').toEqual([]);
    const dropped: OrderedWrites = { targets: current.targets.filter((t) => t.cls !== E1_CLASS) };
    expect(dropped).not.toEqual(current);
    expect(detectPrimaryClearFence(dropped).some((f) => /B-8 is gone/.test(f)), `dropping the clear (fence ${F1_COMMIT}) went undetected`).toBe(true);
    const swapped: OrderedWrites = { targets: [...current.targets].reverse() };
    expect(detectPrimaryClearFence(swapped).some((f) => /AFTER the upsert/.test(f)), 'reordering the clear after the upsert went undetected').toBe(true);
    // The source-text half: the reverted step text with the UPDATE removed.
    const revertedText = currentStep().replace(/UPDATE parcel_buildings SET is_primary = false[^`]*/g, '');
    expect(detectPrimaryClearFence(orderedWritesFromSource(revertedText)).length).toBeGreaterThan(0);
  });

  it(`F2 ${F2_COMMIT} — present in the converted step (descriptor guard_columns + write.js resolution + generated SQL): ${F2_CONSTRUCT}`, () => {
    const d = loadDescriptor();
    const { e2 } = writeTargets(d);
    const guardColumns = currentWrite.resolveGuardColumns(e2, e2.columns.filter((c) => (c.written ?? 'step') === 'step').map((c) => c.name));
    const sql = generatedSqlFor(d, e2);
    const setColumns = [...sql.matchAll(/(\w+)\s*=\s*EXCLUDED\.\w+/g)].map((m) => m[1] as string);
    expect(detectGuardFence({ guardColumns, setColumns, sql }), 'the converted write no longer encodes D-5').toEqual([]);
    const fence = (loadNotes().fences ?? []).find((f) => f.commit.startsWith(F2_COMMIT));
    expect(fence, `notes.fences carries ${F2_COMMIT}`).toBeDefined();
  });

  it(`F2 ${F2_COMMIT} — reversion is detectable: removing the WHERE, guarding linked_at, or writing all_declared makes the lock fire (over today's flushInsertBatch and today's write.js)`, () => {
    const current = guardFromSource(currentStep());
    expect(current.guardColumns, 'today\'s guard is the four').toEqual(GUARD_COLUMNS);
    expect(current.setColumns).toContain(RUN_CLOCK_COLUMN);
    expect(detectGuardFence(current), 'the lock fires on the un-reverted subject').toEqual([]);
    // Reversion 1: the pre-b36d0596 state — no WHERE at all.
    const unguarded: GuardInput = { ...current, guardColumns: [], sql: current.sql.replace(/WHERE[\s\S]*$/, '') };
    expect(unguarded).not.toEqual(current);
    expect(detectGuardFence(unguarded).some((f) => /no IS DISTINCT FROM/.test(f)), `reverting fence ${F2_COMMIT} went undetected`).toBe(true);
    // Reversion 2: linked_at added to the guard (the 520K-row rewrite).
    const clockGuarded: GuardInput = { ...current, guardColumns: [...current.guardColumns, RUN_CLOCK_COLUMN], sql: `${current.sql}\n OR parcel_buildings.linked_at IS DISTINCT FROM EXCLUDED.linked_at` };
    const findings = detectGuardFence(clockGuarded);
    expect(findings.some((f) => /linked_at is in the guard/.test(f)), 'guarding the run-clock column went undetected').toBe(true);
    expect(findings.some((f) => /generated WHERE guards linked_at/.test(f))).toBe(true);
    // Reversion 3: `all_declared` through TODAY's write.js resolves to a set that includes linked_at — the D-5 mechanism, executed.
    const expanded = currentWrite.resolveGuardColumns({ key: WRITE_KEY, write_discipline: { guard_columns: 'all_declared' } }, WRITE_COLUMNS);
    expect(expanded).toContain(RUN_CLOCK_COLUMN);
    expect(detectGuardFence({ ...current, guardColumns: expanded }).some((f) => /linked_at is in the guard/.test(f)), 'all_declared reaching the guard went undetected').toBe(true);
  });

  it(`F3 ${F3_COMMIT} — present in the converted step (retract:all + retract_when:full_only + the scoped generated DELETE + tri_state): ${F3_CONSTRUCT}`, () => {
    const d = loadDescriptor();
    const { e2 } = writeTargets(d);
    const sql = generatedSqlFor(d, e2);
    const del = /DELETE FROM\s+parcel_buildings[\s\S]*?(?:;|$)/i.exec(sql)?.[0] ?? '';
    expect(detectRetractionFence({ deleteSql: del, fullOnly: e2.retract === 'all' && e2.retract_when === 'full_only' }), 'the converted retraction no longer encodes B-7 / b16c036').toEqual([]);
    expect(d.staleness.mode_select).toBe('tri_state');
    expect(JSON.stringify(e2.write_discipline.scope), 'E2 scope names the baseFilter').toMatch(/centroid_lat IS NOT NULL/);
    const fence = (loadNotes().fences ?? []).find((f) => f.commit.startsWith(F3_COMMIT));
    expect(fence, `notes.fences carries ${F3_COMMIT}`).toBeDefined();
  });

  it(`F3 ${F3_COMMIT} — reversion is detectable: an unscoped DELETE, a non-baseFilter scope, or a DELETE outside if (FULL_MODE) makes the lock fire (over today's source)`, () => {
    const current = retractionFromSource(currentStep());
    expect(current.fullOnly, 'today the DELETE sits inside if (FULL_MODE)').toBe(true);
    expect(detectRetractionFence(current), 'the lock fires on the un-reverted subject').toEqual([]);
    const unscoped: RetractionInput = { ...current, deleteSql: 'DELETE FROM parcel_buildings' };
    expect(detectRetractionFence(unscoped).some((f) => /not scoped/.test(f)), 'an unscoped mass-DELETE went undetected').toBe(true);
    const wrongScope: RetractionInput = { ...current, deleteSql: 'DELETE FROM parcel_buildings WHERE parcel_id IN (SELECT id FROM parcels WHERE geom IS NOT NULL)' };
    expect(detectRetractionFence(wrongScope).some((f) => /not the baseFilter/.test(f)), 'a scope that diverges from the work set went undetected').toBe(true);
    const incremental = retractionFromSource(currentStep().replace(/if \(FULL_MODE\) \{/g, '{'));
    expect(incremental.fullOnly).toBe(false);
    expect(detectRetractionFence(incremental).some((f) => /not gated on FULL mode/.test(f)), 'an incremental retraction went undetected').toBe(true);
    const gone = retractionFromSource(currentStep().replace(/DELETE FROM parcel_buildings[^`]*/g, ''));
    expect(detectRetractionFence(gone).some((f) => /no FULL-mode retraction/.test(f))).toBe(true);
  });

  it(`F4 ${F4_COMMIT} — present in the converted step (T3 declared + buildMatchSql reads ctx.config + ST_Expand before ST_DWithin): ${F4_CONSTRUCT}`, () => {
    const d = loadDescriptor();
    const cfg = d.config as { logic_variables: Array<{ name: string; min: number; max: number }> };
    const t3 = cfg.logic_variables.find((v) => v.name === CONFIG_VARS.T3);
    expect(t3, 'T3 declared').toBeDefined();
    expect(t3?.min === 1 && t3?.max === 500, 'T3 bounds 1..500 (seed parity)').toBe(true);
    const mod = loadComputeModule();
    const sql = strings((mod.buildMatchSql as (dd: Descriptor) => unknown)(d)).join('\n');
    expect(detectNearestCapFence({ sql, boundSource: stripComments(computeSource()) }), 'the converted compute no longer encodes B-10 / d324ab27').toEqual([]);
    const fence = (loadNotes().fences ?? []).find((f) => f.commit.startsWith(F4_COMMIT));
    expect(fence, `notes.fences carries ${F4_COMMIT}`).toBeDefined();
  });

  it(`F4 ${F4_COMMIT} — reversion is detectable: a 50 literal, a re-hardcoded constant, or ST_DWithin without/before the ST_Expand prefilter makes the lock fire (over today's source)`, () => {
    const current = nearestFromSource(currentStep());
    expect(current.sql.length, 'today\'s nearest SQL is present').toBeGreaterThan(0);
    expect(detectNearestCapFence(current), 'the lock fires on the un-reverted subject').toEqual([]);
    const literal: NearestInput = { ...current, sql: current.sql.replace(/ST_DWithin\(p\.geom::geography, bf\.geom::geography, \$3\)/, 'ST_DWithin(p.geom::geography, bf.geom::geography, 50)') };
    expect(literal).not.toEqual(current);
    expect(detectNearestCapFence(literal).some((f) => /literal/.test(f)), `re-literalising the cap (fence ${F4_COMMIT}) went undetected`).toBe(true);
    const hardcoded: NearestInput = { ...current, boundSource: `${current.boundSource.replace(/massing_nearest_max_distance_m/g, 'x')}\nconst NEAREST_MAX_DISTANCE_M = 50;` };
    expect(detectNearestCapFence(hardcoded).some((f) => /not sourced|re-hardcoded/.test(f))).toBe(true);
    const noPrefilter: NearestInput = { ...current, sql: current.sql.replace(/ON bf\.geom && ST_Expand\(p\.geom, \$2\)\s*AND\s*/, 'ON ') };
    expect(noPrefilter.sql).not.toBe(current.sql);
    expect(detectNearestCapFence(noPrefilter).some((f) => /no bbox prefilter/.test(f)), 'dropping the B-10 prefilter went undetected').toBe(true);
    const reordered: NearestInput = { ...current, sql: current.sql.replace(/ON bf\.geom && ST_Expand\(p\.geom, \$2\)\s*AND\s*(ST_DWithin\([^)]*\))/, 'ON $1 AND bf.geom && ST_Expand(p.geom, $2)') };
    expect(detectNearestCapFence(reordered).some((f) => /AFTER ST_DWithin/.test(f)), 'the prefilter after the distance went undetected').toBe(true);
  });

  it('the fence corpus is the fix( commits, not the Severity: footer — every locked SHA is a fix( commit on the step file and the footer census is 0', () => {
    const subjects = git(['log', '--format=%h%x1f%s', '--', STEP_REL]).split(/\r?\n/).filter(Boolean);
    const fixes = subjects.filter((l) => /\x1ffix\(/.test(l)).map((l) => l.split('\x1f')[0] ?? '');
    expect(fixes.length, 'G1: 30 fix( commits').toBeGreaterThanOrEqual(30);
    for (const c of FENCE_COMMITS) expect(fixes.some((h) => h.startsWith(c) || c.startsWith(h)), `fence ${c} is not a fix( commit on ${STEP_REL}`).toBe(true);
    const footers = git(['log', '--format=%B%x1e', 'cd6d35d4', '--', STEP_REL]).split('\x1e').filter((c) => /^Severity:/m.test(c));
    expect(footers.length, 'finding 6: the Severity: instrument is blind on this file — 0 pre-conversion footers').toBe(0);
  });
});

// ===========================================================================
// D-5 — the linked_at guard trap. THE regression risk of this conversion (finding 2): one descriptor
// word (`all_declared`) rewrites 520,492 rows per run and re-scopes 485,135 parcels in enrich_parcels.
// ===========================================================================

describe('D-5 linked_at guard trap', () => {
  it('the descriptor\'s E2 guard_columns is an explicit array that excludes linked_at and is never all_declared (red: missing descriptor)', () => {
    const d = loadDescriptor();
    const { e2 } = writeTargets(d);
    const gc = e2.write_discipline.guard_columns;
    expect(gc, 'guard_columns must be an explicit array — `all_declared` expands over the RUN_AT column').not.toBe('all_declared');
    expect(Array.isArray(gc)).toBe(true);
    expect(gc as string[]).not.toContain(RUN_CLOCK_COLUMN);
    expect(gc).toEqual(GUARD_COLUMNS);
    // LG-9: a validator rule — a run-clock-bound column may not be a guard column without a why.
    const trapped = JSON.parse(JSON.stringify(d)) as Descriptor;
    (writes(trapped)[1] as WriteSpec).write_discipline.guard_columns = [...GUARD_COLUMNS, RUN_CLOCK_COLUMN];
    expect(() => validateDescriptor(trapped), 'LG-9: guarding linked_at without a why must be refused by the validator').toThrow(/linked_at|clock|guard_columns/);
  });

  it('write.js resolveGuardColumns — an explicit array is returned as-is (linked_at excluded), and all_declared over the 7 columns INCLUDES linked_at (green: the trap is real today)', () => {
    const explicit = currentWrite.resolveGuardColumns({ key: WRITE_KEY, write_discipline: { guard_columns: GUARD_COLUMNS } }, WRITE_COLUMNS);
    expect(explicit).toEqual(GUARD_COLUMNS);
    expect(explicit).not.toContain(RUN_CLOCK_COLUMN);
    const expanded = currentWrite.resolveGuardColumns({ key: WRITE_KEY, write_discipline: { guard_columns: 'all_declared' } }, WRITE_COLUMNS);
    expect(expanded, 'all_declared = every step-written column except the key — which is exactly the 520K-row rewrite').toEqual(WRITE_COLUMNS.filter((c) => !WRITE_KEY.includes(c)));
    expect(expanded).toContain(RUN_CLOCK_COLUMN);
    // And the downstream re-scope this guards against is real: enrich-parcels scopes on linked_at > massing_enriched_at.
    const enrich = fs.readFileSync(abs('scripts/enrich-parcels.js'), 'utf8');
    expect(/linked_at\s*>\s*p\.massing_enriched_at|pb\.linked_at\s*>/.test(enrich), 'buildMassingScopeWhere re-scopes on pb.linked_at — the blast radius of a guarded linked_at').toBe(true);
  });
});
