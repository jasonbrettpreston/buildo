// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6 — PH-7 test design, prove red), §6.1 (G4d both-directions locks), §5.2 (the per-step checklist)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.2 (conformance), §1.2a (P1–P5: descriptor data, compute is JUST compute, P4 tunables), §1.4 (write_discipline class B), §5.1 (frozen shape), §5.4 (lock-test convention)
// SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.4–§3.4b (notes.json), §14 (conversion workflow), §15 (step testing), §9.2 (load-bearing intent)
// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §3, §9 (the frozen records_meta.ravine_load producer contract)
//
// Pilot 2 — `load_ravines`, the INGESTOR representative and the FIRST pilot that writes a domain
// table (`ravines`, write class B `upsert_scoped_departure_delete`). The 55-A hard gate (44 claims,
// k=PER_STEP) + the 5 55-B monotone partials (k=MIXED) + the 2 G4d fence locks, one `it` per claim,
// claim number and text in the test name (generator: `node scripts/violations/plan-claims.mjs --json`,
// `scope === 'PER_STEP'`). The 6 55-C items (#160/#161/#168/#177/#178/#179) are NOT gated here.
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Each one opens by asserting
// the FUTURE artifact it reads exists (`artifact()` → `expect(existsSync).toBe(true)` with the path
// in the message), so the failure names the missing artifact rather than surfacing as a TypeScript
// or import error. Nothing here requires the CURRENT step file in-process — it still calls
// `pipeline.run()` and would open a pool. The require probe is a child process.
//
// The artifacts this file asserts against (named in .cursor/active_task.md, commits 1–9, Fold A/B):
//   scripts/load-ravines.descriptor.json     — the descriptor: config declares the 6 P4 vars T1–T6,
//                                               `limit_from_config` on the T2–T5 checks (A-4),
//                                               `override.force_run` = RAVINE_FORCE_RELOAD (A-3),
//                                               `override.accept_anomaly[]` for the 2 env overrides (A-5),
//                                               `guards.requires[]` carries `rls_bypass_or_policy` on
//                                               `ravines` (Fold A RLS precondition), outputs.writes[0] =
//                                               ravines / class B / all 5 columns incl `created_at` (D-2),
//                                               emits[] `ravine_load` → consumers [enrich_ravines] (D-6),
//                                               database.min_migration 167 (D-11), every check
//                                               blocking:false (D-8 — PIN, DO NOT FIX), 10 terminals (LG-6)
//   scripts/load-ravines.notes.json          — a REAL notes file (≤12 entries), `fences[]` × 2
//   scripts/lib/compute/load-ravines.js      — A-1(b): `checks` dispatch keyed by the descriptor ids +
//                                               the 9 pure helpers as named exports; no fs/pg/pipeline
//   scripts/lib/step/acquire.js              — Fold B item 3: the ONE home for the content-hash gate
//                                               (contentHashDecision · tier2 · buildSkipReEmitMeta ·
//                                               streamed hash-through-to-disk)
//   scripts/lib/step/staleness.js            — the pre-acquisition validator gate (skipCheckDecision)
//   scripts/lib/step/write.js                — LG-1: generated class-B SQL (IS DISTINCT FROM ·
//                                               RETURNING (xmax = 0) · <> ALL($1::BIGINT[]))
//   scripts/load-ravines.js                  — the §5.1 frozen shape (SPEC LINK kept, lock 59 textual)
//   scripts/steps/_schema/converted.json     — contains the step path (commit 9)
//   docs/reports/2026-08-25-pilot2-load-ravines-assessment.md — PH-0/3/5/6 report (commits 1–4)
//   docs/reports/golden/load_ravines/*.json  — capture-step-golden docs (commit 5) incl. `table_state`
//                                               for `ravines` + `invariants` (D-14 / Fold A part 2)
//
// Shape decisions recorded here because the schema is silent:
//   · `fences[]` lives in load-ravines.notes.json under the top-level key `fences` (root
//     `additionalProperties:false` forbids a descriptor category). Each entry: {const, value, incident,
//     commit, lock_test}.
//   · `emits[]` items are `{key, type, consumers}` only, so the 7 fields `enrich-ravines.js` reads are
//     asserted as declared SOMEWHERE in the descriptor text (a terminal shape or a limitation) AND
//     read by the consumer's source — the runtime contract, not documentation (claim #203).
//   · `emits[].consumers` may name a manifest slug (`enrich_ravines`) or a repo path; a slug resolves
//     through `scripts/manifest.json` (Integration: `run-chain.js` reads `manifest.chains`).
//   · The must-fail world (#165) is the ctx contract A-1(b) implies: the library hands compute
//     `ctx.acquired` (the parsed source), `ctx.written` (the class-B write counters), `ctx.prior` (the
//     prior run's `ravine_load`) and `ctx.overrides` (the resolved accept_anomaly flags). Sabotage is
//     keyed by the CONFIG VARIABLE a check is bound to (`limit_from_config`) so the matrix does not
//     depend on the final check ids; the remaining WARN/FAIL checks match by id pattern.
//   · The report's machine-readable tables are found by HEADER, not position: Intent Ledger
//     (construct · discovered by · disposition · adjudicated by), Line accounting (lines · category ·
//     evidence), Non-determinism inventory (key · disposition), Boundary freeze (table · rows),
//     Commit ledger (commit · done-test).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const THIS_FILE_REL = 'src/tests/steps/load_ravines/violations.test.ts';
const STEP_DIR_REL = 'src/tests/steps/load_ravines';

const STEP_REL = 'scripts/load-ravines.js';
const DESCRIPTOR_REL = 'scripts/load-ravines.descriptor.json';
const NOTES_REL = 'scripts/load-ravines.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-ravines.js';
const ACQUIRE_REL = 'scripts/lib/step/acquire.js';
const STALENESS_REL = 'scripts/lib/step/staleness.js';
const WRITE_REL = 'scripts/lib/step/write.js';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const REPORT_REL = 'docs/reports/2026-08-25-pilot2-load-ravines-assessment.md';
const GOLDEN_DIR_REL = 'docs/reports/golden/load_ravines';
const GOLDEN_HARNESS_REL = 'scripts/analysis/capture-step-golden.js';
const MANIFEST_REL = 'scripts/manifest.json';
const SEED_REL = 'scripts/seeds/logic_variables.json';
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');
const COMPUTE_STUB_REL = 'scripts/steps/_schema/fixtures/shape/_compute-stub.js';
const REVIEW_CLIS = ['scripts/gemini-review.js', 'scripts/deepseek-review.js'];

/** G0 — the frozen line count of scripts/load-ravines.js (`wc -l`, 2026-08-25). */
const FROZEN_LINES = 605;
/** The step's advisory lock (Spec 47 §A.5 registry; pipeline-advisory-lock.infra.test.ts:35). */
const LOCK_ID = 59;
/** D-11 — the only DDL this step depends on: migrations/167_create_ravines_table.sql. */
const MIN_MIGRATION = 167;
/** LG-6 — the 10 exit paths enumerated at G0. */
const TERMINAL_COUNT = 10;
/** The written table and its 5 columns (D-2: `created_at` is a DB default the step never writes, still declared). */
const WRITE_TABLE = 'ravines';
const WRITE_COLUMNS = ['source_id', 'geom', 'source_dataset_version', 'created_at', 'updated_at'];
const WRITE_CLASS = 'upsert_scoped_departure_delete';
/** A-3 / A-5 — the three env overrides. */
const FORCE_RUN_ENV = 'RAVINE_FORCE_RELOAD';
const ACCEPT_ENVS = ['RAVINE_ACCEPT_FEATURE_COUNT_DRIFT', 'RAVINE_ACCEPT_MASS_DELETE'];
/** Fold A RLS precondition — `ravines` has relrowsecurity=true and 0 policies. */
const RLS_REQUIREMENT_KIND = 'rls_bypass_or_policy';
/** D-6 — the seven `records_meta.ravine_load` fields enrich-ravines.js reads (:42/:47/:50/:56/:57/:62). */
const CONSUMED_FIELDS = [
  'spec_version', 'delete_skipped_empty_guard', 'drift_check_passed', 'mass_delete_check_passed',
  'feature_count', 'invalid_geometry_skipped', 'source_dataset_version',
];
const EMIT_KEY = 'ravine_load';
const CONSUMER_SLUG = 'enrich_ravines';

/** P4 — the six tunables (T1–T6), by the plan's proposed names. T2–T5 are verdict bounds (`limit_from_config`). */
const CONFIG_VARS = {
  T1: 'load_ravines_dataset_age_warn_years',
  T2: 'load_ravines_count_drift_fail_pct',
  T3: 'load_ravines_geometry_update_warn_pct',
  T4: 'load_ravines_invalid_geometry_fail_pct',
  T5: 'load_ravines_mass_delete_fail_pct',
  T6: 'load_ravines_download_timeout_ms',
} as const;
const LIMIT_FROM_CONFIG_VARS = [CONFIG_VARS.T2, CONFIG_VARS.T3, CONFIG_VARS.T4, CONFIG_VARS.T5];

/** A-1(b) — the pure domain functions that stay as named exports of the compute. */
const PURE_HELPERS = [
  'computeCountDeltaPct', 'computeGeometryUpdatePct', 'computeMassDeletePct', 'shouldSkipDelete',
  'validatorCounterDelta', 'dedupeBySourceId', 'ageDaysFrom', 'datasetAgeStatus', 'coerceSourceId',
];

/** The 2 fences on scripts/load-ravines.js — `git log --format=%B | grep -ci "^Severity:"` = 2. */
const FENCE_COMMITS = ['1ceebd17', '0b230472'];

/** Spec 120 §14.3 — the closed disposition vocabulary of the Intent Ledger. */
const LEDGER_DISPOSITIONS = [
  'preserved-in-runner',
  'preserved-in-validator',
  'preserved-in-compute',
  'encoded-as-descriptor-field',
  'encoded-as-deviation',
  'knowingly-retired',
];
/** Spec 120 §14.2 / claim #151a — the closed non-determinism disposition vocabulary. */
const NONDET_DISPOSITIONS = ['must-match-exactly', 'normalize-then-match', 'excluded-with-reason'];
/** Spec 120 §14.5 Gate 4c — the line-accounting categories. */
const LINE_CATEGORIES = ['runner-owned', 'validator-owned', 'descriptor-encoded', 'compute', 'dead (proved)', 'duplicate'];
/** Spec 120 §3.4 — the prose blocks that count against the cap. `decisions` carry `adjudicated`, not `measured`. */
const NOTES_PROSE_BLOCKS = [
  'expected_shape', 'read_this_way', 'suspicious_if', 'blind_spots', 'decisions', 'review_notes',
  'expected', 'known_normal', 'known_bad', 'do_not_reflag', 'how_to_investigate', 'limitations',
];
const NOTES_MEASURED_EXEMPT = new Set(['decisions']);
const NOTES_CAP = 12;

// ⚠️ #183 partial — the inline fixtures below were reviewed on this date. The max-age assertion
// goes red 180 days later BY DESIGN (Spec 120 §15.5: ">180 days without review fails").
const FIXTURE_REVIEWED = '2026-08-25';
const FIXTURE_MAX_AGE_DAYS = 180;

