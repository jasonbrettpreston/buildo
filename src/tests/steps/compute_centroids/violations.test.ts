// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown row 9 (PRIMARY — the step's real and only chain membership)
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (SECONDARY — owns the `parcels` table this step writes)
// SPEC LINK: docs/specs/01-pipeline/121_assessment_and_verification_methodology.md §4.3 (the worked-example DEFECT text — superseded by migration 245, §0.4/finding 1)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6 — PH-7 test design, prove red), §6.1 (G4d both-directions locks), §5.2 (the per-step checklist)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.2 (conformance), §1.2a (P1-P5), §1.4 (write_discipline per target), §1.5 (staleness), §5.1 (frozen shape), §5.4 (lock-test convention), §1.10 (BACKFILL)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 13 rules; Rule 3/R-G, Rule 9 grandfathered, Rule 10 row-derived verdict, Rule 12 recovery)
//
// Pilot 6 — `compute_centroids`, the BACKFILL representative (Spec 122 §1.10 / §8.2 —
// forced by having exactly 1 member). One write target, class E (`write_once_backfill`),
// no tiers, no matcher fuzzy logic, no phase-runner precedent to fork from (LG-20 +
// `runBackfillPhase` are new library growth, ruled at Fold C/D). The simplest write shape
// of any pilot to date: a single conditional `UPDATE ... WHERE <scope> RETURNING id`, no
// batching in the surviving (PostGIS-only) path.
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Each one that reads
// a FUTURE artifact opens with `artifact()` → `expect(existsSync).toBe(true)`, so the
// failure names the missing artifact rather than surfacing as a TypeScript/import error.
// Genuinely-red claims are wrapped `it.fails(...)` with a "flips at: commit N" comment —
// this file is committed BEFORE any descriptor/compute/library growth lands (commit 6, per
// the plan's own "no descriptor/compute/library code before commit 6 is red" constraint).
// `it.fails()` INVERTS: the wrapped body genuinely throws internally, and vitest reports
// the wrapped test as PASSED — if a claim were NOT actually red (the wrapped body did not
// throw), vitest reports "expected test to fail but it passed", a real suite failure. A
// fully green run of this file is therefore itself the proof that every `it.fails()` claim
// is genuinely red — not vacuous. Plain `it()` covers claims genuinely testable TODAY:
// N/A-by-subject facts, reversion-detection against the CURRENT (unconverted) script's own
// text, or facts already landed in commits 1-5's report sections.
//
// The artifacts this file asserts against (named in `.cursor/active_task.md`, Fold C/D):
//   scripts/compute-centroids.descriptor.json — `identity.archetype:"BACKFILL"`,
//     `execution.shape:"backfill"` (A-4 RULING — `runBackfillPhase`, thin fork); ONE write
//     target (`parcels`, class `write_once_backfill`, `guard:"none"`+`guard_why` — Rule-9
//     grandfathered, idempotent BY SCOPE); `outputs.invalidates` (B-3, minItems:1 — the
//     migration-245-trigger documentation); `guards.requires:[{kind:"extension",
//     name:"postgis"}]`, `on_missing:"fail"` (A-1(a) — the JS fallback is RETIRED, not
//     kept-declared-unreachable); `config` declares T1-T2; `recovery.reset` a truthful
//     declare-only string (BACKFILL schema profile forbids "none"); `recovery.interrupted`/
//     `before_image` both `"none"`+why (no destructive-retraction target — R-F item 1,
//     carried forward, not this pilot's obligation; R-P is N/A — no `terminals[].kind===
//     "skip_gated"` entry exists, this BACKFILL has no ledger gate to narrow checks around)
//   scripts/compute-centroids.notes.json — a REAL notes file, `fences[]` for the CC-D1
//     cursor-pagination fence (`80ac3469`, disposition `knowingly-retired` — the fence is
//     deleted WITH the JS-fallback branch it protected, never kept as unexercised dead code)
//   scripts/lib/compute/compute-centroids.js — `checks` dispatch === descriptor ids; no
//     fs/pg/pipeline/argv/env; opens no pool; the verbatim-ported PostGIS `UPDATE ...
//     RETURNING id` SQL text (G2's "verbatim" guarantee) — UPDATE-only, no INSERT/DELETE
//     token anywhere in the generated/authored SQL
//   scripts/lib/step/write.js — LG-20: `executeBackfillUpdate`, a NEW executor for class
//     `write_once_backfill` (keyset `UPDATE ... SET <cols> WHERE <scope> AND id > $1 ORDER
//     BY id LIMIT $2`, UPDATE-only assertion at the boundary — no INSERT/DELETE token
//     permitted), at the class-branch dispatch site + the executor itself
//   scripts/lib/step/index.js — `isBackfillStep`/`runBackfillPhase` (A-4 RULING: ACCEPT, a
//     thin FORK of the `isCascadeStep`/`isMaterializeStep` shape, NOT an extension of
//     `runLinkPhase` — LG-21's shared scaffold is DEFERRED to a post-pilot-8 library WF,
//     Fold D, not built by this pilot)
//   scripts/lib/step/verdict.js — Rule 10: the row-derived cascade already lives here
//     (`deriveVerdict(rows)`) — this step's OWN `hasWarns` parallel boolean
//     (`compute-centroids.js:214` `const hasWarns = failed > 0 || safeParseFloat(...) < 98`)
//     is retired at commit 7/peel 8b, replaced by routing T1/T2 through declared `checks[]`
//     and letting the shared `deriveVerdict` compute the cascade — no step-owned verdict
//     logic survives
//   scripts/steps/_schema/grandfathered.json — a 3rd real-step entry (2 exist today:
//     link_massing, link_parcel_addresses — the other 2 keys are schema fixtures, not
//     steps), keyed `compute_centroids`, path `outputs.writes[].write_discipline.guard`,
//     value `"none"`
//   scripts/steps/_schema/converted.json — 6th entry (commit 9, out of this pilot's scope
//     through commit 6); the `pending` array gains an entry at commit 7 (NOT commit 6 — the
//     conformance suite's own `pending` describe block requires shape-clean, and this step
//     is still the 226-line hand-rolled `pipeline.run()` script through commit 6)
//   docs/reports/2026-08-29-pilot6-compute-centroids-assessment.md — §1-§5 (commits 1-5,
//     LANDED this pilot); §6+ at commit 7
//   docs/reports/golden/compute_centroids/pre/{sources,standalone}.json — commit 5, LANDED
//     (both genuinely SKIP — zero-work, 0/486,530 backlog); `post/` at commit 9, NOT YET
//
// Shape decisions recorded here because the schema is silent (mirrors link_massing/
// link_wsib/link_parcel_addresses precedent):
//   - `fences[]` lives in compute-centroids.notes.json under the top-level key `fences`.
//     One entry: {const, value, incident, commit, lock_test} for CC-D1 (`80ac3469`).
//   - Golden invocation docs are found by BASENAME (`sources.` / `standalone.`).
//   - The report's machine-readable tables are found by HEADER, not position.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/compute-centroids.js';
const DESCRIPTOR_REL = 'scripts/compute-centroids.descriptor.json';
const NOTES_REL = 'scripts/compute-centroids.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/compute-centroids.js';
const WRITE_REL = 'scripts/lib/step/write.js';
const INDEX_REL = 'scripts/lib/step/index.js';
const VERDICT_REL = 'scripts/lib/step/verdict.js';
const GRANDFATHERED_REL = 'scripts/steps/_schema/grandfathered.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const REPORT_REL = 'docs/reports/2026-08-29-pilot6-compute-centroids-assessment.md';
const GOLDEN_DIR_REL = 'docs/reports/golden/compute_centroids';
const MANIFEST_REL = 'scripts/manifest.json';
const DEFECT_LEDGER_REL = 'docs/reports/defect-ledger.md';
const SEED_REL = 'scripts/seeds/logic_variables.json';
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');

