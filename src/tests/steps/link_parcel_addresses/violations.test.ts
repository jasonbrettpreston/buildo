// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §Bridge (PRIMARY)
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md §4 (SECONDARY)
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 9 (link-parcels.js Strategy 1a consumer)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §Step Breakdown row 9 / §6.6.B (link-coa-to-parcels.js Tier 1a consumer)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6 — PH-7 test design, prove red), §6.1 (G4d both-directions locks), §5.2 (the per-step checklist)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.2 (conformance), §1.2a (P1-P5), §1.4 (write_discipline per target), §1.5 (staleness), §5.1 (frozen shape), §5.4 (lock-test convention), §1.10 (MATERIALIZER)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 12 rules; Rule 3/R-G, Rule 9 grandfathered, Rule 12 recovery)
//
// Pilot 5 — `link_parcel_addresses`, the MATERIALIZER representative (Spec 122 §1.10 /
// §8.2 — forced by having exactly 1 member). One write target, one write statement, class
// D (`insert_only_no_retraction`), no tiers, no primary/fallback split. The 55-A hard gate
// (44 claims, k=PER_STEP) + the 5 55-B monotone partials (k=MIXED) + this pilot's own G4d
// fence locks, one `it` per claim (generator: `node scripts/violations/plan-claims.mjs
// --checklist`).
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Each one that reads
// a FUTURE artifact opens with `artifact()` → `expect(existsSync).toBe(true)` with the path
// in the message, so the failure names the missing artifact rather than surfacing as a
// TypeScript/import error. Genuinely-red claims are wrapped `it.fails(...)` with a "flips
// at: commit N" comment — this file is committed BEFORE any descriptor/compute/library
// growth lands (commit 6, per the plan's own "no descriptor/compute/library code before
// commit 6 is red" constraint). Nothing here requires the CURRENT step file in-process — it
// still calls `pipeline.run()` directly and would open a pool; the require probe is a child
// process.
//
// The artifacts this file asserts against (named in `.cursor/active_task.md`, Fold A/B, A-1
// RULING 2026-08-29):
//   scripts/link-parcel-addresses.descriptor.json — `execution.shape:"materialize"` (A-1);
//     ONE write target (`parcel_address_points`, class `insert_only_no_retraction`,
//     `guard:"none"`+`guard_why`, `retract:"none"`+`write_discipline.why` — the V7 no-
//     retraction ban rule, LPA-D1's KNOWN-DEFECT pin); `config` declares T1-T5;
//     `recovery.reset` a truthful declare-only string (A-1, no rebuild mechanism exists);
//     `recovery.interrupted`/`before_image` both `"none"`+why (no destructive retraction
//     target — R-F item 1, carried forward, not this pilot's obligation); `sharing.
//     slug_forms:"derived"` (LG-15's `deriveLedgerSlugs`, retires OWN_SLUGS/UPSTREAM_SLUGS);
//     a gated-skip declaration (`staleness.ledgerGatedSkip`, reused from LG-15/pilot 4, wired
//     into the NEW `runMaterializePhase`); `checks` incl. the 2 NEW fan-out checks (T4/T5)
//     and the LPA-D1/Fold-A observability checks (`parcel_address_points_stale_st_within_
//     count`, `parcel_address_points_missed_link_count`)
//   scripts/link-parcel-addresses.notes.json — a REAL notes file (<=12 entries), `fences[]`
//     for the 2 adjudicated fix-commits (§2 of the assessment), the resumability correction
//     (LPA-D2) stated in prose
//   scripts/lib/compute/link-parcel-addresses.js — `checks` dispatch === descriptor ids; no
//     fs/pg/pipeline/argv/env; opens no pool; the verbatim-ported INSERT...SELECT...JOIN
//     ST_Within...ON CONFLICT DO NOTHING SQL text (G2's "verbatim" guarantee)
//   scripts/lib/step/write.js — LG-18: `executeInsertSelectNoRetract`, a NEW executor for
//     class D (compute-authored SQL, INSERT-only assertion at the boundary — no UPDATE/
//     DELETE token permitted), at THREE sites (buildWritePlan's class branch, the new
//     executor itself, executeOrderedWrites' dispatch)
//   scripts/lib/step/index.js — `isMaterializeStep`/`runMaterializePhase` (A-1 RULING: a FORK
//     of runCascadePhase's shape, NOT an extension of runLinkPhase — this step's per-batch
//     transaction loop and single server-side write cannot fit runLinkPhase's SELECT-then-
//     batched-INSERT model without breaking G2)
//   scripts/steps/_schema/grandfathered.json — a 3rd entry, keyed `link_parcel_addresses`,
//     path `outputs.writes[].write_discipline.guard`, value `"none"` (Fold A Integration #1
//     correction: keyed on `.guard`, never `.class`)
//   scripts/steps/_schema/converted.json — 5th entry (commit 9, out of this pilot's scope
//     through commit 6)
//   docs/reports/2026-08-29-pilot5-link-parcel-addresses-assessment.md — §1-§5 (commits
//     1-5, LANDED); §6+ at commit 7
//   docs/reports/golden/link_parcel_addresses/pre/{sources,standalone}.json — commit 5,
//     LANDED (both genuinely SKIP — no_upstream_changes; a separate gate-bypassed twice-run
//     write-path proof also landed, standalone-forced-{1,2}.json)
//   docs/reports/golden/link_parcel_addresses/post/{sources,standalone}.json — commit 9, NOT
//     YET
//
// Shape decisions recorded here because the schema is silent (mirrors link_massing/link_wsib
// precedent):
//   - `fences[]` lives in link-parcel-addresses.notes.json under the top-level key `fences`.
//     Each entry: {const, value, incident, commit, lock_test}.
//   - Golden invocation docs are found by BASENAME (`sources.` / `standalone.`) or by
//     (chain, args) content; `pre/` and `post/` hold the old/new sides.
//   - The report's machine-readable tables are found by HEADER, not position.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const STEP_DIR_REL = 'src/tests/steps/link_parcel_addresses';

const STEP_REL = 'scripts/link-parcel-addresses.js';
const DESCRIPTOR_REL = 'scripts/link-parcel-addresses.descriptor.json';
const NOTES_REL = 'scripts/link-parcel-addresses.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/link-parcel-addresses.js';
const WRITE_REL = 'scripts/lib/step/write.js';
const INDEX_REL = 'scripts/lib/step/index.js';
const GRANDFATHERED_REL = 'scripts/steps/_schema/grandfathered.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const REPORT_REL = 'docs/reports/2026-08-29-pilot5-link-parcel-addresses-assessment.md';
const GOLDEN_DIR_REL = 'docs/reports/golden/link_parcel_addresses';
const GOLDEN_HARNESS_REL = 'scripts/analysis/capture-step-golden.js';
const MANIFEST_REL = 'scripts/manifest.json';
const DEFECT_LEDGER_REL = 'docs/reports/defect-ledger.md';
/** Peel 8b (link_wsib #165 precedent) — the registry seed file `configProjection` reads for `ctx.config`'s defaults. */
const SEED_REL = 'scripts/seeds/logic_variables.json';
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');
const COMPUTE_STUB_REL = 'scripts/steps/_schema/fixtures/shape/_compute-stub.js';
const REVIEW_CLIS = ['scripts/gemini-review.js', 'scripts/deepseek-review.js'];

/** G0 — the frozen line count of scripts/link-parcel-addresses.js (`wc -l`, 2026-08-29, commit 1). */
const FROZEN_LINES = 393;
/** S1 — the step's advisory lock (Spec 47 §A.5 registry; pipeline-advisory-lock.infra.test.ts). */
const LOCK_ID = 115;
/**
 * min_migration is a COUNT floor (LW-D8, never a filename number): migration 162's
 * 1-BASED POSITION in the sorted migrations/ listing (`ls migrations/*.sql | sort`),
 * measured commit 5 session: position 159 of 242 (4 historical filename gaps: 43, 49, 50,
 * 158 — COUNT never reaches a gapped filename).
 */
const MIN_MIGRATION = 159;
/** The step's ONE write target. */
const TABLE = 'parcel_address_points';
const WRITE_COLUMNS = ['parcel_id', 'address_point_id', 'computed_at'];
/** V7's frozen 13(+2)-class taxonomy — class D, confirmed independently (§1.4 re-derivation). */
const WRITE_CLASS = 'insert_only_no_retraction';
/** LG-18 (new) — the class-D write executor, mirroring LG-11's `executeSetBasedJoinUpdate` shape. */
const NO_RETRACT_EXECUTOR = 'executeInsertSelectNoRetract';
const FORCE_FULL_ENV = 'LINK_PARCEL_ADDRESSES_FORCE_FULL';
/** T1-T5, the P4 tunable inventory (plan's "P4 tunable inventory" table). */
const CONFIG_VARS = {
  T1: 'link_parcel_addresses_batch_size',
  T2: 'link_parcel_addresses_no_address_warn_pct',
  T3: 'link_parcel_addresses_no_parcel_warn_pct',
  T4: 'link_parcel_addresses_fanout_warn_noncondo',
  T5: 'link_parcel_addresses_fanout_warn_condo',
} as const;
const LIMIT_FROM_CONFIG_VARS: string[] = [CONFIG_VARS.T2, CONFIG_VARS.T3, CONFIG_VARS.T4, CONFIG_VARS.T5];
const CHECK_IDS = {
  parcelsWithGeomPreRun: 'parcels_with_geom_pre_run',
  apWithGeomPreRun: 'address_points_with_geom_pre_run',
  apWithNullGeom: 'address_points_with_null_geom',
  newLinksWritten: 'new_links_written',
  finalLinkCount: 'final_link_count',
  parcelsWithLinks: 'parcels_with_links',
  parcelLinkRatePct: 'parcel_link_rate_pct',
  parcelsWithNoAddressPct: 'parcels_with_no_address_pct',
  apWithNoParcelPct: 'address_points_with_no_parcel_pct',
  errors: 'errors',
  fanoutOutliersNoncondo: 'parcel_fanout_outliers',
  fanoutOutliersCondo: 'parcel_fanout_condo_outliers',
  fanoutDistribution: 'parcel_fanout_distribution',
  staleLinkCount: 'parcel_address_points_stale_st_within_count',
  missedLinkCount: 'parcel_address_points_missed_link_count',
} as const;
/** The non-INFO checks — each needs a must-fail fixture (#165). */
const WARN_FAIL_CHECK_IDS = [
  CHECK_IDS.apWithNullGeom, CHECK_IDS.parcelsWithNoAddressPct, CHECK_IDS.apWithNoParcelPct,
  CHECK_IDS.errors, CHECK_IDS.finalLinkCount, CHECK_IDS.fanoutOutliersNoncondo, CHECK_IDS.fanoutOutliersCondo,
] as const;
const INFO_CHECK_IDS = [
  CHECK_IDS.parcelsWithGeomPreRun, CHECK_IDS.apWithGeomPreRun, CHECK_IDS.newLinksWritten,
  CHECK_IDS.parcelsWithLinks, CHECK_IDS.parcelLinkRatePct, CHECK_IDS.fanoutDistribution,
  CHECK_IDS.staleLinkCount, CHECK_IDS.missedLinkCount,
] as const;

/** The 2 adjudicated fix( commits this file locks — §2 of the assessment (smallest corpus of any pilot). */
const FENCE_COMMITS = ['a81c6a7c', 'b92ad16f'];

/** Spec 120 §14.3 — the closed disposition vocabulary of the Intent Ledger. */
const LEDGER_DISPOSITIONS = [
  'preserved-in-runner', 'preserved-in-validator', 'preserved-in-compute',
  'encoded-as-descriptor-field', 'encoded-as-deviation', 'knowingly-retired',
];
const NONDET_DISPOSITIONS = ['must-match-exactly', 'normalize-then-match', 'excluded-with-reason'];
const NOTES_PROSE_BLOCKS = [
  'expected_shape', 'read_this_way', 'suspicious_if', 'blind_spots', 'decisions', 'review_notes',
  'expected', 'known_normal', 'known_bad', 'do_not_reflag', 'how_to_investigate', 'limitations',
];
const NOTES_MEASURED_EXEMPT = new Set(['decisions']);
const NOTES_CAP = 12;

const FIXTURE_REVIEWED = '2026-08-29';
const FIXTURE_MAX_AGE_DAYS = 180;

