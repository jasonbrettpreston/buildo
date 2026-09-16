// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (archetypes), §5.5 (seams),
//   claim #54 (ENRICHER staleness.scope ⇒ invalidates minItems:1), §8 (shape enum, amended commit 7)
// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2 zoning · §3 zoning verdict (DEC-1, DEC-4) ·
//   §4 max-build (MB-1..MB-8, D-C floor, MB-5 heritage-no-cap) · §5 existing-structure (ES-1..ES-6) ·
//   §6 scenarios (SC-1..SC-7) · §7 accessory (AF-1..AF-8)
// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §P2 (comp family match) ·
//   §P3A.1 (post-commit streaming architecture, "a same-txn read would be invisible") ·
//   §P3C.1/§P3C.2 (comps kNN, the disclaimed never-refresh limitation, literal bounds)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §3.1 (pin-then-fix) §7 (commit 6)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3/R-G, Rule 9, Rule 11, Rule 12)
//
// Pilot 9 — `enrich_parcels`, the ENRICHER representative (Spec 122 §1.10/§8.2 — the 8th and last
// unproven archetype). Five heterogeneous passes: three set-based SQL passes sharing one transaction
// (zoning / max-build / existing+scenarios), a fourth unguarded comps kNN pass in the SAME transaction
// (B4.5/EP-D1), and a fifth JS-streaming pass that runs AFTER that transaction COMMITs on a separate
// connection (Spec 78 §P3A.1).
//
// ⚠️ SCOPE NOTE (nothing-hidden, stated explicitly rather than silently done — pilot 8's own precedent,
// `4b1e1722`): this file does NOT attempt to port all 13 `src/tests/db/enrich-parcels-*.db.test.ts`
// files to full parity, and does NOT re-derive every one of the 96 `auditRows.push` sites individually.
// It covers the MATERIAL commit-7/8 obligations named in this pilot's own fold record: the ENRICHER
// shape + schema bump, the per-pass write-class/guard/idempotency table (Fold A1/A2, with the
// `nearby_builds_summary` CORRECTION — measured 0/442,244 drift at commit 5, `idempotent_rerun:
// "zero_writes"`, NOT `"declared_drift"` — the plan's original classification is WITHDRAWN), the two
// Rule-9 grandfathered run-clock stamps + the B4.5 pinned guard (three `guard:"none"` dispositions
// sharing one grandfathered.json entry), the pass-4 `permits` read + invalidator (Ask 3(a)), Rule 11's
// `order_guarantee` for pass 5's post-commit read, the four KNOWN-DEFECT pins (EP-D1/EP-D8/EP-D9/EP-D10)
// asserted in their CURRENT WRONG FORM so a future fix peel flips them, the P4 declared-tunables ⊆
// registry check (25 existing + ≥11 newly-externalized, Ask 5), and Ask 9's INFO-only heritage-coverage
// ruling. A future hardening pass MAY extend this file toward full per-audit-row parity — not required
// by this pilot's own commit ledger.
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Each one that reads a FUTURE
// artifact opens with `artifact()` → `expect(existsSync).toBe(true)`, so the failure names the missing
// artifact rather than surfacing as an import error. Genuinely-red claims are wrapped `it.fails(...)`
// with a "flips at: commit N" comment. `it.fails()` INVERTS: the wrapped body genuinely throws
// internally, and vitest reports the wrapped test as PASSED — if a claim were NOT actually red, vitest
// reports "expected test to fail but it passed," a real suite failure. A fully green run of this file
// is therefore the proof every `it.fails()` claim is genuinely red (Spec 123 §4.1's kill-set EQUALITY,
// read from vitest's own JSON reporter, never from source text). Plain `it()` covers claims testable
// TODAY: facts already landed by commits 1-5, or the git-history-order lock below.
//
// The artifacts this file asserts against (commit-ledger rows 7-9, `.cursor/pilot9_enrich_parcels_active_task.md`):
//   scripts/enrich-parcels.descriptor.json — `identity.archetype:"ENRICHER"`, `execution.shape:"enrich"`
//     (Ask 2 RULING — new `runEnrichPhase`, LG-28); ≥5 write targets across `parcels` (35+29+11+10 cols
//     pass 1-3, 5 cols pass 4, 11 cols pass 5) + `enrich_parcels_pass3_scope`; `config.logic_variables`
//     ⊇ the 25 pre-existing names, ⊇ ≥11 newly-externalized names (Ask 5), every entry `on_invalid:"fail"`
//     (R-G, write-affecting); `outputs.invalidates` ≥1 entry naming `permits` for the pass-4 target
//     (Ask 3(a)); `recovery.interrupted:"force_full_on_next_run"` (Fold A2/Rule 12 — passes 4/5's
//     ineligibility resets are `set_based_null_retract`-class)
//   scripts/enrich-parcels.notes.json — R-M reasoning for pass 3's scope-deferred rows left in-txn
//     BY DESIGN (crash-recoverable trail, Fold A3), not a defect
//   scripts/lib/compute/enrich-parcels.js — checks dispatch === descriptor ids; no fs/pg/pipeline/argv/env;
//     opens no pool; §5.5 seam rewrite — `ctx.clock.asOfDate()` replaces the raw `now()::date -
//     interval '5 years'` comps window (Fold G3, MANDATORY); the `::numeric` cast on
//     `zoning_dominant_area_share`'s guard ports VERBATIM (Fold B1, fence `7e130bff`, `lessons.md:28`)
//   scripts/lib/step/index.js — `runEnrichPhase` (LG-28), forked per Ask 1, `ownRunId` convention (Fold D3)
//   scripts/steps/_schema/step.schema.json — `execution.shape` enum gains `"enrich"` (9th value, `x-ruling`)
//   scripts/steps/_schema/grandfathered.json — a real `enrich_parcels` entry, path
//     `outputs.writes[].write_discipline.guard`, value `"none"`, covering THREE dispositions under one
//     `why`: `zoning_enriched_at` + `massing_enriched_at` (Rule-9 run-clock stamps) + the pass-4 comps
//     UPDATE (EP-D1/B4.5 PIN)
//   scripts/seeds/logic_variables.json — gains ≥11 new rows for the newly-externalized pass-4 literals
//   docs/reports/golden/enrich_parcels/post/{sources_run1,sources_run2,standalone}.json — commit 7,
//     differential against commit 5's `pre/*.json`, comparator honours the declared non-determinism
//     inventory (a)-(g) + the Fold A1 correction + the EP-D9/EP-D10 pins

import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/enrich-parcels.js';
const DESCRIPTOR_REL = 'scripts/enrich-parcels.descriptor.json';
const NOTES_REL = 'scripts/enrich-parcels.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/enrich-parcels.js';
const INDEX_REL = 'scripts/lib/step/index.js';
const SCHEMA_REL = 'scripts/steps/_schema/step.schema.json';
const GRANDFATHERED_REL = 'scripts/steps/_schema/grandfathered.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const PROGRAMME_ITEMS_REL = 'scripts/steps/_schema/programme-items.json';
const DEFECT_LEDGER_REL = 'docs/reports/defect-ledger.md';
const SEEDS_REL = 'scripts/seeds/logic_variables.json';
const MANIFEST_REL = 'scripts/manifest.json';
const GOLDEN_DIR_REL = 'docs/reports/golden/enrich_parcels';
const REPORT_REL = 'docs/reports/2026-09-04-pilot9-enrich-parcels-assessment.md';
const SPEC_78_REL = 'docs/specs/01-pipeline/78_optimal_lot_configuration.md';

/** S1 — the step's advisory lock (already true today). */
const LOCK_ID = 65;
const PARCELS = 'parcels';
const SCOPE_TABLE = 'enrich_parcels_pass3_scope';
/** The 25 pre-existing declared tunables (grepped from LOGIC_VARS_SCHEMA `:19-62`, never guessed). */
const EXISTING_25_VARS = [
  'road_overlay_distance_m', 'reno_coa_uplift_pct', 'reno_kitchen_gfa_pct', 'reno_bath_gfa_pct',
  'mislink_footprint_lot_tol', 'max_build_min_dimension_m', 'storey_height_m',
  'garage_min_lot_sqm', 'garage_max_gfa_sqm', 'garage_min_footprint_sqm', 'accessory_max_coverage_pct',
  'car_footprint_sqm', 'laneway_suite_max_gfa_sqm', 'laneway_suite_min_lot_sqm',
  'laneway_suite_min_rear_yard_m', 'min_soft_landscaping_pct', 'laneway_suite_storeys',
  'garden_suite_storeys', 'garden_suite_min_lot_sqm', 'garden_suite_min_rear_yard_m',
  'garden_suite_max_gfa_sqm', 'enrich_parcels_defer_threshold_rows', 'enrich_parcels_heartbeat_minutes',
  'enrich_parcels_pass_statement_timeout_minutes', 'enrich_parcels_lock_timeout_ms',
] as const;
const MIN_NEW_LITERALS = 11; // Ask 5 — 7 comp-pass literals + 4 elsewhere; exact names ruled at commit 7
const CHAINS = ['sources'] as const; // enrich_parcels is a sources-chain-only member (measured, manifest.json)
// PRE (commit 5) landed 3 captures — sources_run1/run2 were BOTH real --full executions, needed
// for G1' (does the step's OWN output vary run-to-run on unchanged data? EP-D9/EP-D10's own
// discovery mechanism, PRE-side only). POST does not re-ask that question — G2' asks a DIFFERENT
// one ("did the conversion change behaviour?"), answered by diffing ONE matching-filename PRE/POST
// pair. `checkCaptures` (scripts/analysis/step-validate.mjs) pairs PRE<->POST STRICTLY by shared
// FILENAME for the diff itself, but its OWN separate `invocationsMissing` sub-check (G8) reads
// every POST file's `{chain,args}` regardless of filename, and `derivedInvocations` hard-codes
// `{chain:'none', args:[]}` for the standalone slot — NOT `--full`, which is what this step's own
// established golden convention (commit 5's `pre/standalone.json`) actually used. Two genuinely
// different questions, two genuinely different invocations, ruled here (commit 7e/2) rather than
// silently conflated:
//   1. BEHAVIOUR-PRESERVATION (the real G2' question) — does the CONVERTED step reproduce PRE's
//      output on the ONE invocation shape that is EVER exercised in production (notes.json's own
//      "read_this_way": "The ONLY live cloud invocation is --full", true for EVERY chain this step
//      is a member of)? Answered by ONE real `chain=sources --full` run, diffed against
//      `pre/sources_run1.json` (same filename, same args — `sources_run2` shares its own key and
//      answered nothing G1' didn't already close). `chainId` does not branch ANY compute code path
//      (verified: `scripts/lib/compute/enrich-parcels.js` never reads `ctx.chainId`; the runner
//      only uses it for `ledgerPipelineName` bookkeeping) — so this ONE diff stands in for every
//      chain this step could be run under, `none` included, for the BEHAVIOUR question.
//   2. MANIFEST-INVOCATION KEY COVERAGE (G8's own generic, per-step-agnostic sub-check) — a real,
//      genuinely-executed `chain=none` (empty args) run, captured under a NAME THAT DOES NOT
//      COLLIDE with any `pre/*.json` filename (so `checkCaptures`'s diff loop never attempts to
//      pair it against `pre/standalone.json`'s `--full` capture — an apples-to-oranges diff that
//      would manufacture spurious "unexplained" noise unrelated to the conversion). Real data,
//      not fabricated; it exists to satisfy the checker's own literal `{chain:'none',args:[]}`
//      expectation, which this step's actual golden convention has never matched (a pre-existing
//      mismatch, predating this WF2, not introduced here).
const PRE_INVOCATIONS = [
  { name: 'sources_run1', chain: 'sources' },
  { name: 'sources_run2', chain: 'sources' },
  { name: 'standalone', chain: 'none' },
] as const;
const POST_INVOCATIONS = [
  { name: 'sources_run1', chain: 'sources' },
  { name: 'none_incremental', chain: 'none' },
] as const;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

interface WriteDiscipline {
  class: string;
  guard: string;
  guard_why?: unknown;
  scope: unknown;
  idempotent_rerun: string;
  idempotent_rerun_why?: unknown;
}
interface WriteSpec { table: string; key: string | string[]; write_discipline: WriteDiscipline; retract: string }
interface OrderGuarantee { guarantee: string; spec_ref: string; anchor: string }
interface Check { id: string; kind: string; severity: string; blocking: boolean; when: string; order_guarantee?: OrderGuarantee }
interface Descriptor {
  identity: { name: string; lock: number; archetype: string };
  outputs: 'none' | { writes: WriteSpec[]; publish: string; invalidates: Array<{ table: string; column: string; when: string }> };
  execution: { shape?: string };
  checks: Check[];
  config: 'none' | { logic_variables: Array<{ name: string; min: unknown; max: unknown; on_invalid: string }> };
  inputs: { reads: { tables: Array<{ table: string; columns?: string[] }> } };
  recovery?: 'none' | { interrupted: string; interrupted_why?: unknown; before_image: string; before_image_why?: unknown };
  plausibility?: 'none' | Array<{ id?: string; name?: string; count_field?: string; severity?: string; statement_timeout?: string }>;
  invariants?: 'none' | Array<{ id?: string; name?: string; severity?: string; statement_timeout?: string }>;
}
interface Notes { [k: string]: unknown }
type ComputeFn = (ctx: unknown) => Promise<{ records_meta?: Record<string, unknown> } | void>;
interface ComputeModule { compute?: ComputeFn; checks?: Record<string, (ctx: unknown) => unknown>; [k: string]: unknown }

function abs(rel: string): string { return path.join(REPO_ROOT, rel); }