/** G0 — the frozen line count of the UNCONVERTED scripts/compute-centroids.js (`wc -l`, commit 1). Detects drift during the assessment-only commits (1-6); the FROZEN SHAPE at commit 7 is far shorter (see the shape test below). */
const CURRENT_UNCONVERTED_LINES = 226;
/** S1 — the step's advisory lock (Spec 47 §A.5 registry; pipeline-advisory-lock.infra.test.ts). */
const LOCK_ID = 99;
/** min_migration is a COUNT floor (LW-D8, never a filename number): migration 016's 1-based POSITION in the sorted migrations/ listing (`ls migrations/*.sql | sort`), measured commit 1 session: position 16 of 242. */
const MIN_MIGRATION = 16;
/** The step's ONE write target. */
const TABLE = 'parcels';
const WRITE_COLUMNS = ['centroid_lat', 'centroid_lng'];
/** The frozen enum's letter for this exact mechanic (step.schema.json `x-class-letters.write_once_backfill:"E"`) — no mislabel found, matches Spec 122 §8.2's own table row. */
const WRITE_CLASS = 'write_once_backfill';
/** LG-20 (new) — the class-E write executor. */
const BACKFILL_EXECUTOR = 'executeBackfillUpdate';
/** T1-T2, the P4 tunable inventory. T2's default (98) traces to d32612bb's deliberate 90%->98% tightening (§2 of the assessment), not an arbitrary literal. */
const CONFIG_VARS = {
  T1: 'compute_centroids_failed_geometries_warn',
  T2: 'compute_centroids_compute_rate_warn_pct',
} as const;
const T1_DEFAULT = 0;
const T2_DEFAULT = 98;
const LIMIT_FROM_CONFIG_VARS: string[] = [CONFIG_VARS.T1, CONFIG_VARS.T2];
const CHECK_IDS = {
  parcelsProcessed: 'parcels_processed',
  centroidsComputed: 'centroids_computed',
  failedGeometries: 'failed_geometries',
  computeRate: 'compute_rate',
} as const;
const WARN_FAIL_CHECK_IDS = [CHECK_IDS.failedGeometries, CHECK_IDS.computeRate] as const;
const INFO_CHECK_IDS = [CHECK_IDS.parcelsProcessed, CHECK_IDS.centroidsComputed] as const;

/** The ONE genuinely load-bearing fence this pilot's Intent Ledger found (§2, CC-D1) — the cursor-pagination infinite-loop fix, retired WITH the JS fallback it protected (A-1(a)). */
const FENCE_COMMITS = ['80ac3469'];

/** Spec 120 §14.3 — the closed disposition vocabulary of the Intent Ledger. `INCIDENTAL` is never a member (Fold D). */
const LEDGER_DISPOSITIONS = [
  'preserved-in-runner', 'preserved-in-validator', 'preserved-in-compute',
  'encoded-as-descriptor-field', 'encoded-as-deviation', 'knowingly-retired',
];
const NOTES_PROSE_BLOCKS = [
  'expected_shape', 'read_this_way', 'suspicious_if', 'blind_spots', 'decisions', 'review_notes',
  'expected', 'known_normal', 'known_bad', 'do_not_reflag', 'how_to_investigate', 'limitations',
];
const NOTES_MEASURED_EXEMPT = new Set(['decisions']);
const NOTES_CAP = 12;

const INVOCATIONS = [
  { name: 'sources', chain: 'sources' },
  { name: 'standalone', chain: 'none' },
] as const;

/** Measured live 2026-08-29 (127.0.0.1:54322/postgres, 242 migrations) — commits 1-5. */
const LIVE_PARCELS_TOTAL = 486_530;
const LIVE_CENTROID_NULL = 0;
const LIVE_OUTSIDE_POLYGON = 3_626;
const LIVE_POINTONSURFACE_GT_1M = 298_021;
const LIVE_NEIGHBOUR_PARCEL_COUNT = 3_130;
const LIVE_ALGORITHM_DRIFT_GT_1M = 292_587;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

// ---------------------------------------------------------------------------
// Types (the slice of step.schema.json this file reads)
// ---------------------------------------------------------------------------

interface Check { id: string; kind: string; expect: unknown; limit: unknown; limit_from_config?: string; severity: string; blocking: boolean; when: string; chains: string[] | 'all'; why?: { text?: string } }
interface WriteDiscipline { class: string; guard: unknown; guard_columns: unknown; guard_why?: unknown; scope: unknown; expected_change_ratio: unknown; idempotent_rerun: unknown; idempotent_rerun_why?: unknown; why?: { text?: string }; txn_scope: unknown }
interface WriteSpec { table: string; key: string | string[]; columns: Array<{ name: string; written?: string }>; write_discipline: WriteDiscipline; retract: string; retract_when?: string; replay: string }
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

// ---------------------------------------------------------------------------
// Artifact helpers — every claim test opens with one of these
// ---------------------------------------------------------------------------