// ONE compiler, the same one pipeline.step() validates with (step-conformance.infra.test.ts:50).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { buildAuditTable, checkRow, deriveVerdict } = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
  buildAuditTable: (
    descriptor: Descriptor,
    chainId: string | null,
    observations: Record<string, unknown>,
  ) => { rows: AuditRow[]; audit_table: { verdict: string } };
  checkRow: (check: Check, observation: unknown, onCheckError: string) => AuditRow | null;
  deriveVerdict: (rows: Array<{ status: string }>) => 'PASS' | 'WARN' | 'FAIL';
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { RUN_STATUS } = require(path.join(REPO_ROOT, 'scripts/lib/step/ledger.js')) as {
  RUN_STATUS: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Types (the slice of step.schema.json this file reads)
// ---------------------------------------------------------------------------

interface AuditRow { metric: string; value: unknown; threshold: unknown; status: string }
interface Check {
  id: string;
  kind: string;
  expect: unknown;
  limit: unknown;
  limit_from_config?: string;
  severity: string;
  blocking: boolean;
  when: string;
  chains: string[] | 'all';
}
interface WriteSpec {
  table: string;
  key: string | string[];
  columns: Array<{ name: string; vocabulary: unknown }>;
  write_discipline: { class: string; guard: unknown; guard_columns: unknown; scope: unknown; expected_change_ratio: unknown; idempotent_rerun: unknown; txn_scope: unknown };
  retract: string;
  replay: string;
}
interface Descriptor {
  identity: { name: string; display_name: string; lock: number; spec_version: string; archetype: string };
  inputs: { reads: { tables: Array<{ table: string }>; externals: Array<{ id: string; url?: string }> } };
  outputs: 'none' | { writes: WriteSpec[]; invalidates: unknown };
  staleness: { trigger: 'none' | Array<{ signal: string; position: string; external?: string }> };
  guards: { requires: Array<{ kind: string; name: string; on_missing: string }>; srid: number | 'none' };
  execution: { on_check_error: string; network: { timeout: string } | 'none'; txn_scope: string };
  checks: Check[];
  override: 'none' | { force_full: string; force_run: string; dry_run: string; accept_anomaly?: Array<{ env: string; check_id: string; why: unknown }> };
  emits: 'none' | Array<{ key: string; type: string; consumers: string[] }>;
  deviations: unknown;
  limitations: unknown;
  interpretation: { file: string; entries: number } | 'none';
  database: { min_migration: number | 'none' };
  counters: 'none' | { records_total: { source: string; scoped_by: unknown }; records_new: { source: string }; records_updated: { source: string } };
  config: 'none' | { logic_variables: Array<{ name: string; min: number | 'none'; max: number | 'none'; on_invalid: string }> };
  sharing: { varies_by_chain: { checks: string } };
  terminals: Array<{ id: string; kind: string; status: string; records_meta: Record<string, string> | string }>;
}
interface NotesEntry {
  measured?: { value?: unknown; date?: string; query?: string };
  detected_by?: string;
  check?: string;
  stale_interpretation?: boolean;
  [k: string]: unknown;
}
interface Notes {
  fences?: Array<{ const: string; value: unknown; incident: string; commit: string; lock_test: string }>;
  counts?: { open_blind_spots?: number; unpromoted_suspicious_if?: number };
  [block: string]: unknown;
}
interface GoldenDoc {
  harness: string;
  chain: string | null;
  nondeterminism: string[];
  normalised: unknown;
  table_state?: Array<{ table: string; row_count: number; content_hash: string | null; order_by?: string }>;
  invariants?: Array<{ name: string; value: unknown }>;
  args?: unknown;
  file: string;
}
type ComputeFn = (ctx: unknown) => Promise<{ records_meta?: Record<string, unknown> } | void>;
interface ComputeModule {
  compute?: ComputeFn;
  checks?: Record<string, (ctx: unknown) => unknown>;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Artifact helpers — every claim test opens with one of these
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the pilot-2 commit sequence)`,
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

function loadNotes(): Notes {
  return JSON.parse(readText(NOTES_REL)) as Notes;
}

function computeSource(): string {
  return readText(COMPUTE_REL);
}

/**
 * ⚠️ FOLD NOTE (commit 7, 2026-08-25) — CORRECTED. A compute module exports the
 * FUNCTION (`pipeline.step()` refuses anything else, and the pilot-1 precedent
 * `scripts/lib/compute/assert-schema.js` ends `module.exports = compute`), with the
 * §5.5 dispatch table and the pure helpers hung off it as own properties. Rewrapping
 * it as a bare `{ compute }` DROPPED every one of those properties, so `mod.checks`
 * read undefined against a module that exports it correctly — a helper bug, not a
 * finding. Spreading preserves the own enumerable properties either way.
 */
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

/** A FUTURE library module, required only after its existence is asserted. */
function loadLib(rel: string): Record<string, unknown> {
  return require(artifact(rel, 'Fold B library growth, commit 7')) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS library module
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

/** Every prose entry of a notes file, tagged with its block. */
function notesEntries(notes: Notes): Array<{ block: string; entry: NotesEntry }> {
  const out: Array<{ block: string; entry: NotesEntry }> = [];
  for (const block of NOTES_PROSE_BLOCKS) {
    const arr = notes[block];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr as NotesEntry[]) out.push({ block, entry });
  }
  return out;
}

function isNone(v: unknown): boolean {
  return typeof v === 'string' && /^none\b/i.test(v);
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/** #36 partial — the stale_interpretation detector (INFO flag on entries older than N months). */
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

/** The check bound to a P4 variable through `limit_from_config` (A-4). */
function checkByVar(d: Descriptor, varName: string): Check {
  const c = d.checks.find((x) => x.limit_from_config === varName);
  expect(c, `no check carries limit_from_config: "${varName}"`).toBeDefined();
  return c as Check;
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'an INGESTOR may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

function emitsOf(d: Descriptor): Array<{ key: string; type: string; consumers: string[] }> {
  expect(d.emits, `emits must declare ${EMIT_KEY}`).not.toBe('none');
  return d.emits as Array<{ key: string; type: string; consumers: string[] }>;
}

/**
 * `emits[].consumers` entry → repo path.
 *
 * ⚠️ FOLD NOTE (commit 7, 2026-08-25) — CORRECTED AGAINST THE REAL MANIFEST. This
 * helper was written against an imagined shape (`chains[*]` as objects carrying
 * `{slug, file}`). Measured: `manifest.chains` maps a chain to an array of SLUG
 * STRINGS, and `manifest.scripts` is the slug → `{file, …}` registry — which is why
 * a slug resolved to itself and the assertion read as a missing consumer. The chain
 * membership stays the liveness handle; the file comes from `scripts`.
 */
function consumerFile(consumer: string): string {
  if (/\.(js|ts|mjs|cjs|py)$/.test(consumer)) return consumer;
  const manifest = JSON.parse(fs.readFileSync(abs(MANIFEST_REL), 'utf8')) as {
    scripts: Record<string, { file: string }>;
    chains: Record<string, string[]>;
  };
  const inSomeChain = Object.values(manifest.chains).some((slugs) => slugs.includes(consumer));
  expect(inSomeChain, `consumer slug "${consumer}" is in no manifest chain`).toBe(true);
  return manifest.scripts[consumer]?.file ?? consumer;
}

// ---------------------------------------------------------------------------
// Markdown tables in the pilot report — found by HEADER, never by position
// ---------------------------------------------------------------------------

interface MdTable {
  heading: string;
  headers: string[];
  rows: Array<Record<string, string>>;
}

function cleanCell(s: string): string {
  return s.replace(/[`*]/g, '').trim();
}

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

/** Find the report table whose headers satisfy every predicate; the failure names what was looked for. */
function reportTable(md: string, want: Array<[string, RegExp]>): { table: MdTable; col: (name: string) => string } {
  const found = mdTables(md).find((t) => want.every(([, re]) => t.headers.some((h) => re.test(h))));
  expect(
    found,
    `${REPORT_REL} has no table with columns ${want.map(([n]) => n).join(' · ')} (${mdTables(md).length} tables found)`,
  ).toBeDefined();
  const t = found as MdTable;
  const col = (name: string): string => {
    const [, re] = want.find(([n]) => n === name) as [string, RegExp];
    return t.headers.find((h) => re.test(h)) as string;
  };
  return { table: t, col };
}

const INTENT_LEDGER_COLS: Array<[string, RegExp]> = [
  ['construct', /construct/],
  ['discovered by', /discover/],
  ['disposition', /^disposition/],
  ['adjudicated by', /adjudicat|approver/],
];

// ---------------------------------------------------------------------------
// Golden-master captures (commit 5) — discovery by content, not by file name
// ---------------------------------------------------------------------------

function goldenDocs(): GoldenDoc[] {
  artifact(GOLDEN_DIR_REL, 'golden-master captures, commit 5');
  const docs = walk(abs(GOLDEN_DIR_REL))
    .filter((p) => p.endsWith('.json'))
    .map((p) => ({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as GoldenDoc), file: path.relative(abs(GOLDEN_DIR_REL), p).replace(/\\/g, '/') }))
    .filter((d) => 'harness' in d); // `invariants.json` is the --invariants {name, sql}[] spec, not a capture
  expect(docs.length, `${GOLDEN_DIR_REL} holds no capture docs`).toBeGreaterThan(0);
  for (const d of docs) expect(d.harness, `${d.file} is not a capture-step-golden doc`).toBe(GOLDEN_HARNESS_REL);
  return docs;
}

/** The written table's captured state in one doc (D-14: count + ordered content hash). */
function ravinesState(doc: GoldenDoc): { table: string; row_count: number; content_hash: string | null } {
  const ts = (doc.table_state ?? []).find((t) => t.table === WRITE_TABLE);
  expect(ts, `${doc.file}: no table_state for ${WRITE_TABLE} — a write-class-B 4-tuple without the written table (D-14 / G8(a))`).toBeDefined();
  return ts as { table: string; row_count: number; content_hash: string | null };
}

function invariant(doc: GoldenDoc, name: string): number {
  const inv = (doc.invariants ?? []).find((i) => i.name === name);
  expect(inv, `${doc.file}: no invariant ${name} (Fold A part 2)`).toBeDefined();
  return Number((inv as { value: unknown }).value);
}

/** The step is a `sources` chain member (manifest.json:101) and runs standalone; 1 chain + standalone = 2 invocations. */
const CHAINS = ['sources', 'standalone'];
const OLD_RE = /old|before|baseline|run[-_]?\d/i;
const NEW_RE = /new|after|converted/i;

function docsFor(docs: GoldenDoc[], chain: string): GoldenDoc[] {
  return docs.filter((x) => path.basename(x.file).startsWith(`${chain}.`) || x.chain === (chain === 'standalone' ? null : chain));
}
/** `pre/` = the OLD script's captures (run 1 + run 2), `post/` = the converted step's; root files classify by name. */
function isOld(d: GoldenDoc): boolean { return d.file.startsWith('pre/') || (OLD_RE.test(path.basename(d.file)) && !NEW_RE.test(path.basename(d.file))); }
function isNew(d: GoldenDoc): boolean { return d.file.startsWith('post/') || NEW_RE.test(path.basename(d.file)); }

// ---------------------------------------------------------------------------
// The must-fail fixture world (#165 / #163 / #182) — DERIVED from the descriptor + the A-1(b) ctx
// contract, healthy by default, sabotaged one check at a time. Spec 120 §15.4 rung 1: inline.
// ---------------------------------------------------------------------------

/** Measured live 2026-08-25: 854 rows, 1 distinct version, source frozen at 2022-03-14. */
const LIVE_FEATURE_COUNT = 854;
const LIVE_LAST_MODIFIED = 'Mon, 14 Mar 2022 15:25:09 GMT';
const LIVE_VERSION_PREFIX = '97b4ac7f';

interface World {
  acquired: {
    feature_count: number;
    invalid_geometry_skipped: number;
    invalid_geometry_repaired: number;
    geometry_collection_extracted: number;
    last_modified: string;
    last_modified_ms: number;
    etag: string | null;
    content_hash: string;
    source_dataset_version: string;
    license_url: string;
    bytes_downloaded: number;
  };
  written: {
    inserted: number;
    updated: number;
    deleted: number;
    rows_scanned: number;
    rows_changed: number;
    delete_skipped_empty_guard: boolean;
    privilege: { bypassrls: boolean; policies: number };
  };
  prior: { feature_count: number; content_hash: string; last_modified: string; source_dataset_version: string } | null;
  overrides: { accept_feature_count_drift: boolean; accept_mass_delete: boolean; force_run: boolean };
}

function healthyWorld(): World {
  return {
    acquired: {
      feature_count: LIVE_FEATURE_COUNT,
      invalid_geometry_skipped: 0,
      invalid_geometry_repaired: 2,
      geometry_collection_extracted: 1,
      last_modified: LIVE_LAST_MODIFIED,
      last_modified_ms: Date.parse(LIVE_LAST_MODIFIED),
      etag: null,
      content_hash: `${LIVE_VERSION_PREFIX}0000000000000000000000000000000000000000000000000000000`,
      source_dataset_version: `${LIVE_VERSION_PREFIX}0000000000000000000000000000000000000000000000000000000`,
      license_url: 'https://open.toronto.ca/open-data-license/',
      bytes_downloaded: 7_640_000,
    },
    written: {
      inserted: 0,
      updated: 0,
      deleted: 0,
      rows_scanned: LIVE_FEATURE_COUNT,
      rows_changed: 0,
      delete_skipped_empty_guard: false,
      privilege: { bypassrls: true, policies: 0 },
    },
    prior: {
      feature_count: LIVE_FEATURE_COUNT,
      content_hash: `${LIVE_VERSION_PREFIX}0000000000000000000000000000000000000000000000000000000`,
      last_modified: LIVE_LAST_MODIFIED,
      source_dataset_version: `${LIVE_VERSION_PREFIX}0000000000000000000000000000000000000000000000000000000`,
    },
    overrides: { accept_feature_count_drift: false, accept_mass_delete: false, force_run: true },
  };
}

/**
 * One sabotage per WARN/FAIL check — keyed by the P4 variable the check is bound to (T2–T5,
 * `limit_from_config`), then by id pattern for the checks that carry a static limit.
 * INFO checks have no negative direction (an INFO row cannot FAIL) and are asserted INFO both ways.
 */