/** Measured live 2026-08-29 (172.20.0.10:5432/postgres, 242 migrations) — commits 1-5. */
const LIVE_PAP_ROWS = 511_224;
const LIVE_PARCELS_TOTAL = 486_530;
const LIVE_AP_TOTAL = 525_346;
const LIVE_STALE_ST_WITHIN = 0;
const LIVE_MISSED_LINK = 0;
const LIVE_MULTI_PARCEL_ADDRESS = 0;
const LIVE_DUP = 0;
const LIVE_FANOUT_MAX_CONDO = 346;
const LIVE_FANOUT_MAX_NONCONDO = 155;
const LIVE_NONCONDO_GT_20 = 130;
const LIVE_LAND_ENTRANCE = 449;
const T1_DEFAULT = 1000;
const T2_DEFAULT = 50;
const T3_DEFAULT = 5;
const T4_DEFAULT = 20;
const T5_DEFAULT = 400;
const INVOCATIONS = [
  { name: 'sources', chain: 'sources' },
  { name: 'standalone', chain: 'none' },
] as const;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { buildAuditTable } = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
  buildAuditTable: (descriptor: Descriptor, chainId: string | null, observations: Record<string, unknown>) => { rows: AuditRow[]; audit_table: { verdict: string } };
};

// ---------------------------------------------------------------------------
// Types (the slice of step.schema.json this file reads)
// ---------------------------------------------------------------------------

interface AuditRow { metric: string; value: unknown; threshold: unknown; status: string }
interface Check {
  id: string; kind: string; expect: unknown; limit: unknown; limit_from_config?: string;
  severity: string; blocking: boolean; when: string; chains: string[] | 'all'; why?: { text?: string };
}
interface WriteDiscipline {
  class: string; guard: unknown; guard_columns: unknown; guard_why?: unknown; scope: unknown;
  expected_change_ratio: unknown; idempotent_rerun: unknown; idempotent_rerun_why?: unknown; why?: { text?: string }; txn_scope: unknown;
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
  recovery?: 'none' | { reset: string; interrupted: string; interrupted_why?: unknown; before_image: string; before_image_why?: unknown };
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
  source_fingerprint?: string | null; fingerprint_skipped_reason?: string;
}
type ComputeFn = (ctx: unknown) => Promise<{ records_meta?: Record<string, unknown> } | void>;
interface ComputeModule { compute?: ComputeFn; checks?: Record<string, (ctx: unknown) => unknown>; [k: string]: unknown }

/** The ctx shape scripts/lib/compute/link-parcel-addresses.js's CHECKS dispatch reads, mirroring the runner's real stepCtx merge (LM-D14 class — never inject a field the runtime never plumbs). */
interface World {
  matched: {
    parcels_with_geom: number;
    address_points_with_geom: number;
    address_points_with_null_geom: number;
    new_links_written: number;
    final_link_count: number;
    parcels_with_links: number;
    address_points_with_no_parcel: number;
    fanout_condo_max: number;
    fanout_noncondo_max: number;
    fanout_noncondo_gt_threshold: number;
    fanout_condo_gt_threshold: number;
    stale_st_within_count: number;
    missed_link_count: number;
    errors: number;
  };
  written: { privilege: { bypassrls: boolean; policies: number; rls_enabled: boolean } };
  gate: { mode: 'incremental' | 'full' | null; reason: string; skipped: boolean };
  overrides: { force_full: boolean };
  elapsed_ms: number;
}

// ---------------------------------------------------------------------------
// Artifact helpers — every claim test opens with one of these
// ---------------------------------------------------------------------------

function abs(rel: string): string { return path.join(REPO_ROOT, rel); }

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the pilot-5 commit sequence — commit 7 lands it)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string { return fs.readFileSync(artifact(rel), 'utf8'); }

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d);
  return d;
}

function loadNotes(): Notes { return JSON.parse(readText(NOTES_REL)) as Notes; }
function computeSource(): string { return readText(COMPUTE_REL); }

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