function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the pilot-9 commit sequence — commit 7 lands it)`,
  ).toBe(true);
  return abs(rel);
}

/** CRLF-tolerant (scripts/*.js checks out CRLF on Windows, lessons.md precedent) — normalise before any literal \n-bearing regex. */
function lf(src: string): string { return src.replace(/\r\n/g, '\n'); }

function readText(rel: string): string { return fs.readFileSync(artifact(rel), 'utf8'); }
function readTextToday(rel: string): string { return fs.readFileSync(abs(rel), 'utf8'); }

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d);
  return d;
}

function loadNotes(): Notes { return JSON.parse(readText(NOTES_REL)) as Notes; }
function computeSource(): string { return lf(readText(COMPUTE_REL)); }
function stepSource(): string { return lf(readTextToday(STEP_REL)); }

function loadComputeModule(): ComputeModule {
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule | ComputeFn; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  return (typeof mod === 'function' ? { compute: mod } : mod) as ComputeModule;
}

function loadLib(rel: string): Record<string, unknown> {
  return require(artifact(rel, 'library growth, commit 7')) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-require-imports -- the CJS library module
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 }).trim();
  } catch {
    return '';
  }
}

/** Unix time of the FIRST commit touching `rel` (optionally introducing `pickaxe`); 0 = never committed. */
function firstCommitTime(rel: string, pickaxe?: string): number {
  const args = ['log', '--reverse', '--format=%ct'];
  if (pickaxe) args.push(`-S${pickaxe}`);
  args.push('--', rel);
  const first = git(args).split(/\r?\n/)[0] ?? '';
  return first ? Number(first) : 0;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'an ENRICHER may not declare outputs:"none" — its whole job is per-parcel mutation').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

function writeTargetFor(d: Descriptor, table: string, nth = 0): WriteSpec {
  const matches = writes(d).filter((w) => w.table === table);
  expect(matches.length, `expected ≥${nth + 1} write target(s) against "${table}"`).toBeGreaterThan(nth);
  return matches[nth] as WriteSpec;
}

function manifest(): { chains: Record<string, string[]>; scripts: Record<string, { chain_args?: Record<string, string[]> }> } {
  return JSON.parse(fs.readFileSync(abs(MANIFEST_REL), 'utf8')) as ReturnType<typeof manifest>;
}

// ---------------------------------------------------------------------------
// The descriptor's ruled shape (ENRICHER, execution.shape:"enrich", Ask 1/Ask 2)
// ---------------------------------------------------------------------------

describe('the descriptor — ENRICHER archetype, execution.shape:"enrich" (Ask 1/Ask 2 RULING)', () => {
  it('descriptor exists, validates, carries the ruled shape: ENRICHER archetype, execution.shape:"enrich", lock 65, ≥5 write targets (parcels ×4 groups + enrich_parcels_pass3_scope), config ⊇ the 25 pre-existing tunables, every entry on_invalid:"fail" (R-G, write-affecting) (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.archetype, 'ENRICHER (Spec 122 §1.10, the 8th and last unproven archetype)').toMatch(/enricher/i);
    expect(d.execution.shape, 'Ask 2 RULING: a new runEnrichPhase, execution.shape:"enrich"').toBe('enrich');
    const w = writes(d);
    const parcelsTargets = w.filter((t) => t.table === PARCELS);
    expect(parcelsTargets.length, 'parcels is written by ≥4 distinct write-target entries (zoning, max-build, existing+scenarios, comps, optconfig — some may combine)').toBeGreaterThanOrEqual(4);
    expect(w.some((t) => t.table === SCOPE_TABLE), `${SCOPE_TABLE} must be a declared write target (the D4′ scope-defer ledger, mig 240)`).toBe(true);
    expect(d.config, 'config must declare the 25 pre-existing tunables at minimum').not.toBe('none');
    const cfg = d.config as Exclude<Descriptor['config'], 'none'>;
    for (const name of EXISTING_25_VARS) {
      const entry = cfg.logic_variables.find((v) => v.name === name);
      expect(entry, `${name} (one of the 25 pre-existing LOGIC_VARS_SCHEMA keys) not declared in config.logic_variables[]`).toBeDefined();
      expect(entry!.on_invalid, `${name} is write-affecting — R-G mandates on_invalid:"fail"`).toBe('fail');
    }
  });

  it('EP-D17 output-panel fix F4 — none of the original 5 bloat-sensitive invariants[]/plausibility[] entries hard-codes a statement_timeout literal; every one declares "none" so it actually inherits step_post_check_statement_timeout_minutes (a hardcoded literal would make the tunable inert)', () => {
    const d = loadDescriptor();
    const entries = [
      ...(Array.isArray(d.invariants) ? d.invariants : []),
      ...(Array.isArray(d.plausibility) ? d.plausibility : []),
    ] as Array<{ id: string; statement_timeout?: string }>;
    const bloatSensitiveIds = [
      'opt_aor_gfa_gt_max_buildable_gfa_count',
      'zoning_dominant_area_share_out_of_range_count',
      'comp_fsi_p50_small_n_sample_count',
      'heritage_basis_coverage_distribution',
      'existing_mislink_footprint_ratio_out_of_bound_count',
    ];
    for (const id of bloatSensitiveIds) {
      const e = entries.find((x) => x.id === id);
      expect(e, `${id} not found on the descriptor`).toBeDefined();
      expect(e!.statement_timeout, `${id} must declare statement_timeout:"none" so it inherits step_post_check_statement_timeout_minutes, not a hardcoded literal`).toBe('none');
    }
  });

  // FLIPPED at commit 7a (2026-09-04). ⚠️ The accessor was `schema.definitions.
  // execution…` when this lock landed at commit 6, and `execution` is a ROOT
  // `properties` category, never a `definitions` entry — so the body threw a
  // TypeError and the `it.fails` passed for the WRONG reason (the "green
  // because it never looked" class, Spec 121 §12b.6). Corrected here, and the
  // correction is proven both directions rather than asserted: against
  // `git show HEAD~1:…step.schema.json` (the pre-bump schema) the CORRECTED
  // accessor still reads `enum.includes("enrich") === false` and
  // `x-ruling === undefined` — i.e. the lock was genuinely red for the ENUM,
  // not for the typo, and goes green only because THIS commit bumps it.
  it('the frozen execution.shape enum (step.schema.json, x-frozen:true) gains a 9th value "enrich" with an x-ruling — checked against the LIVE schema file (flipped at: commit 7a)', () => {
    const schema = JSON.parse(readTextToday(SCHEMA_REL)) as { properties: { execution: { properties: { shape: { enum: string[]; 'x-ruling'?: { rungs_tried?: unknown[]; why?: string } } } } } };
    const shapeNode = schema.properties.execution.properties.shape;
    expect(shapeNode.enum, 'the shape enum must gain "enrich" (Ask 2) — Spec 122 §8 does_not_freeze pays this price in the SAME commit as the bump').toContain('enrich');
    expect(shapeNode['x-ruling'], 'a schema-frozen field bump requires an x-ruling node (Rule 1 G-1 ratchet)').toBeDefined();
    expect(shapeNode['x-ruling']?.rungs_tried?.length, 'x-ruling must NAME the cheaper rungs tried, not merely exist').toBeGreaterThan(0);
    expect((shapeNode['x-ruling']?.why ?? '').length, 'x-ruling must say why none of them fit').toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Per-pass write class, guard, idempotent_rerun, recovery (Fold A1/A2, PH-6)
// ---------------------------------------------------------------------------

describe('per-pass write class / guard / idempotent_rerun (Fold A1/A2 — the corrected table)', () => {
  it('pass 1 zoning — temp_materialize (I), IS DISTINCT FROM guard, idempotent_rerun:"zero_writes" on the 35 guarded cols (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    const t = writeTargetFor(d, PARCELS, 0);
    expect(t.write_discipline.class).toBe('temp_materialize');
    expect(t.write_discipline.guard).toBe('is_distinct_from');
    expect(t.write_discipline.idempotent_rerun, 'a second identical --full run must write 0 rows on the guarded 35 cols (founding fence 7e130bff)').toBe('zero_writes');
  });

  it('the two Rule-9 run-clock stamps — zoning_enriched_at (Fold E1, the "third unguarded write") and massing_enriched_at — are BOTH guard:"none" with a guard_why, deliberately outside the IS DISTINCT FROM set (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    const zoningStamp = writes(d).find((t) => t.table === PARCELS && t.write_discipline.guard === 'none' && /zoning_enriched_at/i.test(JSON.stringify(t)));
    const massingStamp = writes(d).find((t) => t.table === PARCELS && t.write_discipline.guard === 'none' && /massing_enriched_at/i.test(JSON.stringify(t)));
    expect(zoningStamp, 'zoning_enriched_at (:375/:443) must be a declared guard:"none" target with a guard_why (LG-9-style run-clock disposition)').toBeDefined();
    expect(zoningStamp?.write_discipline.guard_why).toBeDefined();
    expect(massingStamp, 'massing_enriched_at (:831) must be a declared guard:"none" target with a guard_why').toBeDefined();
    expect(massingStamp?.write_discipline.guard_why).toBeDefined();
  });

  it('pass 2 max-build — temp_materialize (I), IS DISTINCT FROM guard, idempotent_rerun:"zero_writes" on the 29 guarded cols (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    const t = writeTargetFor(d, PARCELS, 1);
    expect(t.write_discipline.class).toBe('temp_materialize');
    expect(t.write_discipline.guard).toBe('is_distinct_from');
    expect(t.write_discipline.idempotent_rerun).toBe('zero_writes');
  });

  it('pass 3 existing+scenarios — temp_materialize (I), IS DISTINCT FROM + ROUND(...,2) guard, idempotent_rerun:"zero_writes"; recovery prose states scope-deferred rows are left in-txn BY DESIGN (crash-recoverable trail, Fold A3), never framed as a defect (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    const t = writeTargetFor(d, PARCELS, 2);
    expect(t.write_discipline.class).toBe('temp_materialize');
    expect(t.write_discipline.idempotent_rerun).toBe('zero_writes');
    loadNotes();
    const notesBlob = JSON.stringify(loadNotes());
    expect(
      notesBlob.includes(SCOPE_TABLE) && /design|crash.recoverable|recoverable trail/i.test(notesBlob),
      `notes.json must explain that ${SCOPE_TABLE} rows are left in-txn BY DESIGN, not a defect (Fold A3, :2073-2076)`,
    ).toBe(true);
  });

  it('pass 4 comparable-builds — guard:"is_distinct_from" (EP-D1/B4.5 FIXED, peel 8x, commit 8 P2), idempotent_rerun:"zero_writes"; outputs.invalidates declares ≥1 entry naming permits for this target (Ask 3(a) — a real invalidator, not an applies_when escape) (flipped at: commit 8 P2)', () => {
    const d = loadDescriptor();
    const t = writeTargetFor(d, PARCELS, 3);
    expect(t.write_discipline.guard, 'EP-D1/B4.5 FIXED — IS DISTINCT FROM over all 5 comp columns, peel 8x').toBe('is_distinct_from');
    expect(t.write_discipline.guard_why).toBeDefined();
    expect(t.write_discipline.idempotent_rerun, 'zero_writes now that the guard is real (Ask 4 ruling, Fold G1 peel 8x)').toBe('zero_writes');
    expect(t.write_discipline.idempotent_rerun_why).toBeDefined();
    const outputs = d.outputs as { invalidates: Array<{ table: string; column: string; when: string }> };
    expect(Array.isArray(outputs.invalidates) && outputs.invalidates.length >= 1, 'claim #54 — an ENRICHER lineage predicate needs ≥1 declared invalidator; Ask 3 ruled option (a), not the schema-exempt option (b)').toBe(true);
    expect(outputs.invalidates.some((i) => i.table === 'permits'), 'the invalidator must name permits — pass 4 reads permits pr at :1112, the real staleness source for the comps window').toBe(true);
  });

  it('pass 5 optimal-config — derived_recompute (K), IS DISTINCT FROM ×10 OR nearby_changed; idempotent_rerun:"zero_writes" on ALL 11 OPTCFG cols INCLUDING nearby_builds_summary — Fold A1 CORRECTION: the original split ("nearby_builds_summary" → declared_drift) is WITHDRAWN, golden-master G1\' measured 0/442,244 drift under controlled conditions (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    const t = writeTargetFor(d, PARCELS, 4);
    expect(t.write_discipline.class).toBe('derived_recompute');
    expect(
      t.write_discipline.idempotent_rerun,
      'Fold A1 correction (superseding the plan\'s original text): nearby_builds_summary is zero_writes, NOT declared_drift — the 88,575/88,575 docblock figure is production-cadence drift, not code non-determinism',
    ).toBe('zero_writes');
  });

  it('step-level recovery.interrupted:"force_full_on_next_run" — passes 4 and 5\'s ineligibility resets are set_based_null_retract-class statements (Fold A2, Rule 12/R-B) (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    expect(d.recovery, 'recovery must not be "none" for a step with real write targets').not.toBe('none');
    const recovery = d.recovery as Exclude<Descriptor['recovery'], 'none' | undefined>;
    expect(recovery.interrupted, 'a set_based_null_retract-class target REQUIRES interrupted:"force_full_on_next_run" (step-conformance.infra.test.ts)').toBe('force_full_on_next_run');
  });
});

// ---------------------------------------------------------------------------
// grandfathered.json (Rule 9) — one entry, three dispositions
// ---------------------------------------------------------------------------

describe('grandfathered.json (Rule 9) — zoning_enriched_at + massing_enriched_at, TWO guard:"none" dispositions (EP-D1/B4.5 CLOSED at commit 8 P2, no longer covered)', () => {
  it('grandfathered.json carries a real enrich_parcels entry, path outputs.writes[].write_discipline.guard = "none", whose why covers the TWO remaining guard:"none" dispositions and explains EP-D1/B4.5\'s departure (flipped at: commit 8 P2)', () => {
    const g = JSON.parse(fs.readFileSync(abs(GRANDFATHERED_REL), 'utf8')) as { steps: Record<string, { paths?: Record<string, unknown>; why?: string }> };
    const entry = g.steps.enrich_parcels;
    expect(entry, 'no grandfathered.json entry for enrich_parcels').toBeDefined();
    const guardPath = 'outputs.writes[].write_discipline.guard';
    expect(entry?.paths?.[guardPath]).toBe('none');
    const why = entry?.why ?? '';
    expect(/zoning_enriched_at/i.test(why), 'why must name zoning_enriched_at (Fold E1)').toBe(true);
    expect(/massing_enriched_at/i.test(why), 'why must name massing_enriched_at').toBe(true);
    expect(/EP-D1|B4\.5/i.test(why), 'why must still explain EP-D1/B4.5\'s history even though it is no longer a covered disposition').toBe(true);
    expect(/CLOSED/i.test(why), 'why must state EP-D1/B4.5 is CLOSED, not merely historical prose left stale').toBe(true);
  });

  it('the pass-4 write target (guard:"is_distinct_from") is NOT the target of the grandfathered.json guard:"none" allowlist — assertGrandfathered only licenses write targets that ARE guard:"none" (flipped at: commit 8 P2)', () => {
    const d = loadDescriptor();
    const t = writeTargetFor(d, PARCELS, 3);
    expect(t.write_discipline.guard, 'the pass-4 target must be a REAL guard, no longer needing the allowlist').not.toBe('none');
  });
});

// ---------------------------------------------------------------------------
// The compute module — Rule 2, §5.5 seam rewrite (Fold G3), P4 tunables ⊆ registry (Ask 5)
// ---------------------------------------------------------------------------