const SABOTAGE_BY_VAR: Record<string, (w: World) => void> = {
  [CONFIG_VARS.T2]: (w) => { w.acquired.feature_count = 100; }, // 88% count drift vs prior 854
  [CONFIG_VARS.T3]: (w) => { w.written.updated = 800; }, // 93.7% geometry update
  [CONFIG_VARS.T4]: (w) => { w.acquired.invalid_geometry_skipped = 200; }, // 23% invalid geometry
  [CONFIG_VARS.T5]: (w) => { w.written.deleted = 800; }, // 93.7% mass delete
};
// ⚠️ FOLD NOTE (commit 7, 2026-08-25) — TWO ENTRIES ADDED to this matrix, and why.
// The descriptor authored at commit 7 declares two WARN checks this table could not
// sabotage, so #165's `missing` assertion would have gone red for a reason that is
// not a defect in the step:
//   · `ravine_no_cache_validators` — a CDN that strips BOTH HTTP cache validators
//     disables the pre-acquisition gate entirely. Its negative direction is "no
//     last-modified and no etag", which nothing else in this matrix produces.
//   · the two `*_override_*_present` rows — their negative direction is a STANDING
//     override, i.e. an env var set. The alternative was to declare both INFO, which
//     would have silently retired the warn-on-a-standing-override behaviour the
//     pre-conversion step had (`:285-286`) — a Chesterton's Fence, not a simplification.
// Both sabotages flip only fields `healthyWorld()` already carries, so #182's
// "sabotage must change something" and #163's compute-swap control still hold.
const SABOTAGE_BY_ID: Array<[RegExp, (w: World) => void]> = [
  [/age|stale|fresh/i, (w) => { w.acquired.last_modified_ms = Date.parse(`${FIXTURE_REVIEWED}T00:00:00Z`) - 30 * 365.25 * 86_400_000; }], // T1: 30 years old
  [/rows_changed|change_ratio|churn/i, (w) => { w.written.rows_changed = w.written.rows_scanned; }], // D-13: 100% churn on a byte-identical source
  [/privilege|rls|policy/i, (w) => { w.written.privilege = { bypassrls: false, policies: 0 }; }], // Fold A: silent 0-row write
  [/override|accept/i, (w) => { w.overrides.accept_feature_count_drift = true; w.overrides.accept_mass_delete = true; }], // A-5: a standing accept-anomaly override
  [/validator|cache/i, (w) => { w.acquired.last_modified = ''; w.acquired.last_modified_ms = 0; w.acquired.etag = null; }], // the CDN stripped both cache validators
  [/dedupe|duplicate/i, (w) => { w.acquired.feature_count = 0; }],
];

function sabotageFor(c: Check): ((w: World) => void) | undefined {
  if (c.limit_from_config && SABOTAGE_BY_VAR[c.limit_from_config]) return SABOTAGE_BY_VAR[c.limit_from_config];
  const hit = SABOTAGE_BY_ID.find(([re]) => re.test(c.id));
  return hit ? hit[1] : undefined;
}

/**
 * The `ctx.config` the library would hand this compute on a freshly seeded DB: the DECLARED
 * names projected out of the seed JSON, frozen. A declared variable with no seed reds here
 * with the variable's name, not a TypeError (P4: "declared but in NO registry" throws).
 */
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

/**
 * A-4 (1): `limit_from_config` renders the RESOLVED value as the row's threshold. This mirror
 * substitutes the config value into the check's limit string before the audit table is built —
 * the same projection the library performs, so the fixture world runs on the value in force.
 */
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

/** Run a compute against a world; return the row status per check (standalone → every check selected). */
async function runCompute(compute: ComputeFn, d: Descriptor, w: World): Promise<Record<string, string>> {
  const observations: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const declared = new Set(d.checks.map((c) => c.id));
  const config = configProjection(d);
  const resolved = resolvedDescriptor(d, config);
  const ctx = {
    pool: { query: () => { throw new Error('the compute must not touch the pool — acquire/validate/write are library-owned (A-1(b)); #175 partial'); } },
    chainId: null,
    runId: null,
    descriptor: resolved,
    checks: resolved.checks.map((c) => c.id),
    fetch: () => { throw new Error('the compute must not fetch — acquisition is the library seam (A-2)'); },
    clock: () => Date.parse(`${FIXTURE_REVIEWED}T00:00:00Z`),
    config,
    // A-1(b): the library-provided result the checks observe over.
    acquired: w.acquired,
    written: w.written,
    prior: w.prior,
    overrides: w.overrides,
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
    // §5.5 (2) — `ctx.report()` is the ONLY observation path.
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

/** The must-fail PAIR for one check under an explicit sabotage. */
async function mustFailWith(compute: ComputeFn, d: Descriptor, id: string, sabotage: (w: World) => void): Promise<{ healthy: string; sabotaged: string }> {
  const healthy = await runCompute(compute, d, healthyWorld());
  const w = healthyWorld();
  sabotage(w);
  const sabotaged = await runCompute(compute, d, w);
  return { healthy: healthy[id] ?? 'absent', sabotaged: sabotaged[id] ?? 'absent' };
}

/** The must-fail PAIR for one check, using its SABOTAGE matrix entry. */
async function mustFailPair(compute: ComputeFn, d: Descriptor, c: Check): Promise<{ healthy: string; sabotaged: string }> {
  const sabotage = sabotageFor(c);
  expect(sabotage, `no must-fail fixture for check ${c.id} (severity ${c.severity})`).toBeDefined();
  return mustFailWith(compute, d, c.id, sabotage as (w: World) => void);
}

// ---------------------------------------------------------------------------
// The class-B write generator (LG-1, Fold B) — call whatever write.js exports and collect its SQL
// ---------------------------------------------------------------------------

const SQL_CONSTRUCTS: Array<[string, RegExp]> = [
  ['IS DISTINCT FROM guard', /IS DISTINCT FROM/],
  ['RETURNING (xmax = 0) insert/update discriminator', /RETURNING\s*\(\s*xmax\s*=\s*0\s*\)/],
  ['scoped departure DELETE <> ALL($1::BIGINT[])', /<>\s*ALL\s*\(\s*\$1::BIGINT\[\]\s*\)/i],
];

function strings(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 4) return out;
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) strings(x, out, depth + 1);
  return out;
}

/** Generate the class-B SQL for the descriptor's first write target through write.js's exported generator. */
function generatedSql(d: Descriptor): string {
  const lib = loadLib(WRITE_REL);
  const gen = Object.entries(lib).find(([k, v]) => typeof v === 'function' && /sql|generate|build|plan|write/i.test(k));
  expect(gen, `${WRITE_REL} exports no generator (a function named like generate*/build*/*Sql)`).toBeDefined();
  const [, fn] = gen as [string, (...a: unknown[]) => unknown];
  const w = writes(d)[0];
  const out = fn(w, d);
  const sql = strings(out).join('\n');
  expect(sql.length, `${WRITE_REL} generator returned no SQL for ${w?.table}`).toBeGreaterThan(0);
  return sql;
}

// ---------------------------------------------------------------------------
// G4d — the two fences, as pure detectors over a STRUCTURED view of the subject
// ---------------------------------------------------------------------------

/** The status the library derives from a verdict — mirrors scripts/lib/step/index.js (`built.audit_table.verdict`). */
function statusFor(verdict: string): string {
  return verdict === 'FAIL' ? RUN_STATUS.FAILED! : verdict === 'WARN' ? RUN_STATUS.COMPLETED_WITH_WARNINGS! : RUN_STATUS.COMPLETED!;
}

/** F-1 subject: the audit rows a run produced + whether the mass-delete bound was exceeded / accepted. */
interface MassDeleteInput {
  rows: AuditRow[];
  overLimit: boolean;
  accepted: boolean;
}

/** A synthetic mass-delete check row, built through the REAL checkRow so the lock measures verdict.js. */
function massDeleteRow(overLimit: boolean): AuditRow {
  const check: Check = { id: 'mass_delete', kind: 'bound', expect: 'none', limit: 'viol == 0', severity: 'FAIL', blocking: false, when: 'post', chains: 'all' };
  const row = checkRow(check, { violations: overLimit ? 1 : 0, detail: overLimit ? 0.937 : 0 }, 'fail_step');
  expect(row, 'checkRow returned no row for the mass-delete check').not.toBeNull();
  return row as AuditRow;
}

/** F-2 subject: the source text that owns the content-hash gate (legacy step today, acquire.js after commit 7). */
interface HashGateInput {
  file: string;
  text: string; // comment-stripped
}

function hashGateSubject(): HashGateInput {
  const rel = fs.existsSync(abs(ACQUIRE_REL)) ? ACQUIRE_REL : STEP_REL;
  return { file: rel, text: stripComments(fs.readFileSync(abs(rel), 'utf8')) };
}

const F1_COMMIT = '1ceebd17';
const F1_CONSTRUCT = 'L7c mass-delete abort — deleted > mass_delete_fail_pct of the prior count is a FAIL row and the run ends `failed` unless RAVINE_ACCEPT_MASS_DELETE; the override never suppresses the FAIL row';
const F2_COMMIT = '0b230472';
const F2_CONSTRUCT = 'tier-2 content-hash gate — contentHashDecision over the streamed hash-through-to-disk (never Buffer.from(await res.arrayBuffer()), never readFileSync), tier2.skip re-emits the prior meta via buildSkipReEmitMeta';

/** F-1 detector: over the limit and not accepted ⇒ a FAIL row AND status `failed`. [] = fence intact. */
function detectMassDeleteFence(i: MassDeleteInput): string[] {
  const v: string[] = [];
  const row = i.rows.find((r) => /mass_delete/.test(r.metric));
  if (!row) { v.push('no mass-delete audit row at all'); return v; }
  if (i.overLimit && row.status !== 'FAIL') v.push(`mass delete over the limit produced status ${row.status}, not FAIL (the pre-review non-functional abort)`);
  const status = statusFor(deriveVerdict(i.rows));
  if (i.overLimit && !i.accepted && status !== RUN_STATUS.FAILED) v.push(`run status ${status} — the abort did not terminate the run as failed`);
  return v;
}

/** F-1 reversion patch: the FAIL row silently downgraded (what 1ceebd17's body says was true pre-review). */
function revertMassDeleteFence(i: MassDeleteInput): MassDeleteInput {
  return { ...i, rows: i.rows.map((r) => (/mass_delete/.test(r.metric) ? { ...r, status: 'INFO' } : r)) };
}