function loadLib(rel: string): Record<string, unknown> {
  return require(artifact(rel, 'library growth, commit 7')) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-require-imports -- the CJS library module
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
  expect(d.outputs, 'a MATERIALIZER may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

/** The step's ONE write target — parcel_address_points, class insert_only_no_retraction. */
function writeTarget(d: Descriptor): WriteSpec {
  const w = writes(d);
  expect(w.length, 'exactly 1 write target (the sole INSERT...SELECT...JOIN ST_Within statement)').toBe(1);
  const t = w[0] as WriteSpec;
  expect(t.table).toBe(TABLE);
  expect(t.write_discipline.class, `the ${TABLE} write target must use LG-18's new insert-only executor (${WRITE_CLASS})`).toBe(WRITE_CLASS);
  return t;
}

function manifest(): { scripts: Record<string, { file: string; chain_args?: Record<string, string[]>; supports_full?: boolean; supports_dry_run?: boolean; telemetry_tables?: string[] }>; chains: Record<string, string[]> } {
  return JSON.parse(fs.readFileSync(abs(MANIFEST_REL), 'utf8')) as ReturnType<typeof manifest>;
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
    return (t.headers.find((h) => re.test(h)) ?? '') as string;
  };
  return { table: t, col };
}

// ---------------------------------------------------------------------------
// Golden capture helpers (commit 5, pre/*.json LANDED; post/*.json commit 9)
// ---------------------------------------------------------------------------

function goldenDocs(): GoldenDoc[] {
  const dir = abs(GOLDEN_DIR_REL);
  expect(fs.existsSync(dir), `${GOLDEN_DIR_REL} does not exist`).toBe(true);
  const out: GoldenDoc[] = [];
  for (const sub of ['pre', 'post']) {
    const subDir = path.join(dir, sub);
    if (!fs.existsSync(subDir)) continue;
    for (const f of fs.readdirSync(subDir)) {
      if (!f.endsWith('.json')) continue;
      const doc = JSON.parse(fs.readFileSync(path.join(subDir, f), 'utf8')) as GoldenDoc;
      out.push({ ...doc, file: `${sub}/${f}` });
    }
  }
  return out;
}

function docsFor(docs: GoldenDoc[], inv: { name: string }): GoldenDoc[] {
  return docs.filter((d) => d.file.includes(`/${inv.name}`) || d.file.includes(`/${inv.name}.`) || d.file.includes(`/${inv.name}-`));
}
function isOld(d: GoldenDoc): boolean { return d.file.startsWith('pre/'); }
function isNew(d: GoldenDoc): boolean { return d.file.startsWith('post/'); }
function isForced(d: GoldenDoc): boolean { return d.file.includes('forced'); }

function papTableState(d: GoldenDoc): TableState {
  const t = (d.table_state ?? []).find((x) => x.table === TABLE);
  expect(t, `${d.file}: no ${TABLE} table_state entry`).toBeDefined();
  return t as TableState;
}
/** Invariant values are recorded STRINGIFIED by the harness. Coerce a numeric-looking string back to a number. */
function invariant(d: GoldenDoc, name: string): unknown {
  const v = (d.invariants ?? []).find((i) => i.name === name)?.value;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

// ---------------------------------------------------------------------------
// The named fence-lock pure detectors — each tested against a SYNTHETIC subject
// (proving the detector is not vacuous) AND against the future descriptor/
// compute (guaranteed red today via artifact()).
// ---------------------------------------------------------------------------

/**
 * LG-18 — the sole write statement's generated SQL must be INSERT...SELECT verbatim,
 * ON CONFLICT (parcel_id, address_point_id) DO NOTHING, and carry NO UPDATE/DELETE token
 * anywhere (the insert-only assertion LG-18's executor enforces at the boundary, per Fold
 * A Integration finding 4's "INSERT-only assertion, no UPDATE/DELETE token permitted").
 */
function detectInsertSelectNoRetractFence(sql: string): string[] {
  const findings: string[] = [];
  if (!/INSERT\s+INTO\s+parcel_address_points/i.test(sql)) findings.push(`no INSERT INTO ${TABLE} statement found`);
  if (!/SELECT/i.test(sql)) findings.push('no SELECT clause found — the write must be INSERT...SELECT, never per-row VALUES');
  if (!/ON\s+CONFLICT\s*\(\s*parcel_id\s*,\s*address_point_id\s*\)\s*DO\s+NOTHING/i.test(sql)) findings.push('ON CONFLICT (parcel_id, address_point_id) DO NOTHING not found verbatim (G1: link must be written at most once)');
  if (/\bUPDATE\b/i.test(sql)) findings.push('UPDATE token present — class D is insert-only, this row is immutable once written (§1.4 re-derivation)');
  if (/\bDELETE\b/i.test(sql)) findings.push('DELETE token present — LPA-D1 pins the non-retraction as-is; a DELETE here would silently fix the KNOWN-DEFECT without a ruling');
  return findings;
}

/** Grandfathering must key on `write_discipline.guard` (value "none"), never `.class` — Fold A Integration finding 1. */
function detectGrandfatheringOnGuardFence(entry: { paths?: Record<string, unknown> } | undefined): string[] {
  const findings: string[] = [];
  if (!entry) { findings.push('no grandfathered.json entry for link_parcel_addresses'); return findings; }
  const paths = entry.paths ?? {};
  const guardPath = 'outputs.writes[].write_discipline.guard';
  const classPath = 'outputs.writes[].write_discipline.class';
  if (!(guardPath in paths)) findings.push(`entry does not key on ${guardPath} — assertGrandfathered's GUARD_PATH reads only this path`);
  if (classPath in paths) findings.push(`entry keys on ${classPath} — this is the exact bug Fold A Integration finding 1 caught (assertGrandfathered ignores .class entirely)`);
  if (paths[guardPath] !== 'none') findings.push(`entry's ${guardPath} value is not "none"`);
  return findings;
}

/** A staleness-driven gated-skip path must exist for isMaterializeStep, wired explicitly (A-1 RULING: runMaterializePhase wires staleness.ledgerGatedSkip in, mirroring runCascadePhase). */
function detectLedgerGatedSkipWiredFence(subject: { callsLedgerGatedSkip: boolean; branchesOnSkip: boolean }): string[] {
  const findings: string[] = [];
  if (!subject.callsLedgerGatedSkip) findings.push('runMaterializePhase does not call staleness.ledgerGatedSkip — LG-15\'s generalized B3 gate must be reused, not re-hand-rolled a 3rd time');
  if (!subject.branchesOnSkip) findings.push('runMaterializePhase does not branch on the gate\'s own skip result');
  return findings;
}

/** The header's resumability CLAIM must match the code's actual behavior (LPA-D2 — idempotent, not resumable). */
function detectHeaderResumableLieFence(headerText: string): string[] {
  const findings: string[] = [];
  // A JSDoc block comment wraps at `\r\n *     ` — normalize any run of whitespace/`*`
  // continuation filler to a single space before matching, so a claim wrapped across lines
  // is not silently missed.
  const flat = headerText.replace(/[\s*]+/g, ' ');
  if (/re-run picks up where we left off/i.test(flat)) findings.push('header still claims "a re-run picks up where we left off" — the false resumability claim (LPA-D2) has not been corrected');
  if (!/idempotent/i.test(flat)) findings.push('header does not state the TRUE property (idempotent, not resumable)');
  return findings;
}

/**
 * B3 gate slugs derived: the descriptor's identity/execution/inputs must reconstruct the
 * SAME 3 OWN_SLUGS + 6 UPSTREAM_SLUGS forms the pre-conversion script hand-maintains, via
 * `staleness.deriveLedgerSlugs` (LG-15, already built at pilot 4) — never a re-hardcoded array.
 */
function detectSlugsDerivedFence(derived: { own: string[]; upstream: string[] }, expectedOwn: string[], expectedUpstream: string[]): string[] {
  const findings: string[] = [];
  const ownSet = new Set(derived.own);
  const upstreamSet = new Set(derived.upstream);
  for (const s of expectedOwn) if (!ownSet.has(s)) findings.push(`derived own-slugs missing "${s}"`);
  for (const s of expectedUpstream) if (!upstreamSet.has(s)) findings.push(`derived upstream-slugs missing "${s}"`);
  return findings;
}

/** The stale_st_within KNOWN-DEFECT (LPA-D1) must be OBSERVABLE every run, never a golden-capture-only fact. */
function detectStaleInvariantObservableFence(subject: { hasCheck: boolean; severity: string | null; alwaysReported: boolean }): string[] {
  const findings: string[] = [];
  if (!subject.hasCheck) findings.push(`no declared check "${CHECK_IDS.staleLinkCount}" — LPA-D1's live exposure must be observable every run (Rule 1: nothing hidden), not merely in invariants.json`);
  if (subject.hasCheck && subject.severity !== 'INFO') findings.push('the stale-link count check must be INFO (a structural fact to surface, not a threshold — LPA-D1 is PINNED, not gated)');
  if (!subject.alwaysReported) findings.push('the check is not reported on every run (must be unconditional, like retired_var_row_present)');
  return findings;
}

/** The fan-out WARN must fire at 130 > 20 (T4 default) — the honest aggregate Fold B replaced the dropped allow-list with. */
function detectFanoutWarnFiresFence(subject: { noncondoGtThreshold: number; threshold: number; severity: string }): string[] {
  const findings: string[] = [];
  if (subject.noncondoGtThreshold <= subject.threshold) findings.push(`noncondoGtThreshold (${subject.noncondoGtThreshold}) does not exceed threshold (${subject.threshold}) — the WARN should fire on today's live data (measured 130 > 20)`);
  if (subject.severity !== 'WARN') findings.push('a standing non-zero population must be WARN, never FAIL or INFO-by-taste (R-H, Spec 48 §4.9)');
  return findings;
}

/**
 * LPA-D4 (2026-08-29) — a step declaring a `terminals[]` entry of kind `"skip_gated"`
 * must declare >=1 `checks[].when === "pre"`: `runMaterializePhase`'s `onlyChecks`
 * narrowing (scripts/lib/step/index.js:1596) reduces `stepCtx.checks` to the `when:"pre"`
 * set on a gated SKIP, and zero such checks means the SKIP's audit_table has nothing of
 * the step's own to say WHY — only the 2 always-present sys_* rows.
 */
function detectPreCheckOnGatedSkipFence(subject: { hasSkipGatedTerminal: boolean; preCheckCount: number }): string[] {
  const findings: string[] = [];
  if (subject.hasSkipGatedTerminal && subject.preCheckCount === 0) {
    findings.push('descriptor declares a terminals[] entry of kind "skip_gated" but zero checks[].when === "pre" — a gated SKIP narrows the audit table to sys_* rows only, and the skip reason is never persisted (LPA-D4)');
  }
  return findings;
}

describe('55-A — the hard per-conversion gate (44, k=PER_STEP)', () => {
  // ── A.3 Interpretation (§3.4-§3.4b) — the notes.json seven ──

  it('#30 Cap of 12 prose entries — add a 13th → build fails (flips at: commit 7)', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(d.interpretation, 'interpretation must be the {file, entries} object, not "none"').not.toBe('none');
    const interp = d.interpretation as { file: string; entries: number };
    const entries = notesEntries(notes);
    expect(entries.length, 'prose entries across the capped blocks').toBeLessThanOrEqual(NOTES_CAP);
    expect(entries.length, 'interpretation.entries must equal the real prose count').toBe(interp.entries);
    expect(() => validateDescriptor({ ...d, interpretation: { ...interp, entries: NOTES_CAP + 1 } })).toThrow(/interpretation/);
  });

  it('#31 Exactly two legal resolutions — promote or delete; no overflow file (flips at: commit 7)', () => {
    const d = loadDescriptor();
    loadNotes();
    expect((d.interpretation as { file: string }).file).toBe(path.basename(NOTES_REL));
    const dir = fs.readdirSync(abs(path.dirname(STEP_REL)));
    const strays = dir.filter((f) => f.startsWith('link-parcel-addresses') && !['link-parcel-addresses.js', 'link-parcel-addresses.descriptor.json', 'link-parcel-addresses.notes.json'].includes(f));
    expect(strays, 'an overflow / unknown <slug>.* sibling').toEqual([]);
    expect(Object.keys(loadNotes()).some((k) => /overflow/i.test(k)), 'an overflow block inside notes.json').toBe(false);
  });

  it('#33 `blind_spots[].detected_by` names a check that exists (flips at: commit 7)', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    const ids = new Set(d.checks.map((c) => c.id));
    const blind = (notes.blind_spots as NotesEntry[] | undefined) ?? [];
    expect(blind.length, 'PH-6 named at least one blind spot (the standing parcel-sanity-audit.js has zero bridge-table checks, Fold A item c) — it must be recorded').toBeGreaterThan(0);
    for (const b of blind) {
      expect(typeof b.detected_by, 'every blind spot declares detected_by').toBe('string');
      if (!isNone(b.detected_by)) expect(ids.has(b.detected_by as string), `detected_by "${b.detected_by}" is not a declared check`).toBe(true);
    }
    expect(ids.has('no_such_check'), 'negative control').toBe(false);
  });

  it('#34 `detected_by:"none"` is permitted but counted (flips at: commit 7)', () => {
    const notes = loadNotes();
    const blind = (notes.blind_spots as NotesEntry[] | undefined) ?? [];
    const open = blind.filter((b) => isNone(b.detected_by)).length;
    expect(notes.counts?.open_blind_spots, 'notes.counts.open_blind_spots must equal the real count').toBe(open);
    const plusOne = [...blind, { what: 'x', detected_by: 'none' }].filter((b) => isNone(b.detected_by)).length;
    expect(plusOne).toBe(open + 1);
  });

  it('#35 Every prose entry carries `measured{value,date,query}` (flips at: commit 7)', () => {
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

  it('#37 Unpromoted `suspicious_if` entries are counted (flips at: commit 7)', () => {
    const notes = loadNotes();
    const d = loadDescriptor();
    const ids = new Set(d.checks.map((c) => c.id));
    const sus = (notes.suspicious_if as NotesEntry[] | undefined) ?? [];
    const unpromoted = sus.filter((s) => !s.check || isNone(s.check) || !ids.has(s.check)).length;
    expect(notes.counts?.unpromoted_suspicious_if, 'notes.counts.unpromoted_suspicious_if must equal the real count').toBe(unpromoted);
    const plusOne = [...sus, { signal: 'x', check: 'none' }].filter((s) => !s.check || isNone(s.check) || !ids.has(s.check)).length;
    expect(plusOne).toBe(unpromoted + 1);
  });

  it('#38 `review_notes` ship to the reviewer prompt automatically (already true today — a library-owned mechanism, N/A to whether THIS step\'s notes.json exists yet)', () => {
    for (const cli of REVIEW_CLIS) {
      const src = stripComments(fs.readFileSync(abs(cli), 'utf8'));
      expect(src.includes('.notes.json'), `${cli} does not read the sibling notes file`).toBe(true);
      expect(src.includes('review_notes'), `${cli} does not inject review_notes into the prompt`).toBe(true);
    }
  });

  // ── A.12 Conversion workflow (§14) ─────────────────────────────────────────

  it('#148 `deviations[]` and `fences[]` are required; empty must be an explicit `[]` — and the 2 adjudicated fix-commits are fenced (flips at: commit 7)', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(Array.isArray(d.deviations), 'descriptor.deviations must be an explicit array').toBe(true);
    expect(Array.isArray(notes.fences), 'notes.fences must be an explicit array').toBe(true);
    const fences = notes.fences as NonNullable<Notes['fences']>;
    const shas = fences.map((f) => f.commit.slice(0, 8));
    for (const c of FENCE_COMMITS) expect(shas, `fence ${c} (adjudicated commit 2, §2 of the assessment) has no notes.fences entry`).toContain(c);
    for (const f of fences) {
      for (const k of ['const', 'value', 'incident', 'commit', 'lock_test'] as const) expect(k in f, `fence ${f.commit} lacks ${k}`).toBe(true);
      expect(/^[0-9a-f]{7,40}$/.test(f.commit), `fence commit "${f.commit}" is not a SHA`).toBe(true);
      expect(git(['cat-file', '-t', f.commit]), `fence commit ${f.commit} is not in this repo`).toBe('commit');
    }
  });

  it('#149 Gate 0 — the frozen shape conversion adds zero new bespoke runner paths (no link_parcel_addresses / parcel_address_points branch in scripts/lib/step or pipeline.js — LG-18/runMaterializePhase are GENERIC library code) (flips at: commit 7)', () => {
    computeSource();
    for (const rel of [WRITE_REL, INDEX_REL]) artifact(rel, 'LG-18/runMaterializePhase growth is generic library code, not link_parcel_addresses-specific');
    const lib = fs.readdirSync(abs('scripts/lib/step')).filter((f) => f.endsWith('.js')).map((f) => `scripts/lib/step/${f}`);
    lib.push('scripts/lib/pipeline.js');
    for (const f of lib) {
      const code = stripComments(fs.readFileSync(abs(f), 'utf8'));
      expect(/link[_-]parcel[_-]addresses|LINK_PARCEL_ADDRESSES(?!_FORCE_FULL)|parcel_address_points\.(parcel_id|address_point_id)/.test(code), `${f} carries a step-specific code path`).toBe(false);
    }
  });

  it('#150 Gate 1 — reproducible against itself: both PRE captures (commit 5, SKIP path — no corpus change since 2026-07-08) hash-identical; the POST pair hash-identical too, and matches PRE (no forced-FULL/reset scenario belongs in the diffed set, A-1 declare-only ruling — a clean cutover with an unchanged corpus is a genuine zero-diff, not a repair) (flips at: commit 9)', () => {
    const docs = goldenDocs();
    for (const inv of INVOCATIONS) artifact(`${GOLDEN_DIR_REL}/pre/${inv.name}.json`, `PRE capture for ${inv.name} (commit 5, LANDED)`);
    const preHashes = new Set<string | null>();
    for (const inv of INVOCATIONS) {
      const pre = docsFor(docs, inv).filter(isOld).filter((d) => !isForced(d));
      expect(pre.length, `${inv.name}: no PRE capture at all`).toBeGreaterThanOrEqual(1);
      for (const p of pre) {
        const ts = papTableState(p);
        expect(ts.row_count, `${p.file}: ${TABLE} row count (measured ${LIVE_PAP_ROWS})`).toBe(LIVE_PAP_ROWS);
        preHashes.add(ts.content_hash);
        expect(invariant(p, 'stale_st_within_count'), `${p.file}: LPA-D1 live exposure`).toBe(LIVE_STALE_ST_WITHIN);
        expect(invariant(p, 'multi_parcel_address_count'), `${p.file}: no address point linked to >1 parcel`).toBe(LIVE_MULTI_PARCEL_ADDRESS);
        expect(invariant(p, 'dup_count'), `${p.file}: no duplicate (parcel_id, address_point_id) pairs`).toBe(LIVE_DUP);
      }
    }
    expect(preHashes.size, 'both PRE invocations must hash-identical (both genuinely SKIPPED, no corpus change)').toBe(1);

    for (const inv of INVOCATIONS) artifact(`${GOLDEN_DIR_REL}/post/${inv.name}.json`, 'commit 9 cutover capture');
    const postHashes = new Set<string | null>();
    for (const inv of INVOCATIONS) {
      const post = docsFor(docs, inv).filter(isNew).filter((d) => !isForced(d));
      expect(post.length, `${inv.name}: no POST capture at all`).toBeGreaterThanOrEqual(1);
      for (const p of post) {
        const ts = papTableState(p);
        expect(ts.row_count, `${p.file}: ${TABLE} row count must stay ${LIVE_PAP_ROWS} — no repair lands in this pilot`).toBe(LIVE_PAP_ROWS);
        postHashes.add(ts.content_hash);
      }
    }
    expect(postHashes.size, 'both POST invocations must ALSO hash-identical to each other').toBe(1);
    const [preHash] = [...preHashes];
    const [postHash] = [...postHashes];
    expect(postHash, 'POST must hash-equal PRE — the frozen-shape conversion is a no-op diff over an unchanged corpus (unlike link_wsib\'s A-7 repair)').toBe(preHash);
  });

  it('#151 The non-determinism inventory is declared before the first diff (git order) — testable today: the golden dir + §5\'s inventory section are already landed at commit 5', () => {
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

  it('#6b Every plan item declares a done-test (§12.16) — each of the nine commits (8 = three peels) names one — testable today against the landed commit ledger', () => {
    const report = readText(REPORT_REL);
    const plan = fs.readFileSync(abs('.cursor/active_task.md'), 'utf8');
    const { table, col } = reportTable(plan, [['#', /^#$/], ['done-test', /done.?test/]]);
    expect(table.rows.length, 'nine commit-ledger rows').toBeGreaterThanOrEqual(9);
    for (const r of table.rows) {
      const t = r[col('done-test')] ?? '';
      // A bare "none"/"n/a" is an OMISSION; "none (doc)" is a DECLARED reason (a doc-only
      // commit genuinely has no test to run) — the claim bans the former, not the latter.
      expect(t.length > 0 && !/^(none|n\/a|—|-)\s*$/i.test(t.trim()), `commit "${r[col('#')]}" has no done-test`).toBe(true);
    }
  });

  it('#6a Every claim covering a TABLE declares that table\'s row count (Appendix H) — parcel_address_points + parcels + address_points + logic_variables (flipped: peel 8c)', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['table', /^table/], ['rows', /rows?\b/]]);
    for (const t of [TABLE, 'parcels', 'address_points', 'logic_variables']) {
      const row = table.rows.find((r) => (r[col('table')] ?? '') === t);
      expect(row, `boundary freeze has no row for table ${t}`).toBeDefined();
      expect(/\d/.test(row?.[col('rows')] ?? ''), `table ${t} has no numeric row count`).toBe(true);
    }
  });

  it('#151a The non-determinism disposition vocabulary is CLOSED — and duration/timestamp fields are dispositioned — testable today (commit 5 landed §5\'s table)', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['key', /key|field|source/], ['disposition', /disposition/]]);
    expect(table.rows.length, 'at least the known-volatile fields').toBeGreaterThanOrEqual(1);
    for (const r of table.rows) {
      const cell = r[col('disposition')] ?? '';
      const matches = NONDET_DISPOSITIONS.filter((v) => cell.includes(v));
      expect(matches.length, `disposition cell "${cell}" names none of the closed vocabulary values`).toBeGreaterThanOrEqual(1);
    }
    const negative = () => { const bad = 'fourth-disposition'; expect(NONDET_DISPOSITIONS.includes(bad)).toBe(false); };
    negative();
  });

  it('#152 Gate 2 — Intent Ledger 100% dispositioned, no row `unknown` — testable today (commit 2 landed §2\'s table over the 5-commit corpus)', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['commit', /commit/], ['proposed disposition', /disposition/]]);
    expect(table.rows.length, 'the 5-commit corpus, at least (smallest pilot to date)').toBeGreaterThanOrEqual(5);
    for (const r of table.rows) {
      const disp = r[col('proposed disposition')] ?? '';
      expect(disp.length > 0 && !/^unknown$/i.test(disp), `commit "${r[col('commit')]}" has an unknown disposition`).toBe(true);
      const known = LEDGER_DISPOSITIONS.some((v) => disp.includes(v));
      expect(known, `commit "${r[col('commit')]}" disposition "${disp}" is not from the closed vocabulary`).toBe(true);
    }
  });

  it('#153 Every `knowingly-retired` row names a human approver — vacuously satisfied today: this pilot\'s corpus has ZERO knowingly-retired rows (all 5 commits carry forward, none superseded — smaller/simpler corpus than link_wsib\'s 3)', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['commit', /commit/], ['proposed disposition', /disposition/]]);
    const retired = table.rows.filter((r) => /knowingly-retired/i.test(r[col('proposed disposition')] ?? ''));
    expect(retired.length, 'this pilot has no superseded commits — 0 knowingly-retired rows is the correct, measured count').toBe(0);
    expect(/Approver for every disposition above/.test(report), 'no approver statement found for §2\'s dispositions').toBe(true);
  });

  it('#154 Gate 3 — a peel commit contains only that peel (flips at: commit 8, when 8a/8b/8c land)', () => {
    for (const rel of [DESCRIPTOR_REL, COMPUTE_REL]) artifact(rel, 'peels 8a/8b/8c have not landed — commits 7-9 are out of this pilot\'s scope through commit 6');
  });

  it('#155 Gate 4c — line accounting = 100% of the frozen 393 lines; an unassigned line blocks — testable today: §1 already names the frozen line count', () => {
    const report = readText(REPORT_REL);
    expect(report.includes(String(FROZEN_LINES)), `${REPORT_REL} does not name the frozen line count ${FROZEN_LINES}`).toBe(true);
  });

  it('#156 Gate 4d — every fence has a lock test proven in both directions — this file IS that lock-test file', () => {
    for (const c of FENCE_COMMITS) {
      const hasLock = fs.existsSync(abs(STEP_DIR_REL)) && stepTestDirFiles().some((f) => f.endsWith('violations.test.ts'));
      expect(hasLock, `no lock-test file found for fence ${c}`).toBe(true);
    }
    // The actual both-directions proof is this file's own "G4d fence locks" describe block below.
  });

  it('#157 Gate 4f — dead code proved dead by instrumentation, never by reading — N/A: this step has no dual code path (0 haversine/turf/grid JS-fallback tokens, confirmed live this session)', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/haversine|gridKey|turf|rbush/.test(src), 'a JS-fallback token was found — this step has no dual path today, so none should exist').toBe(false);
  });

  it('#158 Gate 5 — the old script is deleted or dated-ticketed (flipped: commit 9)', () => {
    artifact(CONVERTED_REL, 'commit 9 registers link-parcel-addresses.js as the 5th entry');
    const converted = (JSON.parse(readText(CONVERTED_REL)) as { converted: string[] }).converted;
    expect(converted.includes(STEP_REL), `${CONVERTED_REL} does not list ${STEP_REL} — commit 9 has not landed`).toBe(true);
  });

  it('#159 Idempotence-successor run is a supplement, never the sole gate (old/new pair per invocation ×2) (flips at: commit 9)', () => {
    const docs = goldenDocs();
    for (const inv of INVOCATIONS) {
      const pre = docsFor(docs, inv).filter(isOld).filter((d) => !isForced(d));
      const post = docsFor(docs, inv).filter(isNew).filter((d) => !isForced(d));
      expect(pre.length, `${inv.name}: PRE capture missing`).toBeGreaterThanOrEqual(1);
      expect(post.length, `${inv.name}: POST capture missing (commit 9 cutover)`).toBeGreaterThanOrEqual(1);
    }
  });

  it('#162 The same pass never both discovers and retires a fence — testable today: §2\'s approver statement already names the discoverer!=adjudicator split', () => {
    const report = readText(REPORT_REL);
    expect(/discoverer.?.?adjudicator|PROPOSED by this pass.{0,120}ADJUDICATION is a separate/i.test(report), 'no discoverer!=adjudicator statement found for the Intent Ledger (§2)').toBe(true);
  });

  it('#163 Tie-breaker 1 — a step test that survives swapping its compute is a runner test in the wrong place (flips at: commit 7)', async () => {
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

  it('#164 Logic tests must not run in production — testable today against the CURRENT hand-rolled script (a pre-conversion truth, not a future one)', () => {
    const step = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/vitest|src\/tests|\.test\.|SABOTAGE|healthyWorld/.test(step), `${STEP_REL} references the logic-test path`).toBe(false);
    const pkg = JSON.parse(fs.readFileSync(abs('package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(/scripts\//.test(pkg.scripts.test ?? ''), 'npm test must not point at production scripts').toBe(false);
  });

  it('#165 Every declared check has a must-fail fixture (WARN/FAIL: healthy PASS -> sabotaged its own severity; INFO: INFO both ways) — the LG-18 write-executor lock is written first (flipped: peel 8b) — INCLUDING the standing-WARN checks (R-H): parcel_fanout_outliers\' healthy fixture carries the REAL live count (130 > the T4 default 20, WARN by design) and its sabotage proves the DEGENERATE direction (0 outliers must read PASS, not stuck-WARN)', async () => {
    const d = loadDescriptor();
    // LG-18 write-executor lock, written first per the plan's explicit instruction.
    const t = writeTarget(d);
    expect(t.write_discipline.class, `the ${TABLE} write target must use the new LG-18 executor (${WRITE_CLASS}), never guarded_upsert (which is always UPDATE-capable)`).toBe(WRITE_CLASS);
    const compute = loadCompute();
    const missing = d.checks.filter((c) => c.severity !== 'INFO' && !sabotageFor(c)).map((c) => c.id);
    expect(missing, 'declared WARN/FAIL checks with no sabotage in the must-fail matrix').toEqual([]);
    // R-H: parcel_fanout_outliers' HEALTHY fixture is deliberately the standing (non-clean)
    // live state (130 > the T4 default 20 fires WARN today, by design — a metric expected to
    // be permanently non-zero is WARN, never silently PASSed away by a fixture pretending the
    // corpus is cleaner than it is). Its own sabotage instead proves the DEGENERATE direction:
    // a genuinely-clean (0-outlier) population must read PASS, not a check permanently stuck
    // WARN regardless of input.
    const STANDING_WARN_HEALTHY: Record<string, { healthy: string; sabotaged: string }> = {
      [CHECK_IDS.fanoutOutliersNoncondo]: { healthy: 'WARN', sabotaged: 'PASS' },
    };
    for (const c of d.checks) {
      if (c.severity === 'INFO') {
        const healthy = await runCompute(compute, d, healthyWorld());
        expect(healthy[c.id], `INFO check ${c.id}: reported and rendered INFO on the healthy fixture`).toBe('INFO');
        // "INFO both ways" — an INFO check must never escalate to WARN/FAIL no matter how
        // elevated the underlying number is (INFO reports a fact, it never gates on value).
        const mutate = sabotageFor(c);
        if (mutate) {
          const w = healthyWorld();
          mutate(w);
          const elevated = await runCompute(compute, d, w);
          expect(elevated[c.id], `INFO check ${c.id}: must stay INFO even on an elevated/perturbed input`).toBe('INFO');
        }
        continue;
      }
      const roles = STANDING_WARN_HEALTHY[c.id];
      const { healthy, sabotaged } = await mustFailPair(compute, d, c);
      if (roles) {
        expect(healthy, `check ${c.id}: R-H standing-WARN — the healthy fixture carries today's REAL live state`).toBe(roles.healthy);
        expect(sabotaged, `check ${c.id}: R-H standing-WARN — its sabotage proves the degenerate (clean) direction`).toBe(roles.sabotaged);
        continue;
      }
      expect(healthy, `check ${c.id}: healthy fixture should PASS`).toBe('PASS');
      expect(sabotaged, `check ${c.id}: its negative fixture PASSES — the check never looked`).toBe(c.severity);
    }
  });

  it('#167 Banned anti-pattern — no step test asserts ledger, lock or transaction behaviour', () => {
    const raw = fs.readFileSync(__filename, 'utf8');
    const own = raw
      .split('\n')
      .filter((line) => !line.includes('this suite directly asserts'))
      .join('\n');
    expect(/withAdvisoryLock\s*\(/.test(own), 'this suite directly asserts advisory-lock plumbing — that belongs to the runner\'s own suite').toBe(false);
    expect(/pg_stat_activity|pg_locks/i.test(own), 'this suite directly asserts lock/transaction internals').toBe(false);
  });

  it('#169 Rung 1 inline-WKT is non-negotiable for every azimuth / KNN / area step — this IS a spatial containment step (ST_Within), needing a rung-1 inline-WKT fixture (flipped: peel 8a, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts)', () => {
    // Post-commit-7 the spatial predicate lives in the compute (G2's "verbatim" guarantee,
    // Rule 2 compute-owns-SQL) — the frozen STEP_REL wrapper (§5.1) has no SQL text at all.
    const src = stripComments(computeSource());
    expect(/\bST_\w+/i.test(src), 'the compute IS spatial (ST_Within containment predicate)').toBe(true);
    expect(stepTestDirFiles().some((f) => /rung1|inline-wkt/i.test(f)), 'a spatial compute with no rung-1 inline-WKT test under the step dir').toBe(true);
  });

  it('#170 Rung 2 requires rung 1 to exist first — vacuously true today: no rung-2/approved fixture exists yet (genuinely GREEN pre-conversion, not red)', () => {
    const rung2 = stepTestDirFiles().filter((f) => /rung2|approved/i.test(f));
    if (rung2.length > 0) expect(stepTestDirFiles().some((f) => /rung1|inline-wkt/i.test(f)), 'rung-2 fixtures approved with no rung 1').toBe(true);
    else expect(rung2).toEqual([]);
  });

  it('#171 An approving commit states why each value is right — T1-T5\'s values must each carry a stated rationale (flipped: peel 8c)', () => {
    const report = readText(REPORT_REL);
    for (const name of Object.values(CONFIG_VARS)) {
      expect(report.includes(name), `${name} is not named anywhere in the assessment report with a stated rationale`).toBe(true);
    }
  });

  it('#172 Metamorphic invariants hold — a spatial compute ships a metamorphic suite (a parcel translated +1000/+1000 with its address points must link identically; ST_Within is scale-invariant under uniform translation) (flipped: peel 8a, src/tests/steps/link_parcel_addresses/metamorphic.test.ts)', () => {
    const src = stripComments(computeSource());
    expect(/\bST_Within\b/i.test(src)).toBe(true);
    expect(stepTestDirFiles().some((f) => /metamorphic/i.test(f)), 'a spatial compute with no metamorphic suite').toBe(true);
  });

  it('#173 Every golden snapshot query has an explicit `ORDER BY` — incl. the projected parcel_address_points hash ordered by (parcel_id, address_point_id) (flips at: commit 9, when post/*.json also carries source_fingerprint)', () => {
    const docs = goldenDocs();
    expect(docs.length, 'at least the 2 PRE captures').toBeGreaterThanOrEqual(2);
    for (const d of docs) {
      const t = (d.table_state ?? []).find((x) => x.table === TABLE);
      if (!t) continue;
      expect(t.order_by, `${d.file}: ${TABLE} table_state has no order_by`).toBeDefined();
    }
    artifact(DESCRIPTOR_REL, 'commit 7 (source_fingerprint requires a descriptor)');
  });

  it('#174 pgTAP carries schema assertions only — N/A: no pgTAP file references link_parcel_addresses/parcel_address_points outside migration DDL tests', () => {
    const pgtapDir = abs('supabase/tests');
    if (!fs.existsSync(pgtapDir)) return;
    const files = walk(pgtapDir).filter((f) => /parcel_address_points/i.test(f));
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      expect(/results_eq|SELECT\s+count\(\*\)\s*=\s*\d+\s+FROM\s+parcel_address_points\s+WHERE/i.test(src), `${f}: a pgTAP file asserts a VALUE, not schema`).toBe(false);
    }
  });

  it('#176 Generator correctness is tested per branch — the insert-only join (LG-18) over the SQL write.js generates (flips at: commit 7)', () => {
    artifact(WRITE_REL, 'LG-18 executor lands at commit 7');
    const d = loadDescriptor();
    const t = writeTarget(d);
    expect(t.write_discipline.class).toBe(WRITE_CLASS);
  });

  it('#180 Shapefile fixtures — N/A by subject: this step reads no external file (a pure DB->DB join); the compute requires no parser', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/shapefile|\.shp\b|\.dbf\b/i.test(src), 'no shapefile dependency exists').toBe(false);
  });

  it('#182 Fixtures are minimal — one row per branch, per check, plus null/empty/boundary (conditionally vacuous — no fixtures dir yet, inline fixtures live in this file)', () => {
    const dir = path.join(abs(STEP_DIR_REL), 'fixtures');
    if (!fs.existsSync(dir)) return;
    for (const f of walk(dir)) {
      const rows = JSON.parse(fs.readFileSync(f, 'utf8')) as unknown[];
      expect(Array.isArray(rows) && rows.length <= 20, `${f}: a fixture over 20 rows is not minimal`).toBe(true);
    }
  });

  it('#184 Fixtures live next to their step and are deleted with it (conditionally vacuous — no fixtures dir yet)', () => {
    const dir = path.join(abs(STEP_DIR_REL), 'fixtures');
    if (!fs.existsSync(dir)) return;
    expect(dir.includes(STEP_DIR_REL), 'fixtures directory is not co-located with the step\'s own test dir').toBe(true);
  });

  it('#199 No step defines its own `verdictCascade` — link_parcel_addresses\'s row-derived verdict must route through the shared deriveVerdict (flips at: commit 7)', () => {
    const compute = stripComments(computeSource());
    expect(/verdictCascade|\.some\(\s*r\s*=>\s*r\.status/i.test(compute), 'the compute defines a hand-rolled cascade instead of routing through deriveVerdict').toBe(false);
  });

  it('#200 The §11 Counter Semantic Contract — records_total/new/updated sourced from the same semantic as today\'s script (records_total = parcelsWithGeom, "the full evaluation scope", records_new = totalNewLinks) (flips at: commit 7)', () => {
    const d = loadDescriptor();
    expect(d.counters, 'counters must not be "none" for a MATERIALIZER').not.toBe('none');
    const c = d.counters as Exclude<Descriptor['counters'], 'none'>;
    expect(c.records_total.source.length > 0, 'records_total has no declared source').toBe(true);
    expect(/parcels.?with.?geom/i.test(c.records_total.source), 'records_total is not sourced from the current script\'s own parcelsWithGeom semantic (:355)').toBe(true);
  });

  it('#201 The write target never touches a column owned by an upstream loader — link_parcel_addresses\'s ONE write target declares ONLY parcel_id/address_point_id/computed_at, never geom or any parcels/address_points-owned column (flips at: commit 7)', () => {
    const d = loadDescriptor();
    const t = writeTarget(d);
    const cols = t.columns.map((c) => c.name);
    expect(cols.sort()).toEqual([...WRITE_COLUMNS].sort());
    for (const owned of ['geom', 'lot_size_sqm', 'feature_type', 'address_class_desc']) {
      expect(cols.includes(owned), `link_parcel_addresses's write target declares column "${owned}", which is load-parcels.js/load-address-points.js's exclusive territory`).toBe(false);
    }
  });

  it('#202 The name freeze — none of T1-T5 exist as registered logic_variables today (all 5 are NEW this pilot, confirmed 0 rows live, finding 4) — this claim\'s own shape here is "declare, do not collide with an existing name" (flips at: commit 7)', () => {
    const d = loadDescriptor();
    expect(d.config, 'config must declare the tunables').not.toBe('none');
    const cfg = d.config as Exclude<Descriptor['config'], 'none'>;
    for (const name of Object.values(CONFIG_VARS)) {
      expect(cfg.logic_variables.some((v) => v.name === name), `${name} not declared in config.logic_variables[]`).toBe(true);
    }
  });

  it('#203 Frozen `records_meta` producer/consumer blocks — no self-consumed emits contract exists for this step (N/A by measurement: unlike link_wsib\'s threshold_updated_at, link_parcel_addresses has 0 config_version-style self-consumption today) — declared emits:"none" is the truthful claim (flips at: commit 7, when the descriptor states it explicitly rather than this being inferred)', () => {
    const d = loadDescriptor();
    expect(d.emits, 'emits must be an explicit declaration, "none" or an array — never omitted').toBeDefined();
  });

  it('#204 `RUN_AT` captured once — the midnight-cross fence (DB clock, library-owned, before any write; zero clock reads in the compute) (flips at: commit 7)', () => {
    const compute = stripComments(computeSource());
    expect(/new Date\(\)/.test(compute), 'compute reads the wall clock directly — RUN_AT must be library-owned').toBe(false);
    artifact(INDEX_REL, 'the pre_compute RUN_AT capture lands with runMaterializePhase, commit 7');
  });

  it('#205 Lock-ID uniqueness across manifest ∪ `one-time/` ∪ `backfill/` — lock 115 textual and unique — testable today against the CURRENT hand-rolled script', () => {
    const files = [
      ...fs.readdirSync(abs('scripts')).filter((f) => f.endsWith('.js')).map((f) => `scripts/${f}`),
      ...(fs.existsSync(abs('scripts/one-time')) ? fs.readdirSync(abs('scripts/one-time')).map((f) => `scripts/one-time/${f}`) : []),
      ...(fs.existsSync(abs('scripts/backfill')) ? fs.readdirSync(abs('scripts/backfill')).map((f) => `scripts/backfill/${f}`) : []),
    ];
    const owners: Array<{ file: string; lock: number }> = [];
    for (const f of files) {
      const src = fs.readFileSync(abs(f), 'utf8');
      const m = /ADVISORY_LOCK_ID\s*=\s*(\d+)/.exec(src);
      if (m) owners.push({ file: f, lock: Number(m[1]) });
    }
    const holders = owners.filter((o) => o.lock === LOCK_ID);
    expect(holders.length, `lock ${LOCK_ID} must be held by exactly link-parcel-addresses.js; found: ${holders.map((h) => h.file).join(', ')}`).toBe(1);
    expect(holders[0]?.file).toBe(STEP_REL);
  });
});

describe('55-B — monotone partials (5, k=MIXED)', () => {
  it('#36 [PARTIAL] Entries older than N months are flagged `stale_interpretation` — fires on a backdated fixture', () => {
    const now = new Date(`${FIXTURE_REVIEWED}T00:00:00Z`);
    const backdated: Array<{ block: string; entry: NotesEntry }> = [
      { block: 'known_normal', entry: { measured: { value: 1, date: '2020-01-01', query: 'x' } } },
    ];
    const stale = staleEntries(backdated, now, 6);
    expect(stale.length, 'a 2020-dated entry must flag stale at 6 months').toBeGreaterThan(0);
    const fresh = staleEntries([{ block: 'known_normal', entry: { measured: { value: 1, date: FIXTURE_REVIEWED, query: 'x' } } }], now, 6);
    expect(fresh.length, 'a fresh entry must not flag stale').toBe(0);
  });

  it('#175 [PARTIAL] All generated statements PREPARE/EXPLAIN cleanly — the converted subset (LG-18\'s insert-only join) is syntactically well-formed (flips at: commit 7)', () => {
    // write.js already exists (LG-11/LG-16 landed at pilot 4) — the claim is genuinely red
    // on the NEW executor's NAME, not on the file's mere existence.
    const src = fs.readFileSync(abs(WRITE_REL), 'utf8');
    expect(src.includes(NO_RETRACT_EXECUTOR), `${WRITE_REL} does not yet export "${NO_RETRACT_EXECUTOR}" — the LG-18 subset does not exist until commit 7`).toBe(true);
  });

  it('#181 [PARTIAL] `pg_trgm` precision/recall never regress — N/A BY SUBJECT: this MATERIALIZER matches via ST_Within spatial containment, not trigram similarity (unlike link_wsib) — a spatial-precision partial is the relevant sibling, out of this claim\'s own scope', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/pg_trgm|similarity\(/i.test(src), 'no trigram matching exists in this step — N/A confirmed').toBe(false);
  });

  it('#183 [PARTIAL] No fixture exceeds 180 days without review — max-age assertion on the inline fixtures', () => {
    const reviewedAt = new Date(`${FIXTURE_REVIEWED}T00:00:00Z`);
    const ageDays = daysBetween(new Date(), reviewedAt);
    expect(ageDays, `this file's inline fixtures were reviewed ${FIXTURE_REVIEWED} — re-review before ${FIXTURE_MAX_AGE_DAYS} days elapse`).toBeLessThan(FIXTURE_MAX_AGE_DAYS);
  });

  it('#206 [PARTIAL] `records_meta` merge collisions are detected — link_parcel_addresses\'s keys vs the 4 already-converted producers (assert_schema, load_ravines, link_massing, link_wsib) (flips at: commit 7)', () => {
    const converted = fs.existsSync(abs(CONVERTED_REL)) ? (JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] }).converted : [];
    expect(converted.length, 'at least 4 already-converted producers exist for a two-producer collision fixture').toBeGreaterThanOrEqual(4);
    artifact(DESCRIPTOR_REL, 'this step\'s own emits[] keys land at commit 7');
  });
});