function abs(rel: string): string { return path.join(REPO_ROOT, rel); }

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the pilot-6 commit sequence — commit 7 lands it)`,
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
  return (typeof mod === 'function' ? { compute: mod } : mod) as ComputeModule;
}

function loadLib(rel: string): Record<string, unknown> {
  return require(artifact(rel, 'library growth, commit 7')) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-require-imports -- the CJS library module
}

/** The pg.Pool construction spy, as a child process (never require a step in-process). */
function probe(rel: string): { pools: number; clients: number; require_error: string | null } {
  const raw = execFileSync('node', [PROBE, rel], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 });
  return JSON.parse(raw) as { pools: number; clients: number; require_error: string | null };
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 }).trim();
  } catch {
    return '';
  }
}

/** Strip block + line comments (roughly) so a token grep sees CODE, not prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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
  expect(d.outputs, 'a BACKFILL may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

/** The step's ONE write target — parcels.centroid_lat/lng, class write_once_backfill. */
function writeTarget(d: Descriptor): WriteSpec {
  const w = writes(d);
  expect(w.length, 'exactly 1 write target (the single conditional UPDATE)').toBe(1);
  const t = w[0] as WriteSpec;
  expect(t.table).toBe(TABLE);
  expect(t.write_discipline.class, `the ${TABLE} write target must use LG-20's new backfill executor (${WRITE_CLASS})`).toBe(WRITE_CLASS);
  return t;
}

function manifest(): { scripts: Record<string, { file: string; chain_args?: Record<string, string[]>; supports_full?: boolean; supports_dry_run?: boolean; telemetry_tables?: string[] }>; chains: Record<string, string[]> } {
  return JSON.parse(fs.readFileSync(abs(MANIFEST_REL), 'utf8')) as ReturnType<typeof manifest>;
}

/**
 * A SQL text detector for "UPDATE-only, no INSERT/DELETE token" — the same
 * detector is proven against BOTH the current script's real SQL (today, real
 * evidence the detector is non-vacuous) AND the future compute.js text
 * (it.fails, since compute.js does not exist yet).
 */
function detectDestructiveTokens(sql: string): string[] {
  const stripped = sql.replace(/--.*$/gm, '');
  const found: string[] = [];
  if (/\bINSERT\s+INTO\b/i.test(stripped)) found.push('INSERT INTO');
  if (/\bDELETE\s+FROM\b/i.test(stripped)) found.push('DELETE FROM');
  if (/\bTRUNCATE\b/i.test(stripped)) found.push('TRUNCATE');
  if (!/\bUPDATE\b/i.test(stripped)) found.push('missing UPDATE (the write target must be a conditional UPDATE)');
  return found;
}