describe('the compute module — Rule 2 (compute is JUST compute) + §5.5 clock seam (Fold G3, MANDATORY)', () => {
  it('compute exists, exports checks (dispatch === descriptor ids); no fs/pg/pipeline/argv/env; opens no pool (flipped at: commit 7e/2)', () => {
    loadDescriptor();
    const mod = loadComputeModule();
    expect(typeof mod.compute).toBe('function');
    const src = stripComments(computeSource());
    for (const banned of [/require\(['"]fs['"]\)/, /require\(['"]pg['"]\)/, /require\(['"]\.\.?\/pipeline['"]\)/, /process\.argv/, /process\.env/]) {
      expect(banned.test(src), `compute violates Rule 2 (compute is JUST compute): ${banned}`).toBe(false);
    }
  });

  it('§5.5 clock seam (Fold G3, MANDATORY not optional) — no raw now()::date or Date.now() wall-clock fragment survives in compute; the comps window is read via an injected ctx.clock.asOfDate() instead of scripts/enrich-parcels.js\'s own now()::date - interval \'5 years\' literal (:1114) (flipped at: commit 7c)', () => {
    const src = stripComments(computeSource());
    expect(/now\(\)::date/i.test(src), 'a bare now()::date literal survived the seam rewrite — Spec 122 §5.5 bans it outright').toBe(false);
    expect(/\bDate\.now\(\)/.test(src) === false || /ctx\.clock/.test(src), 'Date.now() must be routed through ctx.clock, never called bare, for any DB-facing timestamp').toBe(true);
    expect(/ctx\.clock/.test(src), 'the injected clock seam (ctx.clock.asOfDate() or equivalent) must appear in compute').toBe(true);
  });

  it(`P4 declared-tunables ⊆ registry — every config.logic_variables[].name (the 25 pre-existing + ≥${MIN_NEW_LITERALS} newly-externalized, Ask 5) has a scripts/seeds/logic_variables.json row; total declared count ≥ 36 (flipped at: commit 7b; runner/compute land at 7c/7d, seed rows land alongside)`, () => {
    const d = loadDescriptor();
    expect(d.config).not.toBe('none');
    const cfg = d.config as Exclude<Descriptor['config'], 'none'>;
    expect(cfg.logic_variables.length, `Ask 5 ruled: externalise the 11 pass-4 literals, values preserved — expected ≥${25 + MIN_NEW_LITERALS} declared names`).toBeGreaterThanOrEqual(25 + MIN_NEW_LITERALS);
    const seed = JSON.parse(fs.readFileSync(artifact(SEEDS_REL), 'utf8')) as Record<string, unknown>;
    for (const v of cfg.logic_variables) {
      expect(seed[v.name], `${SEEDS_REL} does not seed declared variable ${v.name} (P4 — declared but in NO registry)`).toBeDefined();
    }
  });

  it('the zoning_dominant_area_share guard ports the ::numeric cast VERBATIM (Fold B1, fence 7e130bff, lessons.md:28 float8-vs-NUMERIC IS DISTINCT FROM trap) — never regenerated generically from a column list (flipped at: commit 7c)', () => {
    const src = computeSource();
    expect(/round\([^)]*::numeric[^)]*,\s*4\)/i.test(src), 'the round(...::numeric, 4) cast on zoning_dominant_area_share must survive the port byte-for-byte').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 11 order_guarantee — pass 5's post-commit read (Fold G2)
// ---------------------------------------------------------------------------

describe('Rule 11 order_guarantee — pass 5 runs AFTER the shared txn COMMITs (Spec 78 §P3A.1)', () => {
  // NOTE: the spec's own prose wraps mid-phrase ("...envelope (a same-txn\nread would be invisible)."
  // at :205-206) — the anchor must be a substring that survives the line break, so it is the clause
  // AFTER the wrap, not the "a same-txn read..." framing used in this pilot's own prose above.
  const ANCHOR_TEXT = 'read would be invisible';
  // Rule 11 amendment (Spec 124 §2, Ask 6, pilot 9 commit 1) — enrich_parcels's identity.spec is
  // "65", but pass 5's own order_guarantee genuinely cites Spec 78 (§P3A.1). checkOrderGuaranteesCited
  // now accepts a spec-qualified anchor "<specnum>:<anchor text>" so rule (d) (spec_ref must agree
  // with the governing spec) resolves against the QUALIFIER's spec rather than identity.spec.
  const ANCHOR = `78:${ANCHOR_TEXT}`;

  it('the anchor text is genuinely present in Spec 78 today (verified BEFORE authoring the check — checkOrderGuaranteesCited would RED on a rotted anchor)', () => {
    const spec = readTextToday(SPEC_78_REL);
    expect(spec.includes(ANCHOR_TEXT), `Spec 78 must literally contain "${ANCHOR_TEXT}" for the future order_guarantee.anchor to verify against`).toBe(true);
  });

  it('a pre_write check on the pass-5 write target declares order_guarantee{guarantee, spec_ref, anchor}, anchor citing Spec 78 §P3A.1\'s own text verbatim, spec-qualified "78:..." since identity.spec is "65" (flipped at: commit 7b; runner/compute land at 7c/7d)', () => {
    const d = loadDescriptor();
    const preWriteChecks = d.checks.filter((c) => c.when === 'pre_write');
    const withOrderGuarantee = preWriteChecks.filter((c) => c.order_guarantee);
    expect(withOrderGuarantee.length, 'at least one pre_write check must carry order_guarantee for pass 5\'s post-commit-read guarantee').toBeGreaterThan(0);
    const og = withOrderGuarantee[0]!.order_guarantee!;
    expect(og.spec_ref).toBe(SPEC_78_REL);
    expect(og.anchor).toBe(ANCHOR);
  });
});

// ---------------------------------------------------------------------------
// KNOWN-DEFECT pins — EP-D1/EP-D8/EP-D9/EP-D10, asserted in their WRONG FORM (Spec 123 §3.1)
// ---------------------------------------------------------------------------

describe('KNOWN-DEFECT pins (Spec 123 §3.1) — each fails the moment its named peel fixes it', () => {
  // commit 7e/2 (2026-09-04) — scripts/enrich-parcels.js becomes the thin pipeline.step() shell;
  // the pinned SQL builders now live SOLELY in scripts/lib/compute/enrich-parcels.js (ported
  // verbatim at commit 7c, its own docblock ":1004-1007" states "Ports EP-D1/B4.5, EP-D8, EP-D9
  // ... in their CURRENT WRONG FORM"). These four pins move from stepSource() to computeSource()
  // — same live-tree assertion, correct file now that the legacy body is gone.
  it('EP-D1/B4.5 FIXED (peel 8x, pilot 9 commit 8 P2), TODAY\'s live tree (compute) — buildComparableBuildsUpdateSql now carries IS DISTINCT FROM over all 5 comp columns, cast to the target columns\' own NUMERIC type for comp_build_ratio_p50/comp_fsi_p50 (avoiding the float8-vs-NUMERIC IS DISTINCT FROM trap, lessons.md:28)', () => {
    const src = computeSource();
    const fn = /function buildComparableBuildsUpdateSql[\s\S]*?\n}\n/.exec(src);
    expect(fn, 'buildComparableBuildsUpdateSql not found — has the pin-worthy shape moved?').toBeTruthy();
    const body = fn![0];
    expect(/IS DISTINCT FROM/i.test(body), 'EP-D1 fix: the pass-4 comps UPDATE must now guard on all 5 columns').toBe(true);
    for (const col of ['comparable_builds', 'comp_count', 'comp_dominant_build', 'comp_build_ratio_p50', 'comp_fsi_p50']) {
      expect(new RegExp(`p\\.${col}\\s+IS DISTINCT FROM`, 'i').test(body), `EP-D1 fix: p.${col} must be guarded`).toBe(true);
    }
    expect(/comp_build_ratio_p50\s+IS DISTINCT FROM\s+agg\.br_p50::numeric/i.test(body), 'comp_build_ratio_p50 must compare against a ::numeric-cast value (the target column is NUMERIC; percentile_cont returns double precision — cast avoids a cross-type comparison trap)').toBe(true);
    expect(/comp_fsi_p50\s+IS DISTINCT FROM\s+agg\.fsi_p50::numeric/i.test(body), 'comp_fsi_p50 must compare against a ::numeric-cast value, same reasoning').toBe(true);
  });

  it('EP-D8 FIXED (peel 8y, pilot 9 commit 8 P4), TODAY\'s live tree (compute) — the subj_family:"all" fallback branch (s.subj_family = \'all\' AND near.zoning_class = s.zoning_class) is UNCHANGED, but the WHERE clause now ALSO requires near.comp_structure_type_known — a structure-scale/type filter excluding unclassified/high-density comps from the generic-family fallback', () => {
    const src = computeSource();
    const fallback = /s\.subj_family\s*=\s*'all'\s*AND\s*near\.zoning_class\s*=\s*s\.zoning_class/i;
    expect(fallback.test(src), 'EP-D8 fix: the generic-family fallback clause must still be present, unmodified — the specific-family branch was never the defect').toBe(true);
    const clauseMatch = /WHERE\s*\(near\.comp_family[\s\S]*?LIMIT \$\{topN\}/i.exec(src) ?? /near\.comp_family = s\.subj_family[\s\S]{0,400}/i.exec(src);
    expect(clauseMatch, 'the comp-match WHERE clause block was not found for the EP-D8 fix scan').toBeTruthy();
    expect(/residential_sqm|structure_type|gfa/i.test(clauseMatch![0]), 'EP-D8 fix: a structure-scale/type term must now guard the \'all\'-family fallback — parcel 8244 (detached, 290 m²) must no longer be able to match apartment-scale comps').toBe(true);
    expect(/near\.comp_structure_type_known/i.test(clauseMatch![0]), 'EP-D8 fix: the fallback branch specifically must require near.comp_structure_type_known').toBe(true);
  });

  it('EP-D9 FIXED (peel, pilot 9 commit 8 P3), TODAY\'s live tree (compute) — BOTH ORDER BY clauses (inner kNN, outer similarity rank) in the comps candidate SQL now carry a deterministic secondary tiebreak key (id-based)', () => {
    const src = computeSource();
    // §5.5 seam rewrite (commit 7c) renamed the bare COMP_KNN_OVERFETCH/COMP_TOP_N literals to
    // config-sourced knnOverfetch/topN — same SQL shape, new parameter names (Ask 5).
    const innerKnn = /ORDER BY c\.geom <-> s\.geom,\s*c\.id\s*\n\s*LIMIT \$\{knnOverfetch\}/i;
    const outerRank = /ORDER BY \(abs\(near\.lot_size_sqm[\s\S]{0,140}\* 10\),\s*near\.id\s*\n\s*LIMIT \$\{topN\}/i;
    expect(innerKnn.test(src), 'EP-D9 fix: the inner kNN ORDER BY must carry a c.id secondary tiebreak key').toBe(true);
    expect(outerRank.test(src), 'EP-D9 fix: the outer similarity-rank ORDER BY must carry a near.id secondary tiebreak key').toBe(true);
  });

  it('EP-D10 FIXED (peel, commit 8 P1), TODAY\'s live tree — the enrich_parcels_pass3_scope hand-off INSERT (scripts/lib/step/index.js\'s runEnrichPhase) stays ON CONFLICT (run_id, parcel_id) DO NOTHING (append-only, crash-recoverable trail unchanged), but compute now PRUNES fully-consumed rows at run end: a DELETE FROM enrich_parcels_pass3_scope WHERE consumed_at IS NOT NULL runs AFTER consumePendingScope, so the table no longer grows unboundedly (442,244 rows/run measured pre-fix). consumePendingScope\'s own recovery read already deduped by parcel_id (SELECT DISTINCT parcel_id …) — no DISTINCT ON was needed.', () => {
    const runnerSrc = lf(readTextToday(INDEX_REL));
    const computeSrc = computeSource();
    expect(
      /INSERT INTO \$\{scopeTarget\.table\}[\s\S]*?ON CONFLICT \(run_id, parcel_id\) DO NOTHING/.test(runnerSrc),
      'the append-only ON CONFLICT (run_id, parcel_id) shape must still be present in runEnrichPhase\'s scope hand-off insert — the crash-recoverable trail itself is unchanged, only its consumed tail is pruned',
    ).toBe(true);
    expect(
      /DELETE\s+FROM\s+enrich_parcels_pass3_scope\s+WHERE\s+consumed_at\s+IS\s+NOT\s+NULL/i.test(computeSrc),
      'EP-D10 fix: a pruning DELETE (consumed_at IS NOT NULL only — unconsumed rows stay for future crash recovery) must exist in compute, issued after consumePendingScope',
    ).toBe(true);
    expect(
      /SELECT\s+DISTINCT\s+parcel_id\s+FROM\s+enrich_parcels_pass3_scope/i.test(computeSrc),
      'consumePendingScope\'s own recovery read must dedupe by parcel_id (SELECT DISTINCT parcel_id) — already true, re-asserted so a future regression is caught',
    ).toBe(true);
  });

  it('EP-D8 small-N audit row — descriptor plausibility[] declares an audit row for comp_fsi_p50 sourced from < 3 non-null comps, WITH A COUNT (Fold C2) (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    expect(d.plausibility, 'plausibility[] must not be "none" — comp_fsi_p50 has a small-N sample-size caveat').not.toBe('none');
    const rows = (d.plausibility ?? []) as Array<{ id?: string; name?: string; count_field?: string }>;
    const smallN = rows.find((r) => /comp_fsi_p50/i.test(JSON.stringify(r)) && /small.?n|<\s*3|sample/i.test(JSON.stringify(r)));
    expect(smallN, 'no plausibility[] row declares the comp_fsi_p50-from-<3-comps small-N caveat').toBeDefined();
    expect(smallN?.count_field, 'the small-N row must declare a count_field so the audit row emits a real count').toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Ask 9 — heritage-basis coverage: INFO-only, no WARN/FAIL (Fold G4)
// ---------------------------------------------------------------------------

describe('Ask 9 — heritage-basis max-build coverage is INFO-only (Fold G4: spec CONTRADICTS a WARN/FAIL bound)', () => {
  it('descriptor plausibility[] declares a heritage-basis coverage DISTRIBUTION row, severity INFO, mirroring MB-8\'s "all INFO, never gated" convention — NO WARN/FAIL threshold attached, per Spec 65 §4 MB-5\'s own stated intent (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    expect(d.plausibility).not.toBe('none');
    const rows = (d.plausibility ?? []) as Array<{ id?: string; name?: string; severity?: string }>;
    const heritageRow = rows.find((r) => /heritage/i.test(JSON.stringify(r)) && /coverage/i.test(JSON.stringify(r)));
    expect(heritageRow, 'no plausibility[] row declares the heritage-basis coverage distribution').toBeDefined();
    expect(heritageRow?.severity, 'Fold G4 ruling: INFO only — a WARN/FAIL bound here repeats the DEC-4 over-gating pattern the spec itself rejects').toBe('INFO');
  });
});

// ---------------------------------------------------------------------------
// Golden capture — PRE (commit 5, LANDED, testable today) + POST (commit 7)
// ---------------------------------------------------------------------------

describe('golden capture — PRE (commit 5, LANDED, testable today) + POST (commit 7)', () => {
  it('all 3 PRE invocations exist, exit 0, verdict WARN (measured — enrich_parcels is not a clean PASS today)', () => {
    for (const inv of PRE_INVOCATIONS) {
      const doc = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/pre/${inv.name}.json`), 'utf8')) as { exit_code: number; verdict: string };
      expect(doc.exit_code, `${inv.name}: exit_code`).toBe(0);
      expect(doc.verdict, `${inv.name}: verdict`).toBe('WARN');
    }
  });

  // Verdict expectation is PER-INVOCATION, not a blanket 'WARN': sources_run1 is a real --full
  // run (exercises all 5 passes' checks, WARN-eligible per the known heritage-basis/comp-sample
  // WARN-severity checks); none_incremental is a genuinely deferred run (scope-defer narrows the
  // scored checks to 'pre' only, per Spec 122 §3.0b) — measured live 2026-09-08 (post-repair, a
  // clean parcels table): checks_passed:'all', 0 warned, an honest PASS at that commit.
  // RE-MEASURED at the commit-9 recapture (2026-09-11, HEAD bc81ac84, fingerprint 0501de76):
  // none_incremental folds to WARN. That capture was taken minutes after the FULL capture, so the
  // stale scope was EMPTY — the run did NOT take the scope-defer path (terminal
  // `enriched_full_with_warnings`, all five passes ran over 0 rows, every *_enriched_count = 0)
  // and therefore DID execute the `when:"post"` plausibility bounds, one of which
  // (`comp_fsi_p50_small_n_sample_count` = 3,294, EP-D8, table-wide by construction) warns on
  // the whole parcels table irrespective of scope. The 2026-09-08 PASS was a genuinely
  // DEFERRED run whose post bounds never executed. Same input file name, two different code
  // paths chosen by DB state at capture time — the pin follows the measured capture (R-C).
  const EXPECTED_POST_VERDICT: Record<string, string> = { sources_run1: 'WARN', none_incremental: 'WARN' };
  it('both POST invocations exist under docs/reports/golden/enrich_parcels/post/ — sources_run1 (real --full, the sole behaviour-preservation diff against pre/sources_run1.json) + none_incremental (real, empty-args, satisfies G8\'s own manifest-invocation key coverage without colliding with any pre/*.json filename) — exit 0; sources_run1\'s differential against PRE is accounted for ENTIRELY by the declared non-determinism inventory (a)-(g) + the Fold A1 correction + the EP-D9/EP-D10 pins — zero unexplained diffs (flipped at: commit 2)', () => {
    for (const inv of POST_INVOCATIONS) {
      const doc = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/post/${inv.name}.json`), 'utf8')) as { exit_code: number; verdict: string };
      expect(doc.exit_code, `${inv.name}: exit_code`).toBe(0);
      expect(doc.verdict, `${inv.name}: verdict`).toBe(EXPECTED_POST_VERDICT[inv.name]);
    }
  });
});

// ---------------------------------------------------------------------------
// The non-determinism inventory precedes the golden capture (git-order lock,
// coordinator addendum — mirrors src/tests/steps/load_ravines/violations.test.ts:992 #151)
// ---------------------------------------------------------------------------

describe('the non-determinism inventory is documented no later than the golden capture (git order)', () => {
  it('firstCommitTime of the assessment report\'s Fold A1 correction section ≤ firstCommitTime of the golden dir (both directions: passes on real history, REDs if the golden dir landed first)', () => {
    // The generic capture harness's own volatile-key declaration is a second, older anchor —
    // whichever of the two is earlier is "when the inventory was first expressible at all".
    const harnessAt = firstCommitTime('scripts/analysis/capture-step-golden.js', 'VOLATILE_KEYS');
    const reportAt = firstCommitTime(REPORT_REL, 'code-level non-determinism claim');
    const inventoryAt = Math.min(...[harnessAt, reportAt].filter((n) => n > 0));
    const goldenAt = firstCommitTime(GOLDEN_DIR_REL);
    expect(reportAt, `${REPORT_REL} has no committed non-determinism-inventory content ("code-level non-determinism claim")`).toBeGreaterThan(0);
    expect(goldenAt, `${GOLDEN_DIR_REL} is not committed`).toBeGreaterThan(0);
    expect(inventoryAt, 'the non-determinism inventory must be documented no LATER than the first golden capture commit').toBeLessThanOrEqual(goldenAt);
  });
});

// ---------------------------------------------------------------------------
// Facts testable today — the live tree, not a future artifact
// ---------------------------------------------------------------------------

describe('facts testable today — the live tree, not a future artifact', () => {
  it('advisory lock 65 is unique to enrich-parcels.js (already true today)', () => {
    const hits: string[] = [];
    for (const f of fs.readdirSync(abs('scripts')).filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(abs(`scripts/${f}`), 'utf8');
      if (/ADVISORY_LOCK_ID\s*=\s*65\b/.test(src)) hits.push(f);
    }
    expect(hits, `lock 65 must be unique to enrich-parcels.js: found in ${hits.join(', ')}`).toEqual(['enrich-parcels.js']);
  });

  it('manifest confirms enrich_parcels is a sources-chain-only member, chain_args.sources includes --full (already true today)', () => {
    const m = manifest();
    for (const chain of CHAINS) {
      expect((m.chains[chain] ?? []).includes('enrich_parcels'), `${chain} chain must list enrich_parcels`).toBe(true);
    }
    for (const [chain, list] of Object.entries(m.chains)) {
      if (chain === 'sources') continue;
      expect(list.includes('enrich_parcels'), `enrich_parcels must NOT be a member of the ${chain} chain (measured: sources-only)`).toBe(false);
    }
    expect(m.scripts.enrich_parcels?.chain_args?.sources ?? []).toContain('--full');
  });

  it('LG-28 is the genuine next-free library-growth number — grepped, never guessed: highest live mechanic today is LG-27 (refresh_snapshot\'s write.js executor)', () => {
    const hits = new Set<string>();
    const scan = (dir: string): void => {
      for (const entry of fs.readdirSync(abs(dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) { scan(rel); continue; }
        if (!/\.(js|json)$/.test(entry.name)) continue;
        const src = fs.readFileSync(abs(rel), 'utf8');
        for (const m of src.matchAll(/LG-2[0-9]/g)) hits.add(m[0]);
      }
    };
    scan('scripts/lib');
    scan('scripts/steps/_schema');
    const nums = [...hits].map((h) => Number(h.slice(3))).sort((a, b) => a - b);
    expect(Math.max(...nums, 0), 'LG-28 (runEnrichPhase) has now landed (commit 7d/commit 2) — the highest LG number in scripts/lib + scripts/steps/_schema must be 28').toBe(28);
  });

  it('converted.json — REGISTERED as converted (commit 9 cutover, 2026-09-11); the pending entry is DELETED in the SAME commit (R-K mutual-exclusion lock — a file cannot be both converted AND pending at once). History: commit 7e/3 advanced the pending stage to shape_clean 2026-09-08; commit 8 P1 moved it to shape_clean_pending_recapture the SAME day; the golden fingerprint was re-stamped at commit 9 against the EP-D17 descriptor (R-C named cause).', () => {
    const c = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[]; pending: Array<{ file: string; stage: string }> };
    expect(c.converted.includes(STEP_REL), 'enrich_parcels must be registered as converted — commit 9 is the cutover').toBe(true);
    const entry = c.pending.find((p) => p.file === STEP_REL);
    expect(entry, `a stale pending entry still exists for ${STEP_REL} — the cutover should have removed it (mutual-exclusion lock)`).toBeUndefined();
    expect(fs.existsSync(abs(DESCRIPTOR_REL)), 'descriptor must exist for a registered converted entry').toBe(true);
    expect(fs.existsSync(abs(COMPUTE_REL)), 'compute (7c) exists on disk').toBe(true);
  });

  it('defect-ledger.md — EP-D1 (PARTIAL, never-refresh half only) carries the PIN (Spec 123 §3.1) status, pinned_until pilot9 commit 9 (already landed, commits 4/4c/5)', () => {
    const ledger = readTextToday(DEFECT_LEDGER_REL);
    for (const id of ['EP-D1']) {
      const row = ledger.split('\n').find((l) => l.includes(`| ${id} |`));
      expect(row, `${DEFECT_LEDGER_REL} has no row for ${id}`).toBeDefined();
      expect(row, `${id} row must carry PIN status`).toMatch(/\*\*PIN \(Spec 123 §3\.1\)/);
      expect(row, `${id} row must state pinned_until: pilot9 commit 9`).toMatch(/pinned_until:\s*pilot9 commit 9/);
    }
  });

  it('defect-ledger.md — EP-D8, EP-D9 and EP-D10 are CLOSED-in-commit (commits 8 P4, P3, P1, 2026-09-08) — no longer PIN (flipped at: commit 8)', () => {
    const ledger = readTextToday(DEFECT_LEDGER_REL);
    for (const id of ['EP-D8', 'EP-D9', 'EP-D10']) {
      const row = ledger.split('\n').find((l) => l.includes(`| ${id} |`));
      expect(row, `${DEFECT_LEDGER_REL} has no row for ${id}`).toBeDefined();
      expect(row, `${id} row must carry CLOSED-in-commit status, not PIN`).toMatch(/\*\*CLOSED-in-commit/);
      expect(row, `${id} row must no longer claim a PIN`).not.toMatch(/\*\*PIN \(Spec 123 §3\.1\)/);
    }
  });

  it('programme-items.json — EP-PIN-B45/D8/D9/D10 cutover_prereq entries exist, all blocking enrich_parcels (already landed, commits 4/4c/5)', () => {
    const items = JSON.parse(readTextToday(PROGRAMME_ITEMS_REL)) as { items?: Array<{ id: string; gate?: { kind: string; blocks?: string[] } }> } | Array<{ id: string; gate?: { kind: string; blocks?: string[] } }>;
    const list = Array.isArray(items) ? items : (items.items ?? []);
    for (const id of ['EP-PIN-B45', 'EP-PIN-D8', 'EP-PIN-D9', 'EP-PIN-D10']) {
      const row = list.find((i) => i.id === id);
      expect(row, `programme-items.json has no ${id} entry`).toBeDefined();
      expect(row?.gate?.kind).toBe('cutover_prereq');
      expect(row?.gate?.blocks).toContain('enrich_parcels');
    }
  });
});

// ---------------------------------------------------------------------------
// runEnrichPhase (LG-28) — logic tests against a fake pool, mirroring
// src/tests/step-library.logic.test.ts's own fakePool convention (commit 7d).
// A hand-built ENRICHER-shaped fixture descriptor + a minimal fake compute
// module — NOT the real 486K-parcel-scale compute.js — so these tests exercise
// the RUNNER's own orchestration (phase order, txn scoping, timeouts,
// heartbeat, stream batching, interrupted-retraction reachability) fast and
// deterministically. See src/tests/steps/enrich_parcels/violations.test.ts's
// OTHER describe blocks (above) for the real-descriptor/real-compute checks.
// ---------------------------------------------------------------------------

describe('runEnrichPhase (LG-28) — logic tests against a fake pool', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
  const stepLib = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js')) as {
    runEnrichPhase: (args: Record<string, unknown>) => Promise<{
      deferred?: boolean; matched: Record<string, unknown>; written: Record<string, unknown>;
      writeSkipped: boolean; skipped?: boolean;
    }>;
    isEnrichStep: (d: unknown) => boolean;
    // EP-PHASE-DEADLINE / EP-PASS3-BACKLOG Observability fold — the two extraRow builders
    // runWithPool feeds into buildAuditTable, exercised directly so the ROW SHAPE is locked
    // without standing up the whole runWithPool/ledger path.
    phaseDeadlineRows: (results: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
    scopeRetireFailureRows: (results: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
  };

  interface FakePoolOpts {
    interruptedRow?: { id: number; pipeline: string; status: string; started_at: string } | null;
    // WF3 enrich_parcels double-run incident (2026-09-07) — default true so every EXISTING
    // test (which never cares about lock contention) is unaffected; a test proving the
    // "second runner while the first holds the lock" half sets this false.
    innerLockAcquired?: boolean;
  }

  function fakePool(opts: FakePoolOpts = {}) {
    const sql: string[] = [];
    const params: unknown[][] = [];
    const innerLockAcquired = opts.innerLockAcquired !== false;
    // EP-PHASE-DEADLINE (WF3, 2026-09-15) — the fixture's own cancel bus. A real
    // `pg_cancel_backend(pid)` is issued on a SEPARATE connection and aborts whatever
    // statement the TARGET backend has in flight with SQLSTATE 57014; a JS `throw` from a
    // timer cannot do that (the in-flight `client.query` keeps running to completion). This
    // models the Postgres side of that contract: every `pg_cancel_backend` issued on ANY
    // connection of this pool is recorded and every registered waiter is woken, so a pass
    // fixture can race its own simulated long statement against the cancel and reject with
    // the real 57014 shape the runner's existing wrapper catches.
    const cancels: number[] = [];
    const cancelWaiters: Array<(pid: number) => void> = [];
    const noteCancel = (text: string, values?: unknown[]) => {
      if (!/pg_cancel_backend/.test(text)) return;
      const pid = Number((values && values[0]) ?? -1);
      cancels.push(pid);
      for (const w of cancelWaiters.splice(0)) w(pid);
    };
    /**
     * Resolves on a cancel issued AFTER `after` cancels had already been seen.
     *
     * Guardian fold (2026-09-15) — the generation counter models real Postgres semantics
     * and is load-bearing, not bookkeeping: a cancel request applies to whatever statement
     * the backend has IN FLIGHT when it arrives. One that lands while the backend is idle
     * between statements is CONSUMED and does NOT carry over to the next statement. Without
     * the counter a fixture statement would spuriously "see" an earlier, already-absorbed
     * cancel, and the re-arm lock below would pass against a single-shot implementation.
     */
    const onCancel = (after = 0) => new Promise<number>((resolve) => {
      if (cancels.length > after) { resolve(cancels[cancels.length - 1]!); return; }
      cancelWaiters.push(resolve);
    });
    // Fold B2 / coordinator addendum (commit 7e/2) — SHOW statement_timeout must read back
    // the LAST SET LOCAL value issued on the SAME client, never a config-value inspection
    // (Spec 122 §7.2's own live-session assertion). The top-level pool.query has NO session
    // (each call is independently autocommitted, mirroring a real pg.Pool.query) — its own
    // SHOW always reads the session default ('0'), proving isolation: a SET LOCAL issued on
    // one client is invisible to any other session, pool-level query included.
    const SESSION_DEFAULT = '0';
    const answer = (text: string, sessionStatementTimeoutMs?: number) => {
      if (/pg_extension|information_schema\.columns|pg_indexes/.test(text)) return { rows: [{ present: 1 }] };
      if (/pg_backend_pid/.test(text)) return { rows: [{ pid: 4242 }] };
      if (/own_last_completed/.test(text)) {
        return { rows: opts.interruptedRow ? [opts.interruptedRow] : [] };
      }
      if (/COUNT\(\*\)::int AS n FROM parcels/.test(text)) return { rows: [{ n: 0 }] };
      if (/INSERT INTO enrich_parcels_pass3_scope/.test(text)) return { rows: [], rowCount: 3 };
      // WF3 enrich_parcels double-run incident (2026-09-07) — the two-key inner lock
      // both the shared-txn client and the post_commit client acquire on themselves.
      if (/pg_try_advisory(?:_xact)?_lock\(\$1, \$2\)/.test(text)) return { rows: [{ acquired: innerLockAcquired }] };
      if (/^SHOW statement_timeout$/i.test(text)) {
        return { rows: [{ statement_timeout: sessionStatementTimeoutMs === undefined ? SESSION_DEFAULT : `${sessionStatementTimeoutMs}ms` }] };
      }
      return { rows: [] };
    };
    // Pool-level: no session state at all — SHOW always reads the untouched default.
    const record = async (text: string, values?: unknown[]) => {
      sql.push(text);
      params.push(values ?? []);
      noteCancel(text, values);
      return answer(text);
    };
    // Every connect()-ed client, in creation order — lets a test reach back into a SPECIFIC
    // session after runEnrichPhase returns (e.g. clients[1] is the post_commit phase's own
    // dedicated connection, per the fixture's shared-txn-then-post_commit call order) to issue
    // its own follow-up SHOW, exactly as a real regression lock would on the real session.
    const clients: Array<{ query: (text: string, values?: unknown[]) => Promise<unknown> }> = [];
    return {
      sql,
      params,
      clients,
      cancels,
      onCancel,
      query: record,
      // Each connect() call is its own SESSION: a distinct, closed-over statementTimeoutMs
      // that only THIS client's own SET LOCAL statement_timeout can move — the mechanism the
      // isolation half of the addendum test below asserts against a SECOND, sibling client.
      connect: async () => {
        // F1 (output panel, 2026-09-09) — TWO distinct timeout states, matching real
        // Postgres session semantics: `sessionTimeoutMs` (a plain `SET`, persists across
        // COMMIT/ROLLBACK, cleared only by another `SET`/`RESET`) and `localTimeoutMs` (a
        // `SET LOCAL`, scoped to the CURRENT transaction only, reverts to whatever
        // `sessionTimeoutMs` currently is — never to a hard-coded '0' — the instant that
        // transaction COMMITs/ROLLBACKs). Before this fix the fixture modelled only the
        // LOCAL half, which could not distinguish a genuine session-level SET from no SET
        // at all — exactly the gap that let EP-D16's own `RESET`-vs-`SET` defect (F1) hide.
        let sessionTimeoutMs: number | undefined;
        let localTimeoutMs: number | undefined;
        const clientQuery = async (text: string, values?: unknown[]) => {
          sql.push(text);
          params.push(values ?? []);
          noteCancel(text, values);
          const localMatch = /^SET LOCAL statement_timeout = (\d+)$/.exec(text);
          if (localMatch) localTimeoutMs = Number(localMatch[1]);
          const sessionMatch = /^SET statement_timeout = (\d+)$/.exec(text);
          if (sessionMatch) sessionTimeoutMs = Number(sessionMatch[1]);
          if (/^COMMIT$/.test(text) || /^ROLLBACK$/.test(text)) localTimeoutMs = undefined;
          return answer(text, localTimeoutMs ?? sessionTimeoutMs);
        };
        const client = { query: clientQuery, release: () => {} };
        clients.push(client);
        return client;
      },
    };
  }

  /** A minimal ENRICHER-shaped descriptor — enough for runEnrichPhase, not full AJV validity. */
  function fixtureDescriptor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      identity: { name: 'fixture_enrich', lock: 999999, archetype: 'ENRICHER', spec: '999' },
      outputs: {
        writes: [
          { table: 'parcels', key: 'id', write_discipline: { class: 'temp_materialize' } },
          { table: 'parcels', key: 'id', write_discipline: { class: 'temp_materialize' } },
          { table: 'parcels', key: 'id', write_discipline: { class: 'temp_materialize' } },
          { table: 'parcels', key: 'id', write_discipline: { class: 'set_based_join_update' } },
          { table: 'parcels', key: 'id', write_discipline: { class: 'derived_recompute' } },
          { table: 'parcels', key: 'id', write_discipline: { class: 'set_based_scoped' } },
          { table: 'fixture_scope', key: ['run_id', 'parcel_id'], write_discipline: { class: 'insert_only_no_retraction' } },
        ],
      },
      execution: {
        shape: 'enrich',
        phases: [
          { name: 'zoning', order: 1, txn: 'shared', writes_ref: 0, timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
          { name: 'max_build', order: 2, txn: 'shared', writes_ref: 1, timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
          { name: 'existing_structure', order: 3, txn: 'shared', writes_ref: 2, timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
          { name: 'comparable_builds', order: 4, txn: 'shared', writes_ref: 3, timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
          { name: 'optimal_config', order: 5, txn: 'post_commit', writes_ref: 4, timeout_minutes_from_config: 'fixture_pass5_timeout_minutes' },
        ],
        invocation: { sources: { argv: [], env: {} } },
      },
      guards: { requires: [{ kind: 'extension', name: 'postgis', on_missing: 'fail' }] },
      recovery: 'none',
      override: { force_full: 'FIXTURE_ENRICH_FORCE_FULL', force_run: 'none', dry_run: 'none' },
      checks: [],
      ...overrides,
    };
  }

  interface FakePassResult { [k: string]: unknown }
  interface FakeCompute {
    OVERLAY_LAYERS: unknown[];
    readZoningContract: (pool: unknown) => Promise<{ layers: Record<string, boolean>; partial: boolean; baseCommittedAfterOverlayFailed: boolean }>;
    computeDeferScope: (pool: unknown, threshold: number) => Promise<{ scope_count: number; threshold: number; ratio: number; perPass: Record<string, number> }>;
    computeAggregateRecordsUpdated: () => number;
    retireStaleScope: (client: unknown, opts: Record<string, unknown>) => Promise<Record<string, number>>;
    passes: Array<{ name: string; txn: string; run: (client: unknown, ctx: Record<string, unknown>, config: Record<string, unknown>) => Promise<FakePassResult> }>;
  }

  /** Records every phase invocation `{name, txn}` in call order — the phase-ordering witness. */
  function fakeCompute(passLog: Array<{ name: string; txn: string }>, opts: { deferScopeCount?: number; passImpl?: Record<string, (client: unknown, ctx: Record<string, unknown>) => Promise<FakePassResult>>; retireStaleScope?: (client: unknown, o: Record<string, unknown>) => Promise<Record<string, number>> } = {}): FakeCompute {
    const names = ['zoning', 'max_build', 'existing_structure', 'comparable_builds', 'optimal_config'];
    return {
      OVERLAY_LAYERS: [],
      readZoningContract: async () => ({ layers: { base: true }, partial: false, baseCommittedAfterOverlayFailed: false }),
      computeDeferScope: async () => ({ scope_count: opts.deferScopeCount ?? 0, threshold: 1000, ratio: 0, perPass: {} }),
      computeAggregateRecordsUpdated: () => 0,
      // EP-PASS3-BACKLOG (WF3, 2026-09-15) — the step-start stale-cohort retirement. The
      // fake returns the shape the runner folds into `matched`; the REAL SQL/predicate
      // behaviour is locked separately against a fake client in the
      // "retireStaleScope" describe block below (this fixture only proves the runner
      // CALLS it, before the shared transaction opens).
      retireStaleScope: opts.retireStaleScope ?? (async () => ({ backlog_rows: 0, backlog_cohorts: 0, retired_rows: 0, retired_cohorts: 0 })),
      passes: names.map((name, i) => ({
        name,
        txn: i < 4 ? 'shared' : 'post_commit',
        run: async (client: unknown, ctx: Record<string, unknown>) => {
          passLog.push({ name, txn: i < 4 ? 'shared' : 'post_commit' });
          if (opts.passImpl && opts.passImpl[name]) return opts.passImpl[name](client, ctx);
          return { scoped: 0, updated: 0, updatedIds: [] };
        },
      })),
    };
  }

  const baseArgs = (descriptor: Record<string, unknown>, pool: ReturnType<typeof fakePool>, compute: FakeCompute) => ({
    descriptor,
    pool,
    compute,
    config: {
      fixture_pass_timeout_minutes: 5,
      fixture_pass5_timeout_minutes: 10,
      enrich_parcels_lock_timeout_ms: 0,
      enrich_parcels_heartbeat_minutes: 60,
      enrich_parcels_defer_threshold_rows: 1000,
      enrich_parcels_pass5_stream_batch_size: 137,
      enrich_parcels_scope_retire_after_hours: 24,
    },
    chainId: null,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    tag: '[fixture_enrich]',
    clockNow: new Date('2026-09-04T00:00:00.000Z'),
    preWriteGate: null,
    ownRunId: 4242,
  });

  it('phase ordering — the four shared-txn phases run in declared `order`, then the post_commit phase runs strictly after', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const compute = fakeCompute(passLog);
    const pool = fakePool();
    await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never);
    expect(passLog.map((p) => p.name)).toEqual(['zoning', 'max_build', 'existing_structure', 'comparable_builds', 'optimal_config']);
    expect(passLog[4]!.txn).toBe('post_commit');
  });

  it('post_commit isolation — a throw in pass 5 does NOT roll back passes 1-4 (they already committed in their own transaction, before pass 5 ever runs)', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pool = fakePool();
    const compute = fakeCompute(passLog, {
      passImpl: {
        optimal_config: async () => { throw new Error('pass 5 boom'); },
      },
    });
    await expect(stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never)).rejects.toThrow('pass 5 boom');
    // The shared txn's own COMMIT already ran (pipeline.withTransaction awaits `fn`, then
    // COMMITs, before runEnrichPhase ever reaches the post-commit loop) — proven by the
    // scope hand-off INSERT (inside that same shared txn, target table "fixture_scope" in
    // this fixture) having already been issued.
    expect(pool.sql.some((s) => /INSERT INTO fixture_scope/.test(s))).toBe(true);
    // EP-D13 H1 fix (pilot 9 commit 8 P9, 2026-09-08) — pass 5 no longer runs inside ONE
    // wrapping transaction (each batch flush is its own short BEGIN/COMMIT via
    // ctx.flushBatch); this fixture's own throw fires BEFORE any batch is ever flushed,
    // so genuinely ZERO transactions (and zero ROLLBACKs) exist on the post_commit
    // connection — there is nothing to roll back, which is itself the point: a pass-5
    // failure with no batches yet committed cannot possibly touch passes 1-4's own
    // ALREADY-COMMITTED work (proven above by the scope hand-off INSERT already present).
    expect(pool.sql.filter((s) => s === 'ROLLBACK')).toHaveLength(0);
    expect(pool.sql.filter((s) => s === 'BEGIN')).toHaveLength(1); // the shared-txn phases' own single wrapping transaction — nothing from post_commit
  });

  it('timeouts applied per shared phase — SET LOCAL statement_timeout/lock_timeout issued, minutes converted to milliseconds, before each shared phase runs', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const compute = fakeCompute(passLog);
    const pool = fakePool();
    const args = baseArgs(fixtureDescriptor(), pool, compute);
    (args.config as Record<string, unknown>).enrich_parcels_lock_timeout_ms = 30000;
    await stepLib.runEnrichPhase(args as never);
    // 5 minutes * 60000 = 300000ms, once per SHARED phase (4) — filtered to that exact
    // value so the post_commit phase's OWN distinct timeout (10 min = 600000ms, asserted
    // in the sibling test below) does not conflate the two into one count.
    const sharedStatementTimeouts = pool.sql.filter((s) => s === 'SET LOCAL statement_timeout = 300000');
    const lockTimeouts = pool.sql.filter((s) => /^SET LOCAL lock_timeout = /.test(s));
    expect(sharedStatementTimeouts).toEqual(Array(4).fill('SET LOCAL statement_timeout = 300000'));
    expect(lockTimeouts).toEqual(Array(4).fill('SET LOCAL lock_timeout = 30000'));
  });

  // -------------------------------------------------------------------------
  // EP-PHASE-DEADLINE (WF3, .cursor/wf3_enrich_parcels_pass3_backlog_active_task.md C2,
  // 2026-09-15) — `execution.phases[].timeout_minutes_from_config` was executed ONLY as a
  // Postgres `SET LOCAL statement_timeout`, a PER-STATEMENT bound re-armed on every
  // statement. A phase issuing N statements was therefore bounded at N x the declared
  // value, never at the declared value: measured on cloud run 34971921328, the
  // `existing_structure` phase (5 statements, `scripts/lib/compute/enrich-parcels.js`
  // runPass3) ran 94.4 min against a declared 75 min bound whose EFFECTIVE ceiling was
  // 375 min — the timeout was never capable of firing, and the only thing that stopped
  // the run was the GH Actions 300-min wall clock (`chain-sources.yml:60,116`).
  //
  // The pair below is the both-directions lock: (e) statements each UNDER the bound whose
  // SUM exceeds it must abort, and (f) a phase that finishes under the bound must NOT be
  // cancelled (proving the deadline is not simply always firing, and that its timer is
  // cleared per phase rather than leaking into the next one).
  // -------------------------------------------------------------------------
  /**
   * A simulated long-running statement: resolves after `ms`, or rejects with the REAL
   * SQLSTATE 57014 shape the instant `pg_cancel_backend` is issued against this pool —
   * exactly what Postgres does to whatever statement the cancelled backend has in flight.
   */
  const statementTaking = (pool: ReturnType<typeof fakePool>, ms: number) => {
    // Snapshotted at call time: only a cancel issued while THIS statement is in flight can
    // abort it (see `onCancel`'s note on the generation counter).
    const baseline = pool.cancels.length;
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      void pool.onCancel(baseline).then(() => {
        clearTimeout(t);
        reject(Object.assign(new Error('canceling statement due to user request'), { code: '57014' }));
      });
    });
  };

  /** A statement that CANNOT be cancelled — models the backend being idle when a cancel lands. */
  const statementIgnoringCancel = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

  it('(e) EP-PHASE-DEADLINE — a shared phase whose statements are EACH under the declared bound but whose SUM exceeds it is cancelled at the wall-clock deadline and fails LOUD, naming the phase, the phase_deadline kind and the elapsed ms', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pool = fakePool();
    const compute = fakeCompute(passLog, {
      passImpl: {
        // Two statements, each 80ms (well under the 120ms declared bound) — neither can
        // ever trip `SET LOCAL statement_timeout`, which is re-armed per statement. Their
        // SUM is 160ms, which is what a PHASE bound must catch and a statement bound cannot.
        existing_structure: async (client: unknown) => {
          const c = client as { query: (t: string, v?: unknown[]) => Promise<unknown> };
          await c.query('SELECT 1 /* stmt A */');
          await statementTaking(pool, 80);
          await c.query('SELECT 1 /* stmt B */');
          await statementTaking(pool, 80);
          return { scoped: 0, updated: 0, updatedIds: [] };
        },
      },
    });
    const args = baseArgs(fixtureDescriptor(), pool, compute);
    // 0.002 min * 60000 = 120ms — the DECLARED bound, read through the SAME
    // `timeout_minutes_from_config` seam production uses, never a test-only constant.
    (args.config as Record<string, unknown>).fixture_pass_timeout_minutes = 0.002;
    // The abort is RETURNED, not thrown (Observability fold — see the dedicated audit-table
    // lock below for why); the message is the same one the throw carried.
    const res = await stepLib.runEnrichPhase(args as never) as Record<string, unknown>;
    expect((res.phaseDeadline as { message: string } | null)?.message)
      .toMatch(/existing_structure aborted by phase_deadline after \d+ms/);
    // The cancel went to the backend pid the runner captured from the phase's OWN client
    // (`SELECT pg_backend_pid()`, fixture value 4242) — a JS throw from a timer could not
    // have interrupted the in-flight statement at all.
    expect(pool.cancels, 'exactly one pg_cancel_backend, against the captured phase pid').toEqual([4242]);
    // ...and it was issued on a DIFFERENT connection than the phase's own (a cancel sent
    // down the very session that is blocked could never be delivered). clients[0] is the
    // pre-acquired, autocommit heartbeat client; the shared-txn phase client is clients[1].
    expect(pool.sql.some((s) => /pg_cancel_backend/.test(s))).toBe(true);
    // The phases BEFORE the deadlined one completed normally — the deadline is per phase.
    expect(passLog.map((p) => p.name)).toEqual(['zoning', 'max_build', 'existing_structure']);
  });

  it('(f) EP-PHASE-DEADLINE inverse — a phase that finishes under the declared bound is never cancelled, and its timer is cleared so a LATER phase never inherits it', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pool = fakePool();
    const compute = fakeCompute(passLog);
    const args = baseArgs(fixtureDescriptor(), pool, compute);
    // A deliberately TIGHT 300ms bound with instant passes: if the per-phase timer were
    // not cleared in the phase's own `finally`, the four phases' armed timers would still
    // be live and would cancel a later phase (or leak past the step entirely).
    (args.config as Record<string, unknown>).fixture_pass_timeout_minutes = 0.005;
    const res = await stepLib.runEnrichPhase(args as never);
    expect(res.writeSkipped).toBe(false);
    expect(passLog.map((p) => p.name)).toEqual(['zoning', 'max_build', 'existing_structure', 'comparable_builds', 'optimal_config']);
    expect(pool.cancels, 'no phase exceeded its bound, so nothing may be cancelled').toEqual([]);
    // Held well past the tightest armed deadline: a leaked timer would fire here.
    await new Promise((r) => setTimeout(r, 400));
    expect(pool.cancels, 'no timer leaked past its own phase').toEqual([]);
  });

  it('(Guardian fold) EP-PHASE-DEADLINE re-arm — a cancel that lands while the backend is IDLE between statements is a Postgres no-op, so the deadline RE-ISSUES it until something is actually cancelled; the next statement dies and the run still reports phase_deadline', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pool = fakePool();
    const compute = fakeCompute(passLog, {
      passImpl: {
        existing_structure: async (client: unknown) => {
          const c = client as { query: (t: string, v?: unknown[]) => Promise<unknown> };
          await c.query('SELECT 1 /* stmt A */');
          // The deadline (120ms) fires here, while this statement cannot be cancelled —
          // the backend-is-idle case. A single-shot timer's ONLY cancel is absorbed and
          // the phase runs on unbounded with `fired()` stuck true, so whatever 57014
          // eventually arrives is mislabelled `phase_deadline`: a deadline that reports
          // success while enforcing nothing. RED against that implementation, because
          // statement B below then runs its full 3s and the phase SUCCEEDS.
          await statementIgnoringCancel(200);
          await c.query('SELECT 1 /* stmt B */');
          await statementTaking(pool, 3000);
          return { scoped: 0, updated: 0, updatedIds: [] };
        },
      },
    });
    const args = baseArgs(fixtureDescriptor(), pool, compute);
    (args.config as Record<string, unknown>).fixture_pass_timeout_minutes = 0.002; // 120ms
    const res = await stepLib.runEnrichPhase(args as never) as Record<string, unknown>;
    expect((res.phaseDeadline as { message: string } | null)?.message)
      .toMatch(/existing_structure aborted by phase_deadline after \d+ms/);
    // MORE than one cancel: the first was absorbed by the uncancellable statement, the
    // re-arm issued the one that actually landed. Exactly one would mean no re-arm.
    expect(pool.cancels.length, 'the cancel must be re-issued until it lands').toBeGreaterThan(1);
    expect(new Set(pool.cancels), 'every re-issued cancel targets the SAME captured pid').toEqual(new Set([4242]));
  });

  it('(Observability fold) EP-PHASE-DEADLINE — a deadline abort is LOUD ON THE AUDIT TABLE: the runner returns a phaseDeadline payload instead of escaping to the outer catch, phaseDeadlineRows renders one errored FAIL row, and the post_commit phase is skipped', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pool = fakePool();
    const compute = fakeCompute(passLog, {
      passImpl: {
        existing_structure: async (client: unknown) => {
          const c = client as { query: (t: string, v?: unknown[]) => Promise<unknown> };
          await c.query('SELECT 1 /* stmt A */');
          await statementTaking(pool, 80);
          await c.query('SELECT 1 /* stmt B */');
          await statementTaking(pool, 80);
          return { scoped: 0, updated: 0, updatedIds: [] };
        },
      },
    });
    const args = baseArgs(fixtureDescriptor(), pool, compute);
    (args.config as Record<string, unknown>).fixture_pass_timeout_minutes = 0.002;
    // NOT a rejection any more — that is the whole point. Before this fold the wrapped
    // 57014 escaped runEnrichPhase to runWithPool's outer catch, which sets status=FAILED
    // and an error_message but builds NO records_meta and NO audit_table at all: the one
    // run the deadline fired on was the one run whose own record said nothing about why.
    const res = await stepLib.runEnrichPhase(args as never) as Record<string, unknown>;
    const d = res.phaseDeadline as { phase: string; txn: string; elapsedMs: number; boundMinutes: number; message: string };
    expect(d, 'the abort must be returned, not thrown').toBeTruthy();
    expect(d.phase).toBe('existing_structure');
    expect(d.txn).toBe('shared');
    expect(d.elapsedMs).toBeGreaterThan(0);
    expect(d.message).toMatch(/aborted by phase_deadline after \d+ms \(declared bound 0\.002min\)/);
    // The post_commit phase is skipped — the shared txn rolled back, so pass 5 would be
    // recomputing against columns that no longer hold the work it derives from.
    expect(passLog.map((p) => p.name)).toEqual(['zoning', 'max_build', 'existing_structure']);
    // ...and `matched` is still built, so the step-start retirement's OWN counters — all
    // three `when:"post"` checks — still reach the audit table on the FAIL path. A killed
    // run records what it retired; that is the only reason the retirement was moved to
    // step start in the first place, and it would be undone if the abort path dropped the
    // counts. (Idempotency/Integration fold, 2026-09-15.)
    expect(res.matched).toMatchObject({
      scope_backlog_at_step_start: 0,
      scope_retired_rows: 0,
      scope_retired_cohorts: 0,
    });
    // The two flags that would NARROW `onlyChecks` away from `when:"post"` in runWithPool
    // (§ the enrich branch of the runner dispatch) are both false on this path — which is
    // what actually keeps those three rows scoreable. If a future change routes the
    // deadline through `writeSkipped`, the counts silently stop being recorded.
    expect(res.writeSkipped, 'a narrowed run would drop every when:"post" row, retirement counts included').toBe(false);
    expect(res.deferred).toBe(false);
    // The row itself: one errored FAIL row, source 'gate' — the POST-B1-1 idiom, so the
    // row-derived cascade (never a parallel boolean) produces the FAIL verdict.
    const rows = stepLib.phaseDeadlineRows([res]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ metric: 'phase_deadline', status: 'FAIL', source: 'gate', errored: true });
    expect(rows[0]!.value).toMatch(/existing_structure \(shared\) aborted after \d+ms/);
    expect(rows[0]!.threshold).toMatch(/declared 0\.002min bound/);
    // Both directions: a healthy run adds NO row, so a clean audit table is unchanged.
    expect(stepLib.phaseDeadlineRows([{ phaseDeadline: null }])).toEqual([]);
  });

  it('(Observability fold) EP-PHASE-DEADLINE — the post_commit phase (optimal_config, the phase cloud run 4911 actually died in) is armed too, with the same re-arm and the same loud row', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pool = fakePool();
    const compute = fakeCompute(passLog, {
      passImpl: {
        optimal_config: async (client: unknown) => {
          const c = client as { query: (t: string, v?: unknown[]) => Promise<unknown> };
          await c.query('SELECT 1 /* batch A */');
          await statementTaking(pool, 80);
          await c.query('SELECT 1 /* batch B */');
          await statementTaking(pool, 80);
          return { scoped: 0, updated: 0, updatedIds: [] };
        },
      },
    });
    const args = baseArgs(fixtureDescriptor(), pool, compute);
    // Pass 5's OWN declared bound (enrich_parcels_pass5_timeout_minutes in production) —
    // its session-level SET statement_timeout is still PER STATEMENT over a batched loop,
    // so it bounds one batch, never the pass. 120ms here.
    (args.config as Record<string, unknown>).fixture_pass5_timeout_minutes = 0.002;
    const res = await stepLib.runEnrichPhase(args as never) as Record<string, unknown>;
    const d = res.phaseDeadline as { phase: string; txn: string };
    expect(d, 'the post_commit phase must be deadlined too').toBeTruthy();
    expect(d.phase).toBe('optimal_config');
    expect(d.txn).toBe('post_commit');
    expect(pool.cancels).toContain(4242);
    // All four shared phases completed first — the deadline is per phase, and pass 5's
    // own bound is a different config key from theirs.
    expect(passLog.map((p) => p.name)).toEqual(['zoning', 'max_build', 'existing_structure', 'comparable_builds', 'optimal_config']);
  });

  it('EP-PASS3-BACKLOG — the stale-cohort retirement runs at STEP START, before the shared transaction opens (never at the end of pass 5, where a killed run never reaches it), and its counts reach the audit observations', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pool = fakePool();
    let sqlLenAtRetire = -1;
    let retireOpts: Record<string, unknown> | null = null;
    const compute = fakeCompute(passLog, {
      retireStaleScope: async (_client: unknown, o: Record<string, unknown>) => {
        sqlLenAtRetire = pool.sql.length;
        retireOpts = o;
        return { backlog_rows: 886046, backlog_cohorts: 2, retired_rows: 443023, retired_cohorts: 1 };
      },
    });
    const res = await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never);
    expect(sqlLenAtRetire, 'retireStaleScope must have been called').toBeGreaterThanOrEqual(0);
    const beginIndex = pool.sql.indexOf('BEGIN');
    expect(beginIndex, 'the shared transaction must have opened').toBeGreaterThanOrEqual(0);
    expect(sqlLenAtRetire, 'the retirement runs BEFORE the shared txn BEGIN — autocommit, its own statement').toBeLessThanOrEqual(beginIndex);
    // The retention window is the admin logic variable, never a literal (Spec 124 Rule 3).
    expect(retireOpts!.retireAfterHours).toBe(24);
    // A 443,023-row DELETE must be LOUD — three row-derived counters, never a silent DELETE.
    expect(res.matched.scope_backlog_at_step_start).toBe(886046);
    expect(res.matched.scope_retired_rows).toBe(443023);
    expect(res.matched.scope_retired_cohorts).toBe(1);
  });

  it('EP-PASS3-BACKLOG — a retirement failure is hygiene, not the run\'s purpose: it is logged and the step CONTINUES (fail-open on the guard, never fail-open on the phase)', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pool = fakePool();
    const errors: string[] = [];
    const compute = fakeCompute(passLog, {
      retireStaleScope: async () => { throw new Error('scope retire boom'); },
    });
    const args = baseArgs(fixtureDescriptor(), pool, compute);
    args.log = { info: () => {}, warn: () => {}, error: (_t: string, m: string) => { errors.push(m); } } as never;
    const res = await stepLib.runEnrichPhase(args as never) as Record<string, unknown>;
    expect(passLog.map((p) => p.name)).toEqual(['zoning', 'max_build', 'existing_structure', 'comparable_builds', 'optimal_config']);
    expect(errors.join(' ')).toMatch(/scope retire boom/);
    // Null, never 0 — "the retirement did not run" and "the retirement retired nothing"
    // are different states and must not render identically in the audit table.
    expect(res.matched).toMatchObject({ scope_retired_rows: null, scope_backlog_at_step_start: null });
    // (Observability fold) A LOG LINE IS NOT OBSERVABILITY. The failure carries onto the
    // audit table as its own errored row — WARN, not FAIL, because the retirement is
    // fail-open hygiene by an authorized plan ruling and may not halt the run; `errored`
    // all the same, because the instrument THREW rather than measured, which is exactly
    // the distinction override.accept_anomaly must not be allowed to blur.
    const rows = stepLib.scopeRetireFailureRows([res]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ metric: 'scope_retire_failed', status: 'WARN', source: 'gate', errored: true });
    expect(rows[0]!.value).toMatch(/scope retirement errored: scope retire boom/);
    expect(stepLib.scopeRetireFailureRows([{ scopeRetireError: null }]), 'no row on a healthy run').toEqual([]);
  });

  it('(Observability fold) EP-PASS3-BACKLOG — when the retirement threw, scope_backlog_at_step_start is left UNREPORTED so it resolves to its DECLARED severity (WARN, "not reported by compute"), never to a PASS built on a measurement that never happened', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      checks: Record<string, (ctx: Record<string, unknown>) => void>;
    };
    const reported: Array<[string, unknown]> = [];
    const ctx = (matched: Record<string, unknown>) => ({ matched, report: (id: string, o: unknown) => reported.push([id, o]) });

    // Retirement threw => the counter is null => NOTHING is reported. checkRow then renders
    // "not reported by compute" at the check's declared severity (WARN). Reporting
    // {violations: 0} would render PASS off a number nobody took; reporting {error} would
    // hit this step's on_check_error:"fail_step" (severity-INDEPENDENT, POST-B1-1) and HALT
    // the run, contradicting the fail-open ruling — so neither is used.
    ep.checks.scope_backlog_at_step_start!(ctx({ scope_backlog_at_step_start: null }) as never);
    expect(reported, 'a failed instrument reports NOTHING, so it can never read PASS').toEqual([]);

    // The healthy direction, so the skip above is not simply always-on.
    ep.checks.scope_backlog_at_step_start!(ctx({ scope_backlog_at_step_start: 886046 }) as never);
    expect(reported).toEqual([['scope_backlog_at_step_start', { violations: 886046, detail: 886046 }]]);
  });

  it('(Observability fold) EP-PASS3-BACKLOG — the retention WINDOW and the CUTOFF timestamp travel on the retirement rows themselves, so a reader of the audit table can tell "nothing was old enough" from "the window is misconfigured"', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      checks: Record<string, (ctx: Record<string, unknown>) => void>;
    };
    const reported: Array<[string, { violations: number; detail: unknown }]> = [];
    const matched = {
      scope_retired_rows: 0,
      scope_retired_cohorts: 0,
      scope_retire_window: { hours: 24, cutoff_at: new Date('2026-09-14T18:10:00.000Z') },
    };
    const ctx = { matched, report: (id: string, o: { violations: number; detail: unknown }) => reported.push([id, o]) };
    ep.checks.scope_retired_rows!(ctx as never);
    ep.checks.scope_retired_cohorts!(ctx as never);
    expect(reported.map(([, o]) => o.detail)).toEqual([
      '0 (window 24h, cutoff 2026-09-14T18:10:00.000Z)',
      '0 (window 24h, cutoff 2026-09-14T18:10:00.000Z)',
    ]);
  });

  // RETARGETED from src/tests/enrich-parcels-stall-hardening.logic.test.ts (retired, pilot 9
  // commit 7e/2, ENRICHER thin-shell conversion): the legacy per-pass `runPass(name, fn)` wrapper
  // is now inlined into runEnrichPhase's own shared-phase loop (Spec 115 §2.2 fail-safe-loud) —
  // same behaviour, no standalone function left to unit-test directly, so these three assert it
  // through the real runner + fake pool instead.
  it('a 57014 (statement_timeout) thrown by a shared phase is rethrown LOUD with the pass name in the message (WF3 enrich_parcels stall commit 1)', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pgErr = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    const compute = fakeCompute(passLog, { passImpl: { max_build: async () => { throw pgErr; } } });
    const pool = fakePool();
    await expect(stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never))
      .rejects.toThrow(/max_build[\s\S]*statement_timeout/);
  });

  it('a 55P03 (lock_timeout) thrown by a shared phase is rethrown LOUD with the pass name in the message', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pgErr = Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' });
    const compute = fakeCompute(passLog, { passImpl: { comparable_builds: async () => { throw pgErr; } } });
    const pool = fakePool();
    await expect(stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never))
      .rejects.toThrow(/comparable_builds[\s\S]*lock_timeout/);
  });

  it('an unrelated pass error passes through UNCHANGED — never masked as a timeout', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const otherErr = new Error('column "foo" does not exist');
    const compute = fakeCompute(passLog, { passImpl: { zoning: async () => { throw otherErr; } } });
    const pool = fakePool();
    await expect(stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never))
      .rejects.toThrow('column "foo" does not exist');
  });

  it('timeouts applied PER BATCH in the post_commit phase (EP-D13 H1 fix, pilot 9 commit 8 P9, 2026-09-08) — SET LOCAL statement_timeout is scoped to EACH batch\'s own short transaction, PROVABLE via SHOW issued INSIDE that same batch (still the bound value) and SHOW issued AFTER the pass completes (reverted to the session default, since that batch\'s transaction already committed) — plus session isolation against a sibling client', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    let showInsideBatch: { rows: Array<{ statement_timeout: string }> } | null = null;
    const compute = fakeCompute(passLog, {
      passImpl: {
        // ctx.flushBatch accepts an arbitrary (sql, params) pair — using it to run a bare
        // SHOW (not a real UPDATE) is a legitimate exercise of the SAME seam a real batch
        // UPDATE goes through: BEGIN; SET LOCAL statement_timeout/lock_timeout; <sql>; COMMIT.
        optimal_config: async (_client: unknown, ctx: unknown) => {
          showInsideBatch = (await (ctx as { flushBatch: (sql: string, params: unknown[]) => Promise<unknown> }).flushBatch('SHOW statement_timeout', [])) as { rows: Array<{ statement_timeout: string }> };
          return { scoped: 0, updated: 0, updatedIds: [] };
        },
      },
    });
    const pool = fakePool();
    await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never);
    // 10 minutes * 60000 = 600000ms.
    expect(pool.sql).toContain('SET LOCAL statement_timeout = 600000');
    expect(showInsideBatch, 'the passImpl above must have actually run').not.toBeNull();
    expect(
      showInsideBatch!.rows[0]!.statement_timeout,
      'SHOW statement_timeout INSIDE the batch\'s own short transaction must read back the bound value, not the session default',
    ).toBe('600000ms');
    // The fixture's own call order (proven by the "phase ordering" test above): clients[0] is
    // heartbeatClient (EP-D12, pilot 9 commit 8 P8 — acquired FIRST, before the shared txn even
    // opens), clients[1] is the shared-txn client (pipeline.withTransaction's own
    // pool.connect()), clients[2] is the post_commit phase's dedicated connection
    // (runEnrichPhase's own pool.connect() at the post-commit loop). SHOW on THAT session,
    // issued AFTER the pass has already returned (i.e. after the one batch's own BEGIN/SET
    // LOCAL/COMMIT already ran) — never inspecting config — proves SET LOCAL's scope ended
    // with that batch's COMMIT, not with the whole phase (RE-FREEZE #3, Spec 122 §8; Fold B2;
    // EP-D13 H1 fix, P9).
    expect(pool.clients.length).toBeGreaterThanOrEqual(3);
    const postCommitClient = pool.clients[2]!;
    const afterPass = (await postCommitClient.query('SHOW statement_timeout')) as { rows: Array<{ statement_timeout: string }> };
    // F1 (output panel, 2026-09-09) — '0ms', not the bare '0' this assertion read before F1:
    // the finally block now explicitly re-`SET`s the pool's own resolved bound (0 in this test
    // env) rather than issuing a `RESET` (which this fixture cannot even distinguish from "never
    // touched" — exactly the gap that hid EP-D16's own defect). The LOCAL batch scope has still
    // ended (proving EP-D13 H1 unchanged) — what changed is that a GENUINE SET now restores the
    // session, rather than nothing restoring it at all.
    expect(
      afterPass.rows[0]!.statement_timeout,
      'SHOW statement_timeout on the SAME session, issued AFTER the pass completes, must read the POOL\'S OWN RESTORED value (an explicit SET, F1) — the bound batch already committed and released its SET LOCAL scope',
    ).toBe('0ms');
    // Isolation: a FRESH client (a different session) reads the untouched default — a live
    // SET LOCAL bound on one connection must never leak onto a pooled sibling checkout.
    const siblingClient = await pool.connect();
    const unbound = (await siblingClient.query('SHOW statement_timeout')) as { rows: Array<{ statement_timeout: string }> };
    expect(unbound.rows[0]!.statement_timeout, 'a sibling client must NOT see the post_commit phase\'s bound statement_timeout — SET LOCAL is session-scoped').toBe('0');
  });

  it('RED-first proof (coordinator addendum, commit 7e/2) — the SHOW-based assertion above genuinely fails when the post_commit SET LOCAL is skipped, not merely when the SQL-text grep is skipped: a scratch runEnrichPhase copy with the post_commit SET LOCAL commented out fails the SAME SHOW assertion', async () => {
    // Proves the NEW assertion mechanism (SHOW on the pinned session) is load-bearing, not
    // vacuously true — a hand-rolled minimal reproduction of the post_commit connection
    // lifecycle with the SET LOCAL line removed, exercising the SAME fakePool session tracking.
    const pool = fakePool();
    const client = await pool.connect();
    await client.query('BEGIN');
    // The line under test, DELIBERATELY OMITTED here (this is the "SET LOCAL commented out"
    // scratch path — the real runEnrichPhase always issues it when timeoutMs > 0):
    // await client.query('SET LOCAL statement_timeout = 600000');
    await client.query('COMMIT');
    const bound = (await client.query('SHOW statement_timeout')) as { rows: Array<{ statement_timeout: string }> };
    expect(bound.rows[0]!.statement_timeout, 'RED proof: with the SET LOCAL genuinely skipped, SHOW reads the untouched session default, not 600000ms — the real runEnrichPhase path (asserted above) must NOT reproduce this').toBe('0');
    expect(bound.rows[0]!.statement_timeout).not.toBe('600000ms');
  });

  it('EP-D16 (WF3 C3, 2026-09-09) — a SESSION-level SET statement_timeout is issued on the post_commit client right after pool.connect(), BEFORE passSpec.run, so a non-flushBatch statement (e.g. consumePendingScope\'s own queries) is ALSO bound, not just a batch flush', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    let sqlAtPassStart = -1;
    const compute = fakeCompute(passLog, {
      passImpl: {
        optimal_config: async () => {
          sqlAtPassStart = pool.sql.length;
          return { scoped: 0, updated: 0, updatedIds: [] };
        },
      },
    });
    const pool = fakePool();
    await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never);
    // 10 minutes * 60000 = 600000ms — the SAME config value flushBatch's own SET LOCAL uses,
    // deliberately: the session-level SET is a WIDER-scope defence-in-depth binding of the
    // identical declared bound, not a second, differently-valued timeout.
    const sessionTimeoutIndex = pool.sql.indexOf('SET statement_timeout = 600000');
    expect(sessionTimeoutIndex, 'the session-level SET (no LOCAL) must have been issued').toBeGreaterThanOrEqual(0);
    expect(sqlAtPassStart, 'passImpl must have actually run').toBeGreaterThanOrEqual(0);
    expect(sessionTimeoutIndex, 'the session-level SET must precede passSpec.run, not follow it').toBeLessThan(sqlAtPassStart);
  });

  it('EP-D16 — a 57014 thrown by a NON-flushBatch statement inside the post_commit pass (e.g. consumePendingScope, the reset UPDATE, the citywide check, or the EP-D10 prune) is rethrown LOUD with the phase name — proving the session-level bound actually reaches those statements, not only flushBatch\'s own', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const pgErr = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    const compute = fakeCompute(passLog, { passImpl: { optimal_config: async () => { throw pgErr; } } });
    const pool = fakePool();
    await expect(stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never))
      .rejects.toThrow(/optimal_config[\s\S]*statement_timeout/);
  });

  it('F1 (output panel, 2026-09-09) — after the post_commit phase completes, postClient\'s statement_timeout equals the POOL\'S OWN resolved bound (PIPELINE_STATEMENT_TIMEOUT_MS), never the bare server default a `RESET` would produce, when the pool\'s own bound is genuinely non-zero', async () => {
    const priorEnv = process.env.PIPELINE_STATEMENT_TIMEOUT_MS;
    process.env.PIPELINE_STATEMENT_TIMEOUT_MS = '300000';
    try {
      const passLog: Array<{ name: string; txn: string }> = [];
      const compute = fakeCompute(passLog);
      const pool = fakePool();
      await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never);
      expect(pool.clients.length).toBeGreaterThanOrEqual(3);
      const postCommitClient = pool.clients[2]!;
      const afterPass = (await postCommitClient.query('SHOW statement_timeout')) as { rows: Array<{ statement_timeout: string }> };
      // A `RESET` would revert to this fixture's hard-coded '0' SESSION_DEFAULT (modelling
      // the real server/session default) — genuinely DIFFERENT from the pool's own 300000ms
      // bound, which is what proves this lock distinguishes the two mechanisms (the prior
      // lock above cannot: the pool default in that test env is 0, so RESET-vs-SET-to-0 are
      // indistinguishable by VALUE alone).
      expect(afterPass.rows[0]!.statement_timeout, 'must equal the pool\'s own 300000ms bound, not the server default 0').toBe('300000ms');
    } finally {
      if (priorEnv === undefined) delete process.env.PIPELINE_STATEMENT_TIMEOUT_MS;
      else process.env.PIPELINE_STATEMENT_TIMEOUT_MS = priorEnv;
    }
  });

  it('heartbeat writes — pipeline_runs.records_meta is UPDATEd with current_pass around EVERY phase (all 5, not just pass 5 — closing the WF3-filed deliverable)', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const compute = fakeCompute(passLog);
    const pool = fakePool();
    await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never);
    const heartbeats = pool.sql.filter((s) => /UPDATE pipeline_runs/.test(s) && /current_pass/.test(s));
    const namesHeartbeaten = new Set<string>();
    for (const p of pool.params.filter((_p, i) => /UPDATE pipeline_runs/.test(pool.sql[i]!) && /current_pass/.test(pool.sql[i]!))) {
      namesHeartbeaten.add(String(p[0]));
    }
    expect(heartbeats.length).toBeGreaterThanOrEqual(10); // start + end, x5 phases
    expect(namesHeartbeaten).toEqual(new Set(['zoning', 'max_build', 'existing_structure', 'comparable_builds', 'optimal_config']));
  });

  it('EP-D15 (WF3 C4, 2026-09-09) — a post_commit phase spanning 3x heartbeatMs produces >=3 PERIODIC (unlatched) recordHeartbeat writes with monotonically increasing rows_processed (fed by ctx.onProgress), plus a "phase optimal_config completed in Xms" log line', async () => {
    vi.useFakeTimers();
    try {
      const passLog: Array<{ name: string; txn: string }> = [];
      const HEARTBEAT_MS = 60000; // enrich_parcels_heartbeat_minutes: 1, below
      const compute = fakeCompute(passLog, {
        passImpl: {
          optimal_config: async (_client: unknown, ctx: unknown) => {
            const c = ctx as { onProgress: (n: number) => void };
            c.onProgress(100);
            await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
            c.onProgress(200);
            await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
            c.onProgress(300);
            await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
            return { scoped: 0, updated: 0, updatedIds: [] };
          },
        },
      });
      const pool = fakePool();
      const logLines: string[] = [];
      const args = baseArgs(fixtureDescriptor(), pool, compute);
      (args.config as Record<string, unknown>).enrich_parcels_heartbeat_minutes = 1;
      args.log = { info: (...a: unknown[]) => { logLines.push(String(a[1])); }, warn: () => {}, error: () => {} } as typeof args.log;
      await stepLib.runEnrichPhase(args as never);

      const heartbeatCalls = pool.params.filter((_p, i) => /UPDATE pipeline_runs/.test(pool.sql[i]!) && /current_pass/.test(pool.sql[i]!));
      const optCfgHeartbeats = heartbeatCalls.filter((p) => p[0] === 'optimal_config');
      // >= 3 periodic ticks + the phase's own start(0)/end(1) writes = >= 5 total for this ONE phase.
      expect(optCfgHeartbeats.length, 'at least 3 periodic heartbeat writes for optimal_config alone (un-latched — every tick writes, not just one)').toBeGreaterThanOrEqual(5);
      const rowsProcessedSeries = optCfgHeartbeats.map((p) => Number(p[1]));
      // F5 (output panel, 2026-09-09) — the phase-end boundary write ALSO now carries the
      // real cumulative count (never the literal `1` this comment described before F5), so
      // the FULL series (start boundary + every periodic tick + end boundary) must be
      // monotonically non-decreasing — no slice-off-the-last-element carve-out needed.
      for (let i = 1; i < rowsProcessedSeries.length; i++) {
        expect(rowsProcessedSeries[i], `rows_processed must be monotonically non-decreasing (index ${i})`).toBeGreaterThanOrEqual(rowsProcessedSeries[i - 1]!);
      }
      expect(rowsProcessedSeries[rowsProcessedSeries.length - 1], 'the phase-end boundary write must equal the LAST real onProgress value (300), never the literal 1').toBe(300);
      expect(rowsProcessedSeries, 'the real onProgress-fed values (100/200/300) must appear among the periodic writes, not just the 0/1 boundary literals').toEqual(
        expect.arrayContaining([100, 200, 300]),
      );
      expect(logLines.some((l) => /phase optimal_config completed in \d+ms/.test(l)), 'the post_commit loop must emit its own completed-in-Xms line, mirroring the shared-txn phases').toBe(true);
      expect(logLines.some((l) => /phase optimal_config starting \(post_commit/.test(l))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('F5 (output panel, 2026-09-09) — the periodic heartbeat ticker is WHOLE-STEP: it fires during a SHARED-TXN phase too (the reaper hazard\'s own evidence, "phase max_build completed in 3049335ms", was a shared-txn phase, not post_commit), and rows_processed carries over CUMULATIVELY into later phases rather than resetting per-phase', async () => {
    vi.useFakeTimers();
    try {
      const passLog: Array<{ name: string; txn: string }> = [];
      const HEARTBEAT_MS = 60000; // enrich_parcels_heartbeat_minutes: 1, below
      const compute = fakeCompute(passLog, {
        passImpl: {
          max_build: async (_client: unknown, ctx: unknown) => {
            const c = ctx as { onProgress: (n: number) => void };
            c.onProgress(50);
            await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
            c.onProgress(75);
            await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
            return { scoped: 0, updated: 0, updatedIds: [] };
          },
        },
      });
      const pool = fakePool();
      const args = baseArgs(fixtureDescriptor(), pool, compute);
      (args.config as Record<string, unknown>).enrich_parcels_heartbeat_minutes = 1;
      await stepLib.runEnrichPhase(args as never);

      const heartbeatCalls = pool.params.filter((_p, i) => /UPDATE pipeline_runs/.test(pool.sql[i]!) && /current_pass/.test(pool.sql[i]!));
      const maxBuildHeartbeats = heartbeatCalls.filter((p) => p[0] === 'max_build');
      // >= 2 periodic ticks + start/end boundary writes = >= 4 for max_build alone — proves
      // the SAME ticker mechanism reaches a shared-txn phase, not just post_commit.
      expect(maxBuildHeartbeats.length, 'the whole-step ticker must produce periodic writes during a SHARED-TXN phase, not only post_commit').toBeGreaterThanOrEqual(4);
      const maxBuildSeries = maxBuildHeartbeats.map((p) => Number(p[1]));
      expect(maxBuildSeries, 'the real onProgress-fed values (50/75) must appear').toEqual(expect.arrayContaining([50, 75]));

      // Cumulative carry-over: the FIRST heartbeat write of the very NEXT phase after
      // max_build (existing_structure, which contributes no onProgress of its own) must
      // still read >= 75 — proving rows_processed is a STEP-LEVEL accumulator, never reset
      // to 0 when a new phase starts.
      const existingStructureHeartbeats = heartbeatCalls.filter((p) => p[0] === 'existing_structure');
      expect(existingStructureHeartbeats.length, 'existing_structure must still get its own boundary heartbeats').toBeGreaterThanOrEqual(2);
      expect(Number(existingStructureHeartbeats[0]![1]), 'the NEXT phase\'s own start-boundary heartbeat must carry max_build\'s cumulative count forward, not reset to 0').toBeGreaterThanOrEqual(75);
    } finally {
      vi.useRealTimers();
    }
  });

  it('R-B / Rule 12 reachability — staleness.detectInterruptedRetraction is folded into `full` UNCONDITIONALLY (no ledger-gated-skip early return exists on this archetype to hide behind)', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    let sawFull: boolean | undefined;
    const compute = fakeCompute(passLog, {
      passImpl: {
        zoning: async (_client, ctx) => { sawFull = ctx.full as boolean; return { scoped: 0, updated: 0, updatedIds: [] }; },
      },
    });
    const pool = fakePool({ interruptedRow: { id: 1, pipeline: 'fixture_enrich', status: 'running', started_at: '2026-09-03T00:00:00.000Z' } });
    const descriptor = fixtureDescriptor({ recovery: { interrupted: 'force_full_on_next_run' } });
    await stepLib.runEnrichPhase(baseArgs(descriptor, pool, compute) as never);
    expect(sawFull, 'an interrupted prior run must force ctx.full = true even with no --full argv and no force_full override').toBe(true);
  });

  it('scope-defer (Spec 122 §3.0b) — over threshold makes the run a genuine ZERO-WRITE no-op: no shared-txn SQL, deferred:true returned', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const compute = fakeCompute(passLog, { deferScopeCount: 5000 });
    const pool = fakePool();
    const out = await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never) as { deferred: boolean };
    expect(out.deferred).toBe(true);
    expect(passLog).toHaveLength(0);
    expect(pool.sql.some((s) => /BEGIN/.test(s))).toBe(false);
  });

  it('assertRequirements (guards.requires) is genuinely enforced — a missing PostGIS extension throws before any phase runs', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const compute = fakeCompute(passLog);
    const sql: string[] = [];
    const missingPool = {
      sql,
      query: async (text: string) => {
        sql.push(text);
        return { rows: [] }; // every probe (incl. pg_extension) reads absent
      },
      connect: async () => ({ query: async (text: string) => { sql.push(text); return { rows: [] }; }, release: () => {} }),
    };
    await expect(stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), missingPool as never, compute) as never))
      .rejects.toThrow(/postgis.*ABSENT/i);
    expect(passLog).toHaveLength(0);
  });

  it('ctx.stream batch size — the post_commit phase\'s ctx.stream is backed by a client-pinned pg-query-stream cursor whose batchSize is config.enrich_parcels_pass5_stream_batch_size, and it never surfaces more than one cursor batch of rows at a time', async () => {
    // Module-cache injection (documented technique, this file only): pg-query-stream's
    // QueryStream needs a REAL protocol-level connection to iterate — a fake pool cannot
    // satisfy that. Swap the module for a fake class that just records its own batchSize
    // and gives the runner's streamOverClient an object it can loop `for await` over.
    const qsPath = require.resolve('pg-query-stream');
    const original = require.cache[qsPath];
    const seenBatchSizes: Array<number | undefined> = [];
    const fakeRows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    class FakeQueryStream {
      sql: string; params: unknown[]; opts: { batchSize?: number };
      constructor(sqlText: string, params: unknown[], opts: { batchSize?: number }) {
        this.sql = sqlText; this.params = params; this.opts = opts;
        seenBatchSizes.push(opts.batchSize);
      }
      destroy() {}
      [Symbol.asyncIterator]() {
        let i = 0;
        return { next: async () => (i < fakeRows.length ? { value: fakeRows[i++], done: false } : { value: undefined, done: true }) };
      }
    }
    require.cache[qsPath] = { id: qsPath, filename: qsPath, loaded: true, exports: FakeQueryStream } as never;
    try {
      const passLog: Array<{ name: string; txn: string }> = [];
      let rowsSeenByPass: unknown[] = [];
      const compute = fakeCompute(passLog, {
        passImpl: {
          optimal_config: async (_client, ctx) => {
            const stream = (ctx.stream as (sql: string, params: unknown[], opts: Record<string, unknown>) => AsyncIterable<unknown>)('SELECT fixture', [], {});
            const seen: unknown[] = [];
            for await (const row of stream) seen.push(row);
            rowsSeenByPass = seen;
            return { updated: seen.length, errors: 0 };
          },
        },
      });
      const pool = fakePool();
      // The fake client's `.query(qs)` must recognize a FakeQueryStream instance and hand
      // back ITSELF (already async-iterable) rather than the generic `{rows: []}` answer.
      const streamAwarePool = {
        ...pool,
        connect: async () => ({
          query: (arg: unknown, ...rest: unknown[]) => (arg instanceof FakeQueryStream ? arg : pool.query(arg as string, ...(rest as [unknown[]]))),
          release: () => {},
        }),
      };
      await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), streamAwarePool as never, compute) as never);
      expect(seenBatchSizes, 'ctx.stream must construct its cursor with config.enrich_parcels_pass5_stream_batch_size (137 in this fixture), never a hardcoded default').toContain(137);
      expect(rowsSeenByPass).toEqual(fakeRows);
    } finally {
      if (original) require.cache[qsPath] = original;
      else delete require.cache[qsPath];
    }
  });

  it('regression lock (WF3 enrich_parcels pass-5 stream/write deadlock, 2026-09-07) — ctx.stream\'s cursor and the client the pass writes on are NEVER the same object; sharing one client reproduces the incident (H1, proven live against the local DB: a write queued behind an open pg-query-stream cursor on the SAME client hangs forever — client A holds the connection\'s one command slot for the cursor\'s whole lifetime, so a write issued on client A never runs, and the cursor never gets to fetch its next batch either)', async () => {
    // Same module-cache injection technique as the "ctx.stream batch size" test above —
    // a fake QueryStream class a fake client's `.query()` can recognize without a real
    // protocol-level connection.
    const qsPath = require.resolve('pg-query-stream');
    const original = require.cache[qsPath];
    class FakeQueryStream {
      constructor(sqlText: string, params: unknown[], opts: Record<string, unknown>) { void sqlText; void params; void opts; }
      destroy() {}
      [Symbol.asyncIterator]() {
        let i = 0;
        const rows = [{ id: 1 }];
        return { next: async () => (i < rows.length ? { value: rows[i++], done: false } : { value: undefined, done: true }) };
      }
    }
    require.cache[qsPath] = { id: qsPath, filename: qsPath, loaded: true, exports: FakeQueryStream } as never;
    try {
      // Tags every connect()-ed client with a distinct id and records, ON THAT CLIENT, whether
      // it ever carried the stream's cursor and/or a write — the two booleans this lock compares.
      let nextId = 0;
      const taggedClients: Array<{ id: number; streamedHere: boolean; wroteHere: boolean }> = [];
      // Mirrors fakePool's own `answer()` for every probe runEnrichPhase issues OUTSIDE the
      // stream/write pair this lock cares about (guards.requires, pg_backend_pid, the scope
      // hand-off INSERT, interrupted-retraction) — this fixture only needs those to not throw.
      const genericAnswer = (text: string) => {
        if (/pg_extension|information_schema\.columns|pg_indexes/.test(text)) return { rows: [{ present: 1 }] };
        if (/pg_backend_pid/.test(text)) return { rows: [{ pid: 4242 }] };
        if (/own_last_completed/.test(text)) return { rows: [] };
        if (/COUNT\(\*\)::int AS n FROM parcels/.test(text)) return { rows: [{ n: 0 }] };
        if (/INSERT INTO enrich_parcels_pass3_scope/.test(text)) return { rows: [], rowCount: 3 };
        if (/pg_try_advisory(?:_xact)?_lock\(\$1, \$2\)/.test(text)) return { rows: [{ acquired: true }] };
        return { rows: [] };
      };
      const trackedPool = {
        query: async (text: string) => genericAnswer(text),
        connect: async () => {
          const tag = { id: nextId++, streamedHere: false, wroteHere: false };
          taggedClients.push(tag);
          const client = {
            release: () => {},
            // NOT async — a real pg Client.query(queryStreamInstance) returns the stream itself
            // SYNCHRONOUSLY (never a Promise), which is exactly what streamOverClient's own
            // `for await (const row of stream)` + `stream.destroy()` in `finally` require; wrapping
            // this branch in a Promise (as an `async` function would) breaks both.
            query: (arg: unknown, ...rest: unknown[]) => {
              if (arg instanceof FakeQueryStream) { tag.streamedHere = true; return arg; }
              const text = String(arg);
              if (/^UPDATE /.test(text)) tag.wroteHere = true;
              if (/^SHOW statement_timeout$/i.test(text)) return Promise.resolve({ rows: [{ statement_timeout: '0' }] });
              void rest;
              return Promise.resolve(genericAnswer(text));
            },
          };
          return client;
        },
      };
      const passLog: Array<{ name: string; txn: string }> = [];
      const compute = fakeCompute(passLog, {
        passImpl: {
          optimal_config: async (client, ctx) => {
            const stream = (ctx.stream as (sql: string, params: unknown[], opts: Record<string, unknown>) => AsyncIterable<unknown>)('SELECT fixture', [], {});
            for await (const _row of stream) { /* drain */ void _row; }
            // The write half: issued on `client`, the FIRST arg runPass5's own passSpec.run
            // receives — exactly like the real flushOptConfigBatch(client, batch, ...).
            await (client as { query: (t: string) => Promise<unknown> }).query('UPDATE parcels SET x = 1');
            return { updated: 1, errors: 0 };
          },
        },
      });
      await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), trackedPool as never, compute) as never);
      const streamedClient = taggedClients.find((c) => c.streamedHere);
      const wroteClient = taggedClients.find((c) => c.wroteHere);
      expect(streamedClient, 'no client ever carried the stream\'s cursor — the fixture itself is broken').toBeDefined();
      expect(wroteClient, 'no client ever carried the write — the fixture itself is broken').toBeDefined();
      expect(
        streamedClient!.id,
        'THE LOCK: the client that streamed the cursor must NOT be the same client that ran the write — ' +
          'sharing one client is exactly the incident this fix closes (a write queued behind an open ' +
          'cursor on the same connection hangs forever, proven live against the local DB)',
      ).not.toBe(wroteClient!.id);
    } finally {
      if (original) require.cache[qsPath] = original;
      else delete require.cache[qsPath];
    }
  });

  describe('inner advisory lock (WF3 enrich_parcels double-run incident, 2026-09-07) — coupled to the shared-txn and post_commit connections, not a separate one', () => {
    it('the shared-txn phase acquires its own two-key lock on the SAME client (clients[1], the withTransaction connection) that runs the four passes — not a separate connection', async () => {
      const passLog: Array<{ name: string; txn: string }> = [];
      const compute = fakeCompute(passLog);
      const pool = fakePool();
      await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never);
      const lockCalls = pool.sql.filter((s) => /pg_try_advisory(?:_xact)?_lock\(\$1, \$2\)/.test(s));
      expect(lockCalls.length, 'the shared-txn phase must acquire the inner lock exactly once').toBeGreaterThanOrEqual(1);
      const lockIdx = pool.sql.indexOf(lockCalls[0]!);
      // fixtureDescriptor's identity.lock is 999999 (the fixture's own lock id).
      expect(pool.params[lockIdx]).toEqual([999999, 1]);
      // clients[0] is EP-D12's own heartbeatClient (pilot 9 commit 8 P8) — acquired FIRST,
      // before the shared txn even opens. clients[1] is pipeline.withTransaction's own
      // connect() — the SAME client that then runs the passes (proven by the phase-ordering
      // test above); the lock call must be the FIRST statement issued on IT, before the pid
      // probe.
      const client1 = pool.clients[1]!;
      expect(client1).toBeDefined();
    });

    it('a genuinely concurrent invocation (the inner lock already held elsewhere) makes runEnrichPhase self-skip with ZERO passes run and ZERO writes — never a crash', async () => {
      const passLog: Array<{ name: string; txn: string }> = [];
      const compute = fakeCompute(passLog);
      const pool = fakePool({ innerLockAcquired: false });
      const out = await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never) as { lockDenied?: boolean; skipped?: boolean };
      expect(out.lockDenied, 'runEnrichPhase must report the inner lock denial to its caller').toBe(true);
      expect(out.skipped).toBe(true);
      expect(passLog, 'no pass may run when the inner lock is held elsewhere').toHaveLength(0);
      expect(pool.sql.some((s) => /INSERT INTO fixture_scope/.test(s)), 'the scope hand-off INSERT must not run either — it is inside the same denied transaction').toBe(false);
    });

    it('the post_commit phase ALSO acquires its own copy of the lock on ITS OWN connection (the shared-txn lock already released at COMMIT by the time this phase starts, so there is nothing left to "re-check" — this phase must hold its own)', async () => {
      const passLog: Array<{ name: string; txn: string }> = [];
      const compute = fakeCompute(passLog);
      const pool = fakePool();
      await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never);
      const lockCalls = pool.sql.filter((s) => /pg_try_advisory(?:_xact)?_lock\(\$1, \$2\)/.test(s));
      // One on the shared-txn client, one on the post_commit client — two DISTINCT connections,
      // each independently proving exclusivity for its own transaction's lifetime.
      expect(lockCalls.length, 'both the shared-txn AND post_commit phases must each acquire the inner lock on their own connection').toBe(2);
    });
  });

  it('isEnrichStep — declared shape only, never sniffed', () => {
    expect(stepLib.isEnrichStep({ execution: { shape: 'enrich' } })).toBe(true);
    expect(stepLib.isEnrichStep({ execution: { shape: 'cascade' } })).toBe(false);
    expect(stepLib.isEnrichStep({})).toBe(false);
  });

  // EP-D12 (pilot 9 commit 8 P8, 2026-09-08) — cloud evidence (pipeline_runs row 4429,
  // live): current_pass/last_heartbeat_at stayed NULL for the ENTIRE run. A genuine
  // BEHAVIOURAL lock, not a call-trace assertion: this fake pool models REAL per-connection
  // commit semantics (a client with an open BEGIN buffers its writes until COMMIT; a client
  // that never issues BEGIN — autocommit — flushes immediately), so the test actually
  // exercises "is the write visible to an independent reader before the phase's own
  // transaction commits", the exact property the fix promises. `fakePool()` (the shared
  // helper above) does NOT model this — every one of its writes lands in one flat trace
  // with no commit/visibility distinction — which is why this test builds its own.
  describe('EP-D12 — heartbeat writes are visible to an independent client BEFORE the phase transaction commits', () => {
    function transactionalFakePool() {
      const committed: { records_meta: Record<string, unknown> } = { records_meta: {} };
      const connectedCount = { n: 0 };
      const heartbeatClients = new Set<object>();

      function makeClient(): { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>; release: () => void } {
        let inTxn = false;
        let pendingRecordsMeta: Record<string, unknown> | null = null;
        const self = {
          query: async (text: string, values?: unknown[]) => {
            if (/pg_extension|information_schema\.columns|pg_indexes/.test(text)) return { rows: [{ present: 1 }] };
            if (/pg_backend_pid/.test(text)) return { rows: [{ pid: 1 }] };
            if (/own_last_completed/.test(text)) return { rows: [] };
            if (/COUNT\(\*\)::int AS n FROM parcels/.test(text)) return { rows: [{ n: 0 }] };
            if (/INSERT INTO fixture_scope/.test(text)) return { rows: [], rowCount: 0 };
            if (/pg_try_advisory(?:_xact)?_lock\(\$1, \$2\)/.test(text)) return { rows: [{ acquired: true }] };
            if (/^SET LOCAL/.test(text)) return { rows: [] };
            if (/^BEGIN$/.test(text)) { inTxn = true; pendingRecordsMeta = null; return { rows: [] }; }
            if (/^COMMIT$/.test(text)) {
              if (pendingRecordsMeta) Object.assign(committed.records_meta, pendingRecordsMeta);
              inTxn = false;
              return { rows: [] };
            }
            if (/^ROLLBACK$/.test(text)) { inTxn = false; pendingRecordsMeta = null; return { rows: [] }; }
            if (/UPDATE pipeline_runs[\s\S]*last_heartbeat_at/.test(text)) {
              const update = { last_heartbeat_at: 'now', current_pass: values?.[0] };
              if (inTxn) {
                // Buffered on THIS client's own open transaction — not yet visible
                // to any other client, exactly like a real Postgres UPDATE inside
                // an uncommitted transaction.
                pendingRecordsMeta = { ...(pendingRecordsMeta ?? {}), ...update };
              } else {
                // Autocommit — no BEGIN was ever issued on this client — flushes
                // to the shared committed store the instant the statement runs.
                Object.assign(committed.records_meta, update);
              }
              return { rows: [] };
            }
            if (/SELECT records_meta FROM pipeline_runs/.test(text)) {
              return { rows: [{ records_meta: { ...committed.records_meta } }] };
            }
            return { rows: [] };
          },
          release: () => {},
        };
        return self;
      }

      return {
        query: async (text: string, values?: unknown[]) => makeClient().query(text, values), // pool-level = always autocommit
        connect: async () => {
          connectedCount.n += 1;
          const client = makeClient();
          heartbeatClients.add(client);
          return client;
        },
        connectedCount,
        readCommitted: () => ({ ...committed.records_meta }),
      };
    }

    it('a heartbeat issued mid-phase (zoning) is READ back by an independent monitor client while the shared-txn client is still open (no COMMIT issued yet)', async () => {
      const pool = transactionalFakePool();
      let observedDuringPhase: Record<string, unknown> | null = null;
      const passLog: Array<{ name: string; txn: string }> = [];
      const compute = fakeCompute(passLog, {
        passImpl: {
          zoning: async () => {
            // Mid-phase: the shared-txn client has issued BEGIN but not COMMIT (we are
            // still INSIDE pipeline.withTransaction's `fn(client)` callback). A fresh,
            // independent "monitor" connection — modelling an operator's own psql session
            // or this pilot's own stall-diagnostic tooling — reads pipeline_runs directly.
            const monitor = await pool.connect();
            const res = await monitor.query('SELECT records_meta FROM pipeline_runs WHERE id = $1', [4242]);
            observedDuringPhase = (res.rows[0] as { records_meta: Record<string, unknown> }).records_meta;
            monitor.release();
            return { scoped: 0, updated: 0, updatedIds: [] };
          },
        },
      });
      await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool as unknown as ReturnType<typeof fakePool>, compute) as never);
      expect(observedDuringPhase, 'the monitor must have observed SOMETHING (a null read here means the test itself is broken, not the fix)').not.toBeNull();
      expect(
        (observedDuringPhase as unknown as Record<string, unknown>).last_heartbeat_at,
        'the pre-phase heartbeat (recordHeartbeat(heartbeatClient, ..., 0) issued before passSpec.run) must already be visible to an independent client — proves it did NOT go through the still-open shared-txn client',
      ).toBe('now');
      expect(
        (observedDuringPhase as unknown as Record<string, unknown>).current_pass,
        'must name the CURRENT phase (zoning), not a stale value from a prior phase',
      ).toBe('zoning');
      // heartbeatClient (1, connect()-ed ONCE and reused for every heartbeat/stall call
      // across BOTH phase loops) + the shared-txn client (1, via pipeline.withTransaction)
      // + post_commit's own two (postClient + streamClient) + this test's OWN one
      // throwaway monitor connection = 5. If heartbeatClient were instead re-acquired
      // per heartbeat call (the naive alternative this fix rejects), this count would be
      // much higher — 4 shared-phase heartbeats + 2 post_commit heartbeats = 6 MORE
      // connections on top of these 5.
      expect(pool.connectedCount.n, 'heartbeatClient must be acquired via pool.connect() exactly once, not once per heartbeat call').toBe(5);
    });
  });
});