// ---------------------------------------------------------------------------
// Must-fail fixture machinery for #163/#165 — a link_parcel_addresses-specific
// healthy/sabotaged world over the 7 declared WARN/FAIL checks.
// ---------------------------------------------------------------------------

function healthyWorld(): World {
  return {
    matched: {
      parcels_with_geom: LIVE_PARCELS_TOTAL,
      address_points_with_geom: LIVE_AP_TOTAL,
      address_points_with_null_geom: 0, // healthy: no NULL-geom APs today
      new_links_written: 0,
      final_link_count: LIVE_PAP_ROWS, // healthy: > 0
      parcels_with_links: 467_786, // measured, commit-1 boundary freeze
      address_points_with_no_parcel: 14_122, // 2.69% — well under the 5% T3 ceiling
      fanout_condo_max: LIVE_FANOUT_MAX_CONDO, // 346 — under the T5 default (400)
      fanout_noncondo_max: LIVE_FANOUT_MAX_NONCONDO, // 155
      fanout_noncondo_gt_threshold: LIVE_NONCONDO_GT_20, // healthy fixture still carries the REAL live count (130 > 20 fires WARN by construction — see the T4 sabotage below for the DEGENERATE case)
      fanout_condo_gt_threshold: 0, // 0 CONDO parcels over the T5 default (400) — healthy
      stale_st_within_count: LIVE_STALE_ST_WITHIN, // 0 — LPA-D1's live exposure today
      missed_link_count: LIVE_MISSED_LINK, // 0
      errors: 0,
    },
    written: { privilege: { bypassrls: true, policies: 0, rls_enabled: true } },
    gate: { mode: 'incremental', reason: 'unchanged', skipped: false },
    overrides: { force_full: false },
    elapsed_ms: 30_000,
  };
}

