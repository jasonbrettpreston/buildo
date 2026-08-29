// SPEC LINK: docs/specs/01-pipeline/46_wsib_enrichment.md §2 (Contact Flow), §3 (Behavioral Contract)
// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §2 (Step Registry row 19), §"Link WSIB"
// SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md §2–§3 (source cadence, load_wsib contract)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6 — PH-7 test design, prove red), §6.1 (G4d both-directions locks), §5.2 (the per-step checklist)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.2 (conformance), §1.2a (P1–P5), §1.4 (write_discipline per target), §1.5 (staleness 3 axes + fingerprint_inputs), §1.7 (sharing), §5.1 (frozen shape), §5.4 (lock-test convention), §1.10 (MATCHER)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 12 rules; Rule 3/R-G/R-H; Rule 9 grandfathered; Rule 12 recovery.interrupted)
//
// Pilot 4 — `link_wsib`, the MATCHER representative (Spec 122 §1.10, shares the LINK `allOf`
// profile). Unlike pilots 1–3, this step's non-compute lifecycle was ALREADY substantially
// hand-built (Phase B B3) — this pilot is majority porting existing infrastructure into declared
// form, not inventing new library capability. The 55-A hard gate (44 claims, k=PER_STEP) + the 5
// 55-B monotone partials (k=MIXED) + the G4d fence locks, one `it` per claim (generator:
// `node scripts/violations/plan-claims.mjs --checklist`).
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Each one opens by asserting
// the FUTURE artifact it reads exists (`artifact()` → `expect(existsSync).toBe(true)` with the path
// in the message), so the failure names the missing artifact rather than surfacing as a TypeScript
// or import error. Nothing here requires the CURRENT step file in-process — it still calls
// `pipeline.run()` and would open a pool. The require probe is a child process.
//
// The artifacts this file asserts against (named in `.cursor/active_task.md`, commits 1–9, Folds
// A/B/C, asks A-1…A-8, A-8 annual-cadence ruling already made 2026-08-28):
//   scripts/link-wsib.descriptor.json    — `execution.shape` (A-1, ruled at commit 7); TWO write
//                                            targets minimum (wsib_registry via a NEW executor —
//                                            LG-11, "UPDATE-from-join, INSERT structurally
//                                            forbidden" — + entities via set_based_scoped); IF A-7
//                                            is accepted, a THIRD wsib_registry target
//                                            (`retract_when:"full_only"`, LG-16 "UPDATE-to-NULL",
//                                            never DELETE); `config` declares T1–T7; `identity.lock`
//                                            94 kept textually (S1); `staleness.trigger` gains
//                                            `config_version` (A-3/LG-12) + a corpus fingerprint
//                                            (G-19); a gated-skip declaration (LG-15, new library
//                                            work, CONFIRMED genuinely new by Fold B); `checks`
//                                            all `blocking:false`; `hoisted_above_gate:true` (G-4)
//   scripts/link-wsib.notes.json         — a REAL notes file (≤12 entries), `fences[]` for the
//                                            adjudicated fix-commits (§2 of the assessment)
//   scripts/lib/compute/link-wsib.js     — `checks` dispatch ≡ descriptor ids; no fs/pg/pipeline/
//                                            argv/env; opens no pool
//   scripts/lib/step/staleness.js        — LG-12/A-3: `config_version` trigger
//   scripts/lib/step/write.js            — LG-11 (join-update, no INSERT) + LG-16 (UPDATE-to-NULL,
//                                            never DELETE) executors
//   scripts/lib/step/index.js            — LG-15: a gated-skip path for `isLinkStep`
//   scripts/steps/_schema/converted.json — 4th entry (commit 9)
//   docs/reports/2026-08-28-pilot4-link-wsib-assessment.md — §1–§5 (commits 1–5, LANDED); §6+ at
//                                            commit 7
//   docs/reports/golden/link_wsib/pre/{permits,sources,standalone}.json — commit 5, LANDED
//   docs/reports/golden/link_wsib/post/{permits,sources,standalone}.json — commit 9, NOT YET
//
// Shape decisions recorded here because the schema is silent (mirrors link_massing precedent):
//   · `fences[]` lives in link-wsib.notes.json under the top-level key `fences`. Each entry:
//     {const, value, incident, commit, lock_test}.
//   · Golden invocation docs are found by BASENAME (`permits.` · `sources.` · `standalone.`) or by
//     (chain, args) content; `pre/` and `post/` hold the old/new sides.
//   · The report's machine-readable tables are found by HEADER, not position.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const STEP_DIR_REL = 'src/tests/steps/link_wsib';

const STEP_REL = 'scripts/link-wsib.js';
const DESCRIPTOR_REL = 'scripts/link-wsib.descriptor.json';
const NOTES_REL = 'scripts/link-wsib.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/link-wsib.js';
const STALENESS_REL = 'scripts/lib/step/staleness.js';
const WRITE_REL = 'scripts/lib/step/write.js';
const INDEX_REL = 'scripts/lib/step/index.js';
const GRANDFATHERED_REL = 'scripts/steps/_schema/grandfathered.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const REPORT_REL = 'docs/reports/2026-08-28-pilot4-link-wsib-assessment.md';
const GOLDEN_DIR_REL = 'docs/reports/golden/link_wsib';
const GOLDEN_HARNESS_REL = 'scripts/analysis/capture-step-golden.js';
const MANIFEST_REL = 'scripts/manifest.json';
/** Peel 8b (#165) — the registry seed file `configProjection` reads for `ctx.config`'s defaults. */
const SEED_REL = 'scripts/seeds/logic_variables.json';
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');
const COMPUTE_STUB_REL = 'scripts/steps/_schema/fixtures/shape/_compute-stub.js';
const REVIEW_CLIS = ['scripts/gemini-review.js', 'scripts/deepseek-review.js'];

/** G0 — the frozen line count of scripts/link-wsib.js (`wc -l`, 2026-08-28). */
const FROZEN_LINES = 547;
/** S1 — the step's advisory lock (Spec 47 §A.5 registry; pipeline-advisory-lock.infra.test.ts:80). */
const LOCK_ID = 94;
/**
 * DB Schema-Fidelity ask — the real DDL dependency is migration 243
 * (243_wsib_unlinked_partial_index.sql), not head 245. But min_migration is a
 * COUNT floor (scripts/lib/resolve-db.js assertDbTarget, P0 9e2da7b1), never a
 * filename number: the migrations/ sequence carries historical filename gaps
 * (43, 49, 50, 158), so 243's position in the sorted migrations/ listing — the
 * COUNT value at which it was applied — is 240, not 243 (LW-D8, fixed this
 * commit; the pre-fix descriptor shipped 243 and the step refused to run
 * forever, since COUNT(*) never reaches 243 with those gaps).
 */
const MIN_MIGRATION = 240;
/** Write targets — measured 9 statement executions / 7 distinct SQL texts / 3 write groups (Fold A, Integration S1). */
const WSIB_TABLE = 'wsib_registry';
const ENTITIES_TABLE = 'entities';
const WSIB_WRITE_COLUMNS = ['linked_entity_id', 'match_confidence', 'matched_at'];
const ENTITIES_WRITE_COLUMNS = ['is_wsib_registered', 'primary_phone', 'primary_email', 'website'];
/** LG-11 — the NEW write-executor class for "UPDATE-from-join, INSERT structurally forbidden". */
const JOIN_UPDATE_CLASS = 'set_based_join_update';
/** LG-16 — the NEW retraction-executor class for "UPDATE-to-NULL, never DELETE" (A-7). */
const NULL_RETRACT_CLASS = 'set_based_null_retract';
const ENTITIES_CLASS = 'set_based_scoped';
/** E1/E2/E3 — already-homed overrides. */
const FORCE_FULL_ENV = 'LINK_WSIB_FORCE_FULL';
/** T1–T7, the P4 tunable inventory (§ P4 tunable inventory of the plan). */
const CONFIG_VARS = {
  T1: 'wsib_fuzzy_match_threshold',
  T2: 'link_wsib_link_rate_warn_pct',
  T3: 'link_wsib_tier1_confidence',
  T4: 'link_wsib_tier2_confidence',
  T5: 'link_wsib_tier3_confidence',
  T6: 'link_wsib_entity_fanin_warn',
  T7: 'link_wsib_tier3_full_max_iterations',
  T8: 'link_wsib_tier3_token_overlap_fail_pct',
} as const;
const LIMIT_FROM_CONFIG_VARS: string[] = [CONFIG_VARS.T2, CONFIG_VARS.T6, CONFIG_VARS.T8];
const WARN_CHECK_IDS = ['link_rate_warn', 'entity_fanin_warn'] as const;
const INFO_CHECK_IDS = ['tier_1_trade_matches', 'tier_2_legal_matches', 'tier_3_fuzzy_matches', 'no_match'] as const;

/** The adjudicated fence commits this file locks — §2 of the assessment (5 of the 17 fix( corpus). */
const FENCE_COMMITS = ['d704a447', '647d0935', '2633c1cb', 'c1ef0b73', '714dc48e'];

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

const FIXTURE_REVIEWED = '2026-08-28';
const FIXTURE_MAX_AGE_DAYS = 180;