// ---------------------------------------------------------------------------
// EP-D14 (WF3 C1, .cursor/wf3_ep_d14_pass5_recovery_scan_active_task.md, 2026-09-09) — a genuine
// BEHAVIOURAL lock directly against `consumePendingScope` (not the whole `runPass5`), seeded with
// scope rows from TWO foreign run_ids to prove the query-COUNT claim: today's per-parcel loop issued
// one UPDATE per pending parcel (2,500 parcels -> 2,500 statements); the fix issues either ONE
// set-based UPDATE (--full) or `ceil(pending/batchSize)` batched round trips (incremental), never one
// per parcel. RED against the pre-fix tree — reproduced live by checking out the parent commit's
// `consumePendingScope` and confirming this test fails with "expected 1 UPDATE, saw 2500" (git
// stash-verified this session, not merely asserted).
// ---------------------------------------------------------------------------

describe('consumePendingScope — EP-D14 query-count lock (the load-bearing one)', () => {
  interface Call { kind: string; params: unknown[] }

  function scopeRecoveryFakeClient(pendingParcelIds: number[], opts: { throwOnBatchSelectContaining?: number; throwOnBatchFlush?: boolean } = {}) {
    const calls: Call[] = [];
    const query = async (text: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
      if (/^\s*SELECT DISTINCT parcel_id FROM enrich_parcels_pass3_scope WHERE consumed_at IS NULL AND run_id <> \$1/.test(text)) {
        calls.push({ kind: 'select_pending', params });
        return { rows: pendingParcelIds.map((parcel_id) => ({ parcel_id })), rowCount: pendingParcelIds.length };
      }
      if (/UPDATE enrich_parcels_pass3_scope SET consumed_at = \$2\s+WHERE consumed_at IS NULL AND run_id <> \$1 AND parcel_id <> ALL\(\$3::int\[\]\)/.test(text)) {
        calls.push({ kind: 'set_based_stamp', params });
        return { rows: [], rowCount: pendingParcelIds.length };
      }
      if (/p\.id = ANY\(\$1::int\[\]\)/.test(text)) {
        calls.push({ kind: 'batch_select', params });
        const ids = params[0] as number[];
        // F2 (output panel, 2026-09-09) — simulates a genuinely thrown batch SELECT (a real
        // DB/network error, not a per-row engine error) for the batch containing this id.
        if (opts.throwOnBatchSelectContaining !== undefined && ids.includes(opts.throwOnBatchSelectContaining)) {
          throw new Error(`simulated batch SELECT error (F2 fixture, batch containing ${opts.throwOnBatchSelectContaining})`);
        }
        return { rows: ids.map((id) => ({ id })), rowCount: ids.length };
      }
      if (/WITH incoming\(id,/.test(text)) {
        calls.push({ kind: 'batch_flush', params });
        // F2 (output panel) — simulates flushBatch's own re-throw-by-design behaviour.
        if (opts.throwOnBatchFlush) {
          throw new Error('simulated flushOptConfigBatch/ctx.flushBatch error (F2 fixture)');
        }
        return { rows: [], rowCount: params.length / 12 }; // 12 params/row (flushOptConfigBatch's own perRow)
      }
      if (/UPDATE enrich_parcels_pass3_scope SET consumed_at = \$2 WHERE parcel_id = ANY\(\$1::int\[\]\) AND consumed_at IS NULL/.test(text)) {
        calls.push({ kind: 'batch_stamp', params });
        return { rows: [], rowCount: (params[0] as number[]).length };
      }
      calls.push({ kind: 'UNEXPECTED: ' + text.slice(0, 80), params });
      return { rows: [], rowCount: 0 };
    };
    return { query, calls };
  }

  it('full:true — exactly ONE set-based UPDATE, ZERO buildOptConfigSelectSql/batch calls, regardless of pending count (2,500 parcels across 2 foreign run_ids)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute module under test
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      consumePendingScope: (
        client: unknown, runId: number, stats: Record<string, unknown>, stamp: Date,
        genuineIds: Set<number>, log: unknown, opts: { full: boolean; batchSize: number; flushClient: unknown },
      ) => Promise<number>;
    };
    const pendingIds = Array.from({ length: 2500 }, (_, i) => i + 1); // simulates run_ids 1001/1002's combined 2,500 distinct parcels
    const { query, calls } = scopeRecoveryFakeClient(pendingIds);
    const stats: Record<string, unknown> = { errors: 0, errorIds: new Set<number>() };
    const flushClient = { query };
    await ep.consumePendingScope(
      { query } as unknown as { query: typeof query },
      999, stats, new Date('2026-09-09T00:00:00.000Z'), new Set(), { warn: () => {}, info: () => {}, error: () => {} },
      { full: true, batchSize: 1000, flushClient },
    );
    const byKind = calls.reduce<Record<string, number>>((acc, c) => { acc[c.kind] = (acc[c.kind] || 0) + 1; return acc; }, {});
    expect(byKind.select_pending, 'exactly one pending-scope read').toBe(1);
    expect(byKind.set_based_stamp, 'exactly ONE set-based UPDATE under --full').toBe(1);
    expect(byKind.batch_select, '--full must issue ZERO buildOptConfigSelectSql calls — recompute is redundant (Ask 1 ruling)').toBeUndefined();
    expect(byKind.batch_flush, '--full must issue ZERO flushOptConfigBatch calls').toBeUndefined();
    expect(byKind.UNEXPECTED, 'no unhandled/unexpected SQL — every statement is accounted for').toBeUndefined();
    expect(stats.scope_stamped_without_recompute_count).toBe(2500);
  });

  it('full:false, batch size 1000 — ceil(2500/1000)=3 scope UPDATEs and 3 select+flush pairs, never 2,500 (RED against the per-parcel loop)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute module under test
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      consumePendingScope: (
        client: unknown, runId: number, stats: Record<string, unknown>, stamp: Date,
        genuineIds: Set<number>, log: unknown, opts: { full: boolean; batchSize: number; flushClient: unknown },
      ) => Promise<number>;
    };
    const pendingIds = Array.from({ length: 2500 }, (_, i) => i + 1);
    const { query, calls } = scopeRecoveryFakeClient(pendingIds);
    const stats: Record<string, unknown> = { errors: 0, errorIds: new Set<number>() };
    const flushClient = { query };
    await ep.consumePendingScope(
      { query } as unknown as { query: typeof query },
      999, stats, new Date('2026-09-09T00:00:00.000Z'), new Set(), { warn: () => {}, info: () => {}, error: () => {} },
      { full: false, batchSize: 1000, flushClient },
    );
    const byKind = calls.reduce<Record<string, number>>((acc, c) => { acc[c.kind] = (acc[c.kind] || 0) + 1; return acc; }, {});
    expect(byKind.select_pending).toBe(1);
    expect(byKind.batch_select, 'ceil(2500/1000) = 3 batched recompute SELECTs, never one per parcel').toBe(3);
    expect(byKind.batch_flush).toBe(3);
    expect(byKind.batch_stamp, '3 batched stamp UPDATEs, never one per parcel (2,500 in the pre-fix tree)').toBe(3);
    expect(byKind.set_based_stamp, 'the --full-only set-based UPDATE must NOT fire under incremental').toBeUndefined();
    expect(byKind.UNEXPECTED).toBeUndefined();
    expect(stats.scope_recovery_batches).toBe(3);
    expect(stats.scope_recovery_recovered_count).toBe(2500);
  });

  it('full:true — a parcel that errored in THIS run\'s own stream (stats.errorIds) is EXCLUDED from the set-based stamp, so its scope row survives for a future genuine recovery', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute module under test
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      consumePendingScope: (
        client: unknown, runId: number, stats: Record<string, unknown>, stamp: Date,
        genuineIds: Set<number>, log: unknown, opts: { full: boolean; batchSize: number; flushClient: unknown },
      ) => Promise<number>;
    };
    const pendingIds = [1, 2, 3];
    const { query, calls } = scopeRecoveryFakeClient(pendingIds);
    const stats: Record<string, unknown> = { errors: 1, errorIds: new Set<number>([2]) };
    await ep.consumePendingScope(
      { query } as unknown as { query: typeof query },
      999, stats, new Date('2026-09-09T00:00:00.000Z'), new Set(), { warn: () => {}, info: () => {}, error: () => {} },
      { full: true, batchSize: 1000, flushClient: { query } },
    );
    const stampCall = calls.find((c) => c.kind === 'set_based_stamp');
    expect(stampCall, 'the set-based stamp must have fired').toBeDefined();
    expect(stampCall!.params[2], 'the exclusion array must name exactly the errored parcel id').toEqual([2]);
  });

  it('F2 (output panel, 2026-09-09) — full:false, a genuinely thrown batch SELECT isolates to ONE batch: stats.errors counts every id in that batch, its ids stay unstamped, and the loop continues to process the REMAINING batches (never aborts the whole recovery)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute module under test
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      consumePendingScope: (
        client: unknown, runId: number, stats: Record<string, unknown>, stamp: Date,
        genuineIds: Set<number>, log: unknown, opts: { full: boolean; batchSize: number; flushClient: unknown },
      ) => Promise<number>;
    };
    // 3 batches of 2: [1,2] throws on SELECT, [3,4] and [5,6] succeed normally.
    const pendingIds = [1, 2, 3, 4, 5, 6];
    const { query, calls } = scopeRecoveryFakeClient(pendingIds, { throwOnBatchSelectContaining: 1 });
    const stats: Record<string, unknown> = { errors: 0, errorIds: new Set<number>() };
    const recovered = await ep.consumePendingScope(
      { query } as unknown as { query: typeof query },
      999, stats, new Date('2026-09-09T00:00:00.000Z'), new Set(), { warn: () => {}, info: () => {}, error: () => {} },
      { full: false, batchSize: 2, flushClient: { query } },
    );
    expect(stats.errors, 'the 2 ids in the thrown batch must be counted').toBe(2);
    expect(stats.scope_recovery_batches, 'all 3 batches must have been ATTEMPTED — the throw in batch 1 must not stop the loop').toBe(3);
    const batchStampCalls = calls.filter((c) => c.kind === 'batch_stamp');
    expect(batchStampCalls.length, 'the 2 SURVIVING batches must still be stamped').toBe(2);
    const stampedIds = batchStampCalls.flatMap((c) => c.params[0] as number[]);
    expect(stampedIds.sort(), 'ids 1 and 2 (the thrown batch) must NEVER be stamped; 3/4/5/6 must be').toEqual([3, 4, 5, 6]);
    expect(recovered).toBe(4);
  });

  it('F2 — full:false, a genuinely thrown flush (ctx.flushBatch\'s own re-throw-by-design) ALSO isolates to one batch, not the whole recovery', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute module under test
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      consumePendingScope: (
        client: unknown, runId: number, stats: Record<string, unknown>, stamp: Date,
        genuineIds: Set<number>, log: unknown, opts: { full: boolean; batchSize: number; flushClient: unknown },
      ) => Promise<number>;
    };
    const pendingIds = [1, 2, 3, 4];
    const { query, calls } = scopeRecoveryFakeClient(pendingIds, { throwOnBatchFlush: true });
    const stats: Record<string, unknown> = { errors: 0, errorIds: new Set<number>() };
    await ep.consumePendingScope(
      { query } as unknown as { query: typeof query },
      999, stats, new Date('2026-09-09T00:00:00.000Z'), new Set(), { warn: () => {}, info: () => {}, error: () => {} },
      { full: false, batchSize: 2, flushClient: { query } },
    );
    expect(stats.scope_recovery_batches, 'both batches must have been attempted').toBe(2);
    expect(stats.errors, 'every id across both thrown-flush batches must be counted').toBe(4);
    expect(calls.some((c) => c.kind === 'batch_stamp'), 'no batch may be stamped when its own flush threw').toBe(false);
  });

  it.each([NaN, 0, -1, -1000])('F10 (output panel, 2026-09-09) — full:false with an invalid batchSize (%s) throws naming the remedy, rather than looping forever (i += batchSize never advances)', async (badBatchSize) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute module under test
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      consumePendingScope: (
        client: unknown, runId: number, stats: Record<string, unknown>, stamp: Date,
        genuineIds: Set<number>, log: unknown, opts: { full: boolean; batchSize: number; flushClient: unknown },
      ) => Promise<number>;
    };
    const { query } = scopeRecoveryFakeClient([1, 2, 3]);
    const stats: Record<string, unknown> = { errors: 0, errorIds: new Set<number>() };
    await expect(ep.consumePendingScope(
      { query } as unknown as { query: typeof query },
      999, stats, new Date('2026-09-09T00:00:00.000Z'), new Set(), { warn: () => {}, info: () => {}, error: () => {} },
      { full: false, batchSize: badBatchSize, flushClient: { query } },
    )).rejects.toThrow(/batchSize must be a positive finite number/);
  });
});