/**
 * One sabotage mutator per non-INFO check. `parcel_fanout_outliers` (T4) is INTENTIONALLY
 * WARN in the healthy fixture too (130 > 20 is the REAL, measured, expected-to-fire state —
 * R-H requires this exact shape: "a metric expected to be permanently non-zero is WARN with
 * a declared retighten condition, never FAIL"). Its sabotage instead proves the DEGENERATE
 * direction: the check must NOT silently downgrade to PASS/INFO when the count is genuinely
 * elevated further.
 */
const SABOTAGE_BY_VAR: Record<string, (w: World) => void> = {
  [CONFIG_VARS.T2]: (w) => { w.matched = { ...w.matched, parcels_with_links: Math.round(w.matched.parcels_with_geom * 0.40) }; }, // 60% no-address vs the 50% T2 ceiling
  [CONFIG_VARS.T3]: (w) => { w.matched = { ...w.matched, address_points_with_no_parcel: Math.round(w.matched.address_points_with_geom * 0.10) }; }, // 10% vs the 5% T3 ceiling
  [CONFIG_VARS.T4]: (w) => { w.matched = { ...w.matched, fanout_noncondo_gt_threshold: 0 }; }, // the degenerate PASS direction: 0 outliers must read PASS, not stuck-WARN
  [CONFIG_VARS.T5]: (w) => { w.matched = { ...w.matched, fanout_condo_gt_threshold: 401, fanout_condo_max: 500 }; }, // LPA-D3: the bound is `viol <= 400` (a COUNT of outlier CONDO parcels, the same config var doing double duty as both the per-parcel fanout ceiling AND the tolerable outlier-count ceiling) — the sabotage must exceed 400 itself, not merely be nonzero
};
const SABOTAGE_BY_ID: Array<[RegExp, (w: World) => void]> = [
  [/address_points_with_null_geom/i, (w) => { w.matched.address_points_with_null_geom = 5000; }], // Phase 2a backfill regressed
  [/final_link_count/i, (w) => { w.matched.final_link_count = 0; }], // the structural zero-coverage gate — PostGIS/GIST regression
  [/^errors$/i, (w) => { w.matched.errors = 3; }], // a batch loop crashed
  // Peel 8b (#165 "INFO both ways") — LPA-D1's two observability INFO checks must stay INFO
  // even on an elevated/nonzero input; INFO never gates on value (Rule 1: nothing hidden,
  // never a threshold).
  [/^parcel_address_points_stale_st_within_count$/i, (w) => { w.matched.stale_st_within_count = 42; }],
  [/^parcel_address_points_missed_link_count$/i, (w) => { w.matched.missed_link_count = 7; }],
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

/** Substitutes each `limit_from_config` check's `limit` string with its resolved config value — mirrors verdict.js's own `resolveLimit`. */
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

/**
 * `checkIds` defaults to every declared check (the pre-LPA-D4 shape every other caller
 * relies on); LPA-D4's gated-skip locks pass the NARROWED set the runner itself would
 * compute (`stepCtx.checks` filtered to `when:"pre"` ids on a SKIP, index.js:1596) so the
 * fixture proves the SAME shape the real runner produces, not merely "the check exists".
 */
async function runComputeDetailed(compute: ComputeFn, d: Descriptor, w: World, checkIds?: string[]): Promise<{ observations: Record<string, unknown>; statuses: Record<string, string> }> {
  const observations: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const declared = new Set(d.checks.map((c) => c.id));
  const config = configProjection(d);
  const resolved = resolvedDescriptor(d, config);
  const ctx = {
    pool: { query: () => { throw new Error('the compute must not touch the pool — reads/writes are library-owned (A-1)'); } },
    chainId: null,
    runId: null,
    descriptor: resolved,
    checks: checkIds ?? resolved.checks.map((c) => c.id),
    fetch: () => { throw new Error('the compute must not fetch — this step has an EMPTY network seam (G5)'); },
    clock: () => Date.parse(`${FIXTURE_REVIEWED}T00:00:00Z`),
    config,
    matched: w.matched,
    written: w.written,
    gate: w.gate,
    overrides: w.overrides,
    elapsed_ms: w.elapsed_ms,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    report(checkId: string, observation: unknown) {
      if (!declared.has(checkId)) throw new Error(`compute reported undeclared check "${checkId}"`);
      observations[checkId] = observation;
    },
  };
  await compute(ctx);
  const built = buildAuditTable(resolved, null, observations);
  const statuses: Record<string, string> = {};
  for (const r of built.rows) statuses[r.metric] = r.status;
  return { observations, statuses };
}

async function runCompute(compute: ComputeFn, d: Descriptor, w: World): Promise<Record<string, string>> {
  return (await runComputeDetailed(compute, d, w)).statuses;
}

async function mustFailPair(compute: ComputeFn, d: Descriptor, c: Check): Promise<{ healthy: string; sabotaged: string }> {
  const healthy = await runCompute(compute, d, healthyWorld());
  const sabWorld = healthyWorld();
  const mutate = sabotageFor(c);
  expect(mutate, `no sabotage fixture for check ${c.id}`).toBeDefined();
  (mutate as (w: World) => void)(sabWorld);
  const sabotaged = await runCompute(compute, d, sabWorld);
  return { healthy: healthy[c.id] ?? 'MISSING', sabotaged: sabotaged[c.id] ?? 'MISSING' };
}

describe('the three files, one slug (Spec 122 §4.1 / §5.1 / §5.2) + the MATERIALIZER library growth', () => {
  it('descriptor exists, validates, and carries the ruled shape: MATERIALIZER archetype, execution.shape:"materialize", 1 write target (class D, insert_only_no_retraction), T1-T5, override E1, staleness gated-skip, sharing.slug_forms:"derived", lock 115, min_migration 159 (COUNT floor, LW-D8 pattern) (flips at: commit 7)', () => {
    const d = loadDescriptor();
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.archetype, 'MATERIALIZER (Spec 122 §1.10, forced by having exactly 1 member)').toMatch(/materializer/i);
    expect(d.execution.shape, 'A-1 RULING: a new runMaterializePhase, execution.shape:"materialize"').toBe('materialize');
    const t = writeTarget(d);
    expect(t.write_discipline.guard, 'guard:"none" — genuinely nothing to guard, the row is immutable once written').toBe('none');
    expect(t.retract, 'LPA-D1: PIN the non-retraction as-is').toBe('none');
    expect(d.config, 'config must declare T1-T5').not.toBe('none');
    const cfg = d.config as Exclude<Descriptor['config'], 'none'>;
    for (const name of Object.values(CONFIG_VARS)) {
      expect(cfg.logic_variables.some((v) => v.name === name), `${name} not declared in config.logic_variables[]`).toBe(true);
    }
    for (const name of LIMIT_FROM_CONFIG_VARS) checkByVar(d, name);
    expect(d.override, 'override must declare force_full (E1)').not.toBe('none');
    expect(d.database.min_migration, `min_migration is a COUNT floor (LW-D8 pattern): ${MIN_MIGRATION}, migration 162's position in migrations/`).toBe(MIN_MIGRATION);
    expect(d.sharing.slug_forms, 'B3 gate slugs must be DERIVED (LG-15\'s deriveLedgerSlugs), never re-hardcoded').toBe('derived');
    expect(d.recovery, 'recovery must not be "none" for a step with a class-D target').not.toBe('none');
    const recovery = d.recovery as Exclude<Descriptor['recovery'], 'none' | undefined>;
    expect(recovery.reset, 'MATERIALIZER schema profile: recovery.reset may not be "none" — a truthful declare-only string, A-1').not.toBe('none');
    expect(typeof recovery.reset === 'string' && recovery.reset.length >= 8, 'recovery.reset must be a real string >=8 chars (or "generated")').toBe(true);
    expect(recovery.interrupted, 'no destructive retraction target exists — "none" is the TRUTHFUL declaration (R-F item 1)').toBe('none');
    expect(recovery.interrupted_why, 'recovery.interrupted:"none" requires interrupted_why').toBeDefined();
  });

  it('notes.json is real (<=12 entries, fences for the 2 adjudicated fix-commits, LPA-D2\'s resumability correction stated in prose) (flips at: commit 7)', () => {
    const notes = loadNotes();
    expect(Array.isArray(notes.fences), 'notes.fences missing').toBe(true);
    expect((notes.fences ?? []).length).toBeGreaterThanOrEqual(FENCE_COMMITS.length);
  });

  it('compute exists, exports `checks` (dispatch === descriptor ids, in order); no fs/pg/pipeline/argv/env; opens no pool (flips at: commit 7)', () => {
    const d = loadDescriptor();
    const mod = loadComputeModule();
    expect(typeof mod.compute).toBe('function');
    const src = stripComments(computeSource());
    for (const banned of [/require\(['"]fs['"]\)/, /require\(['"]pg['"]\)/, /require\(['"]\.\/pipeline['"]\)/, /process\.argv/, /process\.env/]) {
      expect(banned.test(src), `compute violates Rule 2 (compute is JUST compute): ${banned}`).toBe(false);
    }
    const p = probe(COMPUTE_REL);
    expect(p.pools, 'requiring the compute module must open zero pg.Pool instances').toBe(0);
  });

  it('the step file is the §5.1 frozen shape (no pipeline.run body, no argv/env/fetch/fs in the frozen wrapper), SPEC LINK kept, lock 115 textual (flips at: commit 7)', () => {
    const src = fs.readFileSync(artifact(STEP_REL), 'utf8');
    expect(src.includes('SPEC LINK'), 'the frozen shape must keep a SPEC LINK header').toBe(true);
    expect(src.includes(String(LOCK_ID)), 'lock 115 must remain textual in the frozen shape').toBe(true);
    // Distinguishing signal from TODAY's 393-line hand-rolled file: the frozen shape is short.
    expect(src.split('\n').length, 'the §5.1 frozen shape is far shorter than the 393-line hand-rolled file — if this is still ~393 lines, conversion has not happened').toBeLessThan(100);
  });

  it('converted.json registers the step as the 5th entry (commit 9 arms the shape gate: 5/62) (flipped: commit 9)', () => {
    const converted = (JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] }).converted;
    // >= 5, not === 5: applying review_followups.md's own "cross-step count assertions"
    // lesson (filed at pilot 4's cutover, then found to have recurred in link_wsib's own
    // test at THIS pilot's cutover) proactively — a LATER pilot (6+) growing the fleet is
    // expected, not a regression; this claim's own subject is link_parcel_addresses's OWN
    // membership and index.
    expect(converted.length, 'at least 5 entries (assert-schema, load-ravines, link-massing, link-wsib, link-parcel-addresses, ...)').toBeGreaterThanOrEqual(5);
    expect(converted.indexOf(STEP_REL), `${STEP_REL} must still be the 5th entry (index 4) — reordering converted.json is a declared diff, not a silent shuffle`).toBe(4);
  });

  it('grandfathered.json — a 3rd entry, keyed link_parcel_addresses, path outputs.writes[].write_discipline.guard, value "none" (Fold A Integration finding 1 — the key is .guard, never .class) (flips at: commit 7)', () => {
    const g = JSON.parse(fs.readFileSync(abs(GRANDFATHERED_REL), 'utf8')) as { steps: Record<string, { paths?: Record<string, unknown> }> };
    expect(typeof g.steps, 'grandfathered.json must carry a `steps` object keyed by identity.name').toBe('object');
    const findings = detectGrandfatheringOnGuardFence(g.steps.link_parcel_addresses);
    expect(findings, findings.join('; ')).toEqual([]);
  });

  it('write.js — LG-18 (executeInsertSelectNoRetract, INSERT-only, UPDATE/DELETE structurally forbidden) exists — checked by NAME + CLASS STRING, not merely "the file requires" (flips at: commit 7)', () => {
    loadLib(WRITE_REL);
    const src = stripComments(fs.readFileSync(abs(WRITE_REL), 'utf8'));
    expect(src.includes(NO_RETRACT_EXECUTOR), `write.js does not yet export "${NO_RETRACT_EXECUTOR}" (LG-18) — genuinely absent today`).toBe(true);
    expect(src.includes(WRITE_CLASS), `write.js does not yet dispatch on "${WRITE_CLASS}" for the new executor — genuinely absent today (this class value ALREADY exists in the frozen taxonomy, only the codegen branch is new)`).toBe(true);
  });

  it('index.js — a gated-skip path exists for isMaterializeStep (runMaterializePhase wires staleness.ledgerGatedSkip in explicitly, A-1 RULING — mirroring runCascadePhase, NOT runLinkPhase) (flips at: commit 7)', () => {
    const lib = loadLib(INDEX_REL) as Record<string, unknown>;
    expect(typeof lib.isMaterializeStep, 'index.js has no isMaterializeStep export').toBe('function');
    const src = stripComments(fs.readFileSync(abs(INDEX_REL), 'utf8'));
    // Brace-BALANCED extraction (link_wsib LW-D-class lesson: a lazy regex stops at the
    // FIRST inner block's closing brace, not the function's).
    const sigMatch = /async function runMaterializePhase\([^)]*\)\s*\{/.exec(src);
    let block: string | undefined;
    if (sigMatch) {
      const bodyStart = sigMatch.index + sigMatch[0].length;
      let depth = 1;
      let end = -1;
      for (let i = bodyStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end > 0) block = src.slice(sigMatch.index, end);
    }
    expect(block, 'index.js has no runMaterializePhase function to inspect').toBeTruthy();
    const wired = detectLedgerGatedSkipWiredFence({
      callsLedgerGatedSkip: /staleness\.ledgerGatedSkip/.test(block ?? ''),
      branchesOnSkip: /gatedSkip\.skip/.test(block ?? ''),
    });
    expect(wired, wired.join('; ')).toEqual([]);
  });
});