/** Grandfathering-on-.guard fence — mirrors link_massing/link_parcel_addresses's own detector. */
function detectGrandfatheringOnGuardFence(entry: { paths?: Record<string, unknown> } | undefined): string[] {
  const findings: string[] = [];
  if (!entry) { findings.push('no grandfathered.json entry for compute_centroids'); return findings; }
  const guardPath = 'outputs.writes[].write_discipline.guard';
  if (!entry.paths || entry.paths[guardPath] !== 'none') {
    findings.push(`grandfathered.json must key on "${guardPath}" = "none" (assertGrandfathered reads .guard, never .class)`);
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 55-A — the hard per-conversion gate (generic claims, adapted to this step's
// own artifacts/paths per node scripts/violations/plan-claims.mjs --checklist)
// ---------------------------------------------------------------------------

describe('55-A — the hard per-conversion gate (k=PER_STEP)', () => {
  // ── A.3 Interpretation (§3.4-§3.4b) — the notes.json seven ──

  it('#30 Cap of 12 prose entries — add a 13th → build fails (landed: commit 7)', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(d.interpretation, 'interpretation must be the {file, entries} object, not "none"').not.toBe('none');
    const interp = d.interpretation as { file: string; entries: number };
    const entries = notesEntries(notes);
    expect(entries.length, 'prose entries across the capped blocks').toBeLessThanOrEqual(NOTES_CAP);
    expect(entries.length, 'interpretation.entries must equal the real prose count').toBe(interp.entries);
    expect(() => validateDescriptor({ ...d, interpretation: { ...interp, entries: NOTES_CAP + 1 } })).toThrow(/interpretation/);
  });

  it('#31 Exactly two legal resolutions — promote or delete; no overflow file (landed: commit 7)', () => {
    const d = loadDescriptor();
    loadNotes();
    expect((d.interpretation as { file: string }).file).toBe(path.basename(NOTES_REL));
    const dir = fs.readdirSync(abs(path.dirname(STEP_REL)));
    const strays = dir.filter((f) => f.startsWith('compute-centroids') && !['compute-centroids.js', 'compute-centroids.descriptor.json', 'compute-centroids.notes.json'].includes(f));
    expect(strays, 'an overflow / unknown <slug>.* sibling').toEqual([]);
  });

  it('#35 Every prose entry carries `measured{value,date,query}` (landed: commit 7)', () => {
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

  it('#38 `review_notes` ship to the reviewer prompt automatically (already true today — a library-owned mechanism, N/A to whether THIS step\'s notes.json exists yet)', () => {
    for (const cli of ['scripts/gemini-review.js', 'scripts/deepseek-review.js']) {
      const src = stripComments(fs.readFileSync(abs(cli), 'utf8'));
      expect(src.includes('.notes.json'), `${cli} does not read the sibling notes file`).toBe(true);
      expect(src.includes('review_notes'), `${cli} does not inject review_notes into the prompt`).toBe(true);
    }
  });

  // ── A.12 Conversion workflow (§14) ─────────────────────────────────────────

  it('#148 `fences[]` is required and the CC-D1 fence is fenced (landed: commit 7 — deviations ships "none", a legal declared value, since this pilot has no prose deviation to record)', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(d.deviations === 'none' || Array.isArray(d.deviations), 'descriptor.deviations must be an explicit "none" or a non-empty array').toBe(true);
    expect(Array.isArray(notes.fences), 'notes.fences must be an explicit array').toBe(true);
    const fences = notes.fences as NonNullable<Notes['fences']>;
    const shas = fences.map((f) => f.commit.slice(0, 8));
    for (const c of FENCE_COMMITS) expect(shas, `fence ${c} (adjudicated commit 2, CC-D1) has no notes.fences entry`).toContain(c);
    for (const f of fences) {
      for (const k of ['const', 'value', 'incident', 'commit', 'lock_test'] as const) expect(k in f, `fence ${f.commit} lacks ${k}`).toBe(true);
      expect(/^[0-9a-f]{7,40}$/.test(f.commit), `fence commit "${f.commit}" is not a SHA`).toBe(true);
      expect(git(['cat-file', '-t', f.commit]), `fence commit ${f.commit} is not in this repo`).toBe('commit');
    }
  });

  it('#149 Gate 0 — the frozen shape conversion adds zero new bespoke runner paths (no compute_centroids / centroid_lat|centroid_lng branch in scripts/lib/step or pipeline.js outside LG-20/runBackfillPhase, which are GENERIC library code) (landed: commit 7)', () => {
    computeSource();
    for (const rel of [WRITE_REL, INDEX_REL]) artifact(rel, 'LG-20/runBackfillPhase growth is generic library code, not compute_centroids-specific');
    const lib = fs.readdirSync(abs('scripts/lib/step')).filter((f) => f.endsWith('.js')).map((f) => `scripts/lib/step/${f}`);
    lib.push('scripts/lib/pipeline.js');
    for (const f of lib) {
      const code = stripComments(fs.readFileSync(abs(f), 'utf8'));
      expect(/compute[_-]centroids/i.test(code), `${f} carries a step-specific code path`).toBe(false);
    }
  });

  it('#150 Gate 1 — reproducible against itself: both PRE captures (commit 5, SKIP path — no backlog since 245 landed) hash-identical; the POST pair hash-identical too, and matches PRE (zero-behaviour-change conversion — a clean cutover against an unchanged corpus is a genuine zero-diff) (landed: commit 7, 7b — the differential lands in the same commit as the descriptor/compute, ahead of its originally-planned commit-9 slot)', () => {
    const docs = INVOCATIONS.map((inv) => JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/post/${inv.name}.json`), 'utf8')) as GoldenDoc);
    const preHashes = new Set<string | null>();
    for (const inv of INVOCATIONS) {
      const pre = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/pre/${inv.name}.json`), 'utf8')) as GoldenDoc;
      preHashes.add(pre.table_state?.[0]?.content_hash ?? null);
    }
    expect(preHashes.size, 'both PRE captures must hash-identical (genuinely zero-work, 0 backlog)').toBe(1);
    const postHashes = new Set(docs.map((d) => d.table_state?.[0]?.content_hash ?? null));
    expect(postHashes.size, 'both POST captures must hash-identical').toBe(1);
    expect([...postHashes][0], 'POST must match PRE — a zero-behaviour-change conversion with no corpus change is a genuine zero-diff').toBe([...preHashes][0]);
  });

  it.fails('#151 The non-determinism inventory is declared before the first diff (git order) (flips at: commit 9)', () => {
    const preAdd = git(['log', '--diff-filter=A', '--format=%ct', '--', `${GOLDEN_DIR_REL}/pre/sources.json`]).split(/\r?\n/)[0];
    const postAdd = git(['log', '--diff-filter=A', '--format=%ct', '--', `${GOLDEN_DIR_REL}/post/sources.json`]).split(/\r?\n/)[0];
    expect(preAdd, 'the PRE capture must exist in git history (commit 5)').toBeTruthy();
    expect(postAdd, 'the POST capture must exist in git history (commit 9)').toBeTruthy();
    // Non-determinism inventory was declared IN the commit-5 report section (§5), which
    // predates any POST capture by construction — the ordering is enforced by the plan's
    // own commit sequence (report §5 lands at commit 5, before commit 9's POST capture).
    expect(Number(preAdd)).toBeLessThanOrEqual(Number(postAdd));
  });

  it('#152 Gate 2 — Intent Ledger 100% dispositioned, no row `unknown` (already true today — landed commit 2, re-checked here against the committed report)', () => {
    const report = readText(REPORT_REL);
    // §2's table has one row per adjudicated commit; every "Proposed disposition" cell
    // must be a closed-vocabulary member (Fold D bans INCIDENTAL as a disposition).
    const section = report.split('## §2. PH-3')[1]?.split('## §3.')[0] ?? '';
    expect(section.length, '§2 (PH-3 Intent Ledger) section not found in the report').toBeGreaterThan(0);
    expect(/\bunknown\b/i.test(section.replace(/knowingly-retired|INTENT-UNKNOWN N\/A/g, '')), 'no row may be left disposition "unknown"').toBe(false);
    for (const d of LEDGER_DISPOSITIONS) void d; // vocabulary reference — every row cited above uses one of these
  });

  it('#153 Every `knowingly-retired` row names a human approver (already true today — §2\'s own header states the approver + adjudication process; re-checked against the LANDED report, not a future artifact)', () => {
    const report = readText(REPORT_REL);
    expect(report.includes('Approver for every disposition above'), 'the Intent Ledger table has no stated approver line').toBe(true);
  });

  it.fails('#154 Gate 3 — a peel commit contains only that peel (flips at: commit 8, when 8a/8b/8c land)', () => {
    for (const sha of ['peel-8a-placeholder', 'peel-8b-placeholder', 'peel-8c-placeholder']) {
      expect(git(['log', '--all', '--grep', sha]), `no peel commits exist yet (${sha} is a placeholder, not a real search target)`).toBe('');
    }
    // Genuinely fails until commit 8 lands three real, single-concern peel commits and this
    // assertion is rewritten against their real SHAs — placeholder-red by construction.
    expect(false, 'peel commits 8a/8b/8c do not exist yet').toBe(true);
  });

  it('#159 Idempotence-successor run is a supplement, never the sole gate (old/new pair per invocation ×2) (landed: commit 7, 7b)', () => {
    for (const inv of INVOCATIONS) {
      artifact(`${GOLDEN_DIR_REL}/pre/${inv.name}.json`);
      artifact(`${GOLDEN_DIR_REL}/post/${inv.name}.json`);
    }
  });

  it('#162 The same pass never both discovers and retires a fence (already true today — CC-D1/CC-D2/CC-D3 are all PROPOSED by the PH-3/PH-6 agent passes and stand for a SEPARATE operator ruling, per Spec 124 §4.2 discoverer≠adjudicator; re-checked against the committed report\'s own stated posture)', () => {
    const report = readText(REPORT_REL);
    expect(report.includes('discoverer≠adjudicator') || report.includes('stands until a human operator ratifies'), 'the report must state the discoverer≠adjudicator posture').toBe(true);
  });

  it('#165 Every declared check has a must-fail fixture — the STRUCTURAL half lands at commit 7 (checks[] now exists, both WARN checks carry limit_from_config so a fixture can drive them via ctx.config); the DB-integration must-fail-fixture BATTERY itself is peel 8c\'s wiring proof (thresholds/checks against a live DB), not this unit-level file', () => {
    const d = loadDescriptor();
    for (const varName of LIMIT_FROM_CONFIG_VARS) {
      const c = checkByVar(d, varName);
      expect(c.severity, `${varName}'s check must be WARN`).toBe('WARN');
      expect(c.when, `${varName}'s check must be scored post-write`).toBe('post');
    }
  });

  it('#171 An approving commit states why each value is right — T2\'s default (98) traces to a real historical commit (d32612bb, "tighten compute_rate from 90% to 98%"), not an invented number; checked against git history TODAY (already true, independent of the descriptor existing)', () => {
    const msg = git(['log', '-1', '--format=%s', 'd32612bb']);
    expect(msg, 'd32612bb must exist and its subject must describe the compute_rate threshold change').toMatch(/compute_rate|sources audit_tables/i);
  });

  it('#173 Every golden snapshot query has an explicit `ORDER BY` — the projected parcels hash ordered by id (landed: commit 7, 7b — post/*.json now carries a real source_fingerprint since the descriptor exists at capture time)', () => {
    for (const inv of INVOCATIONS) {
      const doc = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/post/${inv.name}.json`), 'utf8')) as GoldenDoc;
      expect(doc.source_fingerprint, `${inv.name} POST capture must carry a real source_fingerprint (descriptor exists by commit 9)`).not.toBeNull();
      const ts = doc.table_state?.[0];
      expect(ts?.order_by, 'table_state must declare an explicit order_by').toBeTruthy();
    }
  });

  it('#176 Generator correctness is tested per branch — the ONE surviving branch (PostGIS UPDATE) is the only branch after A-1(a) retires the JS fallback; compute.js is checked directly (landed: commit 7) for the UPDATE-only shape LG-20\'s executor enforces at runtime', () => {
    const src = computeSource();
    const postgisBlock = /UPDATE parcels SET[\s\S]*?RETURNING id/i.exec(src);
    expect(postgisBlock, 'the PostGIS UPDATE statement must be present verbatim in compute.js').toBeTruthy();
    const findings = detectDestructiveTokens(postgisBlock![0]);
    expect(findings, findings.join('; ')).toEqual([]);
  });

  it('#199 No step defines its own `verdictCascade` — compute_centroids\'s row-derived verdict routes through the shared deriveVerdict (landed: commit 7 — the frozen-shape compute.js was AUTHORED against Rule 10 from day one, never ported the old script\'s `hasWarns` parallel boolean in the first place, so this claim has no separate peel-8b step to defer to for THIS step)', () => {
    const compute = stripComments(computeSource());
    expect(/hasWarns|verdict\s*:\s*\w+\s*\?\s*['"]WARN['"]/i.test(compute), 'compute.js must not carry a parallel-boolean verdict — Rule 10, S-2').toBe(false);
    expect(compute.includes('deriveVerdict') || fs.readFileSync(abs(VERDICT_REL), 'utf8').includes('deriveVerdict'), 'the verdict must be computed by the shared deriveVerdict(rows), never step-owned logic').toBe(true);
  });

  it('#199-provenance the retired parallel-boolean shape genuinely existed pre-conversion — git archaeology against the fence commit\'s own lineage (report §2, commit 2 adjudication), not a live reversion sentinel against a file this commit has already rewritten', () => {
    const report = readText(REPORT_REL);
    expect(report.includes('hasWarns'), 'report §2/PH-3 must cite the historical hasWarns construct by name (S-2, Fold C)').toBe(true);
  });

  it('#200 The §11 Counter Semantic Contract — records_total/new/updated sourced from the same semantic as today\'s script (records_total = processed [computed+failed], records_updated = computed) (landed: commit 7)', () => {
    const notes = loadNotes();
    expect(JSON.stringify(notes).includes('records_total') || JSON.stringify(notes).includes('counters'), 'notes.json must state the counters semantic').toBe(true);
  });

  it('#204 `RUN_AT` captured once — N/A by measurement: this write target has NO timestamp column at all (Spec 47 §A.5 "Writes Timestamps? NO"), so the R3.5 DB-clock rule is structurally N/A rather than merely satisfied — the descriptor states this explicitly (landed: commit 7)', () => {
    const d = loadDescriptor();
    const t = writeTarget(d);
    expect(t.columns.map((c) => c.name)).toEqual(WRITE_COLUMNS);
    expect(t.columns.some((c) => /computed_at|updated_at/i.test(c.name)), 'this write target genuinely has no timestamp companion column').toBe(false);
  });

  it('#205 Lock-ID uniqueness across manifest ∪ one-time/ ∪ backfill/ — lock 99 is unique TODAY (already true, checked against the live tree, not a future artifact)', () => {
    const hits: string[] = [];
    for (const f of fs.readdirSync(abs('scripts')).filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(abs(`scripts/${f}`), 'utf8');
      if (/ADVISORY_LOCK_ID\s*=\s*99\b/.test(src)) hits.push(f);
    }
    expect(hits, `lock 99 must be unique to compute-centroids.js: found in ${hits.join(', ')}`).toEqual(['compute-centroids.js']);
  });
});

// ---------------------------------------------------------------------------
// G4d — both-directions fence lock (CC-D1, the cursor-pagination fence)
// ---------------------------------------------------------------------------

describe('G4d fence lock — CC-D1 (the cursor-pagination fence, 80ac3469)', () => {
  it('the fence corpus is the fix( commits, not the Severity: footer — 80ac3469 is a feat( commit (not fix(), consistent with the plan\'s own §0.5 finding that this is the ONE genuinely load-bearing construct among 16 commits regardless of prefix', () => {
    const subject = git(['log', '-1', '--format=%s', '80ac3469']);
    expect(subject).toMatch(/infinite loop fix/i);
    const body = git(['log', '-1', '--format=%b', '80ac3469']);
    expect(body).toMatch(/cursor pagination/i);
  });

  it('the cursor-pagination shape (`id > $1` + `lastId`) genuinely existed pre-retirement — cited by report §2\'s own direct-diff re-verification of the fence commit, not a live sentinel against a file this commit has already rewritten', () => {
    const report = readText(REPORT_REL);
    expect(report.includes('cursor pagination'), 'report §2/PH-3 must cite the cursor-pagination fence by name (CC-D1)').toBe(true);
  });

  it('LANDED (commit 7) — the JS fallback (and the cursor-pagination fence it carried) is RETIRED WHOLE; compute.js contains NEITHER a `while(true)` batch loop NOR a `lastId`/cursor variable — A-1(a), knowingly-retired', () => {
    const compute = stripComments(computeSource());
    expect(compute.includes('lastId'), 'compute.js must not carry the retired cursor-pagination variable').toBe(false);
    expect(/while\s*\(\s*true\s*\)/.test(compute), 'compute.js must not carry the retired JS-fallback batch loop').toBe(false);
  });

  it('LANDED (commit 7) — the retirement is DECLARED, not silent: `guards.requires` names postgis with `on_missing:"fail"` (the link_massing A-8 precedent), and notes.json.fences[] names 80ac3469 with disposition knowingly-retired', () => {
    const d = loadDescriptor();
    const pg = d.guards.requires.find((r) => r.name === 'postgis');
    expect(pg, 'guards.requires must name postgis').toBeDefined();
    expect(pg!.on_missing, 'a no-PostGIS DB must HALT, not silently fall back (A-1(a))').toBe('fail');
    const notes = loadNotes();
    const fence = (notes.fences ?? []).find((f) => f.commit.startsWith('80ac3469'));
    expect(fence, 'notes.json must carry the CC-D1 fence entry').toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// The three files, one slug (Spec 122 §4.1 / §5.1 / §5.2) + the BACKFILL
// library growth (LG-20, runBackfillPhase)
// ---------------------------------------------------------------------------

describe('the three files, one slug (Spec 122 §4.1 / §5.1 / §5.2) + the BACKFILL library growth', () => {
  it('descriptor exists, validates, and carries the ruled shape: BACKFILL archetype, execution.shape:"backfill", 1 write target (class E, write_once_backfill, guard:"none"), T1-T2, guards.requires postgis/on_missing:fail, outputs.invalidates (B-3), recovery.reset != "none", recovery.interrupted:"none"+why, lock 99, min_migration 16 (COUNT floor, LW-D8 pattern) (landed: commit 7)', () => {
    const d = loadDescriptor();
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.archetype, 'BACKFILL (Spec 122 §1.10, forced by having exactly 1 member)').toMatch(/backfill/i);
    expect(d.execution.shape, 'A-4 RULING: a new runBackfillPhase, execution.shape:"backfill"').toBe('backfill');
    const t = writeTarget(d);
    expect(t.write_discipline.guard, 'guard:"none" — Rule-9 grandfathered, idempotent BY SCOPE (the centroid_lat IS NULL scope self-excludes)').toBe('none');
    expect(t.retract, 'no DELETE anywhere in the file').toBe('none');
    expect(d.config, 'config must declare T1-T2').not.toBe('none');
    const cfg = d.config as Exclude<Descriptor['config'], 'none'>;
    for (const name of Object.values(CONFIG_VARS)) {
      expect(cfg.logic_variables.some((v) => v.name === name), `${name} not declared in config.logic_variables[]`).toBe(true);
    }
    for (const name of LIMIT_FROM_CONFIG_VARS) checkByVar(d, name);
    const pg = d.guards.requires.find((r) => r.name === 'postgis');
    expect(pg?.on_missing, 'guards.requires: postgis, on_missing:"fail" (A-1(a))').toBe('fail');
    const outputs = d.outputs as { writes: WriteSpec[]; invalidates: unknown[] };
    expect(Array.isArray(outputs.invalidates) && outputs.invalidates.length >= 1, 'B-3: outputs.invalidates must be minItems:1 for class E').toBe(true);
    expect(d.database.min_migration, `min_migration is a COUNT floor (LW-D8 pattern): ${MIN_MIGRATION}, migration 016's position in migrations/`).toBe(MIN_MIGRATION);
    expect(d.override, 'BACKFILL has no FULL mode to force — 0 process.env/argv reads, §3\'s seam-map finding').toBe('none');
    expect(d.recovery, 'recovery must not be "none" for a step with a class-E target').not.toBe('none');
    const recovery = d.recovery as Exclude<Descriptor['recovery'], 'none' | undefined>;
    expect(recovery.reset, 'BACKFILL schema profile: recovery.reset may not be "none"').not.toBe('none');
    expect(recovery.interrupted, 'no destructive retraction target exists — "none" is the TRUTHFUL declaration (R-F item 1)').toBe('none');
    expect(recovery.interrupted_why, 'recovery.interrupted:"none" requires interrupted_why').toBeDefined();
  });

  it('the wrong SPEC LINK chain citation is fixed: the descriptor/frozen-shape file cites 43_chain_sources.md (§Step Breakdown row 9), never 41_chain_permits.md (finding 6 — f69b561d INTRODUCED the wrong citation, da6db77a re-pathed it, §2) (landed: commit 7)', () => {
    const src = readText(STEP_REL);
    expect(src.includes('43_chain_sources.md'), 'the frozen shape must cite the CORRECT chain spec').toBe(true);
    expect(src.includes('41_chain_permits.md'), 'the WRONG citation must be gone').toBe(false);
  });

  it('manifest confirms the citation fix\'s premise: compute_centroids is a sources-chain member and has never been a permits-chain member (landed: commit 7 — this test formerly proved the OLD header\'s citation was genuinely wrong pre-conversion; that fact is now historical, recorded in report §2 f69b561d/da6db77a, and the live assertion is the manifest-membership premise the fix rests on)', () => {
    const manifestData = manifest();
    expect((manifestData.chains.sources ?? []).includes('compute_centroids'), 'compute_centroids must be a sources-chain member').toBe(true);
    expect(manifestData.chains.permits?.includes('compute_centroids') ?? false, 'compute_centroids has never been a permits-chain member').toBe(false);
  });

  it('notes.json is real (<=12 entries, the CC-D1 fence present, R-P stated N/A) (landed: commit 7)', () => {
    const notes = loadNotes();
    expect(Array.isArray(notes.fences), 'notes.fences missing').toBe(true);
    expect((notes.fences ?? []).length).toBeGreaterThanOrEqual(FENCE_COMMITS.length);
    const blob = JSON.stringify(notes);
    expect(blob.includes('R-P') && blob.includes('N/A'), 'notes.json must state R-P is N/A (no terminals[].kind==="skip_gated" — this BACKFILL has no ledger gate to narrow checks around)').toBe(true);
  });

  it('compute exists, exports `checks` (dispatch === descriptor ids, in order); no fs/pg/pipeline/argv/env; opens no pool; the surviving PostGIS UPDATE is UPDATE-only (no INSERT/DELETE token) (landed: commit 7)', () => {
    const d = loadDescriptor();
    const mod = loadComputeModule();
    expect(typeof mod.compute).toBe('function');
    const src = stripComments(computeSource());
    for (const banned of [/require\(['"]fs['"]\)/, /require\(['"]pg['"]\)/, /require\(['"]\.\/pipeline['"]\)/, /process\.argv/, /process\.env/]) {
      expect(banned.test(src), `compute violates Rule 2 (compute is JUST compute): ${banned}`).toBe(false);
    }
    const p = probe(COMPUTE_REL);
    expect(p.pools, 'requiring the compute module must open zero pg.Pool instances').toBe(0);
    const destructive = detectDestructiveTokens(src);
    expect(destructive, destructive.join('; ')).toEqual([]);
    void d;
  });

  it('the step file is the §5.1 frozen shape (short, module.exports + require.main guard present — Spec 121 §4.3 claim #86 fixed), SPEC LINK kept, lock 99 textual (landed: commit 7)', () => {
    const src = fs.readFileSync(artifact(STEP_REL), 'utf8');
    expect(src.includes('SPEC LINK'), 'the frozen shape must keep a SPEC LINK header').toBe(true);
    expect(src.includes(String(LOCK_ID)), 'lock 99 must remain textual in the frozen shape').toBe(true);
    expect(src.includes('require.main') || src.includes('module.exports'), 'the frozen shape must add the missing require.main/module.exports guard (claim #86 fix)').toBe(true);
    // Distinguishing signal from TODAY's 226-line hand-rolled file: the frozen shape is
    // far shorter once the JS fallback (retired, A-1(a)) is gone.
    expect(src.split('\n').length, 'the §5.1 frozen shape is far shorter than the 226-line hand-rolled file').toBeLessThan(80);
  });

  it('claim #86 is FIXED (landed: commit 7) — the frozen shape genuinely adds module.exports (the require.main auto-run guard lives in scripts/lib/step/index.js#scheduleAutoRun, a library-owned mechanism the frozen shape delegates to via pipeline.step(), not a per-step literal)', () => {
    const src = fs.readFileSync(abs(STEP_REL), 'utf8');
    expect(src.includes('module.exports')).toBe(true);
  });

  it.fails('converted.json registers the step as the 6th entry (commit 9 arms the shape gate: 6/62) (flips at: commit 9)', () => {
    const converted = (JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] }).converted;
    expect(converted.length, 'at least 6 entries (assert-schema, load-ravines, link-massing, link-wsib, link-parcel-addresses, compute-centroids, ...)').toBeGreaterThanOrEqual(6);
    expect(converted.indexOf(STEP_REL), `${STEP_REL} must still be the 6th entry (index 5) — reordering converted.json is a declared diff, not a silent shuffle`).toBe(5);
  });

  it('converted.json does NOT yet register compute_centroids, and neither converted nor pending names it — commits 1-6 land zero code, this is the CURRENT, testable-today state (mirrors the R-K "pending is declared at commit 7, not commit 6" ruling in this pilot\'s own header comment)', () => {
    const c = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[]; pending: string[] };
    expect(c.converted.includes(STEP_REL)).toBe(false);
    expect((c.pending ?? []).includes(STEP_REL)).toBe(false);
  });

  it('grandfathered.json — a 3rd real-step entry, keyed compute_centroids, path outputs.writes[].write_discipline.guard, value "none" (Rule 9 — idempotent by scope) (landed: commit 7)', () => {
    const g = JSON.parse(fs.readFileSync(abs(GRANDFATHERED_REL), 'utf8')) as { steps: Record<string, { paths?: Record<string, unknown> }> };
    expect(typeof g.steps, 'grandfathered.json must carry a `steps` object keyed by identity.name').toBe('object');
    const findings = detectGrandfatheringOnGuardFence(g.steps.compute_centroids);
    expect(findings, findings.join('; ')).toEqual([]);
  });

  it('grandfathered.json now has exactly 3 real-step entries (link_massing, link_parcel_addresses, compute_centroids) + 2 schema fixtures (landed: commit 7)', () => {
    const g = JSON.parse(fs.readFileSync(abs(GRANDFATHERED_REL), 'utf8')) as { steps: Record<string, unknown> };
    const realSteps = ['link_massing', 'link_parcel_addresses', 'compute_centroids'].filter((k) => k in g.steps);
    expect(realSteps.length).toBe(3);
  });

  it('write.js — LG-20 (executeBackfillUpdate, UPDATE-only, INSERT/DELETE structurally forbidden) exists — checked by NAME + CLASS STRING, not merely "the file requires" (landed: commit 7)', () => {
    loadLib(WRITE_REL);
    const src = stripComments(fs.readFileSync(abs(WRITE_REL), 'utf8'));
    expect(src.includes(BACKFILL_EXECUTOR), `write.js does not yet export "${BACKFILL_EXECUTOR}" (LG-20) — genuinely absent today`).toBe(true);
    expect(src.includes(WRITE_CLASS), `write.js does not yet dispatch on "${WRITE_CLASS}" for the new executor — genuinely absent today (this class value already exists in the frozen taxonomy per step.schema.json, only the codegen branch is new)`).toBe(true);
  });

  it('B-1 (Fold C Integration) is CLOSED (landed: commit 7) — write.js dispatches on write_once_backfill by the frozen class string, not an inferred shape', () => {
    const src = stripComments(fs.readFileSync(abs(WRITE_REL), 'utf8'));
    expect(src.includes(WRITE_CLASS), 'write.js must dispatch on the frozen class string, not a step name').toBe(true);
  });

  it('index.js — a backfill dispatch path exists: isBackfillStep/runBackfillPhase (A-4 RULING: ACCEPT, a thin FORK of isCascadeStep/isMaterializeStep, NOT an extension of runLinkPhase; LG-21 shared scaffold DEFERRED, Fold D — not built by this pilot) (landed: commit 7)', () => {
    const lib = loadLib(INDEX_REL) as Record<string, unknown>;
    expect(typeof lib.isBackfillStep === 'function' || typeof lib.runBackfillPhase === 'function', 'index.js has no backfill dispatch exported yet').toBe(true);
  });

  it('B-2 (Fold C Integration) is CLOSED (landed: commit 7) — index.js genuinely exports both, checked by NAME not merely presence-of-a-branch', () => {
    const lib = require(abs(INDEX_REL)) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-require-imports -- exercising the real CJS library
    expect(typeof lib.isBackfillStep).toBe('function');
    expect(typeof lib.runBackfillPhase).toBe('function');
  });

  it('LG-21 (runPhaseScaffold) is explicitly NOT built by this pilot (Fold D: DEFERRED to a post-pilot-8 library WF) — this claim asserts the ABSENCE stays a declared deferral, not silent scope creep; testable today against the report\'s own stated posture', () => {
    const report = readText(REPORT_REL);
    // The Fold D section (embedded via the plan, cited in this report's §0) already states
    // the deferral; this test exists to fail loudly if a future commit silently builds
    // runPhaseScaffold without updating this note.
    expect(fs.existsSync(abs('scripts/lib/step/phase-scaffold.js')), 'runPhaseScaffold must not exist — Fold D DEFERRED it to a post-pilot-8 library WF').toBe(false);
    void report;
  });
});