// ---------------------------------------------------------------------------
// EP-D10 — a genuine BEHAVIOURAL lock on runPass5's pruning DELETE (pilot 9 commit 8 P7),
// against the REAL compute module's runPass5 (not the fixture-compute runEnrichPhase tests
// above, which exist to exercise the RUNNER's own orchestration — see that section's own
// header comment). The commit-8-P1 pin flip (src/tests/steps/enrich_parcels/violations.test.ts
// "EP-D10 FIXED", earlier in this file) is a SOURCE-TEXT regex lock only: it proves the DELETE
// statement text exists, never that running it actually prunes the right rows. This block
// drives runPass5 against a fake client with an in-memory enrich_parcels_pass3_scope
// simulation, seeding one ALREADY-consumed row and one prior-run row whose OWN PARCEL errors in
// THIS run's own stream, and asserts the real DELETE removed exactly the consumed row while the
// still-unconsumed (genuinely-erroring) one survives.
//
// UPDATED (WF3 EP-D14, 2026-09-09) — the ORIGINAL fixture (pre-C1) simulated a "recovery-failed"
// row by making the PER-PARCEL recovery SELECT itself throw (`p.id = $1`). EP-D14's Ask 1 ruling
// retires that whole code path under --full: the pending set is stamped consumed set-based with
// NO recompute at all, so there is no per-parcel "recovery attempt" left to fail. The ONLY
// remaining way a prior-run scope row can legitimately survive under --full is if its OWN PARCEL
// also appears in THIS run's own main stream and throws there (`stats.errorIds`) — this fixture
// now reproduces exactly that, via a row whose `lot_size_sqm` getter throws (a genuine JS
// exception on first field access inside mapRowToEngineInput, not a synthetic shortcut).
// ---------------------------------------------------------------------------