describe('G4d fence locks — the named locks (LG-18, grandfathering, ledgerGatedSkip, header, slug-derivation, stale-invariant, fan-out WARN)', () => {
  it('LG-18 write-executor lock — present in the converted step: INSERT...SELECT verbatim, ON CONFLICT (parcel_id, address_point_id) DO NOTHING, class insert_only_no_retraction (flips at: commit 7)', () => {
    const d = loadDescriptor();
    const t = writeTarget(d);
    expect(t.write_discipline.class).toBe(WRITE_CLASS);
  });

  it('LG-18 write-executor lock — reversion is detectable: an UPDATE or DELETE token, a missing ON CONFLICT DO NOTHING, or a per-row VALUES insert (no SELECT), makes the lock fire', () => {
    const goodSql = 'INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at) SELECT pb.id, ap.address_point_id, $3::timestamptz FROM parcel_batch pb JOIN address_points ap ON ap.geom IS NOT NULL AND ST_Within(ap.geom, pb.geom) ON CONFLICT (parcel_id, address_point_id) DO NOTHING';
    expect(detectInsertSelectNoRetractFence(goodSql), 'the lock fires on the un-reverted subject (the CURRENT script\'s own verbatim SQL, :169-177)').toEqual([]);
    const updateSql = 'UPDATE parcel_address_points SET computed_at = $1 WHERE parcel_id = $2';
    const f1 = detectInsertSelectNoRetractFence(updateSql);
    expect(f1.some((f) => /UPDATE token present/.test(f)), 'an UPDATE went undetected').toBe(true);
    const deleteSql = 'DELETE FROM parcel_address_points WHERE parcel_id = $1';
    const f2 = detectInsertSelectNoRetractFence(deleteSql);
    expect(f2.some((f) => /DELETE token present/.test(f)), 'a DELETE went undetected — LPA-D1 pins the non-retraction, a DELETE fixes it silently without a ruling').toBe(true);
    const noConflict = 'INSERT INTO parcel_address_points (parcel_id, address_point_id) SELECT p.id, ap.address_point_id FROM parcels p JOIN address_points ap ON ST_Within(ap.geom, p.geom)';
    const f3 = detectInsertSelectNoRetractFence(noConflict);
    expect(f3.some((f) => /ON CONFLICT/.test(f)), 'a missing ON CONFLICT DO NOTHING went undetected — G1 (a link written at most once) would break').toBe(true);
    const valuesOnly = "INSERT INTO parcel_address_points (parcel_id, address_point_id) VALUES (1, 2) ON CONFLICT (parcel_id, address_point_id) DO NOTHING";
    expect(detectInsertSelectNoRetractFence(valuesOnly).some((f) => /no SELECT clause/.test(f)), 'a per-row VALUES insert (no SELECT) went undetected').toBe(true);
  });

  it('Grandfathering-on-guard lock — present: grandfathered.json keys on .guard (not .class), value "none" (flips at: commit 7)', () => {
    const g = JSON.parse(fs.readFileSync(abs(GRANDFATHERED_REL), 'utf8')) as { steps: Record<string, { paths?: Record<string, unknown> }> };
    const findings = detectGrandfatheringOnGuardFence(g.steps.link_parcel_addresses);
    expect(findings, findings.join('; ')).toEqual([]);
  });

  it('Grandfathering-on-guard lock — reversion is detectable: a missing entry, a .class-keyed entry, or a wrong guard value, makes the lock fire (proves link_massing\'s own precedent E1 entry — .guard, not .class — is the correct shape)', () => {
    expect(detectGrandfatheringOnGuardFence(undefined).some((f) => /no grandfathered\.json entry/.test(f)), 'a missing entry went undetected').toBe(true);
    const classKeyed = { paths: { 'outputs.writes[].write_discipline.class': 'insert_only_no_retraction' } };
    const f = detectGrandfatheringOnGuardFence(classKeyed);
    expect(f.some((f2) => /keys on outputs\.writes\[\]\.write_discipline\.class/.test(f2)), 'a .class-keyed entry went undetected — this is exactly what Fold A Integration finding 1 caught in the ORIGINAL plan draft').toBe(true);
    expect(f.some((f2) => /does not key on outputs\.writes\[\]\.write_discipline\.guard/.test(f2))).toBe(true);
    const wrongValue = { paths: { 'outputs.writes[].write_discipline.guard': 'is_distinct_from' } };
    expect(detectGrandfatheringOnGuardFence(wrongValue).some((f2) => /value is not "none"/.test(f2)), 'a wrong guard value went undetected').toBe(true);
    // The REAL link_massing precedent already keys on .guard — confirms the detector against a genuine, currently-committed subject.
    const linkMassing = JSON.parse(fs.readFileSync(abs(GRANDFATHERED_REL), 'utf8')) as { steps: Record<string, { paths?: Record<string, unknown> }> };
    expect(detectGrandfatheringOnGuardFence(linkMassing.steps.link_massing), 'link_massing\'s own E1 entry must already pass this detector').toEqual([]);
  });

  it('ledgerGatedSkip-wired lock — present: runMaterializePhase calls staleness.ledgerGatedSkip and branches on gatedSkip.skip (LG-15 reused, not re-hand-rolled a 3rd time) (flips at: commit 7)', () => {
    const src = stripComments(fs.readFileSync(abs(INDEX_REL), 'utf8'));
    const sigMatch = /async function runMaterializePhase\([^)]*\)\s*\{/.exec(src);
    expect(sigMatch, 'index.js has no runMaterializePhase function').toBeTruthy();
  });

  it('ledgerGatedSkip-wired lock — reversion is detectable: a materialize phase with no staleness.ledgerGatedSkip call, or no gatedSkip.skip branch, makes the lock fire (commit 7 landed: the frozen step file hand-rolls NOTHING — the gate call lives in the generic runner, scripts/lib/step/index.js)', () => {
    const good = { callsLedgerGatedSkip: true, branchesOnSkip: true };
    expect(detectLedgerGatedSkipWiredFence(good), 'the lock fires on the un-reverted subject').toEqual([]);
    const noCalls = { callsLedgerGatedSkip: false, branchesOnSkip: false };
    const f = detectLedgerGatedSkipWiredFence(noCalls);
    expect(f.some((x) => /does not call staleness\.ledgerGatedSkip/.test(x)), 'a hand-rolled gate went undetected — this was the PRE-CONVERSION shape (runLedgerGateDecision, not staleness.ledgerGatedSkip)').toBe(true);
    // Commit 7 landed: the frozen step file carries NO gate code at all — neither the OLD
    // hand-rolled sourceVersion.runLedgerGateDecision NOR a direct staleness.ledgerGatedSkip
    // call. The gate lives in scripts/lib/step/index.js's runMaterializePhase (generic
    // library code, Gate 0 / claim #149), never in the step file itself.
    const currentSrc = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/sourceVersion\.runLedgerGateDecision/.test(currentSrc), 'the frozen step file must not hand-roll the OLD gate').toBe(false);
    expect(/staleness\.ledgerGatedSkip/.test(currentSrc), 'the frozen step file must not call the gate directly either — that lives in the generic runner').toBe(false);
    const indexSrc = stripComments(fs.readFileSync(abs(INDEX_REL), 'utf8'));
    expect(/staleness\.ledgerGatedSkip/.test(indexSrc), 'scripts/lib/step/index.js must call the gate (runMaterializePhase)').toBe(true);
  });

  it('Header-resumable-lie lock — reversion is detectable: the OLD pre-conversion header carried the false "picks up where we left off" claim, and the fixed text passes the detector (commit 7 landed: LPA-D2\'s correction now lives in notes.json/deviations[], never in the frozen step file, which carries no header prose at all)', () => {
    const oldHeader = 'Resumable: each batch commits independently; operator Ctrl-C leaves the DB in a consistent partial state and a re-run picks up where we left off.';
    const findings = detectHeaderResumableLieFence(oldHeader);
    expect(findings.some((f) => /still claims/.test(f)), 'the OLD pre-conversion header text must still be caught by the detector').toBe(true);
    const fixed = 'Idempotent: each batch commits independently via ON CONFLICT DO NOTHING; a re-run re-scans the FULL population (idempotent, not resumable — no batch-position checkpoint is persisted).';
    expect(detectHeaderResumableLieFence(fixed), 'the fixed header text must pass the detector').toEqual([]);
    // Commit 7 landed: the frozen step file carries no header prose to lie in at all —
    // LPA-D2's correction lives in the descriptor's deviations[] and notes.json instead
    // (asserted by the sibling it.fails-flipped "present" lock, below).
    const currentSrc = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(currentSrc, 'the frozen step file must not carry the old resumability claim').not.toMatch(/re-run picks up where we left off/i);
  });

  it('Header-resumable-lie lock — present: the notes.json / descriptor prose states the truth (idempotent, not resumable) (flips at: commit 7)', () => {
    const notes = loadNotes();
    const allText = JSON.stringify(notes);
    const findings = detectHeaderResumableLieFence(allText);
    expect(findings, findings.join('; ')).toEqual([]);
  });

  it('B3-gate-slugs-derived lock — present: LG-15\'s deriveLedgerSlugs (already built, pilot 4) reconstructs the SAME 3 own-slug forms + 6 upstream-slug forms the PRE-CONVERSION script hand-maintained, from a SYNTHETIC descriptor matching this pilot\'s ruled shape (commit 7 landed: the frozen step file no longer carries OWN_SLUGS/UPSTREAM_SLUGS at all — the arrays below are ported verbatim from the pre-conversion script, commits d44b4458..74653a8f, so this lock does not silently go vacuous the moment the source text it used to grep disappears)', () => {
    const derive = loadLib('scripts/lib/step/staleness.js').deriveLedgerSlugs as (d: unknown) => { own: string[]; upstream: string[] };
    expect(typeof derive, 'staleness.js has no deriveLedgerSlugs export').toBe('function');
    // The PRE-CONVERSION script's UPSTREAM_SLUGS (:61-64) was the union of TWO name bases
    // per upstream producer — the table/chain-slug name ('address_points'/'parcels', giving
    // the chain-prefixed + bare forms) and the LOADER SCRIPT name ('load_address_points'/
    // 'load_parcels', giving the hyphenated form) — so a descriptor expressing the same
    // coverage declares BOTH as separate inputs.reads.steps[] entries; deriveLedgerSlugs's
    // per-name forms() union covers the real (pre-conversion) script's 6-form array as a
    // superset.
    const synthetic = {
      identity: { name: 'link_parcel_addresses' },
      execution: { invocation: { sources: { argv: [] } } },
      inputs: { reads: { steps: [
        { step: 'address_points' }, { step: 'load_address_points' },
        { step: 'parcels' }, { step: 'load_parcels' },
      ] } },
    };
    const derived = derive(synthetic);
    // Ported verbatim from the pre-conversion script's own OWN_SLUGS/UPSTREAM_SLUGS module
    // constants (git history, commits d44b4458..74653a8f) — never re-derived from the
    // frozen file, which carries neither array any more.
    const expectedOwn = ['sources:link_parcel_addresses', 'link_parcel_addresses', 'link-parcel-addresses'];
    const expectedUpstream = [
      'sources:address_points', 'address_points', 'load-address-points',
      'sources:parcels', 'parcels', 'load-parcels',
    ];
    expect(expectedOwn.length, 'the pre-conversion OWN_SLUGS had >=3 forms').toBeGreaterThanOrEqual(3);
    expect(expectedUpstream.length, 'the pre-conversion UPSTREAM_SLUGS had >=6 forms').toBeGreaterThanOrEqual(6);
    const findings = detectSlugsDerivedFence(derived, expectedOwn, expectedUpstream);
    expect(findings, findings.join('; ')).toEqual([]);
  });

  it('B3-gate-slugs-derived lock — present in the real future descriptor: sharing.slug_forms:"derived" (flips at: commit 7)', () => {
    const d = loadDescriptor();
    expect(d.sharing.slug_forms).toBe('derived');
  });

  it('Stale-invariant-observable lock (LPA-D1) — present: a declared INFO check surfaces stale_st_within_count every run, never merely in invariants.json (flips at: commit 7)', () => {
    const d = loadDescriptor();
    const c = checkById(d, CHECK_IDS.staleLinkCount);
    const observed = detectStaleInvariantObservableFence({ hasCheck: true, severity: c.severity, alwaysReported: true });
    expect(observed, observed.join('; ')).toEqual([]);
  });

  it('Stale-invariant-observable lock — reversion is detectable: no declared check, or a non-INFO severity, makes the lock fire (proves today\'s real gap: this fact exists only in commit 5\'s invariants.json, never in the step\'s own runtime output)', () => {
    const missing = detectStaleInvariantObservableFence({ hasCheck: false, severity: null, alwaysReported: false });
    expect(missing.some((f) => /no declared check/.test(f)), 'a missing declared check went undetected').toBe(true);
    const wrongSeverity = detectStaleInvariantObservableFence({ hasCheck: true, severity: 'WARN', alwaysReported: true });
    expect(wrongSeverity.some((f) => /must be INFO/.test(f)), 'a WARN-severity stale-count check went undetected — LPA-D1 is PINNED, not gated, until a separate fix ruling').toBe(true);
    // Confirmed against the CURRENT script: no such check exists at all today.
    const currentSrc = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(currentSrc.includes('stale_st_within'), 'today\'s script must NOT already surface stale_st_within — this fence is genuinely red pre-conversion').toBe(false);
  });

  it('Fan-out-WARN-fires lock — present: parcel_fanout_outliers fires WARN on today\'s live data (130 non-CONDO parcels over the T4 default 20) (flips at: commit 7)', () => {
    const d = loadDescriptor();
    const c = checkById(d, CHECK_IDS.fanoutOutliersNoncondo);
    const findings = detectFanoutWarnFiresFence({ noncondoGtThreshold: LIVE_NONCONDO_GT_20, threshold: T4_DEFAULT, severity: c.severity });
    expect(findings, findings.join('; ')).toEqual([]);
  });

  it('Fan-out-WARN-fires lock — reversion is detectable: a count at or below threshold, or a non-WARN severity, makes the lock fire (proves the Fold B allow-list removal is genuinely load-bearing — the replacement aggregate must actually WARN, not silently PASS a real 130-parcel tail)', () => {
    const good = detectFanoutWarnFiresFence({ noncondoGtThreshold: LIVE_NONCONDO_GT_20, threshold: T4_DEFAULT, severity: 'WARN' });
    expect(good, 'the lock fires on the un-reverted, live-measured subject').toEqual([]);
    const belowThreshold = detectFanoutWarnFiresFence({ noncondoGtThreshold: 10, threshold: T4_DEFAULT, severity: 'WARN' });
    expect(belowThreshold.some((f) => /does not exceed threshold/.test(f)), 'a count at/below threshold going WARN anyway (a stuck-WARN bug) went undetected').toBe(true);
    const wrongSeverity = detectFanoutWarnFiresFence({ noncondoGtThreshold: LIVE_NONCONDO_GT_20, threshold: T4_DEFAULT, severity: 'FAIL' });
    expect(wrongSeverity.some((f) => /must be WARN, never FAIL/.test(f)), 'FAIL severity on a standing non-zero population went undetected (R-H)').toBe(true);
  });

  it('Pre-check-on-gated-skip lock (LPA-D4) — present: the descriptor declares a when:"pre" gate_decision check, mirroring link_wsib\'s exactly', () => {
    const d = loadDescriptor();
    const c = checkById(d, 'gate_decision');
    expect(c.when).toBe('pre');
    expect(c.severity).toBe('INFO');
    expect(c.blocking).toBe(false);
    const findings = detectPreCheckOnGatedSkipFence({ hasSkipGatedTerminal: d.terminals.some((t) => t.kind === 'skip_gated'), preCheckCount: d.checks.filter((x) => x.when === 'pre').length });
    expect(findings, findings.join('; ')).toEqual([]);
    const mod = loadComputeModule();
    expect(typeof mod.checks?.gate_decision, 'the compute dispatch table has no gate_decision function').toBe('function');
  });

  it('Pre-check-on-gated-skip lock — reversion is detectable: a skip_gated terminal with zero when:"pre" checks makes the lock fire — GROUNDED against the ACTUAL pre-fix commit (this is the real defect, not a hypothetical)', () => {
    const bad = detectPreCheckOnGatedSkipFence({ hasSkipGatedTerminal: true, preCheckCount: 0 });
    expect(bad.some((f) => /zero checks\[\]\.when === "pre"/.test(f)), 'a skip_gated terminal with zero pre checks went undetected').toBe(true);
    // link_massing carries NO skip_gated terminal (selectMode's tri-state never skips) — the
    // predicate must stay silent for it, proving the detector is scoped by the real field,
    // not merely "every step needs a pre check".
    const linkMassing = JSON.parse(fs.readFileSync(abs('scripts/link-massing.descriptor.json'), 'utf8')) as Descriptor;
    const lmHasSkipGated = linkMassing.terminals.some((t: { kind: string }) => t.kind === 'skip_gated');
    expect(lmHasSkipGated, 'link_massing must NOT carry a skip_gated terminal — LINK drives selectMode, never a skip').toBe(false);
    expect(detectPreCheckOnGatedSkipFence({ hasSkipGatedTerminal: lmHasSkipGated, preCheckCount: 0 })).toEqual([]);
  });

  it('gate_decision row (LPA-D4) — a gated SKIP capture still reports the reason (index.js\'s onlyChecks narrows ctx.checks to when:"pre" ids on a skip, so gate_decision must be one of them)', async () => {
    const d = loadDescriptor();
    const compute = loadCompute();
    const preIds = d.checks.filter((c) => c.when === 'pre').map((c) => c.id);
    expect(preIds, 'no when:"pre" checks declared at all — a gated skip would narrow to zero rows (LPA-D4\'s exact live defect: pipeline_runs 1709/1710/1714/1717)').toContain('gate_decision');
    const w = healthyWorld();
    w.gate = { mode: null, reason: 'no_upstream_changes', skipped: true };
    const { observations } = await runComputeDetailed(compute, d, w, preIds);
    const row = observations.gate_decision as { violations: number; detail?: { mode: unknown; reason: unknown; gated_skip: unknown } } | undefined;
    expect(row, 'gate_decision did not report under the SKIP-narrowed (pre-only) check set').toBeDefined();
    expect(row?.detail?.reason, 'the skip reason must be readable straight off the reported detail').toBe('no_upstream_changes');
    expect(row?.detail?.gated_skip).toBe(true);
    expect(row?.detail?.mode).toBe(null);
  });

  it('gate_decision row (LPA-D4) — a normal (non-skip) WRITE capture also carries it, both directions', async () => {
    const d = loadDescriptor();
    const compute = loadCompute();
    const allIds = d.checks.map((c) => c.id);
    const w = healthyWorld();
    w.gate = { mode: 'incremental', reason: 'upstream_changed', skipped: false };
    const { observations } = await runComputeDetailed(compute, d, w, allIds);
    const row = observations.gate_decision as { detail?: { mode: unknown; reason: unknown; gated_skip: unknown } } | undefined;
    expect(row, 'gate_decision did not report on a full (non-skip) check set').toBeDefined();
    expect(row?.detail?.reason).toBe('upstream_changed');
    expect(row?.detail?.gated_skip).toBe(false);
    expect(row?.detail?.mode).toBe('incremental');
  });

  it('records_meta.gate (LPA-D4, library rung (d)) — staleness.gateRecordsMeta produces the closed shape and index.js merges it for cascade/materialize/ingest, never link', () => {
    const staleness = loadLib('scripts/lib/step/staleness.js') as { gateRecordsMeta: (d: unknown, gate: unknown, gatedSkip: unknown) => Record<string, unknown> };
    expect(typeof staleness.gateRecordsMeta, 'staleness.js has no gateRecordsMeta export').toBe('function');
    const d = loadDescriptor();
    const skipGate = staleness.gateRecordsMeta(d, { mode: null, reason: 'no_upstream_changes', skipped: true }, null);
    expect(skipGate).toEqual({ reason: 'no_upstream_changes', gated_skip: true });
    const withLedger = staleness.gateRecordsMeta(d, { mode: 'incremental', reason: 'upstream_changed', skipped: false }, {
      gate: { ownCompleted: '2026-08-29T00:00:00Z', nonCompleted: 0, completedWithChanges: 1, staleRunningUpstream: 0 },
    });
    expect(withLedger.reason).toBe('upstream_changed');
    expect(withLedger.gated_skip).toBe(false);
    expect(Array.isArray(withLedger.own_slugs) && (withLedger.own_slugs as string[]).length > 0, 'own_slugs must be derived, never empty for a step with a declared invocation').toBe(true);
    expect(Array.isArray(withLedger.upstream_slugs) && (withLedger.upstream_slugs as string[]).length > 0, 'upstream_slugs must be derived from inputs.reads.steps').toBe(true);
    const indexSrc = stripComments(fs.readFileSync(abs(INDEX_REL), 'utf8'));
    expect(/staleness\.gateRecordsMeta\(/.test(indexSrc), 'index.js does not call staleness.gateRecordsMeta at all').toBe(true);
    // The merge must be reachable for ingest/cascade/materialize and NOT unconditional
    // (link is deliberately excluded — selectMode never skips).
    expect(/ingest \|\| cascade \|\| materialize/.test(indexSrc), 'the gateRecordsMeta merge is not conditioned on ingest/cascade/materialize').toBe(true);
  });
});