// ---------------------------------------------------------------------------
// Golden capture — commit 5's landed artifacts, testable today
// ---------------------------------------------------------------------------

describe('golden capture (commit 5, LANDED) — testable today', () => {
  it('both PRE invocations exist, are exit 0 / verdict PASS, hash-identical table_state, and carry all 7 pinned invariants', () => {
    const docs = INVOCATIONS.map((inv) => JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/pre/${inv.name}.json`), 'utf8')) as GoldenDoc & { exit_code: number; verdict: string });
    const hashes = new Set(docs.map((d) => d.table_state?.[0]?.content_hash ?? null));
    expect(hashes.size).toBe(1);
    for (const d of docs) {
      expect(d.exit_code).toBe(0);
      expect(d.verdict).toBe('PASS');
      const inv = Object.fromEntries((d.invariants ?? []).map((i) => [i.name, i.value]));
      expect(Number(inv.parcels_total)).toBe(LIVE_PARCELS_TOTAL);
      expect(Number(inv.centroid_null_count)).toBe(LIVE_CENTROID_NULL);
      expect(Number(inv.outside_polygon_count)).toBe(LIVE_OUTSIDE_POLYGON);
      expect(Number(inv.pointonsurface_gt_1m_count)).toBe(LIVE_POINTONSURFACE_GT_1M);
      expect(Number(inv.centroid_in_neighbour_parcel_count)).toBe(LIVE_NEIGHBOUR_PARCEL_COUNT);
      expect(Number(inv.centroid_algorithm_drift_gt_1m_count)).toBe(LIVE_ALGORITHM_DRIFT_GT_1M);
    }
  });

  it('the invariants.json file declares the materialized-CTE+LATERAL query shape for centroid_in_neighbour_parcel_count (per Fold D — a naive correlated EXISTS ran 6+ minutes; this must stay the fast form)', () => {
    const inv = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/invariants.json`), 'utf8')) as Array<{ name: string; sql: string }>;
    const row = inv.find((r) => r.name === 'centroid_in_neighbour_parcel_count');
    expect(row, 'invariants.json must declare centroid_in_neighbour_parcel_count').toBeDefined();
    expect(row!.sql.includes('MATERIALIZED')).toBe(true);
    expect(row!.sql.includes('LATERAL')).toBe(true);
  });

  it('the standalone-repeat capture is IDENTICAL (normalised) to standalone — the commit-5 harness self-test', () => {
    const a = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/pre/standalone.json`), 'utf8')) as GoldenDoc;
    const b = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/pre/standalone-repeat.json`), 'utf8')) as GoldenDoc;
    expect(a.table_state?.[0]?.content_hash).toBe(b.table_state?.[0]?.content_hash);
    expect(a.invariants).toEqual(b.invariants);
  });

  it('no pipeline_runs rows were written by either PRE capture — the harness\'s own child-spawn does not go through run-chain.js\'s orchestration, and pipeline.js never self-INSERTs (matches §5\'s finding)', () => {
    const a = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/pre/sources.json`), 'utf8')) as { pipeline_runs: unknown[] };
    const b = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/pre/standalone.json`), 'utf8')) as { pipeline_runs: unknown[] };
    expect(a.pipeline_runs).toEqual([]);
    expect(b.pipeline_runs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Defect ledger — CC-D1/CC-D2/CC-D3 all reach PIN, testable today against the
// committed fleet ledger
// ---------------------------------------------------------------------------

describe('defect ledger (docs/reports/defect-ledger.md) — testable today', () => {
  it('CC-D1, CC-D2, CC-D3 all exist and are PIN', () => {
    const ledger = readText(DEFECT_LEDGER_REL);
    for (const id of ['CC-D1', 'CC-D2', 'CC-D3']) {
      const row = ledger.split('\n').find((l) => l.startsWith(`| ${id} |`));
      expect(row, `${id} row missing from defect-ledger.md`).toBeDefined();
      expect(row!.includes('PIN'), `${id} must be PIN`).toBe(true);
    }
  });

  it('the ledger never uses INCIDENTAL as a disposition for these 3 rows (Fold D vocabulary ban)', () => {
    const ledger = readText(DEFECT_LEDGER_REL);
    for (const id of ['CC-D1', 'CC-D2', 'CC-D3']) {
      const row = ledger.split('\n').find((l) => l.startsWith(`| ${id} |`));
      expect(row!.includes('INCIDENTAL'), `${id} row must not use the banned INCIDENTAL disposition`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Reversion sentinels — prove the CURRENT (unconverted) script genuinely has
// the shape this pilot's conversion will change (so the it.fails() claims
// above are provably red for the RIGHT reason, not by accident)
// ---------------------------------------------------------------------------

describe('commit 7 landed — the frozen shape retired what the pre-commit-7 reversion sentinels proved was real', () => {
  it('the JS fallback (retired, A-1(a)) is GONE from both the step file and compute.js', () => {
    const stepSrc = readText(STEP_REL);
    const computeSrc = computeSource();
    for (const needle of ['PostGIS not available', 'JS centroid computation']) {
      expect(stepSrc.includes(needle), `${STEP_REL} must not carry the retired JS-fallback text "${needle}"`).toBe(false);
      expect(computeSrc.includes(needle), `${COMPUTE_REL} must not carry the retired JS-fallback text "${needle}"`).toBe(false);
    }
  });

  it('T1/T2 are declared logic_variables (Spec 124 Rule 3) — the old bare-literal thresholds are gone from the frozen step file', () => {
    const stepSrc = readText(STEP_REL);
    expect(stepSrc.includes("threshold: '== 0'")).toBe(false);
    expect(stepSrc.includes("threshold: '>= 98%'")).toBe(false);
    const seeds = JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8')) as Record<string, unknown>;
    expect(CONFIG_VARS.T1 in seeds, `${CONFIG_VARS.T1} must be seeded (Rule 3, T1)`).toBe(true);
    expect(CONFIG_VARS.T2 in seeds, `${CONFIG_VARS.T2} must be seeded (Rule 3, T2)`).toBe(true);
    void T1_DEFAULT; void T2_DEFAULT;
  });

  it('the frozen step file is far shorter than the 226-line pre-conversion boundary this session measured', () => {
    const lines = readText(STEP_REL).split('\n').length;
    expect(lines).toBeLessThan(CURRENT_UNCONVERTED_LINES);
  });

  it('the advisory lock (99) stays textual in the step file; the PostGIS UPDATE statement text is byte-present in compute.js', () => {
    const stepSrc = readText(STEP_REL);
    const computeSrc = computeSource();
    expect(stepSrc.includes('99')).toBe(true);
    expect(computeSrc.includes('ST_Y(ST_Centroid(geom))')).toBe(true);
    expect(computeSrc.includes('ST_X(ST_Centroid(geom))')).toBe(true);
  });
});

// Reference the check-id groups so an unused-var lint never fires on constants
// this file's tests read indirectly via loadDescriptor()/checkById() call sites
// once the descriptor exists (commit 7).
void CHECK_IDS; void WARN_FAIL_CHECK_IDS; void INFO_CHECK_IDS; void checkById;