/** F-2 detector over CODE text. [] = fence intact. */
function detectHashGateFence(i: HashGateInput): string[] {
  const v: string[] = [];
  if (!/contentHashDecision\s*\(/.test(i.text)) v.push(`${i.file}: contentHashDecision( is no longer called — the tier-2 gate is gone`);
  if (!/tier2/.test(i.text)) v.push(`${i.file}: no tier2 decision`);
  if (!/buildSkipReEmitMeta\s*\(/.test(i.text)) v.push(`${i.file}: the tier-2 skip no longer re-emits the prior meta`);
  if (!/hashThrough|streamFileHash/.test(i.text)) v.push(`${i.file}: the streamed hash-through-to-disk is gone`);
  if (/arrayBuffer\s*\(\s*\)/.test(i.text)) v.push(`${i.file}: the download is buffered whole via arrayBuffer() (Spec 43 §9.5 ban)`);
  if (/readFileSync/.test(i.text)) v.push(`${i.file}: readFileSync over the download (the hash must stream)`);
  return v;
}

/** F-2 reversion patch: the pre-B1 shape — whole-buffer download, no hash decision. */
function revertHashGateFence(i: HashGateInput): HashGateInput {
  return {
    ...i,
    text: `${i.text.replace(/contentHashDecision\s*\(/g, 'neverHashDecision(').replace(/hashThrough|streamFileHash/g, 'bufferedHash')}\nconst body = Buffer.from(await res.arrayBuffer());\n`,
  };
}

// ===========================================================================
// 55-A — the hard per-conversion gate (44)
// ===========================================================================

describe('55-A — the hard per-conversion gate (44, k=PER_STEP)', () => {
  // ── A.3 Interpretation (§3.4–§3.4b) — the notes.json seven ────────────────

  it('#30 Cap of 12 prose entries — add a 13th → build fails', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(d.interpretation, 'interpretation must be the {file, entries} object, not "none" (vacuity risk on 7 of 44 — a REAL notes file)').not.toBe('none');
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
    const strays = dir.filter((f) => f.startsWith('load-ravines') && !['load-ravines.js', 'load-ravines.descriptor.json', 'load-ravines.notes.json'].includes(f));
    expect(strays, 'an overflow / unknown <slug>.* sibling').toEqual([]);
    expect(dir.some((f) => /overflow/i.test(f)), 'a notes-overflow file').toBe(false);
    expect(Object.keys(loadNotes()).some((k) => /overflow/i.test(k)), 'an overflow block inside notes.json').toBe(false);
  });

  it('#33 `blind_spots[].detected_by` names a check that exists', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    const ids = new Set(d.checks.map((c) => c.id));
    const blind = (notes.blind_spots as NotesEntry[] | undefined) ?? [];
    for (const b of blind) {
      expect(typeof b.detected_by, 'every blind spot declares detected_by').toBe('string');
      if (!isNone(b.detected_by)) expect(ids.has(b.detected_by as string), `detected_by "${b.detected_by}" is not a declared check`).toBe(true);
    }
    expect(ids.has('no_such_check'), 'negative control: the detector would reject a nonexistent check id').toBe(false);
  });

  it('#34 `detected_by:"none"` is permitted but counted', () => {
    const notes = loadNotes();
    const blind = (notes.blind_spots as NotesEntry[] | undefined) ?? [];
    const open = blind.filter((b) => isNone(b.detected_by)).length;
    expect(notes.counts?.open_blind_spots, 'notes.counts.open_blind_spots must be declared and equal the real count').toBe(open);
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

  it('#148 `deviations[]` and `fences[]` are required; empty must be an explicit `[]`', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(Array.isArray(d.deviations), 'descriptor.deviations must be an explicit array (never "none", never omitted)').toBe(true);
    expect(Array.isArray(notes.fences), 'notes.fences must be an explicit array (schema has no fences category — see header)').toBe(true);
    const fences = notes.fences as NonNullable<Notes['fences']>;
    expect(fences.map((f) => f.commit.slice(0, 8)).sort()).toEqual([...FENCE_COMMITS].sort());
    for (const f of fences) {
      for (const k of ['const', 'value', 'incident', 'commit', 'lock_test'] as const) expect(k in f, `fence ${f.commit} lacks ${k}`).toBe(true);
    }
  });

  it('#149 Gate 0 — script #3 adds zero new bespoke runner paths (no load_ravines branch in the library, incl. acquire/staleness/write)', () => {
    computeSource();
    for (const rel of [ACQUIRE_REL, STALENESS_REL, WRITE_REL]) artifact(rel, 'Fold B: the library growth is generic, not a load_ravines branch');
    const lib = fs.readdirSync(abs('scripts/lib/step')).filter((f) => f.endsWith('.js')).map((f) => `scripts/lib/step/${f}`);
    lib.push('scripts/lib/pipeline.js');
    for (const f of lib) {
      const code = stripComments(fs.readFileSync(abs(f), 'utf8'));
      expect(/load[_-]ravines|\bravines?\b/.test(code), `${f} carries a step-specific code path`).toBe(false);
    }
  });

  it('#150 Gate 1 — the old script is reproducible against itself (two OLD captures per invocation, identical normalised, incl. table_state)', () => {
    const docs = goldenDocs();
    for (const chain of CHAINS) {
      const old = docsFor(docs, chain).filter(isOld);
      expect(old.length, `${chain}: need ≥2 OLD captures (run 1 + run 2), found ${old.length}`).toBeGreaterThanOrEqual(2);
      for (const o of old) {
        const ts = ravinesState(o);
        expect(ts.row_count, `${o.file}: ravines count on a byte-identical source (Fold A part 2 invariant 1)`).toBe(LIVE_FEATURE_COUNT);
        expect(typeof ts.content_hash, `${o.file}: table_state.${WRITE_TABLE}.content_hash (ordered)`).toBe('string');
        expect(invariant(o, 'ravines_count')).toBe(LIVE_FEATURE_COUNT);
        expect(invariant(o, 'ravines_distinct_source_dataset_version'), 'invariant 2: one dataset version').toBe(1);
        for (const law of ['parcels_sign_law_violations', 'permits_sign_law_violations', 'coa_sign_law_violations', 'parcels_lineage_mismatch']) expect(invariant(o, law), `${o.file}: ${law} (invariants 4/5)`).toBe(0);
      }
      for (const o of old.slice(1)) {
        expect(o.normalised, `${chain}: ${o.file} differs from ${old[0]?.file} modulo declared normalisations`).toEqual(old[0]?.normalised);
        expect(o.table_state, `${chain}: ${o.file} table_state differs from ${old[0]?.file}`).toEqual(old[0]?.table_state);
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

  it('#6a Every claim covering a TABLE declares that table\'s row count (Appendix H) — pipeline_runs + ravines in the boundary freeze', () => {
    const d = loadDescriptor();
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['table', /^table/], ['rows', /rows?\b/]]);
    const touched = new Set(['pipeline_runs', WRITE_TABLE, ...d.inputs.reads.tables.map((t) => t.table), ...writes(d).map((w) => w.table)]);
    for (const t of touched) {
      const row = table.rows.find((r) => (r[col('table')] ?? '') === t);
      expect(row, `boundary freeze has no row for table ${t}`).toBeDefined();
      expect(/^\d[\d,]*$/.test((row?.[col('rows')] ?? '').replace(/\s/g, '')), `table ${t} has no integer row count`).toBe(true);
    }
    const ravines = table.rows.find((r) => (r[col('table')] ?? '') === WRITE_TABLE);
    expect(Number((ravines?.[col('rows')] ?? '').replace(/[,\s]/g, '')), `ravines row count in the freeze (measured ${LIVE_FEATURE_COUNT})`).toBe(LIVE_FEATURE_COUNT);
  });

  it('#151a The non-determinism disposition vocabulary is CLOSED — must-match-exactly · normalize-then-match · excluded-with-reason', () => {
    const docs = goldenDocs();
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['key', /key|field|source/], ['disposition', /disposition/]]);
    for (const r of table.rows) {
      expect(NONDET_DISPOSITIONS, `disposition "${r[col('disposition')]}" for ${r[col('key')]} is outside the closed vocabulary`).toContain(r[col('disposition')]);
    }
    const declared = table.rows.map((r) => r[col('key')] ?? '').join(' · ');
    for (const doc of docs) for (const k of doc.nondeterminism) expect(declared.includes(k), `${doc.file} stripped "${k}", which the inventory never declared`).toBe(true);
    // cleanCell strips `*`, so compare the count(*) key with the star removed on both sides
    for (const k of [`table:${WRITE_TABLE}.updated_at`, `table:${WRITE_TABLE}.count()`]) expect(declared.replace(/\*/g, '').includes(k), `the inventory does not disposition ${k} (D-14: a LOADER's table state)`).toBe(true);
  });

  it('#152 Gate 2 — Intent Ledger 100% dispositioned, no row `unknown`; both fence SHAs present', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, INTENT_LEDGER_COLS);
    expect(table.rows.length, 'an empty Intent Ledger for a fence-density-2 file').toBeGreaterThanOrEqual(FENCE_COMMITS.length);
    for (const r of table.rows) {
      const disp = (r[col('disposition')] ?? '').toLowerCase();
      expect(LEDGER_DISPOSITIONS.some((d) => disp.startsWith(d)), `"${r[col('construct')]}" disposition "${disp}" is unknown / outside the vocabulary`).toBe(true);
    }
    const ledgerText = table.rows.map((r) => Object.values(r).join(' ')).join('\n');
    for (const c of FENCE_COMMITS) expect(ledgerText.includes(c), `fence commit ${c} has no Intent Ledger row`).toBe(true);
  });

  it('#153 Every `knowingly-retired` row names a human approver (verdictCascade is the planned retirement — Fold A)', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, INTENT_LEDGER_COLS);
    const retired = table.rows.filter((x) => /^(proposed\s+)?knowingly-retired/i.test(x[col('disposition')] ?? ''));
    expect(retired.length, 'the ledger names its retirements (String(runAt) fallback LR-D4; per-feature rows LR-D1)').toBeGreaterThan(0);
    for (const r of retired) {
      const approver = r[col('adjudicated by')] ?? '';
      expect(approver.length > 0 && !/agent|claude|gemini|deepseek|none|awaiting|pending|tbd/i.test(approver), `retired "${r[col('construct')]}" has no HUMAN approver (§7.1: the agent that discovers may not retire)`).toBe(true);
    }
  });

  it('#154 Gate 3 — a peel commit contains only that peel', () => {
    computeSource();
    const log = git(['log', '--format=%H%x1f%s', '--', '.']).split(/\r?\n/).filter(Boolean);
    const peels = log.filter((l) => /122_step_optimization/.test(l) && /pilot 2 peel [abc]\b/i.test(l));
    expect(peels.length, 'three peel commits (8a gating · 8b verdict/audit · 8c thresholds/checks)').toBeGreaterThanOrEqual(3);
    // 8a moves the two-tier gate into the library (acquire/staleness), 8b re-shapes the audit rows
    // (drops the unbounded per-source_id rows, closes an LR-D id), 8c wires the six ctx.config reads
    // (seed + the pct <= limits). Never the frozen-shape step file, never the admin UI.
    const allowed = (f: string): boolean =>
      f === COMPUTE_REL || f === DESCRIPTOR_REL || f === NOTES_REL || f.startsWith('scripts/lib/step/') ||
      f === 'scripts/lib/source-version.js' || f === SEED_REL ||
      f.startsWith('scripts/steps/_schema/') || f.startsWith(STEP_DIR_REL) || f === REPORT_REL || f.startsWith(GOLDEN_DIR_REL) ||
      // The GENERATED projection of step.schema.json (scripts/violations/schema-to-vocab.mjs).
      // A peel that grows the schema drags it by construction; leaving it stale reds
      // step-schema.logic.test.ts. Derived from an already-allowed file, never authored.
      f === 'docs/reports/generated/122-vocabulary.md' ||
      f === 'docs/reports/review_followups.md' || f === 'docs/reports/defect-ledger.md' ||
      // `step-library.logic` joined at peel 8a: the force_run arm and the
      // `on_prior_run_error` posture are LIBRARY behaviour, so their both-directions
      // proof lives with the library's own suite, not in this step's checklist.
      /^src\/tests\/(load-ravines\.(infra|logic)|source-version\.logic|pipeline-advisory-lock\.infra|step-conformance\.infra|step-library\.logic)\.test\.ts$/.test(f) ||
      f === 'docs/specs/01-pipeline/122_pipeline_step_optimization.md' || f === 'docs/specs/01-pipeline/59_source_ravine_protection.md';
    for (const p of peels) {
      const [hash, subject] = p.split('\x1f') as [string, string];
      const files = git(['show', '--name-only', '--format=', hash]).split(/\r?\n/).filter(Boolean).map((f) => f.replace(/\\/g, '/'));
      const foreign = files.filter((f) => !allowed(f));
      expect(foreign, `${hash.slice(0, 8)} "${subject}" touches non-peel files`).toEqual([]);
      expect(files.includes(STEP_REL), `${hash.slice(0, 8)} edits the frozen-shape step file`).toBe(false);
    }
  });

  it('#155 Gate 4c — line accounting = 100% of the frozen 605 lines; an unassigned line blocks', () => {
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
  });

  it('#156 Gate 4d — every fence has a lock test proven in both directions', () => {
    const notes = loadNotes();
    const fences = (notes.fences ?? []) as NonNullable<Notes['fences']>;
    expect(fences.length).toBe(FENCE_COMMITS.length);
    for (const f of fences) expect(f.lock_test, `fence ${f.commit} names the wrong lock test`).toBe(THIS_FILE_REL);
    const self = fs.readFileSync(abs(THIS_FILE_REL), 'utf8');
    expect(self.includes('— present in the converted step'), 'the present-direction lock').toBe(true);
    expect(self.includes('— reversion is detectable'), 'the reversion-direction lock').toBe(true);
    for (const [detect, revert] of [[detectMassDeleteFence, revertMassDeleteFence], [detectHashGateFence, revertHashGateFence]] as const) {
      expect(typeof detect === 'function' && typeof revert === 'function', 'a fence lacks a direction').toBe(true);
    }
  });

  it('#157 Gate 4f — dead code proved dead by instrumentation, never by reading', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['lines', /^lines?$|line range|range/], ['category', /category|owner|disposition/], ['evidence', /evidence|proof|run/]]);
    for (const r of table.rows.filter((x) => /^dead/i.test(x[col('category')] ?? ''))) {
      expect(/zero[- ]hit|0 hits?|run(_id| id|s? #?\d)|instrument/i.test(r[col('evidence')] ?? ''), `dead range ${r[col('lines')]} has no zero-hit run record`).toBe(true);
    }
  });

  it('#158 Gate 5 — the old script is deleted or dated-ticketed (same file, two commits: no pipeline.run(), path registered)', () => {
    computeSource();
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(/pipeline\.run\s*\(/.test(src), `${STEP_REL} still carries the island (pipeline.run)`).toBe(false);
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] };
    expect(converted.converted, `${CONVERTED_REL} does not register ${STEP_REL}`).toContain(STEP_REL);
  });

  it('#159 Idempotence-successor run is a supplement, never the sole gate (an old/new snapshot-replay pair per invocation, plus pre/post table-state)', () => {
    const docs = goldenDocs();
    for (const chain of CHAINS) {
      const mine = docsFor(docs, chain);
      const old = mine.filter(isOld);
      const neu = mine.filter(isNew);
      expect(old.length, `${chain}: no OLD capture — path agreement cannot be proven by a run-2 zero-diff`).toBeGreaterThan(0);
      expect(neu.length, `${chain}: no NEW capture (post/) — the differential has only one side`).toBeGreaterThan(0);
      for (const side of ['pre', 'post']) {
        const p = `${GOLDEN_DIR_REL}/${side}/${chain}.json`;
        artifact(p, `${side}-conversion capture for ${chain}`);
        ravinesState({ ...(JSON.parse(fs.readFileSync(abs(p), 'utf8')) as GoldenDoc), file: p });
      }
      // G8(b) / A-3: the differential must cover BOTH terminals — the (normal) skip and a forced reload.
      const forced = mine.filter((x) => /force/i.test(path.basename(x.file)) || JSON.stringify(x.args ?? []).includes(FORCE_RUN_ENV));
      expect(forced.length, `${chain}: no forced-reload capture — the write path is never exercised (finding #3, ${FORCE_RUN_ENV})`).toBeGreaterThan(0);
      for (const f of forced) expect(ravinesState(f).row_count, `${f.file}: a forced reload of a byte-identical source must leave exactly ${LIVE_FEATURE_COUNT} rows`).toBe(LIVE_FEATURE_COUNT);
    }
  });

  it('#162 The same pass never both discovers and retires a fence', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, INTENT_LEDGER_COLS);
    for (const r of table.rows) {
      const discoverer = (r[col('discovered by')] ?? '').trim().toLowerCase();
      const adjudicator = (r[col('adjudicated by')] ?? '').trim().toLowerCase();
      expect(discoverer.length, `"${r[col('construct')]}" names no discoverer`).toBeGreaterThan(0);
      expect(adjudicator.length > 0 && !/awaiting|pending|tbd/.test(adjudicator), `"${r[col('construct')]}" names no adjudicator yet (§7.1 human ruling outstanding)`).toBe(true);
      expect(discoverer === adjudicator, `"${r[col('construct')]}" was discovered and dispositioned by the same pass (${discoverer})`).toBe(false);
    }
  });

  // ── A.13 Step testing (§15) ─────────────────────────────────────────────────

  it('#163 Tie-breaker 1 — a step test that survives swapping its compute is a runner test in the wrong place', async () => {
    const d = loadDescriptor();
    const stub = loadComputeStub();
    for (const c of d.checks.filter((x) => x.severity !== 'INFO')) {
      // ⚠️ FOLD NOTE (commit 7, 2026-08-25): a foreign compute reports a check id
      // THIS descriptor does not declare, and `ctx.report` throws on exactly that —
      // §5.5 (2)'s declared-check guard. A throw is the strongest possible form of
      // "the pair did not survive the swap", so it is caught and scored as such
      // rather than being allowed to error the test out before it can assert.
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
      expect(healthy, `check ${c.id}: healthy fixture should PASS (LG-5: a pct <= limit that is still unevaluable resolves to ${c.severity})`).toBe('PASS');
      expect(sabotaged, `check ${c.id}: its negative fixture PASSES — the check never looked`).toBe(c.severity);
    }
  });

  it('#167 Banned anti-pattern — no step test asserts ledger, lock or transaction behaviour', () => {
    loadDescriptor();
    // tokens built by concatenation so this list does not match itself
    const banned = ['withAdvisory' + 'Lock(', 'with' + 'Transaction(', 'openLedger' + 'Row', 'finalizeLedger' + 'Row', 'pg_advisory_' + 'xact_lock', 'INSERT INTO ' + 'pipeline_runs', 'finalizeStranded' + 'Run'];
    for (const f of stepTestDirFiles().filter((f) => /\.test\.ts$/.test(f))) {
      const src = stripComments(fs.readFileSync(abs(f), 'utf8'));
      for (const tok of banned) expect(src.includes(tok), `${f} asserts runner behaviour (${tok}) — 64 copies of the runner suite is negative coverage`).toBe(false);
    }
  });

  it('#169 Rung 1 inline-WKT is non-negotiable for every azimuth / KNN / area step — the compute computes no geometry (VALIDATION_SQL moved to write.js)', () => {
    const src = stripComments(computeSource());
    const spatial = /\bST_\w+|azimuth|<->|\bknn\b/i.test(src);
    if (spatial) {
      expect(stepTestDirFiles().some((f) => /rung1|inline-wkt/i.test(f)), 'a spatial compute with no rung-1 inline-WKT test').toBe(true);
    } else {
      expect(spatial, 'load_ravines computes pcts over library-provided counts; ST_* lives in write.js — conditionally vacuous, executed').toBe(false);
      expect(/\bST_\w+/.test(stripComments(readText(WRITE_REL))) || /\bST_\w+/.test(stripComments(readText(ACQUIRE_REL))), 'the geometry validation SQL (ST_MakeValid / ST_CollectionExtract) must live in the library, not vanish').toBe(true);
    }
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

  it('#172 Metamorphic invariants hold', () => {
    const src = stripComments(computeSource());
    const spatial = /\bST_\w+|azimuth|ST_Area/i.test(src);
    if (spatial) expect(stepTestDirFiles().some((f) => /metamorphic/i.test(f)), 'a spatial compute with no metamorphic suite').toBe(true);
    else expect(spatial, 'the compute computes no geometry — metamorphic invariants are conditionally vacuous, executed').toBe(false);
  });

  it('#173 Every golden snapshot query has an explicit `ORDER BY` — incl. the D-14 ordered content hash over ravines', () => {
    goldenDocs();
    const src = fs.readFileSync(abs(GOLDEN_HARNESS_REL), 'utf8');
    expect(/table_state/.test(src), `${GOLDEN_HARNESS_REL} captures no table_state (D-14 / LG-9 harness growth)`).toBe(true);
    const selects = [...src.matchAll(/`([^`]*\bSELECT\b[^`]*)`/gi)].map((m) => m[1] as string);
    expect(selects.length).toBeGreaterThan(0);
    for (const q of selects) {
      if (!/\bFROM\b/i.test(q)) continue;
      if (/\bstring_agg\s*\(/i.test(q)) { expect(/string_agg\s*\([^)]*ORDER BY/i.test(q), `unordered content-hash aggregate: ${q.replace(/\s+/g, ' ').trim()}`).toBe(true); continue; }
      if (/\bmax\(|\bcount\(/i.test(q)) continue; // aggregates have no row order
      expect(/\bORDER BY\b/i.test(q), `unordered golden query: ${q.replace(/\s+/g, ' ').trim()}`).toBe(true);
    }
  });

  it('#174 pgTAP carries schema assertions only', () => {
    loadDescriptor();
    const sql = walk(abs('src/tests')).filter((p) => p.endsWith('.sql') && /load[-_]ravines|\bravines\b/.test(fs.readFileSync(p, 'utf8')));
    for (const p of sql) {
      const body = fs.readFileSync(p, 'utf8');
      const calls = [...body.matchAll(/\b(is|isnt|cmp_ok|results_eq|row_eq)\s*\(/g)];
      expect(calls.length, `${path.relative(REPO_ROOT, p)} carries value assertions in pgTAP`).toBe(0);
    }
    expect(sql.every((p) => p.endsWith('.sql')), 'conditionally vacuous when no pgTAP file names this step, executed').toBe(true);
  });

  it('#176 Generator correctness is tested per branch — insert · update · distinct-noop · conflict-target, over the class-B SQL write.js generates', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|ON CONFLICT)\b/i.test(src), 'hand-written write SQL in the compute — §1.4: the class SELECTS the generated SQL').toBe(false);
    const sql = generatedSql(d);
    expect(/INSERT INTO\s+ravines/i.test(sql), 'branch:insert — INSERT INTO ravines').toBe(true);
    expect(/ON CONFLICT\s*\(\s*source_id\s*\)\s*DO UPDATE/i.test(sql), 'branch:conflict-target — ON CONFLICT (source_id) DO UPDATE').toBe(true);
    expect(/DO UPDATE SET[\s\S]*updated_at/i.test(sql), 'branch:update — the update path stamps updated_at').toBe(true);
    expect(/WHERE[\s\S]*IS DISTINCT FROM/i.test(sql), 'branch:distinct-noop — the guarded UPDATE is a no-op on identical rows').toBe(true);
    expect(/DELETE FROM\s+ravines[\s\S]*<>\s*ALL/i.test(sql), 'the scoped departure DELETE (class B)').toBe(true);
    expect(/created_at/i.test(sql.replace(/RETURNING[\s\S]*/i, '')) && !/INSERT INTO\s+ravines\s*\([^)]*created_at/i.test(sql), 'created_at is declared (D-2) but never written — DB default').toBe(true);
  });

  it('#180 Shapefile fixtures include one corrupt, one non-UTF8 `.dbf`, one missing `.prj` — this IS the shapefile step (acquire.js parses it)', () => {
    const acquire = stripComments(readText(ACQUIRE_REL));
    const parsesShapefiles = /require\(['"](shapefile|node-stream-zip)['"]\)|\.dbf\b|\.shp\b/.test(acquire);
    expect(parsesShapefiles, `${ACQUIRE_REL} does not parse the shapefile — acquisition has no home (A-2)`).toBe(true);
    for (const f of ['corrupt', 'non-utf8', 'missing-prj']) expect(stepTestDirFiles().some((x) => x.includes(f)), `no ${f} shapefile fixture under ${STEP_DIR_REL}`).toBe(true);
    expect(/require\(['"](shapefile|node-stream-zip)['"]\)/.test(stripComments(computeSource())), 'the compute parses shapefiles (compute-forbidden-require)').toBe(false);
  });

  it('#182 Fixtures are minimal — one row per branch, per check, plus null/empty/boundary', () => {
    const d = loadDescriptor();
    const w = healthyWorld();
    expect(w.acquired.feature_count).toBe(LIVE_FEATURE_COUNT);
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
      .filter((f) => !f.startsWith(STEP_DIR_REL) && /fixtures?\//.test(f) && /ravine/i.test(path.basename(f)));
    expect(strays, 'load_ravines fixtures outside the step directory').toEqual([]);
  });

  // ── A.15 Load-bearing intent that must survive conversion (§9.2) ──────────

  it('#199 No step defines its own `verdictCascade` — the :143-147 cascade is retired to verdict.js', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(/verdictCascade|verdict\s*[:=]/.test(src), 'the compute computes a verdict').toBe(false);
    expect(/\?\s*['"]FAIL['"]\s*:\s*['"](PASS|WARN)['"]/.test(src), 'a parallel-boolean cascade (hasFails ? FAIL : PASS)').toBe(false);
    for (const t of d.terminals) expect(typeof t.records_meta === 'object' && 'verdict' in t.records_meta, `terminal ${t.id} declares a verdict`).toBe(false);
    const step = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/verdictCascade/.test(step), 'the frozen-shape step still carries verdictCascade').toBe(false);
  });

  it('#200 The §11 Counter Semantic Contract — records_total = ravine polygons (feature_count), _new = inserted, _updated = updated, scoped by source_id', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(d.counters, 'a LOADER declares its counters (primary entity = ravine polygons, §11)').not.toBe('none');
    const c = d.counters as { records_total: { source: string; scoped_by: unknown }; records_new: { source: string }; records_updated: { source: string } };
    expect(/feature_count/.test(c.records_total.source), `records_total.source "${c.records_total.source}" is not the primary entity count`).toBe(true);
    expect(/insert/.test(c.records_new.source), `records_new.source "${c.records_new.source}"`).toBe(true);
    expect(/update/.test(c.records_updated.source), `records_updated.source "${c.records_updated.source}"`).toBe(true);
    expect(/records_total|records_new|records_updated/.test(src), 'the compute assigns a counter the library derives from `counters`').toBe(false);
  });

  it('#201 `load-massing`\'s `ON CONFLICT` area-column exclusion — here: ON CONFLICT lives ONLY in the generated SQL, never in the compute', () => {
    const src = stripComments(computeSource());
    expect(/ON CONFLICT/i.test(src), 'a hand-written ON CONFLICT in the compute (§1.4 lint)').toBe(false);
    expect(/ON CONFLICT/i.test(stripComments(readText(WRITE_REL))), `${WRITE_REL} generates no ON CONFLICT — the class-B upsert has no generator`).toBe(true);
  });

  it('#202 The `tier_1_exact_address` name freeze', () => {
    const src = stripComments(computeSource());
    const tiers = [...src.matchAll(/tier_1\w*/g)].map((m) => m[0]);
    for (const t of tiers) expect(t).toBe('tier_1_exact_address');
    expect(tiers.every((t) => t === 'tier_1_exact_address'), 'conditionally vacuous for this step, executed').toBe(true);
  });

  it('#203 Frozen `records_meta` producer/consumer blocks — ravine_load → enrich_ravines, all 7 consumed fields declared and read', () => {
    const d = loadDescriptor();
    const emits = emitsOf(d);
    const e = emits.find((x) => x.key === EMIT_KEY);
    expect(e, `emits[] does not declare ${EMIT_KEY}`).toBeDefined();
    expect((e as { consumers: string[] }).consumers, `consumers names the manifest slug ${CONSUMER_SLUG}`).toContain(CONSUMER_SLUG);
    expect((e as { consumers: string[] }).consumers.map(consumerFile)).toContain('scripts/enrich-ravines.js');
    const success = d.terminals.find((t) => t.kind === 'success');
    expect(success, 'a success terminal').toBeDefined();
    const shape = (success as { records_meta: Record<string, string> }).records_meta;
    for (const x of emits) expect(Object.keys(shape), `emits.${x.key} is not in the success terminal's records_meta shape`).toContain(x.key);
    const descriptorText = JSON.stringify(d);
    for (const consumer of (e as { consumers: string[] }).consumers) {
      const file = consumerFile(consumer);
      expect(fs.existsSync(abs(file)), `consumer ${consumer} (${file}) of ${EMIT_KEY} does not exist`).toBe(true);
      const src = fs.readFileSync(abs(file), 'utf8');
      expect(src.includes(EMIT_KEY), `${file} never reads ${EMIT_KEY}`).toBe(true);
      for (const f of CONSUMED_FIELDS) {
        expect(src.includes(f), `${file} does not read ${f}`).toBe(true);
        expect(descriptorText.includes(f), `the descriptor never declares consumed field ${f} (D-6: the 7-field contract)`).toBe(true);
      }
    }
    expect(d.identity.spec_version, 'C-9: enrich-ravines.js:42 pins spec_version === "1.2" — never "fix" to the Spec 59 header').toBe('1.2');
  });

  it('#204 `RUN_AT` captured once — the midnight-cross fence (DB clock, library-owned; zero clock reads in the compute)', () => {
    const src = stripComments(computeSource());
    expect(/new Date\s*\(|Date\.now\s*\(/.test(src), 'new Date()/Date.now() in a pipeline compute (Spec 47 §R3.5)').toBe(false);
    expect((src.match(/getDbTimestamp\(/g) ?? []).length, 'the DB clock captured in the compute').toBe(0);
    expect(/\bNOW\(\)/i.test(src), 'a DB-side NOW() write from the compute').toBe(false);
    const lib = [ACQUIRE_REL, STALENESS_REL, WRITE_REL, 'scripts/lib/step/index.js'].map((f) => stripComments(readText(f))).join('\n');
    expect((lib.match(/getDbTimestamp\(/g) ?? []).length, 'the library captures the DB clock at most once per run').toBeLessThanOrEqual(1);
  });

  it('#205 Lock-ID uniqueness across manifest ∪ `one-time/` ∪ `backfill/` — lock 59 textual and unique', () => {
    const d = loadDescriptor();
    const textual = /const ADVISORY_LOCK_ID\s*=\s*(\d+)/.exec(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(textual, 'the §5.4 textual constant').not.toBeNull();
    expect(d.identity.lock).toBe(Number((textual as RegExpExecArray)[1]));
    expect(d.identity.lock).toBe(LOCK_ID);
    const holders = walk(abs('scripts'))
      .filter((p) => p.endsWith('.js') && !p.includes(`${path.sep}_schema${path.sep}fixtures${path.sep}`) && !p.includes(`${path.sep}node_modules${path.sep}`))
      .map((p) => path.relative(REPO_ROOT, p).replace(/\\/g, '/'))
      .filter((f) => f !== STEP_REL && new RegExp(`ADVISORY_LOCK_ID\\s*=\\s*${d.identity.lock}\\b`).test(fs.readFileSync(abs(f), 'utf8')));
    expect(holders, `another script (manifest, one-time/ or backfill/) also holds lock ${d.identity.lock}`).toEqual([]);
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

  it('#175 [PARTIAL] All generated statements PREPARE/EXPLAIN cleanly — the converted subset (the class-B statements write.js generates) is syntactically well-formed and the compute issues no SQL', () => {
    const d = loadDescriptor();
    const src = stripComments(computeSource());
    expect(/\.query\s*\(|streamQuery\(|withTransaction\s*\(/.test(src), 'a compute issuing SQL — a statement outside the PREPARE/EXPLAIN gate').toBe(false);
    const sql = generatedSql(d);
    // The DB-side PREPARE is the k=27 closure (needs the live pool); the partial gated now is the
    // syntactic half — balanced parentheses and a contiguous $1..$n placeholder set per statement.
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter((s) => /\b(INSERT|UPDATE|DELETE|SELECT|WITH)\b/i.test(s))) {
      const open = (stmt.match(/\(/g) ?? []).length;
      const close = (stmt.match(/\)/g) ?? []).length;
      expect(open, `unbalanced parentheses in: ${stmt.slice(0, 80)}…`).toBe(close);
      const params = [...new Set([...stmt.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
      params.forEach((p, i) => expect(p, `placeholder gap in: ${stmt.slice(0, 80)}…`).toBe(i + 1));
    }
  });

  it('#181 [PARTIAL] `pg_trgm` precision/recall never regress below a committed number — ratchet baseline exists iff trigram matching is used', () => {
    const src = stripComments(computeSource());
    const usesTrgm = /similarity\(|pg_trgm|word_similarity/.test(src);
    if (usesTrgm) expect(stepTestDirFiles().some((f) => /precision|recall|baseline/i.test(f)), 'trigram matching with no committed baseline').toBe(true);
    else expect(usesTrgm, 'load_ravines does no fuzzy matching — conditionally vacuous, executed').toBe(false);
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

  it('#206 [PARTIAL] `records_meta` merge collisions are detected — this step\'s keys vs the chain-level keys, vs pilot 1\'s keys (two real producers now), and a two-producer fixture', () => {
    const d = loadDescriptor();
    const runChain = fs.readFileSync(abs('scripts/run-chain.js'), 'utf8');
    const chainKeys = new Set<string>(['pipeline_meta', ...[...runChain.matchAll(/metaObj\.(\w+)\s*=/g)].map((m) => m[1] as string)]);
    expect(chainKeys.size, 'the chain-level taken keys parsed from run-chain.js').toBeGreaterThanOrEqual(3);
    const mine = new Set<string>(emitsOf(d).map((e) => e.key));
    for (const t of d.terminals) if (typeof t.records_meta === 'object') for (const k of Object.keys(t.records_meta)) mine.add(k);
    const collisions = (a: Set<string>, b: Set<string>): string[] => [...a].filter((k) => b.has(k));
    expect(collisions(mine, chainKeys), 'this step emits a key the chain merge clobbers (run-chain merges shallowly)').toEqual([]);
    // k=2 closure: two converted producers exist. Their step-specific emits must not collide.
    const pilot1 = JSON.parse(fs.readFileSync(abs('scripts/quality/assert-schema.descriptor.json'), 'utf8')) as Descriptor;
    const theirs = new Set<string>(pilot1.emits === 'none' ? [] : pilot1.emits.map((e) => e.key));
    expect(collisions(mine, theirs), 'load_ravines emits a key assert_schema also emits').toEqual([]);
    expect(collisions(new Set(['audit_table', 'x']), new Set(['audit_table', 'y'])), 'two-producer fixture').toEqual(['audit_table']);
  });
});

// ===========================================================================
// The three files, one slug — the descriptor (Fold A/B + A-1…A-5 rulings), the compute, the shape,
// the three library modules
// ===========================================================================

describe('the three files, one slug (Spec 122 §4.1 / §5.1 / §5.2) + the Fold B library growth', () => {
  it('descriptor exists, validates, and carries the A-3/A-4/A-5 rulings + Fold A corrections', () => {
    const d = loadDescriptor();
    expect(d.identity.name).toBe('load_ravines');
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.archetype).toMatch(/INGESTOR|LOADER/);
    // P4 — the six tunables, none hidden (closes review_followups #421)
    expect(d.config, 'config:"none" while six ConfigSchema knobs exist is the hidden-variable failure P4 closes').not.toBe('none');
    const names = (d.config as { logic_variables: Array<{ name: string }> }).logic_variables.map((v) => v.name).sort();
    expect(names).toEqual(Object.values(CONFIG_VARS).sort());
    const byName = Object.fromEntries((d.config as { logic_variables: Array<{ name: string; on_invalid: string; min: unknown; max: unknown }> }).logic_variables.map((v) => [v.name, v]));
    expect(byName[CONFIG_VARS.T2]?.on_invalid, 'T2 verdict bound: on_invalid fail').toBe('fail');
    expect(byName[CONFIG_VARS.T4]?.on_invalid, 'T4 verdict bound: on_invalid fail').toBe('fail');
    expect(byName[CONFIG_VARS.T5]?.on_invalid, 'T5 verdict bound: on_invalid fail').toBe('fail');
    expect(byName[CONFIG_VARS.T6]?.on_invalid, 'T6 timeout: on_invalid clamp').toBe('clamp');
    for (const v of Object.values(CONFIG_VARS)) expect(byName[v]?.min !== 'none' && byName[v]?.max !== 'none', `${v} declares both bounds`).toBe(true);
    // A-4 (1) — T2–T5 are verdict bounds rendered from the resolved value; each bound to exactly one check
    for (const v of LIMIT_FROM_CONFIG_VARS) {
      const bound = d.checks.filter((c) => c.limit_from_config === v);
      expect(bound.length, `${v} must be bound to exactly one check via limit_from_config`).toBe(1);
      expect(typeof bound[0]?.limit === 'string' && /^pct <= /.test(bound[0].limit), `${bound[0]?.id}: a pct-shaped limit (LG-5)`).toBe(true);
    }
    expect(checkByVar(d, CONFIG_VARS.T2).severity).toBe('FAIL');
    expect(checkByVar(d, CONFIG_VARS.T3).severity).toBe('WARN');
    expect(checkByVar(d, CONFIG_VARS.T4).severity).toBe('FAIL');
    expect(checkByVar(d, CONFIG_VARS.T5).severity).toBe('FAIL');
    // T6 mirrors execution.network.timeout — the two must AGREE (P1.1 vs P4 tension)
    expect(d.execution.network).not.toBe('none');
    const timeout = (d.execution.network as { timeout: string }).timeout;
    expect(timeout, 'execution.network.timeout must name the T6 variable or its value, not a bare unrelated literal').toMatch(new RegExp(`${CONFIG_VARS.T6}|60000|60s|1m`));
    // A-3 — force_run
    expect(d.override, 'override:"none" — no force mechanism, the write path is untestable (finding #3)').not.toBe('none');
    const o = d.override as { force_run: string; force_full: string; accept_anomaly?: Array<{ env: string; check_id: string }> };
    expect(o.force_run).toBe(FORCE_RUN_ENV);
    expect(o.force_full, 'supports_full:false in the manifest — no force_full').toBe('none');
    // A-5 — the two accept-anomaly overrides, each naming a declared FAIL check
    expect(Array.isArray(o.accept_anomaly), 'override.accept_anomaly[] (A-5 box)').toBe(true);
    expect((o.accept_anomaly ?? []).map((a) => a.env).sort()).toEqual([...ACCEPT_ENVS].sort());
    for (const a of o.accept_anomaly ?? []) expect(checkById(d, a.check_id).severity, `accept_anomaly ${a.env} must point at a FAIL check`).toBe('FAIL');
    const massDelete = (o.accept_anomaly ?? []).find((a) => a.env === 'RAVINE_ACCEPT_MASS_DELETE');
    expect(massDelete?.check_id, 'RAVINE_ACCEPT_MASS_DELETE accepts the T5 mass-delete check (fence F-1)').toBe(checkByVar(d, CONFIG_VARS.T5).id);
    const drift = (o.accept_anomaly ?? []).find((a) => a.env === 'RAVINE_ACCEPT_FEATURE_COUNT_DRIFT');
    expect(drift?.check_id, 'RAVINE_ACCEPT_FEATURE_COUNT_DRIFT accepts the T2 count-drift check').toBe(checkByVar(d, CONFIG_VARS.T2).id);
    // Fold A — RLS precondition, fail-loud before the write
    const rls = d.guards.requires.filter((r) => r.kind === RLS_REQUIREMENT_KIND);
    expect(rls.map((r) => r.name), `guards.requires must carry ${RLS_REQUIREMENT_KIND} on ${WRITE_TABLE}`).toContain(WRITE_TABLE);
    for (const r of rls) expect(r.on_missing, 'a non-bypass role UPSERTs 0 rows silently — fail, never degrade').toBe('fail');
    expect(d.guards.srid, 'S6 → guards.srid').toBe(4326);
    expect(d.guards.requires.map((r) => r.name), 'the two GIST indexes').toEqual(expect.arrayContaining(['idx_ravines_geom_gist', 'idx_ravines_geog_gist']));
    // D-2 / §1.4 — the write target
    const w = writes(d);
    expect(w.length).toBe(1);
    expect(w[0]?.table).toBe(WRITE_TABLE);
    expect(w[0]?.key).toBe('source_id');
    expect(w[0]?.write_discipline.class).toBe(WRITE_CLASS);
    expect(w[0]?.columns.map((c) => c.name).sort(), 'all 5 columns incl. created_at (D-2: declared, never written)').toEqual([...WRITE_COLUMNS].sort());
    expect(w[0]?.retract, 'class B retracts departed rows').toBe('departed');
    expect(w[0]?.replay).toBe('idempotent_upsert');
    expect(d.execution.txn_scope, 'LG-2: the upsert loop and the departure DELETE commit together').toBe('step');
    // LG-3 — two triggers at two lifecycle positions
    const triggers = d.staleness.trigger;
    expect(Array.isArray(triggers)).toBe(true);
    const t = triggers as Array<{ signal: string; position: string }>;
    expect(t.some((x) => x.signal === 'source_validator' && x.position === 'pre_acquisition'), 'tier-1: source_validator @ pre_acquisition').toBe(true);
    expect(t.some((x) => x.signal === 'content_hash' && x.position === 'post_acquisition'), 'tier-2: content_hash @ post_acquisition (fence F-2)').toBe(true);
    // D-11 — the floor is the ravines DDL, not the current head
    expect(d.database.min_migration).toBe(MIN_MIGRATION);
    // D-8 — PIN, DO NOT FIX: a FAIL row today exits 0 and the chain continues; blocking:true would smuggle a halt
    for (const c of d.checks) expect(c.blocking, `check ${c.id} is blocking — D-8 smuggles a chain-halt into a "no-op diff"`).toBe(false);
    // LG-6 — the 10 exit paths
    expect(d.terminals.length, 'G0: 10 terminals').toBe(TERMINAL_COUNT);
    expect(d.terminals.filter((x) => x.kind === 'skip_gated').length, 'tier-1 + tier-2 skip terminals').toBeGreaterThanOrEqual(2);
    expect(d.terminals.some((x) => x.kind === 'skip_lock_contention'), 'D-10').toBe(true);
    expect(d.terminals.some((x) => x.status === 'failed'), 'the mass-delete FAIL terminal').toBe(true);
    // D-4 — the INFO metric rows survive as declared INFO checks
    expect(d.checks.filter((c) => c.severity === 'INFO').length, 'D-4: dataset_source_license · feature_count · geometry_repaired_pct · geometry_collection_extracted as INFO checks').toBeGreaterThanOrEqual(4);
    // D-1 — the CKAN source is an external, not a read table
    expect(d.inputs.reads.externals.some((e) => /ravine/.test(e.id) && (e.url ?? '').includes('ravine-natural-feature-protection-area-wgs84.zip')), 'the CKAN ZIP as inputs.reads.externals[]').toBe(true);
    expect(d.inputs.reads.tables.map((x) => x.table)).toEqual([]);
  });

  it('notes.json is real (≤12 entries, fences × 2) and its counts self-declare', () => {
    const notes = loadNotes();
    const entries = notesEntries(notes);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(NOTES_CAP);
    expect((notes.fences ?? []).length).toBe(2);
    expect(notes.counts, 'counts block').toBeDefined();
    const text = JSON.stringify(notes);
    // The interpretation content that exists only as comments today (:37-39 #409, :12-14 DEC-B, the 2022 freeze, :431)
    expect(/sources:load_ravines/.test(text), 'the #409 pipeline-name correction').toBe(true);
    expect(/DEC-B|geometry-validator/.test(text), 'the DEC-B divergence from geometry-validator.js').toBe(true);
    expect(/2022/.test(text), 'the 2022-frozen source (skip is the normal terminal)').toBe(true);
  });

  it('compute exists, exports `checks` (dispatch keyed by the descriptor ids, in order) + the 9 pure helpers; requires no fs/pg/pipeline and opens no pool', () => {
    artifact(COMPUTE_REL);
    const d = loadDescriptor();
    const p = probe(COMPUTE_REL);
    expect(p.require_error, 'require() threw').toBeNull();
    expect(p.pools + p.clients, 'a pool/client constructed at require time').toBe(0);
    const src = stripComments(computeSource());
    expect(/pipeline\.run\s*\(/.test(src), 'pipeline.run in the compute').toBe(false);
    expect(/new\s+(pg\.)?Pool\s*\(/.test(src)).toBe(false);
    expect(/require\(\s*['"](fs|node:fs|os|child_process|pg|dotenv|crypto|node-stream-zip|shapefile|stream\/promises|\.\.\/pipeline|\.\.\/step|\.\.\/step\/[a-z]+|\.\.\/resolve-db|\.\.\/source-version|\.\.\/config-loader)['"]\s*\)/.test(src), 'compute-forbidden-require: acquisition/IO in the compute').toBe(false);
    const mod = loadComputeModule();
    expect(typeof mod.compute).toBe('function');
    expect(mod.checks && typeof mod.checks === 'object', '`checks` dispatch table').toBe(true);
    expect(Object.keys(mod.checks as object), '§5.5 (1): dispatch keys ≡ descriptor check ids, in order').toEqual(d.checks.map((c) => c.id));
    for (const [id, fn] of Object.entries(mod.checks as Record<string, (ctx: unknown) => unknown>)) {
      expect(typeof fn, `checks.${id}`).toBe('function');
      expect(fn.name, `checks.${id}.name`).toBe(id);
    }
    for (const h of PURE_HELPERS) expect(typeof mod[h], `pure helper ${h} is not a named export (Fold A export-surface collapse)`).toBe('function');
    for (const gone of ['skipCheckDecision', 'verdictCascade', 'locateShapefile', 'VALIDATION_SQL']) expect(gone in mod, `${gone} must NOT live in the compute (re-homed: staleness / verdict.js / acquire.js / write.js)`).toBe(false);
    expect(/^\s*\/\/.*SPEC LINK:|\* SPEC LINK:/m.test(fs.readFileSync(abs(COMPUTE_REL), 'utf8').split('\n').slice(0, 30).join('\n')), 'SPEC LINK header').toBe(true);
    // the pure helpers still compute what load-ravines.logic.test.ts locked (a spot check, values from the live baseline)
    const pct = mod.computeMassDeletePct as (deleted: number, prior: number | null) => number;
    expect(pct(800, LIVE_FEATURE_COUNT)).toBeCloseTo(800 / LIVE_FEATURE_COUNT, 6);
    expect(pct(0, LIVE_FEATURE_COUNT)).toBe(0);
  });

  it('the step file is the §5.1 frozen shape (ast-grep silent, no pipeline.run), SPEC LINK kept, lock 59 textual', () => {
    computeSource(); // red until commit 7 — the shape cannot exist without the compute
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(src.split('\n').slice(0, 30).join('\n').includes('SPEC LINK:'), 'the frozen file must keep the SPEC LINK header').toBe(true);
    expect(/const ADVISORY_LOCK_ID\s*=\s*59;/.test(src), 'S1 — kept textually per §5.4 so pipeline-advisory-lock.infra.test.ts:253/:301 stay green').toBe(true);
    expect(/module\.exports\s*=\s*pipeline\.step\(descriptor,\s*compute\)/.test(src)).toBe(true);
    expect(/module\.exports\.descriptor\s*=\s*descriptor/.test(src)).toBe(true);
    expect(/module\.exports\.compute\s*=\s*compute/.test(src)).toBe(true);
    expect(/process\.env|fetch\s*\(|require\(['"]fs['"]\)/.test(stripComments(src)), 'env/fetch/fs in the frozen-shape file').toBe(false);
    expect(runShapeRule([STEP_REL]), 'ast-grep violations on the converted step').toEqual([]);
    const p = probe(STEP_REL);
    expect(p.require_error).toBeNull();
    expect(p.pools + p.clients).toBe(0);
    expect(p.has_descriptor && p.compute_type === 'function').toBe(true);
  });

  it('converted.json registers the step (commit 9 arms the A2 gate: 2/62)', () => {
    computeSource();
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] };
    expect(converted.converted).toContain(STEP_REL);
    expect(converted.converted.length).toBeGreaterThanOrEqual(2);
  });

  it('acquire.js — the ONE home for the content-hash gate (Fold B item 3) and the acquisition seam (A-2)', () => {
    const lib = loadLib(ACQUIRE_REL);
    const src = stripComments(fs.readFileSync(abs(ACQUIRE_REL), 'utf8'));
    expect(Object.values(lib).some((v) => typeof v === 'function'), 'acquire.js exports a function').toBe(true);
    expect(detectHashGateFence({ file: ACQUIRE_REL, text: src }), 'the F-2 constructs (contentHashDecision · tier2 · buildSkipReEmitMeta · streamed hash; no arrayBuffer/readFileSync)').toEqual([]);
    expect(/rmSync\s*\([^)]*recursive/.test(src), 'the :372 temp-dir cleanup (fs.rmSync recursive) must survive wherever acquisition lands').toBe(true);
    expect(/force_run/.test(src) || /force_run/.test(stripComments(fs.readFileSync(abs(STALENESS_REL), 'utf8'))) || /force_run/.test(stripComments(fs.readFileSync(abs('scripts/lib/step/index.js'), 'utf8'))), 'LG-10: nothing reads override.force_run — G8(b) stays red with a dead field').toBe(true);
  });

  it('staleness.js — owns only the pre-acquisition validator gate (skipCheckDecision)', () => {
    const lib = loadLib(STALENESS_REL);
    expect(typeof lib.skipCheckDecision, 'skipCheckDecision re-homed from the step (LG-3)').toBe('function');
    const src = stripComments(fs.readFileSync(abs(STALENESS_REL), 'utf8'));
    expect(/contentHashDecision\s*\(/.test(src), 'the content-hash decision belongs to acquire.js, not staleness.js (one home)').toBe(false);
  });

  it('write.js — generates the class-B SQL: IS DISTINCT FROM · RETURNING (xmax = 0) · <> ALL($1::BIGINT[]); emits rows_scanned/rows_changed (D-13)', () => {
    const d = loadDescriptor();
    const sql = generatedSql(d);
    for (const [name, re] of SQL_CONSTRUCTS) expect(re.test(sql), `generated SQL lacks the ${name}`).toBe(true);
    const src = stripComments(fs.readFileSync(abs(WRITE_REL), 'utf8'));
    expect(/rows_scanned/.test(src) && /rows_changed/.test(src), 'D-13: the write path emits rows_scanned / rows_changed').toBe(true);
    expect(/expected_change_ratio/.test(src), 'D-13: rows_changed checked against expected_change_ratio').toBe(true);
    expect(/idempotent_rerun/.test(src), 'D-13: idempotent_rerun "zero_writes" asserted (run twice, second run updates 0)').toBe(true);
    expect(/load[_-]ravines|\bravines?\b/.test(src), 'write.js is generic — the table name comes from outputs.writes[]').toBe(false);
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
// F-1 1ceebd17 (mass-delete abort) is BEHAVIOURAL: the lock measures verdict.js rows → status,
//     not the `:553` regex. Present-direction runs the FUTURE compute; reversion-direction is
//     green today because the detector fires on a sabotaged row set built through the real checkRow.
// F-2 0b230472 (content-hash gate) is a CODE-TEXT lock: present-direction reads the FUTURE
//     acquire.js; reversion-direction runs the detector over today's subject (the legacy step)
//     and over a string carrying arrayBuffer()/readFileSync — green today.
// ===========================================================================

describe('G4d fence locks', () => {
  it(`F1 ${F1_COMMIT} — present in the converted step (compute + descriptor): ${F1_CONSTRUCT}`, async () => {
    const d = loadDescriptor();
    const compute = loadCompute();
    const check = checkByVar(d, CONFIG_VARS.T5);
    expect(check.severity).toBe('FAIL');
    const w = healthyWorld();
    (SABOTAGE_BY_VAR[CONFIG_VARS.T5] as (w: World) => void)(w);
    const rows = await runCompute(compute, d, w);
    expect(rows[check.id], 'mass delete over the limit → FAIL row').toBe('FAIL');
    // the override lets an acknowledged full reload COMPLETE but never suppresses the FAIL row (L7c)
    const accepted = healthyWorld();
    (SABOTAGE_BY_VAR[CONFIG_VARS.T5] as (w: World) => void)(accepted);
    accepted.overrides.accept_mass_delete = true;
    const acceptedRows = await runCompute(compute, d, accepted);
    expect(acceptedRows[check.id], 'RAVINE_ACCEPT_MASS_DELETE must NOT suppress the FAIL row').toBe('FAIL');
    expect(Object.keys(acceptedRows).some((m) => /override.*mass_delete|mass_delete.*override|accept/.test(m)), 'the override-present WARN row (ravine_override_mass_delete_present)').toBe(true);
    const fence = (loadNotes().fences ?? []).find((f) => f.commit.startsWith(F1_COMMIT));
    expect(fence, 'notes.fences carries 1ceebd17').toBeDefined();
    expect(d.terminals.some((t) => t.status === 'failed' && t.kind === 'fail_check'), 'the fail_check terminal (status failed) the abort lands on').toBe(true);
  });

  it(`F1 ${F1_COMMIT} — reversion is detectable: the patch applied to the current subject makes the lock fire (verdict.js deriveVerdict + RUN_STATUS.FAILED)`, () => {
    // Positive control: the healthy row set (under the limit) is silent.
    const healthy: MassDeleteInput = { rows: [massDeleteRow(false)], overLimit: false, accepted: false };
    expect(detectMassDeleteFence(healthy), 'the lock fires on a healthy run — it is not measuring the fence').toEqual([]);
    // The fence as it stands: over the limit, not accepted → FAIL row and status `failed`.
    const current: MassDeleteInput = { rows: [massDeleteRow(true)], overLimit: true, accepted: false };
    expect(current.rows[0]?.status).toBe('FAIL');
    expect(deriveVerdict(current.rows)).toBe('FAIL');
    expect(statusFor(deriveVerdict(current.rows))).toBe(RUN_STATUS.FAILED);
    expect(detectMassDeleteFence(current), 'the lock fires on the un-reverted subject').toEqual([]);
    // The reversion: the FAIL row silently downgraded — the pre-review "non-functional abort".
    const reverted = revertMassDeleteFence(current);
    expect(reverted, 'the reversion patch must change the subject').not.toEqual(current);
    const findings = detectMassDeleteFence(reverted);
    expect(findings.length, `reverting fence ${F1_COMMIT} went undetected`).toBeGreaterThan(0);
    expect(statusFor(deriveVerdict(reverted.rows))).not.toBe(RUN_STATUS.FAILED);
    // And the other half of L7c: accepted → the run may complete, but the FAIL row must still be there.
    const acceptedReverted = { ...revertMassDeleteFence(current), accepted: true };
    expect(detectMassDeleteFence(acceptedReverted).some((f) => /not FAIL/.test(f)), 'the override suppressing the FAIL row is detected').toBe(true);
  });

  it(`F2 ${F2_COMMIT} — present in the converted step (acquire.js + descriptor): ${F2_CONSTRUCT}`, () => {
    artifact(ACQUIRE_REL, 'Fold B item 3: the content-hash gate moves INTO acquire.js');
    const d = loadDescriptor();
    const src = stripComments(fs.readFileSync(abs(ACQUIRE_REL), 'utf8'));
    expect(detectHashGateFence({ file: ACQUIRE_REL, text: src }), `fence ${F2_COMMIT} is not carried by the library`).toEqual([]);
    const triggers = d.staleness.trigger as Array<{ signal: string; position: string }>;
    expect(triggers.some((t) => t.signal === 'content_hash' && t.position === 'post_acquisition'), 'the tier-2 gate is declared at its lifecycle position').toBe(true);
    const step = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/contentHashDecision\s*\(/.test(step), 'the gate must not ALSO live in the step (one home)').toBe(false);
    const fence = (loadNotes().fences ?? []).find((f) => f.commit.startsWith(F2_COMMIT));
    expect(fence, 'notes.fences carries 0b230472').toBeDefined();
  });

  it(`F2 ${F2_COMMIT} — reversion is detectable: the patch applied to the current subject makes the lock fire (arrayBuffer()/readFileSync)`, () => {
    // Positive control: silent on the subject as it stands (legacy step today, acquire.js after commit 7).
    const current = hashGateSubject();
    expect(detectHashGateFence(current), `the lock fires on the un-reverted subject ${current.file} — it is not measuring the fence`).toEqual([]);
    const reverted = revertHashGateFence(current);
    expect(reverted, 'the reversion patch must change the subject').not.toEqual(current);
    const findings = detectHashGateFence(reverted);
    expect(findings.length, `reverting fence ${F2_COMMIT} went undetected`).toBeGreaterThan(0);
    expect(findings.some((f) => /arrayBuffer/.test(f)), 'the whole-buffer download is named').toBe(true);
    expect(findings.some((f) => /contentHashDecision/.test(f)), 'the missing gate is named').toBe(true);
    // Each banned construct fires on its own.
    expect(detectHashGateFence({ file: 'x', text: `${current.text}\nconst b = fs.readFileSync(tmp);` }).some((f) => /readFileSync/.test(f))).toBe(true);
    expect(detectHashGateFence({ file: 'x', text: `${current.text}\nBuffer.from(await res.arrayBuffer())` }).some((f) => /arrayBuffer/.test(f))).toBe(true);
  });

  it('the two fences are exactly the two Severity:-footer commits on the step file', () => {
    const footers = git(['log', '--format=%H%x1f%B%x1e', '--', STEP_REL]).split('\x1e').filter((c) => /^Severity:/m.test(c));
    const fenced = footers.map((c) => (c.split('\x1f')[0] ?? '').trim().slice(0, 8)).filter(Boolean);
    for (const c of FENCE_COMMITS) expect(fenced, `fence commit ${c} has no Severity: footer on ${STEP_REL}`).toContain(c);
    expect(fenced.length, 'fence density (Spec 123 §6 G1)').toBe(FENCE_COMMITS.length);
  });
});

// ---------------------------------------------------------------------------
// Peel 8b — the audit-row shape (LR-D1). One row, capped detail, exact count.
// ---------------------------------------------------------------------------

describe('LR-D1 — the dropped source ids are ONE row\'s detail, capped, count exact (peel 8b)', () => {
  interface SkipObservation {
    value: number;
    detail: number | { pct: number; dropped_count: number; dropped_source_ids: number[]; dropped_ids_truncated: boolean };
  }

  /** Drive the ONE check under test through the real dispatch table, counting report() calls. */
  function reportsFor(droppedCount: number): Array<[string, SkipObservation]> {
    const mod = loadComputeModule();
    const check = (mod.checks ?? {})['ravine_geometry_skipped_pct'];
    expect(typeof check, 'the descriptor declares ravine_geometry_skipped_pct — the dispatch must carry it').toBe('function');
    const calls: Array<[string, SkipObservation]> = [];
    check({
      acquired: {
        feature_count: LIVE_FEATURE_COUNT,
        invalid_geometry_skipped: droppedCount,
        skipped_keys: Array.from({ length: droppedCount }, (_, i) => 1_000_000 + i),
      },
      report: (id: string, o: SkipObservation) => { calls.push([id, o]); },
    } as never);
    return calls;
  }

  const CAP = (loadComputeModule().MAX_DETAIL_KEYS as number | undefined) ?? -1;

  it('the cap is declared by the compute and by the descriptor (a magic 50 in one place only is not a bound)', () => {
    expect(CAP, `${COMPUTE_REL} must export MAX_DETAIL_KEYS`).toBeGreaterThan(0);
    const d = loadDescriptor();
    const check = d.checks.find((c) => c.id === 'ravine_geometry_skipped_pct');
    expect(check, 'the check must be declared').toBeDefined();
    const why = JSON.stringify(check?.why ?? {});
    expect(why.includes(String(CAP)), `the check's why must state the cap (${CAP})`).toBe(true);
    const limitations = JSON.stringify(d.limitations ?? []);
    expect(limitations.includes('dropped_source_ids'), 'a limitation must record that the id list can be a prefix').toBe(true);
  });

  it('PRESENT — 3× the cap of dropped ids still produces exactly ONE report, with the exact count', () => {
    const n = CAP * 3;
    const calls = reportsFor(n);
    expect(calls.length, `${n} dropped features must not produce ${n} rows — that is the pre-conversion shape`).toBe(1);
    expect(calls[0]![0]).toBe('ravine_geometry_skipped_pct');
    const detail = calls[0]![1].detail as { dropped_count: number; dropped_source_ids: number[]; dropped_ids_truncated: boolean };
    expect(detail.dropped_count, 'the COUNT is never truncated').toBe(n);
    expect(detail.dropped_source_ids.length, 'the LIST is capped').toBe(CAP);
    expect(detail.dropped_ids_truncated, 'and the truncation is declared, not inferred from a length').toBe(true);
  });

  it('PRESENT — under the cap the list is complete and says so', () => {
    const n = CAP - 1;
    const detail = reportsFor(n)[0]![1].detail as { dropped_count: number; dropped_source_ids: number[]; dropped_ids_truncated: boolean };
    expect(detail.dropped_count).toBe(n);
    expect(detail.dropped_source_ids.length).toBe(n);
    expect(detail.dropped_ids_truncated).toBe(false);
  });

  it('PRESENT — nothing dropped means no id list at all (the row is a bare ratio)', () => {
    const detail = reportsFor(0)[0]![1].detail;
    expect(typeof detail, 'a clean load must not carry an empty ids envelope').toBe('number');
  });

  it('REVERSION IS DETECTABLE — a per-id metric cannot even be reported (the declared-check guard)', async () => {
    const d = loadDescriptor();
    const ids = new Set(d.checks.map((c) => c.id));
    // The pre-conversion metric name. It is not a declared check and must never become
    // one: `ctx.report` refuses an undeclared id, so the unbounded shape is structurally
    // unreachable rather than merely absent from today's code.
    expect(ids.has('ravine_geometry_skipped_source_id'), 'the unbounded per-feature metric must not be declared').toBe(false);
    const compute = loadCompute();
    const reported: string[] = [];
    const guard = (id: string) => {
      if (!ids.has(id)) throw new Error(`compute reported undeclared check "${id}"`);
      reported.push(id);
    };
    // A run that drops a feature reports the RATIO check and nothing keyed by an id.
    await compute({
      checks: ['ravine_geometry_skipped_pct'],
      descriptor: d,
      acquired: { feature_count: 1, invalid_geometry_skipped: 1, skipped_keys: [7] },
      written: null,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      report: guard,
    } as never);
    expect(reported, 'one dropped feature, one row').toEqual(['ravine_geometry_skipped_pct']);
    // ...and the guard itself bites when handed the retired per-feature id, so the
    // pre-conversion shape cannot come back through a compute that "just reports more".
    expect(() => guard('ravine_geometry_skipped_source_id')).toThrow(/undeclared check/);
  });
});

// ---------------------------------------------------------------------------
// Peel 8c — every threshold has ONE source, and the `pct <=` form really evaluates
// ---------------------------------------------------------------------------

describe('8c — thresholds: one source, no literal a knob duplicates', () => {
  type LimitCheck = { id: string; limit: string | { warn: number; fail: number }; limit_from_config?: string; severity: string };

  const seed = (): Record<string, { default: number }> =>
    JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8')) as Record<string, { default: number }>;

  /** The trailing number a `limit_from_config` substitution replaces — the same anchor verdict.js uses. */
  const literalOf = (limit: string): number => {
    const m = /([0-9]*\.?[0-9]+)(?=\s*(?:x median)?$)/.exec(limit);
    expect(m, `limit "${limit}" carries no number to substitute`).not.toBeNull();
    return Number((m as RegExpExecArray)[1]);
  };

  it('every `pct <=` limit names a DECLARED config variable, and the literal it carries IS that variable\'s seed default', () => {
    const d = loadDescriptor();
    const declared = new Set(d.config === 'none' ? [] : d.config.logic_variables.map((v) => v.name));
    const S = seed();
    const pctChecks = (d.checks as LimitCheck[]).filter((c) => typeof c.limit === 'string' && /^pct <=/.test(c.limit));
    expect(pctChecks.length, 'no pct-shaped check — LG-5 would be untested').toBeGreaterThan(0);
    for (const c of pctChecks) {
      if (!c.limit_from_config) continue; // the deliberate descriptor-data case, locked below
      expect(declared.has(c.limit_from_config), `check ${c.id}: limit_from_config "${c.limit_from_config}" is not declared in config`).toBe(true);
      expect(S[c.limit_from_config], `seed missing ${c.limit_from_config}`).toBeDefined();
      expect(
        literalOf(c.limit as string),
        `check ${c.id}: the descriptor's literal and the seed default for ${c.limit_from_config} have DRIFTED — a descriptor read on its own would state a bound nobody uses`,
      ).toBe(S[c.limit_from_config]!.default);
    }
  });

  it('every declared FAIL/WARN bound that has a knob is BOUND to it — no operator-tunable threshold survives as a bare literal', () => {
    const d = loadDescriptor();
    if (d.config === 'none') return;
    // Every declared variable whose name reads as a bound must be reachable from a check
    // or from a `*_from_config` field; a knob nothing resolves is a knob that does nothing.
    const refs = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          if (/_from_config$/.test(k) && typeof v === 'string') refs.add(v);
          walk(v);
        }
      }
    };
    walk(d);
    const computeSrc = computeSource();
    for (const v of d.config.logic_variables) {
      const reached = refs.has(v.name) || computeSrc.includes(`ctx.config.${v.name}`);
      expect(reached, `declared tunable "${v.name}" is resolved by nothing — neither a *_from_config field nor a ctx.config read`).toBe(true);
    }
  });

  it('the ONE deliberate non-knob bound agrees with the write discipline it mirrors (two places, locked)', () => {
    const d = loadDescriptor();
    const check = (d.checks as LimitCheck[]).find((c) => c.id === 'ravine_rows_changed_ratio');
    expect(check, 'ravine_rows_changed_ratio must be declared').toBeDefined();
    expect(check?.limit_from_config, 'it is descriptor data, NOT an operator knob').toBeUndefined();
    const wd = (d.outputs as { writes: Array<{ write_discipline: { expected_change_ratio: string } }> }).writes[0]!.write_discipline;
    expect(
      literalOf(check!.limit as string),
      'the check bound and write_discipline.expected_change_ratio are the same number in two places — they must AGREE',
    ).toBe(literalOf(wd.expected_change_ratio));
  });

  it('the acquisition timeout has ONE source: the config value wins, the literal is the stated fallback, and they AGREE', () => {
    const d = loadDescriptor();
    const net = d.execution.network as { timeout: string; timeout_from_config?: string };
    expect(net.timeout_from_config, 'execution.network.timeout_from_config must name the T6 variable').toBe(CONFIG_VARS.T6);
    const declared = d.config === 'none' ? [] : d.config.logic_variables.map((v) => v.name);
    expect(declared, 'and that variable must be declared').toContain(CONFIG_VARS.T6);
    const seededDefault = seed()[CONFIG_VARS.T6]!.default;
    const acquire = loadLib(ACQUIRE_REL) as {
      resolveTimeoutMs: (d: unknown, c: Record<string, number> | null) => number | null;
    };
    // The literal is only a fallback, so it must equal the seed default or an un-seeded
    // database would silently run on a different budget than a seeded one.
    expect(acquire.resolveTimeoutMs(d, {}), 'the fallback literal').toBe(seededDefault);
    expect(acquire.resolveTimeoutMs(d, null)).toBe(seededDefault);
    // ...and the operator's value WINS, which is the half that makes it one source.
    expect(acquire.resolveTimeoutMs(d, { [CONFIG_VARS.T6]: 12_345 })).toBe(12_345);
    // A nonsense value falls back rather than aborting every fetch instantly.
    expect(acquire.resolveTimeoutMs(d, { [CONFIG_VARS.T6]: 0 })).toBe(seededDefault);
  });

  it('LG-5 — the `pct <=` form really evaluates, in both directions, at the RESOLVED bound', () => {
    const d = loadDescriptor();
    const verdict = loadLib('scripts/lib/step/verdict.js') as {
      evaluateLimit: (l: unknown, o: Record<string, number>) => { ok?: boolean; unevaluable?: string };
      resolveLimit: (c: unknown, cfg: Record<string, number>) => string;
    };
    const S = seed();
    const config: Record<string, number> = {};
    if (d.config !== 'none') for (const v of d.config.logic_variables) config[v.name] = S[v.name]!.default;

    for (const c of (d.checks as LimitCheck[]).filter((x) => typeof x.limit === 'string' && /^pct <=/.test(x.limit))) {
      const resolved = verdict.resolveLimit(c, config);
      const bound = literalOf(resolved);
      const inside = verdict.evaluateLimit(resolved, { value: bound });
      const outside = verdict.evaluateLimit(resolved, { value: bound + 0.01 });
      // "unevaluable" resolves to the DECLARED severity upstream, so a pct check the
      // library cannot read would redden (or green) every single run without looking.
      expect(inside.unevaluable, `check ${c.id}: at the bound`).toBeUndefined();
      expect(outside.unevaluable, `check ${c.id}: above the bound`).toBeUndefined();
      expect(inside.ok, `check ${c.id}: <= the bound must PASS`).toBe(true);
      expect(outside.ok, `check ${c.id}: above the bound must FAIL`).toBe(false);
    }

    // The substitution itself, proven with a value that is NOT the seed default: the
    // threshold column has to show the number in force, not the one in the file.
    const bound = (d.checks as LimitCheck[]).find((c) => c.limit_from_config);
    expect(bound, 'no limit_from_config check — the substitution would be untested').toBeDefined();
    const moved = verdict.resolveLimit(bound!, { [bound!.limit_from_config!]: 0.123 });
    expect(moved, 'the RESOLVED value renders as the threshold').toContain('0.123');
  });
});