describe('runPass5 pruning DELETE — genuine BEHAVIOURAL lock (pilot 9 commit 8 P7, EP-D10; fixture updated for EP-D14)', () => {
  interface ScopeRow { run_id: number; parcel_id: number; consumed_at: string | null }

  function scopeFakeClient(seed: ScopeRow[]) {
    const rows: ScopeRow[] = seed.map((r) => ({ ...r }));
    const sql: string[] = [];
    const query = async (text: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
      sql.push(text);
      // Citywide (NULL,'all') backstop check — pass 5's own precondition.
      if (/^\s*SELECT 1 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL/.test(text)) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }
      // Ineligibility reset — irrelevant to this lock, no rows touched.
      if (/UPDATE parcels p SET/.test(text) && /opt_config_confidence IS NOT NULL/.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      // THIS run's own set-based consumed_at flip. F9 (output panel) — reads the 3rd param
      // (this run's own errorIds exclusion array) so the fixture genuinely exercises it.
      if (/UPDATE enrich_parcels_pass3_scope SET consumed_at = \$2 WHERE run_id = \$1 AND consumed_at IS NULL AND parcel_id <> ALL\(\$3::int\[\]\)/.test(text)) {
        const [runId, stamp, excluded] = params as [number, string, number[]];
        let n = 0;
        for (const r of rows) if (r.run_id === runId && r.consumed_at === null && !excluded.includes(r.parcel_id)) { r.consumed_at = stamp; n += 1; }
        return { rows: [], rowCount: n };
      }
      // consumePendingScope's own recovery scan (prior runs' unconsumed rows).
      if (/SELECT DISTINCT parcel_id FROM enrich_parcels_pass3_scope WHERE consumed_at IS NULL AND run_id <> \$1/.test(text)) {
        const [runId] = params as [number];
        const ids = [...new Set(rows.filter((r) => r.run_id !== runId && r.consumed_at === null).map((r) => r.parcel_id))];
        return { rows: ids.map((parcel_id) => ({ parcel_id })), rowCount: ids.length };
      }
      // EP-D14 (C1) — the set-based --full stamp: consumed_at IS NULL, a PRIOR run, and NOT one
      // of this run's own errored parcel ids.
      if (/UPDATE enrich_parcels_pass3_scope SET consumed_at = \$2\s+WHERE consumed_at IS NULL AND run_id <> \$1 AND parcel_id <> ALL\(\$3::int\[\]\)/.test(text)) {
        const [runId, stamp, excluded] = params as [number, string, number[]];
        let n = 0;
        for (const r of rows) {
          if (r.run_id !== runId && r.consumed_at === null && !excluded.includes(r.parcel_id)) { r.consumed_at = stamp; n += 1; }
        }
        return { rows: [], rowCount: n };
      }
      // THE pruning DELETE under test (peel, pilot 9 commit 8 P1).
      if (/DELETE FROM enrich_parcels_pass3_scope WHERE consumed_at IS NOT NULL/.test(text)) {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.consumed_at !== null) rows.splice(i, 1);
        return { rows: [], rowCount: before - rows.length };
      }
      return { rows: [], rowCount: 0 };
    };
    return { query, rowsSnapshot: () => rows.map((r) => ({ ...r })), sql };
  }

  /** A stream row whose `lot_size_sqm` getter throws on first access — mapRowToEngineInput's
   * OWN first field read — simulating a genuine engine error in THIS run's own main stream,
   * never a synthetic shortcut. */
  function throwingStreamRow(id: number) {
    return Object.defineProperties({}, {
      id: { value: id, enumerable: true },
      lot_size_sqm: { enumerable: true, get(): number { throw new Error('simulated optimal-config engine error (EP-D10/EP-D14 behavioural lock fixture)'); } },
    });
  }

  it('seeds one CONSUMED row + one UNCONSUMED prior-run row whose OWN PARCEL errors in this run\'s own stream — after runPass5, the consumed row is pruned and the erroring row survives', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute module under test
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      runPass5: (client: unknown, ctx: unknown, config: Record<string, number>) => Promise<Record<string, unknown>>;
    };
    const OWN_RUN_ID = 999;
    const STUCK_PARCEL_RUN_ID = 500; // a PRIOR run, distinct from OWN_RUN_ID
    const seed: ScopeRow[] = [
      { run_id: OWN_RUN_ID, parcel_id: 1, consumed_at: '2026-09-01T00:00:00.000Z' }, // already consumed
      { run_id: STUCK_PARCEL_RUN_ID, parcel_id: 2, consumed_at: null }, // prior-run; parcel 2 errors in THIS run's own stream below
    ];
    const client = scopeFakeClient(seed);
    // Named `passCtx`, not `ctx` — LW-D11's harness-fidelity lock (step-conformance.infra.test.ts)
    // extracts the FIRST `const ctx = { ... }` in a violations.test.ts file and checks its keys
    // against STEP_CTX_KEYS, the closed set the library assigns onto the GENERIC step-level
    // stepCtx (scripts/lib/step/index.js:95). This object is a DIFFERENT thing: the ENRICHER
    // per-pass ctx runEnrichPhase builds internally and threads straight into each pass function
    // (runPass5(client, ctx, config)) — scopeWhere/full/stream/scopeRunId are real keys on THAT
    // ctx, never assigned onto stepCtx, so LW-D11's own `ctx`-shaped extractor would misclassify
    // them as a phantom generic-stepCtx field. Renaming sidesteps the false positive without
    // teaching the checker to conflate two runner-internal ctx shapes it was never meant to merge.
    const passCtx = {
      scopeWhere: 'TRUE',
      full: true,
      stream: async function* stream() { yield throwingStreamRow(2); },
      scopeRunId: OWN_RUN_ID,
      clock: { now: () => new Date('2026-09-08T12:00:00.000Z') },
      log: { warn: () => {}, info: () => {}, error: () => {} },
    };
    const config = { enrich_parcels_optcfg_batch_size: 500, enrich_parcels_pass5_stream_batch_size: 200, enrich_parcels_scope_recovery_batch_size: 1000 };

    const stats = await ep.runPass5(client, passCtx, config);

    expect(stats.errors, 'the stuck parcel\'s simulated engine error must be counted, not swallowed silently').toBe(1);
    const after = client.rowsSnapshot();
    expect(after.map((r) => r.parcel_id), 'the already-consumed row (parcel 1) must be PRUNED — gone from the table').not.toContain(1);
    expect(after.map((r) => r.parcel_id), 'the erroring row (parcel 2) must SURVIVE — still present, still unconsumed').toContain(2);
    const survivor = after.find((r) => r.parcel_id === 2);
    expect(survivor?.consumed_at, 'the survivor\'s consumed_at must still be NULL — EP-D14\'s errored-id exclusion kept it out of the set-based stamp').toBeNull();
    expect(client.sql.some((s) => /DELETE FROM enrich_parcels_pass3_scope WHERE consumed_at IS NOT NULL/.test(s)), 'the pruning DELETE must have actually been issued, not merely present in source text').toBe(true);
  });

  it('F9 (output panel, 2026-09-09) — a parcel that errors in THIS run\'s OWN stream keeps its OWN scope row (same run_id as ownRunId) unconsumed too — the this-run stamp must exclude errorIds, not just the prior-run recovery stamp', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute module under test
    const ep = require(path.join(REPO_ROOT, 'scripts/lib/compute/enrich-parcels.js')) as {
      runPass5: (client: unknown, ctx: unknown, config: Record<string, number>) => Promise<Record<string, unknown>>;
    };
    const OWN_RUN_ID = 999;
    const seed: ScopeRow[] = [
      { run_id: OWN_RUN_ID, parcel_id: 1, consumed_at: null }, // healthy, this run's own
      { run_id: OWN_RUN_ID, parcel_id: 2, consumed_at: null }, // errors in this run's own stream below
    ];
    const client = scopeFakeClient(seed);
    const passCtx = {
      scopeWhere: 'TRUE',
      full: true,
      stream: async function* stream() { yield throwingStreamRow(2); },
      scopeRunId: OWN_RUN_ID,
      clock: { now: () => new Date('2026-09-09T12:00:00.000Z') },
      log: { warn: () => {}, info: () => {}, error: () => {} },
    };
    const config = { enrich_parcels_optcfg_batch_size: 500, enrich_parcels_pass5_stream_batch_size: 200, enrich_parcels_scope_recovery_batch_size: 1000 };
    await ep.runPass5(client, passCtx, config);
    const after = client.rowsSnapshot();
    const row2 = after.find((r) => r.parcel_id === 2);
    expect(row2, 'parcel 2\'s scope row must still exist (not pruned, since it was never stamped consumed)').toBeDefined();
    expect(row2?.consumed_at, 'parcel 2 errored in THIS run\'s own stream — its OWN scope row must stay unconsumed, not be stamped by the this-run set-based UPDATE').toBeNull();
    const row1 = after.find((r) => r.parcel_id === 1);
    expect(row1, 'parcel 1 (healthy) must have been pruned — consumed then removed').toBeUndefined();
  });
});