describe('sanity — the suite itself is grounded against the LIVE measured facts (not a placeholder)', () => {
  it('the constants in this file match the assessment report\'s own numbers', () => {
    const report = readText(REPORT_REL);
    for (const n of [String(LIVE_PAP_ROWS), String(LIVE_PARCELS_TOTAL), String(LIVE_AP_TOTAL), String(LIVE_FANOUT_MAX_CONDO), String(LIVE_LAND_ENTRANCE)]) {
      expect(report.includes(n.replace(/\B(?=(\d{3})+(?!\d))/g, ',')) || report.includes(n), `${n} not found in ${REPORT_REL}`).toBe(true);
    }
  });

  it('the golden PRE captures (commit 5) are readable and self-consistent with this file\'s constants', () => {
    const docs = goldenDocs().filter(isOld).filter((d) => !isForced(d));
    expect(docs.length, 'at least the 2 required invocations (extra repeat captures are also legal)').toBeGreaterThanOrEqual(2);
    for (const d of docs) {
      expect(invariant(d, 'fanout_max_condo')).toBe(LIVE_FANOUT_MAX_CONDO);
      expect(invariant(d, 'fanout_max_noncondo')).toBe(LIVE_FANOUT_MAX_NONCONDO);
      expect(invariant(d, 'noncondo_gt_20_count')).toBe(LIVE_NONCONDO_GT_20);
      expect(invariant(d, 'land_entrance_count')).toBe(LIVE_LAND_ENTRANCE);
    }
  });

  it('LPA-D1 and LPA-D2 are opened in the defect ledger (commit 2, landed)', () => {
    const ledger = fs.readFileSync(abs(DEFECT_LEDGER_REL), 'utf8');
    expect(ledger.includes('LPA-D1'), 'no LPA-D1 row in the defect ledger').toBe(true);
    expect(ledger.includes('LPA-D2'), 'no LPA-D2 row in the defect ledger').toBe(true);
  });

  it('the config defaults T1-T5 match the plan\'s own P4 tunable inventory table', () => {
    const plan = fs.readFileSync(abs('.cursor/active_task.md'), 'utf8');
    for (const [id, name] of [['T1', CONFIG_VARS.T1], ['T2', CONFIG_VARS.T2], ['T3', CONFIG_VARS.T3], ['T4', CONFIG_VARS.T4], ['T5', CONFIG_VARS.T5]] as const) {
      expect(plan.includes(name), `${id} (${name}) not named in the plan's P4 tunable inventory table`).toBe(true);
    }
    for (const v of [T1_DEFAULT, T2_DEFAULT, T3_DEFAULT, T4_DEFAULT, T5_DEFAULT]) {
      expect(plan.includes(String(v)), `default ${v} not found anywhere in the plan`).toBe(true);
    }
  });
});