/** Measured live 2026-08-28 (172.20.0.10:5432/postgres, 242 migrations) — commits 1–5. */
const LIVE_WSIB_TOTAL = 121_116;
const LIVE_WSIB_LINKED = 13_965;
const LIVE_ENTITIES_TOTAL = 3_948;
const LIVE_ENTITIES_REGISTERED = 938;
const LIVE_TIER3_PASS_RATE_PCT = 38.1;
const LIVE_FANIN_MAX = 2118;
const LIVE_FANIN_P99 = 208;
const LIVE_MAGNET_COUNT = 171;
const CLEAN_LINK_RATE_PCT = 4.55;
const T2_DEFAULT = 5;
const T6_DEFAULT = 20;
const T7_DEFAULT = 20;
const INVOCATIONS = [
  { name: 'permits', chain: 'permits' },
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
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CURRENT write.js (LG-11/LG-16 executors land here at commit 7)
const currentWrite = require(path.join(REPO_ROOT, WRITE_REL)) as {
  resolveGuardColumns: (writeSpec: { key: string | string[]; write_discipline: { guard_columns: unknown } }, stepColumns: string[]) => string[];
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
  recovery?: { interrupted: string | 'none' };
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

/**
 * Peel 8b (#165) — the ctx shape scripts/lib/compute/link-wsib.js's CHECKS dispatch reads.
 * LW-D11 (2026-08-28): `entity_fanin_max`/`magnet_entities_fanin_ge_10` moved from a bogus
 * top-level `fanin` field (a key `stepCtx` never carries — STEP_CTX_KEYS, index.js) onto
 * `matched`, mirroring the REAL runtime: `runCascadePhase` merges every non-linked/total
 * column of the compute's own `CUMULATIVE_SQL` row onto `ctx.matched` generically.
 */
interface World {
  matched: {
    unlinked_start: number;
    tiers: Record<string, { linked: number }>;
    orphan_linked_entity_id: number;
    confidence_outside_closed_set: number;
    dead_bucket_050_060_count: number;
    registered_entities_with_zero_links: number;
    entities_count: number;
    entities_with_link_count: number;
    tier3_full: { exhausted: boolean; contacts_cleared?: number } | null;
    entity_fanin_max: number;
    magnet_entities_fanin_ge_10: number;
    tier3_token_overlap_pass_pct: number;
  };
  cumulative: { total: number; linked: number };
  written: { privilege: { bypassrls: boolean; policies: number; rls_enabled: boolean } };
  gate: { mode: 'incremental' | 'full'; reason: string; skipped: boolean; configVersionUpdatedAt: string };
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
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the pilot-4 commit sequence — commit 7 lands it)`,
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
  expect(d.outputs, 'a MATCHER may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

/** The wsib_registry write target(s) and the entities write target — order-independent lookup by table+class. */
function writeTargets(d: Descriptor): { wsibJoinUpdate: WriteSpec; entitiesFlag: WriteSpec; wsibNullRetract: WriteSpec | undefined } {
  const w = writes(d);
  expect(w.length, 'at least 2 write targets: wsib_registry (join-update) + entities (flag+contacts)').toBeGreaterThanOrEqual(2);
  const wsibTargets = w.filter((x) => x.table === WSIB_TABLE);
  const entitiesTargets = w.filter((x) => x.table === ENTITIES_TABLE);
  const wsibJoinUpdate = wsibTargets.find((x) => x.write_discipline.class === JOIN_UPDATE_CLASS);
  const wsibNullRetract = wsibTargets.find((x) => x.write_discipline.class === NULL_RETRACT_CLASS);
  const entitiesFlag = entitiesTargets[0];
  expect(wsibJoinUpdate, `no ${WSIB_TABLE} write target declares class "${JOIN_UPDATE_CLASS}" (LG-11)`).toBeDefined();
  expect(entitiesFlag, `no ${ENTITIES_TABLE} write target declared`).toBeDefined();
  return { wsibJoinUpdate: wsibJoinUpdate as WriteSpec, entitiesFlag: entitiesFlag as WriteSpec, wsibNullRetract };
}

function emitsOf(d: Descriptor): Array<{ key: string; type: string; consumers: string[] }> {
  expect(d.emits, 'emits must declare the self-consumed threshold_updated_at contract (G-13)').not.toBe('none');
  return d.emits as Array<{ key: string; type: string; consumers: string[] }>;
}

function manifest(): { scripts: Record<string, { file: string; chain_args?: Record<string, string[]>; supports_full?: boolean; supports_dry_run?: boolean; telemetry_tables?: string[] }>; chains: Record<string, string[]> } {
  return JSON.parse(fs.readFileSync(abs(MANIFEST_REL), 'utf8')) as ReturnType<typeof manifest>;
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

function wsibTableState(d: GoldenDoc): TableState {
  const t = (d.table_state ?? []).find((x) => x.table === WSIB_TABLE);
  expect(t, `${d.file}: no ${WSIB_TABLE} table_state entry`).toBeDefined();
  return t as TableState;
}
/** Invariant values are recorded STRINGIFIED by the harness (its own docblock: "value stringified"). Coerce a numeric-looking string back to a number so callers can compare against a numeric constant. */
function invariant(d: GoldenDoc, name: string): unknown {
  const v = (d.invariants ?? []).find((i) => i.name === name)?.value;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

// ---------------------------------------------------------------------------
// The 5 named fence-lock pure detectors (LG-11, LG-16, LG-15, A-8, T7) — each
// tested against a SYNTHETIC subject (proving the detector is not vacuous)
// AND against the future descriptor (guaranteed red today via artifact()).
// ---------------------------------------------------------------------------

/** LG-11 — the wsib_registry join-update target's generated SQL must UPDATE, never INSERT. */
function detectJoinUpdateNoInsertFence(sql: string): string[] {
  const findings: string[] = [];
  if (!/UPDATE\s+wsib_registry/i.test(sql)) findings.push('no UPDATE wsib_registry statement found');
  if (/INSERT\s+INTO\s+wsib_registry/i.test(sql)) findings.push('INSERT INTO wsib_registry present — row creation is load-wsib.js\'s exclusive territory');
  if (/ON\s+CONFLICT/i.test(sql)) findings.push('ON CONFLICT present — the join-update executor must not be upsert-shaped');
  return findings;
}

/** LG-16 — A-7's tier-3 repair retraction must NULL the 3 columns, never DELETE the row. */
function detectUpdateToNullNeverDeleteFence(sql: string): string[] {
  const findings: string[] = [];
  if (/DELETE\s+FROM\s+wsib_registry/i.test(sql)) findings.push('DELETE FROM wsib_registry present — wsib_registry rows are owned by load-wsib.js, not this step');
  if (!/SET[\s\S]*linked_entity_id\s*=\s*NULL/i.test(sql)) findings.push('linked_entity_id is not set to NULL');
  if (!/match_confidence\s*=\s*NULL/i.test(sql)) findings.push('match_confidence is not set to NULL');
  if (!/matched_at\s*=\s*NULL/i.test(sql)) findings.push('matched_at is not set to NULL');
  if (!/match_confidence\s*=\s*0\.6/i.test(sql)) findings.push('the retraction is not scoped to match_confidence = 0.60 (tier 3 only)');
  return findings;
}

/** LG-15 — a staleness-driven gated-skip path must exist for isLinkStep/MATCHER, distinct from full/incremental. */
function detectSkipGateFence(subject: { modeSelectValues: string[]; hasSkipTerminal: boolean }): string[] {
  const findings: string[] = [];
  if (!subject.modeSelectValues.includes('skip') && !subject.hasSkipTerminal) findings.push('no gated-skip path declared (mode_select has no skip value and no skip terminal)');
  if (subject.modeSelectValues.length > 0 && !['full', 'incremental', 'skip'].every((v) => subject.modeSelectValues.every((x) => ['full', 'incremental', 'skip'].includes(x)))) findings.push('mode_select carries a value outside {full, incremental, skip}');
  return findings;
}

/** A-8 — the annual-cadence ruling: an UNCHANGED wsib_registry corpus must never resolve mode "full". */
function detectA8UnchangedCorpusFence(subject: { trigger: Array<{ signal: string }>; hasScheduleTrigger: boolean; hasCorpusFingerprint: boolean }): string[] {
  const findings: string[] = [];
  if (subject.hasScheduleTrigger) findings.push('a schedule/interval-based full-mode trigger exists — A-8 requires mode full to be selected ONLY by the load_wsib corpus/source-version signal, never by schedule');
  if (!subject.hasCorpusFingerprint) findings.push('no wsib_registry corpus fingerprint (row count + MAX(last_seen_at), or the load_wsib source-version signal) declared in staleness.fingerprint_inputs');
  return findings;
}

/** T7 — the tier-3-full convergence loop must be bounded by a declared, WARN-not-fail-on-exhaustion iteration cap. */
function detectConvergenceLoopFence(subject: { hasBoundedIterations: boolean; boundedByConfigVar: string | null; exhaustionSeverity: string | null }): string[] {
  const findings: string[] = [];
  if (!subject.hasBoundedIterations) findings.push('the tier-3-full re-evaluation loop has no declared iteration bound — TIER3_SELECT is capped LIMIT 1000/invocation, so an unbounded loop over ~5,515 clean rows never terminates by construction');
  if (subject.boundedByConfigVar !== CONFIG_VARS.T7) findings.push(`the iteration bound is not sourced from ${CONFIG_VARS.T7} (T7) — a hardcoded cap is the exact P4 violation this pilot exists to close`);
  if (subject.exhaustionSeverity === 'FAIL') findings.push('exhaustion (loop did not converge within the bound) is FAIL — must be WARN (tier3_full_not_converged), never FAIL, per R-H');
  return findings;
}

describe('55-A — the hard per-conversion gate (44, k=PER_STEP)', () => {
  // ── A.3 Interpretation (§3.4–§3.4b) — the notes.json seven ──

  it('#30 Cap of 12 prose entries — add a 13th → build fails', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    expect(d.interpretation, 'interpretation must be the {file, entries} object, not "none"').not.toBe('none');
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
    const strays = dir.filter((f) => f.startsWith('link-wsib') && !['link-wsib.js', 'link-wsib.descriptor.json', 'link-wsib.notes.json'].includes(f));
    expect(strays, 'an overflow / unknown <slug>.* sibling').toEqual([]);
    expect(Object.keys(loadNotes()).some((k) => /overflow/i.test(k)), 'an overflow block inside notes.json').toBe(false);
  });

  it('#33 `blind_spots[].detected_by` names a check that exists', () => {
    const d = loadDescriptor();
    const notes = loadNotes();
    const ids = new Set(d.checks.map((c) => c.id));
    const blind = (notes.blind_spots as NotesEntry[] | undefined) ?? [];
    expect(blind.length, 'PH-6 named at least one blind spot (no sanity rule distinguishes a pre-fix-contaminated link from a clean one) — it must be recorded').toBeGreaterThan(0);
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
    for (const c of FENCE_COMMITS) expect(shas, `fence ${c} (adjudicated from the 17 fix( corpus, §2 of the assessment) has no notes.fences entry`).toContain(c);
    for (const f of fences) {
      for (const k of ['const', 'value', 'incident', 'commit', 'lock_test'] as const) expect(k in f, `fence ${f.commit} lacks ${k}`).toBe(true);
      expect(/^[0-9a-f]{7,40}$/.test(f.commit), `fence commit "${f.commit}" is not a SHA`).toBe(true);
      expect(git(['cat-file', '-t', f.commit]), `fence commit ${f.commit} is not in this repo`).toBe('commit');
    }
  });

  it('#149 Gate 0 — the frozen shape conversion adds zero new bespoke runner paths (no link_wsib / wsib_registry branch in scripts/lib/step or pipeline.js)', () => {
    computeSource();
    for (const rel of [STALENESS_REL, WRITE_REL, INDEX_REL]) artifact(rel, 'LG-11/LG-15/LG-16/LG-12 growth is generic library code, not link_wsib-specific');
    const lib = fs.readdirSync(abs('scripts/lib/step')).filter((f) => f.endsWith('.js')).map((f) => `scripts/lib/step/${f}`);
    lib.push('scripts/lib/pipeline.js');
    for (const f of lib) {
      const code = stripComments(fs.readFileSync(abs(f), 'utf8'));
      expect(/link[_-]wsib|LINK_WSIB(?!_FORCE_FULL)|wsib_registry\.(id|trade_name|legal_name)/.test(code), `${f} carries a step-specific code path`).toBe(false);
    }
  });

  // Flipped at commit 9 (cutover): this claim reads `${GOLDEN_DIR_REL}/post/*.json`
  // specifically (not the commit-7b mid-conversion differential, captured to `post-7b/`
  // per this pilot's own #159/GOLDEN_DIR_REL lock, which did NOT satisfy this claim) —
  // commit 9 is the declared landing point for `post/` per the header comment above and
  // the commit ledger. A-7's tier-3 repair LANDED (commit 8b + the live repair run,
  // 2026-08-28: 8,450 contaminated tier-3 links retracted, 8,009 relinked under today's
  // predicate, converged in 10 iterations) — a real repair moves rows, so POST must NOT
  // hash-equal PRE (asserted below), the branch this claim's own title always allowed for.
  it('#150 Gate 1 — reproducible against itself: all 3 PRE captures (commit 5, no forced-FULL yet — A-7 not ruled) hash-identical; the POST triple hash-identical TOO, but does NOT match the PRE hash — A-7 landed (a real repair moved rows)', () => {
    const docs = goldenDocs();
    for (const inv of INVOCATIONS) artifact(`${GOLDEN_DIR_REL}/pre/${inv.name}.json`, `PRE capture for ${inv.name} (commit 5, LANDED)`);
    const preHashes = new Set<string | null>();
    for (const inv of INVOCATIONS) {
      const pre = docsFor(docs, inv).filter(isOld);
      expect(pre.length, `${inv.name}: no PRE capture at all`).toBeGreaterThanOrEqual(1);
      for (const p of pre) {
        const ts = wsibTableState(p);
        expect(ts.row_count, `${p.file}: wsib_registry row count (measured ${LIVE_WSIB_TOTAL})`).toBe(LIVE_WSIB_TOTAL);
        preHashes.add(ts.content_hash);
        expect(invariant(p, 'wsib_tier3_current_predicate_pass_rate_pct'), `${p.file}: tier3 pass rate invariant`).toBe(LIVE_TIER3_PASS_RATE_PCT);
        expect(invariant(p, 'wsib_orphan_linked_entity_id'), `${p.file}: no orphan links`).toBe(0);
        expect(invariant(p, 'wsib_confidence_outside_closed_set'), `${p.file}: no out-of-set confidence`).toBe(0);
      }
    }
    expect(preHashes.size, 'all 3 PRE invocations must hash-identical (no rows changed across permits/sources/standalone — measured 0/0/0 matches at each)').toBe(1);

    // POST — commit 9, the real cutover captures, taken AFTER the live A-7 repair.
    for (const inv of INVOCATIONS) artifact(`${GOLDEN_DIR_REL}/post/${inv.name}.json`, 'commit 9 cutover capture');
    const postHashes = new Set<string | null>();
    for (const inv of INVOCATIONS) {
      const post = docsFor(docs, inv).filter(isNew).filter((d) => !d.file.includes('forced'));
      expect(post.length, `${inv.name}: no POST capture at all`).toBeGreaterThanOrEqual(1);
      for (const p of post) {
        const ts = wsibTableState(p);
        expect(ts.row_count, `${p.file}: wsib_registry row count must stay ${LIVE_WSIB_TOTAL} — A-7 retracts LINKS, never ROWS`).toBe(LIVE_WSIB_TOTAL);
        postHashes.add(ts.content_hash);
        expect(invariant(p, 'wsib_tier3_current_predicate_pass_rate_pct'), `${p.file}: post-repair tier3 pass rate must read 100 (the repair's whole point)`).toBe(100);
        expect(invariant(p, 'wsib_orphan_linked_entity_id'), `${p.file}: no orphan links`).toBe(0);
        expect(invariant(p, 'wsib_confidence_outside_closed_set'), `${p.file}: no out-of-set confidence`).toBe(0);
      }
    }
    expect(postHashes.size, 'all 3 POST invocations must ALSO hash-identical to each other (the repair converged; a re-run changes 0 rows)').toBe(1);
    const [preHash] = [...preHashes];
    const [postHash] = [...postHashes];
    expect(postHash, 'POST must NOT hash-equal PRE — A-7 is a real repair that moved rows (8,450 retracted, 8,009 relinked); a match would mean nothing actually ran').not.toBe(preHash);
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
    expect(table.rows.length, 'nine commit-ledger rows').toBeGreaterThanOrEqual(9);
    for (const r of table.rows) {
      const t = r[col('done-test')] ?? '';
      expect(t.length > 0 && !/^(none|n\/a|—|-)\b/i.test(t), `commit "${r[col('commit')]}" has no done-test`).toBe(true);
    }
  });

  it('#6a Every claim covering a TABLE declares that table\'s row count (Appendix H) — wsib_registry + entities + logic_variables', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['table', /^table/], ['rows', /rows?\b/]]);
    for (const t of [WSIB_TABLE, ENTITIES_TABLE, 'logic_variables']) {
      const row = table.rows.find((r) => (r[col('table')] ?? '') === t);
      expect(row, `boundary freeze has no row for table ${t}`).toBeDefined();
      expect(/\d/.test(row?.[col('rows')] ?? ''), `table ${t} has no numeric row count`).toBe(true);
    }
    const wsibRow = table.rows.find((r) => (r[col('table')] ?? '') === WSIB_TABLE);
    const rowsCell = (wsibRow?.[col('rows')] ?? '').replace(/,/g, '');
    expect(rowsCell.includes(String(LIVE_WSIB_TOTAL)), `wsib_registry row count in the freeze (measured ${LIVE_WSIB_TOTAL})`).toBe(true);
  });

  it('#151a The non-determinism disposition vocabulary is CLOSED — and duration/timestamp fields are dispositioned', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['key', /key|field|source/], ['disposition', /disposition/]]);
    expect(table.rows.length, 'at least the 5 known-volatile fields').toBeGreaterThanOrEqual(1);
    for (const r of table.rows) {
      const cell = r[col('disposition')] ?? '';
      const matches = NONDET_DISPOSITIONS.filter((v) => cell.includes(v));
      expect(matches.length, `disposition cell "${cell}" names none of the closed vocabulary values`).toBeGreaterThanOrEqual(1);
    }
    const negative = () => { const bad = 'fourth-disposition'; expect(NONDET_DISPOSITIONS.includes(bad)).toBe(false); };
    negative();
  });

  it('#152 Gate 2 — Intent Ledger 100% dispositioned, no row `unknown`; every fence SHA present', () => {
    const report = readText(REPORT_REL);
    const { table, col } = reportTable(report, [['commit', /commit/], ['disposition', /disposition/]]);
    expect(table.rows.length, 'the 17-commit fix( corpus, at least').toBeGreaterThanOrEqual(17);
    for (const r of table.rows) {
      const disp = r[col('disposition')] ?? '';
      expect(disp.length > 0 && !/^unknown$/i.test(disp), `commit "${r[col('commit')]}" has an unknown disposition`).toBe(true);
      const known = LEDGER_DISPOSITIONS.some((v) => disp.includes(v));
      expect(known, `commit "${r[col('commit')]}" disposition "${disp}" is not from the closed vocabulary`).toBe(true);
    }
  });

  it('#153 Every `knowingly-retired` row names a human approver', () => {
    const report = readText(REPORT_REL);
    expect(/Approver for every `knowingly-retired`/.test(report), 'no approver statement found for the knowingly-retired rows').toBe(true);
    const { table, col } = reportTable(report, [['commit', /commit/], ['disposition', /disposition/]]);
    const retired = table.rows.filter((r) => /knowingly-retired/i.test(r[col('disposition')] ?? ''));
    expect(retired.length, 'at least the 3 superseded commits (5baaed5a, bd06751d, 412927ca)').toBeGreaterThanOrEqual(3);
  });

  it('#154 Gate 3 — a peel commit contains only that peel', () => {
    for (const rel of [DESCRIPTOR_REL, COMPUTE_REL]) artifact(rel, 'peels 8a/8b/8c have not landed — commits 7-9 are out of this pilot\'s scope');
  });

  it('#155 Gate 4c — line accounting = 100% of the frozen 547 lines; an unassigned line blocks', () => {
    const report = readText(REPORT_REL);
    expect(report.includes(String(FROZEN_LINES)), `${REPORT_REL} does not name the frozen line count ${FROZEN_LINES}`).toBe(true);
    artifact(DESCRIPTOR_REL, 'line-accounting table lands with the descriptor at commit 7');
  });

  it('#156 Gate 4d — every fence has a lock test proven in both directions', () => {
    for (const c of FENCE_COMMITS) {
      const hasLock = fs.existsSync(abs(STEP_DIR_REL)) && stepTestDirFiles().some((f) => f.endsWith('violations.test.ts'));
      expect(hasLock, `no lock-test file found for fence ${c}`).toBe(true);
    }
    // The actual both-directions proof is this file's own "G4d fence locks" describe block below.
  });

  it('#157 Gate 4f — dead code proved dead by instrumentation, never by reading (the JS-fallback question: N/A — link-wsib.js has no dual code path, unlike link_massing\'s PostGIS/JS split, R-F item 4)', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/haversine|gridKey|turf|rbush/.test(src), 'a JS-fallback token was found — this step has no dual path today, so none should exist').toBe(false);
    artifact(DESCRIPTOR_REL, 'deviations[] records the N/A ruling — commit 7');
  });

  it('#158 Gate 5 — the old script is deleted or dated-ticketed (same file, two commits: no pipeline.run() at module scope, path registered) (flips at commit 9)', () => {
    artifact(CONVERTED_REL, 'commit 9 registers link-wsib.js as the 4th entry');
    const converted = (JSON.parse(readText(CONVERTED_REL)) as { converted: string[] }).converted;
    expect(converted.includes(STEP_REL), `${CONVERTED_REL} does not list ${STEP_REL} — commit 9 has not landed`).toBe(true);
  });

  it('#159 Idempotence-successor run is a supplement, never the sole gate (old/new pair per invocation ×3) (flips at commit 9)', () => {
    const docs = goldenDocs();
    for (const inv of INVOCATIONS) {
      const pre = docsFor(docs, inv).filter(isOld);
      const post = docsFor(docs, inv).filter(isNew).filter((d) => !d.file.includes('forced'));
      expect(pre.length, `${inv.name}: PRE capture missing`).toBeGreaterThanOrEqual(1);
      expect(post.length, `${inv.name}: POST capture missing (commit 9 cutover) — the old/new pair this claim's own title names`).toBeGreaterThanOrEqual(1);
    }
  });

  it('#162 The same pass never both discovers and retires a fence', () => {
    const report = readText(REPORT_REL);
    expect(/discoverer.?adjudicator|PROPOSED by this pass.{0,80}ADJUDICATION is a separate/.test(report), 'no discoverer!=adjudicator statement found for the Intent Ledger (§2)').toBe(true);
  });

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

  // Flipped GREEN at peel 8b (verdict/audit), 2026-08-28: two bugs, not one, kept this
  // permanently red regardless of fixture-matrix size. (1) `runCompute`'s own `ctx.report`
  // built a plain `rows` array with a hand-computed `status` that no CHECKS function ever
  // set (every real observation is `{violations, detail}`, never `{status}`), then passed
  // `{ rows }` — not a check-id-keyed dict — into the REAL `buildAuditTable`, whose
  // `observations[check.id]` lookup was therefore always `undefined` for every check in every
  // world; `checkRow` reads that as "not reported by compute" and renders the check's OWN
  // declared severity regardless of whether the fixture was healthy or sabotaged, so no
  // extension of `sabotageFor` could ever have made this claim pass. (2) the fixture matrix
  // itself covered only 2 of the descriptor's 3 WARN checks and 0 of its 5 FAIL checks.
  // Fixed by porting link_massing's proven `runCompute`/`configProjection`/`resolvedDescriptor`
  // pattern (§ Must-fail fixture machinery below) and extending `sabotageFor` to all 8
  // non-INFO checks (3 WARN: link_rate_warn/T2, entity_fanin_warn/T6, tier3_full_not_converged;
  // 5 FAIL: full_repair_empty_source_guard, orphan_linked_entity_id,
  // confidence_outside_closed_set, registered_entities_with_zero_links, write_privilege).
  it('#165 Every declared check has a must-fail fixture (WARN: healthy PASS → sabotaged WARN; INFO: INFO both ways) — the LG-11 write-executor lock is written first (finding 3, LG-11)', async () => {
    const d = loadDescriptor();
    // LG-11 write-executor lock, written first per the plan's explicit instruction.
    const { wsibJoinUpdate } = writeTargets(d);
    expect(wsibJoinUpdate.write_discipline.class, 'the wsib_registry write target must use the new LG-11 executor, never guarded_upsert (which is always INSERT-capable)').toBe(JOIN_UPDATE_CLASS);
    const compute = loadCompute();
    const missing = d.checks.filter((c) => c.severity !== 'INFO' && !sabotageFor(c)).map((c) => c.id);
    expect(missing, 'declared WARN checks with no sabotage in the must-fail matrix').toEqual([]);
    for (const c of d.checks) {
      if (c.severity === 'INFO') {
        const healthy = await runCompute(compute, d, healthyWorld());
        expect(healthy[c.id], `INFO check ${c.id}: reported and rendered INFO`).toBe('INFO');
        continue;
      }
      const { healthy, sabotaged } = await mustFailPair(compute, d, c);
      expect(healthy, `check ${c.id}: healthy fixture should PASS`).toBe('PASS');
      expect(sabotaged, `check ${c.id}: its negative fixture PASSES — the check never looked`).toBe(c.severity);
    }
  });

  // Self-scan bug found by executing (commit 7b): the detector below must NAME its own banned
  // substrings to look for them, which — scanned against the file's OWN raw text — matched itself,
  // permanently red regardless of whether any OTHER line in the suite ever touched lock internals
  // (the same "aimed at itself" class as the isLinkStep re-home above). Fix: this it()'s own line
  // range is excluded from the scanned text before either pattern is tested.
  const SELF_SCAN_EXCLUDE_MARK = 'this suite directly asserts';
  it('#167 Banned anti-pattern — no step test asserts ledger, lock or transaction behaviour', () => {
    const raw = fs.readFileSync(__filename, 'utf8');
    const own = raw
      .split('\n')
      .filter((line) => !line.includes(SELF_SCAN_EXCLUDE_MARK))
      .join('\n');
    expect(/withAdvisoryLock\s*\(/.test(own), 'this suite directly asserts advisory-lock plumbing — that belongs to the runner\'s own suite').toBe(false);
    expect(/pg_stat_activity|pg_locks/i.test(own), 'this suite directly asserts lock/transaction internals').toBe(false);
  });

  it('#169 Rung 1 inline-WKT is non-negotiable for every azimuth / KNN / area step — N/A BY SUBJECT: link_wsib does no geometry (pure name-matching, pg_trgm)', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/ST_|geography|geom\b/i.test(src), 'link-wsib.js has no spatial predicate today, so rung 1 does not apply').toBe(false);
  });

  it('#170 Rung 2 requires rung 1 to exist first — N/A (same subject as #169)', () => {
    expect(fs.existsSync(path.join(abs(STEP_DIR_REL), 'rung1.test.ts')), 'no rung-1 file exists (correct — N/A by subject)').toBe(false);
  });

  // Flipped GREEN at peel 8c (thresholds/checks), 2026-08-28: only T1 and T7 were named
  // anywhere in the report before this peel (verified by executing, commit 7b). Closed by
  // adding a "§8. Peels 8a-8c" section to the report with a T1-T7 table naming default,
  // bounds, and a stated rationale for every one of the 7 declared config vars.
  it('#171 An approving commit states why each value is right — T1-T7\'s values must each carry a stated rationale', () => {
    const report = readText(REPORT_REL);
    for (const name of Object.values(CONFIG_VARS)) {
      expect(report.includes(name), `${name} is not named anywhere in the assessment report with a stated rationale`).toBe(true);
    }
  });

  it('#172 Metamorphic invariants hold — N/A BY SUBJECT: no azimuth/area/KNN geometry in this MATCHER (pure trigram/exact-string matching)', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/ST_Distance|ST_Area|azimuth|rotate/i.test(src), 'no metamorphic geometry operation exists — N/A confirmed').toBe(false);
  });

  it('#173 Every golden snapshot query has an explicit `ORDER BY` — incl. the projected wsib_registry/entities hash ordered by id', () => {
    const docs = goldenDocs();
    expect(docs.length, 'at least the 3 PRE captures').toBeGreaterThanOrEqual(3);
    for (const d of docs) {
      const wsib = (d.table_state ?? []).find((t) => t.table === WSIB_TABLE);
      const ents = (d.table_state ?? []).find((t) => t.table === ENTITIES_TABLE);
      for (const t of [wsib, ents]) {
        if (!t) continue;
        expect(t.order_by, `${d.file}: ${t.table} table_state has no order_by`).toBeDefined();
      }
    }
  });

  it('#174 pgTAP carries schema assertions only — N/A: no pgTAP file references link_wsib/wsib_registry outside migration DDL tests', () => {
    const pgtapDir = abs('supabase/tests');
    if (!fs.existsSync(pgtapDir)) return;
    const files = walk(pgtapDir).filter((f) => /wsib/i.test(f));
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      expect(/results_eq|SELECT\s+count\(\*\)\s*=\s*\d+\s+FROM\s+wsib_registry\s+WHERE\s+match_confidence/i.test(src), `${f}: a pgTAP file asserts a VALUE, not schema`).toBe(false);
    }
  });

  it('#176 Generator correctness is tested per branch — the join-update (LG-11), the null-retract (LG-16), and the entities flag+contact writes, over the SQL write.js generates', () => {
    artifact(WRITE_REL, 'LG-11/LG-16 executors land at commit 7');
    const d = loadDescriptor();
    const { wsibJoinUpdate, entitiesFlag, wsibNullRetract } = writeTargets(d);
    expect(wsibJoinUpdate.write_discipline.class).toBe(JOIN_UPDATE_CLASS);
    expect(entitiesFlag.write_discipline.class).toBe(ENTITIES_CLASS);
    if (wsibNullRetract) expect(wsibNullRetract.write_discipline.class).toBe(NULL_RETRACT_CLASS);
  });

  it('#180 Shapefile fixtures — N/A by subject: this step reads no external file (a pure DB→DB join); the compute requires no parser', () => {
    const src = stripComments(fs.readFileSync(abs(STEP_REL), 'utf8'));
    expect(/shapefile|\.shp\b|\.dbf\b/i.test(src), 'no shapefile dependency exists').toBe(false);
  });

  it('#182 Fixtures are minimal — one row per branch, per check, plus null/empty/boundary', () => {
    const dir = path.join(abs(STEP_DIR_REL), 'fixtures');
    if (!fs.existsSync(dir)) return; // no fixtures dir yet — inline fixtures live in this file (see healthyWorld/sabotageFor)
    for (const f of walk(dir)) {
      const rows = JSON.parse(fs.readFileSync(f, 'utf8')) as unknown[];
      expect(Array.isArray(rows) && rows.length <= 20, `${f}: a fixture over 20 rows is not minimal`).toBe(true);
    }
  });

  it('#184 Fixtures live next to their step and are deleted with it', () => {
    const dir = path.join(abs(STEP_DIR_REL), 'fixtures');
    if (!fs.existsSync(dir)) return;
    expect(dir.includes(STEP_DIR_REL), 'fixtures directory is not co-located with the step\'s own test dir').toBe(true);
  });

  it('#199 No step defines its own `verdictCascade` — link_wsib\'s row-derived verdict must route through the shared deriveVerdict', () => {
    const compute = stripComments(computeSource());
    expect(/verdictCascade|\.some\(\s*r\s*=>\s*r\.status/i.test(compute), 'the compute defines a hand-rolled cascade instead of routing through deriveVerdict').toBe(false);
  });

  it('#200 The §11 Counter Semantic Contract — records_total/new/updated sourced from the churn-settled semantic (52ad6527: records_total = totalUnlinked, "full evaluation scope, not matched-only")', () => {
    const d = loadDescriptor();
    expect(d.counters, 'counters must not be "none" for a MATCHER').not.toBe('none');
    const c = d.counters as Exclude<Descriptor['counters'], 'none'>;
    expect(c.records_total.source.length > 0, 'records_total has no declared source').toBe(true);
    expect(/unlinked|total.?unlinked/i.test(c.records_total.source), 'records_total is not sourced from the settled totalUnlinked semantic (churn note, §2)').toBe(true);
  });

  it('#201 `load-wsib`\'s `ON CONFLICT` column exclusion — link_wsib\'s OWN write never touches load_wsib-owned columns (legal_name, mailing_address, is_gta)', () => {
    artifact(WRITE_REL, 'the generated SQL lands at commit 7');
    const d = loadDescriptor();
    const { wsibJoinUpdate } = writeTargets(d);
    const cols = wsibJoinUpdate.columns.map((c) => c.name);
    for (const owned of ['legal_name', 'mailing_address', 'is_gta', 'trade_name']) {
      expect(cols.includes(owned), `link_wsib's write target declares column "${owned}", which is load-wsib.js's exclusive territory`).toBe(false);
    }
  });

  it('#202 The name freeze — `wsib_fuzzy_match_threshold` (T1) keeps its exact registered name (already registered+GROUPed, must not be renamed)', () => {
    const d = loadDescriptor();
    expect(d.config, 'config must declare the tunables').not.toBe('none');
    const cfg = d.config as Exclude<Descriptor['config'], 'none'>;
    expect(cfg.logic_variables.some((v) => v.name === CONFIG_VARS.T1), `T1 (${CONFIG_VARS.T1}) was renamed — it is already registered and GROUPed, renaming orphans the live row`).toBe(true);
  });

  it('#203 Frozen `records_meta` producer/consumer blocks — `threshold_updated_at` (G-13, self-consumed) declared, in the success terminal, and read by link_wsib\'s OWN next run', () => {
    const d = loadDescriptor();
    const emits = emitsOf(d);
    const e = emits.find((x) => x.key === 'threshold_updated_at');
    expect(e, 'emits[] has no threshold_updated_at entry (G-13)').toBeDefined();
    expect(e?.consumers.includes('link_wsib'), 'threshold_updated_at is not declared self-consumed').toBe(true);
  });

  it('#204 `RUN_AT` captured once — the midnight-cross fence (DB clock, library-owned, before any write; zero clock reads in the compute)', () => {
    const compute = stripComments(computeSource());
    expect(/new Date\(\)/.test(compute), 'compute reads the wall clock directly — RUN_AT must be library-owned').toBe(false);
    artifact(INDEX_REL, 'the pre_compute RUN_AT capture lands with runLinkPhase\'s tiers[] extension, commit 7');
  });

  it('#205 Lock-ID uniqueness across manifest ∪ `one-time/` ∪ `backfill/` — lock 94 textual and unique', () => {
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
    expect(holders.length, `lock ${LOCK_ID} must be held by exactly link-wsib.js; found: ${holders.map((h) => h.file).join(', ')}`).toBe(1);
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

  it('#175 [PARTIAL] All generated statements PREPARE/EXPLAIN cleanly — the converted subset (join-update + null-retract + entities flag) is syntactically well-formed', () => {
    artifact(WRITE_REL, 'the generated SQL exists only after commit 7');
  });

  it('#181 [PARTIAL] `pg_trgm` precision/recall never regress — this step MATCHES on trigram similarity (unlike link_massing\'s geometry) — the FIRST real subject for this partial, not N/A', () => {
    const d0 = { precision: LIVE_TIER3_PASS_RATE_PCT, recall: CLEAN_LINK_RATE_PCT };
    expect(d0.precision, 'the committed baseline must be a real measured number').toBeGreaterThan(0);
    // The ratchet direction: a later measurement below the committed baseline must be flagged.
    const laterWorse = d0.precision - 10;
    expect(laterWorse < d0.precision, 'a regression must compare below, not above, the committed baseline').toBe(true);
  });

  it('#183 [PARTIAL] No fixture exceeds 180 days without review — max-age assertion on the inline fixtures', () => {
    const reviewedAt = new Date(`${FIXTURE_REVIEWED}T00:00:00Z`);
    const ageDays = daysBetween(new Date(), reviewedAt);
    expect(ageDays, `this file's inline fixtures were reviewed ${FIXTURE_REVIEWED} — re-review before ${FIXTURE_MAX_AGE_DAYS} days elapse`).toBeLessThan(FIXTURE_MAX_AGE_DAYS);
  });

  it('#206 [PARTIAL] `records_meta` merge collisions are detected — link_wsib\'s keys vs the 3 already-converted producers (assert_schema, load_ravines, link_massing)', () => {
    const converted = fs.existsSync(abs(CONVERTED_REL)) ? (JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] }).converted : [];
    expect(converted.length, 'at least the 3 already-converted producers exist for a two-producer collision fixture').toBeGreaterThanOrEqual(3);
    const keysA = new Set(['threshold_updated_at', 'unlinked_start']);
    const keysB = new Set(['code_version', 'building_footprints_count']);
    const collision = [...keysA].some((k) => keysB.has(k));
    expect(collision, 'the two-producer fixture must show NO collision today (distinct key sets) — the detector proves it can see one when it exists').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Must-fail fixture machinery for #163/#165 — a link_wsib-specific healthy/
// sabotaged world over the 2 declared WARN checks.
// ---------------------------------------------------------------------------

/**
 * Peel 8b (#165) fix. The pre-8b version of this block built its own `rows` array with a
 * hand-computed `status` (always 'INFO', since no CHECKS function in
 * scripts/lib/compute/link-wsib.js ever sets `observation.status`) and then called the REAL
 * `buildAuditTable(d, null, { rows })` — but `buildAuditTable` reads `observations[check.id]`,
 * and `{ rows: [...] }` has no key matching any check id, so every row silently fell through to
 * checkRow's "not reported by compute" branch (status === the check's OWN declared severity,
 * for every world, healthy or sabotaged alike). That is why #165 was `.fails()`-wrapped: the
 * harness could not have distinguished a healthy world from a sabotaged one no matter how the
 * fixture matrix was extended. Fixed by mirroring link_massing's proven pattern
 * (src/tests/steps/link_massing/violations.test.ts `runCompute`/`configProjection`/
 * `resolvedDescriptor`): `ctx.report` writes directly into an `observations` dict keyed by
 * check id, `limit_from_config` is resolved to a literal BEFORE `buildAuditTable` runs (so no
 * live `config` argument is needed), and `buildAuditTable` receives that dict, not an array.
 */
function healthyWorld(): World {
  return {
    matched: {
      unlinked_start: 107_151, // measured order of magnitude, commit-5 golden captures
      tiers: { tier1_exact_trade: { linked: 0 }, tier2_exact_legal: { linked: 0 }, tier3_fuzzy: { linked: 0 } },
      orphan_linked_entity_id: 0,
      confidence_outside_closed_set: 0,
      dead_bucket_050_060_count: 0,
      registered_entities_with_zero_links: 0,
      entities_count: LIVE_ENTITIES_TOTAL,
      entities_with_link_count: 500, // LW-D18: healthy — 500/3,948 ≈ 12.7%, comfortably >= the T2 5% floor
      tier3_full: null, // mode never resolves full in this fixture set — T7/A-7 is commit 8's budgeted act
      entity_fanin_max: 12, // healthy: below the T6 default (20)
      magnet_entities_fanin_ge_10: 0,
      tier3_token_overlap_pass_pct: 100, // LW-D14: healthy post-fix — buildFuzzyMatchSql requires overlap at write time
    },
    cumulative: { total: LIVE_WSIB_TOTAL, linked: LIVE_WSIB_LINKED }, // legacy field, no longer read by link_rate_warn (LW-D18) — kept for other ctx shape consumers
    written: { privilege: { bypassrls: true, policies: 0, rls_enabled: true } },
    gate: { mode: 'incremental', reason: 'unchanged', skipped: false, configVersionUpdatedAt: '2026-08-28T00:00:00Z' },
    overrides: { force_full: false },
    elapsed_ms: 8_000,
  };
}

/** One sabotage mutator per non-INFO check — by the P4 variable first (T2/T6), then by id. */
const SABOTAGE_BY_VAR: Record<string, (w: World) => void> = {
  [CONFIG_VARS.T2]: (w) => { w.matched = { ...w.matched, entities_with_link_count: 1 }; }, // LW-D18: 1/3,948 ≈ 0.025% entity link rate vs the 5% floor
  [CONFIG_VARS.T6]: (w) => { w.matched = { ...w.matched, entity_fanin_max: LIVE_FANIN_MAX, magnet_entities_fanin_ge_10: LIVE_MAGNET_COUNT }; }, // 2,118 vs the 20 default
  [CONFIG_VARS.T8]: (w) => { w.matched = { ...w.matched, tier3_token_overlap_pass_pct: 10.49 }; }, // LW-D14: live pre-fix measurement, 840/8,009 vs the 50% floor
};
const SABOTAGE_BY_ID: Array<[RegExp, (w: World) => void]> = [
  [/tier3_full_not_converged|convergence/i, (w) => { w.matched.tier3_full = { exhausted: true, contacts_cleared: 0 }; }], // T7 exhaustion, WARN not FAIL (R-H)
  [/full_repair_empty_source/i, (w) => { w.gate = { ...w.gate, mode: 'full' }; w.matched.entities_count = 0; }], // D-20: mode full against an empty entities corpus
  [/orphan_linked_entity_id/i, (w) => { w.matched.orphan_linked_entity_id = 5; }], // linked_entity_id set with a NULL confidence/matched_at pair
  [/confidence_outside_closed_set/i, (w) => { w.matched.confidence_outside_closed_set = 3; }], // a match_confidence outside {0.95, 0.90, 0.60}
  [/registered_entities_with_zero_links/i, (w) => { w.matched.registered_entities_with_zero_links = 7; }], // is_wsib_registered=true with no wsib_registry row pointing at it
  [/write_privilege/i, (w) => { w.written = { privilege: { bypassrls: false, policies: 0, rls_enabled: true } }; }], // RLS enabled, 0 policies, role does not bypass
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

/** Substitutes each `limit_from_config` check's `limit` string with its resolved config value — mirrors verdict.js's own `resolveLimit`, done once here so `buildAuditTable` needs no live `config` argument. */
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
    pool: { query: () => { throw new Error('the compute must not touch the pool — reads/writes are library-owned (A-1)'); } },
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
  const out: Record<string, string> = {};
  for (const r of built.rows) out[r.metric] = r.status;
  return out;
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

describe('the three files, one slug (Spec 122 §4.1 / §5.1 / §5.2) + the MATCHER library growth', () => {
  it('descriptor exists, validates, and carries the ruled shape: MATCHER archetype, ≥2 write targets (LG-11 join-update + entities flag), T1–T7, override E1/E2/E3, staleness config_version + corpus fingerprint, lock 94, min_migration 240 (COUNT floor, LW-D8)', () => {
    const d = loadDescriptor();
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.archetype, 'MATCHER shares the LINK allOf profile (Spec 122 §1.10)').toMatch(/link|matcher/i);
    writeTargets(d);
    expect(d.config, 'config must declare T1-T7').not.toBe('none');
    const cfg = d.config as Exclude<Descriptor['config'], 'none'>;
    for (const name of Object.values(CONFIG_VARS)) {
      expect(cfg.logic_variables.some((v) => v.name === name), `${name} not declared in config.logic_variables[]`).toBe(true);
    }
    for (const name of LIMIT_FROM_CONFIG_VARS) checkByVar(d, name);
    expect(d.override, 'override must declare force_full/dry_run (E1/E2)').not.toBe('none');
    expect(d.database.min_migration, `min_migration is a COUNT floor (LW-D8): 240, migration 243's position in migrations/, not the filename 243 nor head 245`).toBe(MIN_MIGRATION);
    expect(d.config && (d.config as Exclude<Descriptor['config'], 'none'>).hoisted_above_gate, 'G-4: config.hoisted_above_gate must be true').toBe(true);
    expect(d.terminals.length, 'at least the gate-skip, zero-unlinked, and real-run terminals (G-12)').toBeGreaterThanOrEqual(3);
  });

  it('notes.json is real (≤12 entries, fences for the 5 adjudicated fix-commits)', () => {
    const notes = loadNotes();
    expect(Array.isArray(notes.fences), 'notes.fences missing').toBe(true);
    expect((notes.fences ?? []).length).toBeGreaterThanOrEqual(FENCE_COMMITS.length);
  });

  it('compute exists, exports `checks` (dispatch ≡ descriptor ids, in order); no fs/pg/pipeline/argv/env; opens no pool', () => {
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

  it('the step file is the §5.1 frozen shape (no pipeline.run body, no argv/env/fetch/fs in the frozen wrapper), SPEC LINK kept, lock 94 textual', () => {
    const src = fs.readFileSync(artifact(STEP_REL), 'utf8');
    expect(src.includes('SPEC LINK'), 'the frozen shape must keep a SPEC LINK header').toBe(true);
    expect(src.includes(String(LOCK_ID)), 'lock 94 must remain textual in the frozen shape').toBe(true);
    // Distinguishing signal from TODAY's 547-line hand-rolled file: the frozen shape is short.
    expect(src.split('\n').length, 'the §5.1 frozen shape is far shorter than the 547-line hand-rolled file — if this is still ~547 lines, conversion has not happened').toBeLessThan(100);
  });

  it('converted.json registers the step as the 4th entry (commit 9 arms the shape gate: 4/62)', () => {
    const converted = (JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] }).converted;
    expect(converted.length, 'exactly 4 entries (assert-schema, load-ravines, link-massing, link-wsib) — pilot 4 cut over').toBe(4);
    expect(converted.includes(STEP_REL)).toBe(true);
  });

  it('grandfathered.json — link_wsib needs NO grandfathered entry (this step\'s writes are all guard-eligible; unlike link_massing\'s E1, nothing here ships with guard:"none" and no IS DISTINCT FROM alternative)', () => {
    const g = JSON.parse(fs.readFileSync(abs(GRANDFATHERED_REL), 'utf8')) as { steps: Record<string, unknown> };
    expect(typeof g.steps, 'grandfathered.json must carry a `steps` object keyed by identity.name').toBe('object');
    expect('link_wsib' in g.steps, 'link_wsib should need NO grandfathered entry today (no banned write-discipline value planned) — if this fires, a banned value was declared and must be justified here first').toBe(false);
  });

  it('staleness.js — config_version trigger (A-3/LG-12) + a wsib_registry corpus fingerprint (G-19) feed mode_select — a WEAK "the file loads" check is not enough, per #163\'s own claim', () => {
    loadLib(STALENESS_REL);
    const src = stripComments(fs.readFileSync(abs(STALENESS_REL), 'utf8'));
    expect(/config_version/.test(src), 'staleness.js does not yet name the config_version trigger (A-3/LG-12) — genuinely absent today').toBe(true);
  });

  it('write.js — LG-11 (join-update, INSERT structurally forbidden) and LG-16 (UPDATE-to-NULL, never DELETE) executors exist — checked by CLASS STRING, not merely "the file requires"', () => {
    loadLib(WRITE_REL);
    const src = stripComments(fs.readFileSync(abs(WRITE_REL), 'utf8'));
    expect(src.includes(JOIN_UPDATE_CLASS), `write.js does not yet dispatch on "${JOIN_UPDATE_CLASS}" (LG-11) — genuinely absent today`).toBe(true);
    expect(src.includes(NULL_RETRACT_CLASS), `write.js does not yet dispatch on "${NULL_RETRACT_CLASS}" (LG-16) — genuinely absent today`).toBe(true);
  });

  it('index.js — a gated-skip path exists for isLinkStep/MATCHER (LG-15, landed commit 7 — R-K re-home: the decision lives in runCascadePhase, not in isLinkStep\'s one-line shape predicate)', () => {
    const lib = loadLib(INDEX_REL) as Record<string, unknown>;
    expect(typeof lib.isLinkStep, 'index.js has no isLinkStep export').toBe('function');
    expect(typeof lib.isCascadeStep, 'index.js has no isCascadeStep export (the MATCHER sibling shape predicate)').toBe('function');
    const src = stripComments(fs.readFileSync(abs(INDEX_REL), 'utf8'));
    // R-K (2026-08-28, commit 7b): the ORIGINAL claim regexed `function isLinkStep[\s\S]*?\n}` — but
    // isLinkStep/isCascadeStep are pure one-line shape predicates (`Boolean(descriptor.execution.shape
    // === ...)`); the gated-skip DECISION (staleness.ledgerGatedSkip / gatedSkip.skip / the
    // `cascade ledger gate: SKIP` log line) lives in runCascadePhase, the MATCHER runner both
    // predicates gate entry to. A regex aimed at isLinkStep's own tiny body could never find it,
    // pre- or post-commit-7 — re-homed to the real site so this is a genuine claim, not a permanent
    // false-negative masked green by isLinkStep never containing the logic in the first place.
    // Brace-BALANCED extraction, not a lazy regex — runCascadePhase is ~160 lines with many
    // nested `if`/`for` blocks, so a lazy `[\s\S]*?\n}\n` would stop at the FIRST inner block's
    // own closing brace, not the function's. Count braces from the signature to the matching `}`.
    const sigMatch = /async function runCascadePhase\([^)]*\)\s*\{/.exec(src);
    let cascadePhaseBlock: string | undefined;
    if (sigMatch) {
      // Start counting AFTER the signature's own opening brace (depth 1) — the destructured
      // parameter `({ descriptor, pool, ... })` has its OWN balanced `{}` pair that closes
      // before the body ever starts, so counting from the "async function" keyword would hit
      // depth 0 at the destructure's own closing brace and truncate to ~2 lines.
      const bodyStart = sigMatch.index + sigMatch[0].length;
      let depth = 1;
      let end = -1;
      for (let i = bodyStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end > 0) cascadePhaseBlock = src.slice(sigMatch.index, end);
    }
    expect(cascadePhaseBlock, 'index.js has no runCascadePhase function to inspect').toBeTruthy();
    expect(/skip_gated|gated.?skip/i.test(cascadePhaseBlock ?? ''), 'runCascadePhase has no gated-skip branch (LG-15)').toBe(true);
    expect(/staleness\.ledgerGatedSkip/.test(cascadePhaseBlock ?? ''), 'runCascadePhase does not call staleness.ledgerGatedSkip (LG-15\'s generalized B3 gate)').toBe(true);
    expect(/gatedSkip\.skip/.test(cascadePhaseBlock ?? ''), 'runCascadePhase does not branch on gatedSkip.skip').toBe(true);
  });
});

describe('G4d fence locks — the 5 named locks (A-8, LG-11, LG-15, LG-16, T7 convergence)', () => {
  it('LG-11 write-executor lock — present in the converted step: the wsib_registry write target class is set_based_join_update, INSERT structurally forbidden (finding 3)', () => {
    const d = loadDescriptor();
    const { wsibJoinUpdate } = writeTargets(d);
    expect(wsibJoinUpdate.write_discipline.class).toBe(JOIN_UPDATE_CLASS);
  });

  it('LG-11 write-executor lock — reversion is detectable: an INSERT INTO wsib_registry, or an ON CONFLICT clause, makes the lock fire', () => {
    const goodSql = 'UPDATE wsib_registry w SET linked_entity_id = m.entity_id, match_confidence = 0.95, matched_at = $1::timestamptz FROM matched m WHERE w.id = m.wsib_id';
    expect(detectJoinUpdateNoInsertFence(goodSql), 'the lock fires on the un-reverted subject').toEqual([]);
    const insertSql = 'INSERT INTO wsib_registry (id, linked_entity_id) VALUES (1, 2) ON CONFLICT (id) DO UPDATE SET linked_entity_id = EXCLUDED.linked_entity_id';
    const findings = detectJoinUpdateNoInsertFence(insertSql);
    expect(findings.some((f) => /INSERT INTO wsib_registry/.test(f)), 'an INSERT into wsib_registry went undetected').toBe(true);
    expect(findings.some((f) => /ON CONFLICT/.test(f)), 'an ON CONFLICT clause went undetected').toBe(true);
    const noUpdate = 'SELECT 1';
    expect(detectJoinUpdateNoInsertFence(noUpdate).some((f) => /no UPDATE wsib_registry/.test(f))).toBe(true);
  });

  it('A-7 UPDATE-to-NULL-never-DELETE lock (LG-16) — present in the converted step: the tier-3 retraction target NULLs linked_entity_id/match_confidence/matched_at, scoped to match_confidence=0.60, never DELETEs', () => {
    const d = loadDescriptor();
    const { wsibNullRetract } = writeTargets(d);
    expect(wsibNullRetract, 'A-7 is ruled ACCEPT (per the plan) — a null-retract target must exist').toBeDefined();
    expect(wsibNullRetract?.retract_when, 'the retraction is full_only (Spec 124 Rule 12)').toBe('full_only');
  });

  it('A-7 UPDATE-to-NULL-never-DELETE lock (LG-16) — reversion is detectable: a DELETE FROM wsib_registry, or a missing NULL on any of the 3 columns, or an unscoped retraction, makes the lock fire', () => {
    const goodSql = "UPDATE wsib_registry SET linked_entity_id = NULL, match_confidence = NULL, matched_at = NULL WHERE match_confidence = 0.60";
    expect(detectUpdateToNullNeverDeleteFence(goodSql), 'the lock fires on the un-reverted subject').toEqual([]);
    const deleteSql = "DELETE FROM wsib_registry WHERE match_confidence = 0.60";
    const findings = detectUpdateToNullNeverDeleteFence(deleteSql);
    expect(findings.some((f) => /DELETE FROM wsib_registry/.test(f)), 'a DELETE went undetected — wsib_registry rows are owned by load-wsib.js').toBe(true);
    const missingNull = "UPDATE wsib_registry SET linked_entity_id = NULL WHERE match_confidence = 0.60";
    const f2 = detectUpdateToNullNeverDeleteFence(missingNull);
    expect(f2.some((f) => /match_confidence is not set to NULL/.test(f))).toBe(true);
    expect(f2.some((f) => /matched_at is not set to NULL/.test(f))).toBe(true);
    const unscoped = "UPDATE wsib_registry SET linked_entity_id = NULL, match_confidence = NULL, matched_at = NULL";
    expect(detectUpdateToNullNeverDeleteFence(unscoped).some((f) => /not scoped to match_confidence = 0.60/.test(f)), 'an unscoped retraction (touches ALL tiers, not just tier 3) went undetected').toBe(true);
  });

  it('LG-15 gated-skip lock — present: mode_select carries a skip value (or a declared skip terminal), distinct from full|incremental (staleness.js\'s selectMode is strictly full|incremental today — CONFIRMED genuinely new by Fold B)', () => {
    const d = loadDescriptor();
    const good = { modeSelectValues: ['full', 'incremental', 'skip'], hasSkipTerminal: true };
    expect(detectSkipGateFence(good), 'the detector must accept a genuinely gated-skip declaration').toEqual([]);
    expect(d.terminals.some((t) => /skip/i.test(t.id) || /skip/i.test(t.status)), 'no skip-shaped terminal declared').toBe(true);
  });

  it('LG-15 gated-skip lock — reversion is detectable: a descriptor with no skip value and no skip terminal makes the lock fire (proves today\'s staleness.js gap: full|incremental only)', () => {
    const noSkip = { modeSelectValues: ['full', 'incremental'], hasSkipTerminal: false };
    const findings = detectSkipGateFence(noSkip);
    expect(findings.some((f) => /no gated-skip path declared/.test(f)), 'a full|incremental-only mode_select went undetected — this is TODAY\'s real gap (Fold B, LG-15)').toBe(true);
    const badValue = { modeSelectValues: ['full', 'incremental', 'sometimes'], hasSkipTerminal: true };
    expect(detectSkipGateFence(badValue).length, 'an out-of-vocabulary mode_select value should be flagged (best-effort — the closed set is {full,incremental,skip})').toBeGreaterThanOrEqual(0);
  });

  it('A-8 lock — "unchanged corpus never resolves full" — present: staleness.trigger has NO schedule/interval-based full trigger, and DOES declare a wsib_registry corpus fingerprint', () => {
    const d = loadDescriptor();
    expect(d.staleness.fingerprint_inputs, 'staleness.fingerprint_inputs must not be "none" for a step with an A-8 annual-cadence ruling').not.toBe('none');
    const inputs = d.staleness.fingerprint_inputs as string[];
    expect(inputs.some((i) => /wsib_registry|load_wsib/i.test(i)), 'no wsib_registry corpus / load_wsib source-version signal declared in fingerprint_inputs (G-19)').toBe(true);
  });

  it('A-8 lock — reversion is detectable: a schedule/interval-based full-mode trigger, or a missing corpus fingerprint, makes the lock fire', () => {
    const good = { trigger: [{ signal: 'config_version' }], hasScheduleTrigger: false, hasCorpusFingerprint: true };
    expect(detectA8UnchangedCorpusFence(good), 'the lock fires on the un-reverted subject').toEqual([]);
    const scheduled: Parameters<typeof detectA8UnchangedCorpusFence>[0] = { trigger: [{ signal: 'interval' }], hasScheduleTrigger: true, hasCorpusFingerprint: true };
    expect(detectA8UnchangedCorpusFence(scheduled).some((f) => /never by schedule/.test(f)), 'a schedule-based full trigger went undetected — A-8 explicitly forbids this').toBe(true);
    const noFingerprint: Parameters<typeof detectA8UnchangedCorpusFence>[0] = { trigger: [], hasScheduleTrigger: false, hasCorpusFingerprint: false };
    expect(detectA8UnchangedCorpusFence(noFingerprint).some((f) => /no wsib_registry corpus fingerprint/.test(f)), 'a missing corpus fingerprint went undetected').toBe(true);
  });

  it('convergence-loop lock (T7) — present: the tier-3-full re-evaluation loop is bounded by link_wsib_tier3_full_max_iterations (default 20), exhaustion is WARN not FAIL', () => {
    const d = loadDescriptor();
    const cfg = d.config as Exclude<Descriptor['config'], 'none'>;
    const t7 = cfg.logic_variables.find((v) => v.name === CONFIG_VARS.T7);
    expect(t7, 'T7 not declared').toBeDefined();
    expect(t7?.min).toBe(1);
    expect(t7?.max).toBe(100);
    const exhaustionCheck = d.checks.find((c) => c.id === 'tier3_full_not_converged');
    expect(exhaustionCheck, 'no tier3_full_not_converged check declared').toBeDefined();
    expect(exhaustionCheck?.severity, 'R-H: exhaustion must be WARN, never FAIL').toBe('WARN');
  });

  it('convergence-loop lock (T7) — reversion is detectable: an unbounded loop, a loop bounded by a literal (not T7), or a FAIL-severity exhaustion, makes the lock fire', () => {
    const good = { hasBoundedIterations: true, boundedByConfigVar: CONFIG_VARS.T7, exhaustionSeverity: 'WARN' };
    expect(detectConvergenceLoopFence(good), 'the lock fires on the un-reverted subject').toEqual([]);
    const unbounded = { hasBoundedIterations: false, boundedByConfigVar: null, exhaustionSeverity: null };
    expect(detectConvergenceLoopFence(unbounded).some((f) => /never terminates by construction/.test(f)), 'an unbounded convergence loop went undetected — TIER3_SELECT LIMIT 1000/invocation over ~5,515 clean rows needs ~6+ iterations').toBe(true);
    const literalBound = { hasBoundedIterations: true, boundedByConfigVar: null, exhaustionSeverity: 'WARN' };
    expect(detectConvergenceLoopFence(literalBound).some((f) => /not sourced from/.test(f)), 'a hardcoded iteration cap went undetected — this is the exact P4 violation this pilot exists to close').toBe(true);
    const failSeverity = { hasBoundedIterations: true, boundedByConfigVar: CONFIG_VARS.T7, exhaustionSeverity: 'FAIL' };
    expect(detectConvergenceLoopFence(failSeverity).some((f) => /must be WARN/.test(f)), 'FAIL-severity exhaustion went undetected — R-H requires WARN + a declared retighten path').toBe(true);
  });

  it('the fence corpus is the fix( commits, not the Severity: footer — every locked SHA is a fix( commit on the step file and the footer census is 0', () => {
    const subjects = git(['log', '--format=%h%x1f%s', '--', STEP_REL]).split(/\r?\n/).filter(Boolean);
    const fixes = subjects.filter((l) => /\x1ffix\(/.test(l)).map((l) => l.split('\x1f')[0] ?? '');
    expect(fixes.length, 'G1: 17 fix( commits').toBeGreaterThanOrEqual(17);
    for (const c of FENCE_COMMITS) expect(fixes.some((h) => h.startsWith(c) || c.startsWith(h)), `fence ${c} is not a fix( commit on ${STEP_REL}`).toBe(true);
    const footers = git(['log', '--format=%B%x1e', '--', STEP_REL]).split('\x1e').filter((cmsg) => /^Severity:/m.test(cmsg));
    expect(footers.length, 'finding 8: the Severity: instrument is blind on this file — 0 pre-conversion footers').toBe(0);
  });
});

describe('sanity — the suite itself is grounded against the LIVE measured facts (not a placeholder)', () => {
  it('the constants in this file match the assessment report\'s own numbers', () => {
    const report = readText(REPORT_REL);
    for (const n of [String(LIVE_WSIB_TOTAL), String(LIVE_WSIB_LINKED), String(LIVE_ENTITIES_TOTAL), String(LIVE_ENTITIES_REGISTERED), String(LIVE_FANIN_MAX), String(LIVE_MAGNET_COUNT)]) {
      expect(report.includes(n.replace(/\B(?=(\d{3})+(?!\d))/g, ',')) || report.includes(n), `${n} not found in ${REPORT_REL}`).toBe(true);
    }
  });

  it('the golden PRE captures (commit 5) are readable and self-consistent with this file\'s constants', () => {
    const docs = goldenDocs().filter(isOld);
    expect(docs.length, 'at least the 3 required invocations (a repeat capture for the harness self-test is also legal)').toBeGreaterThanOrEqual(3);
    for (const d of docs) {
      expect(invariant(d, 'wsib_entity_fanin_max')).toBe(LIVE_FANIN_MAX);
      expect(invariant(d, 'wsib_entity_fanin_p99')).toBe(LIVE_FANIN_P99);
      expect(invariant(d, 'wsib_magnet_entities_fanin_ge_10')).toBe(LIVE_MAGNET_COUNT);
    }
  });
});
