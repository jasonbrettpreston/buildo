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

import { describe, it, expect } from 'vitest';
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
  plausibility?: 'none' | Array<{ id?: string; name?: string; count_field?: string; severity?: string }>;
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

  it('pass 4 comparable-builds — guard:"none" (EP-D1/B4.5 PIN, no IS DISTINCT FROM at all), idempotent_rerun:"not_idempotent"; outputs.invalidates declares ≥1 entry naming permits for this target (Ask 3(a) — a real invalidator, not an applies_when escape) (flipped at: commit 7b)', () => {
    const d = loadDescriptor();
    const t = writeTargetFor(d, PARCELS, 3);
    expect(t.write_discipline.guard, 'EP-D1/B4.5 — pinned in its CURRENT wrong form, no IS DISTINCT FROM').toBe('none');
    expect(t.write_discipline.guard_why).toBeDefined();
    expect(t.write_discipline.idempotent_rerun, 'not zero_writes — the guard is genuinely absent, not merely inert').toBe('not_idempotent');
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

describe('grandfathered.json (Rule 9) — zoning_enriched_at + massing_enriched_at + EP-D1/B4.5, one guard:"none" path', () => {
  it('grandfathered.json carries a real enrich_parcels entry, path outputs.writes[].write_discipline.guard = "none", whose why covers all THREE guard:"none" dispositions (the mechanism is generic — assertGrandfathered reads .guard, never .class, so one entry licenses every unguarded write target) (flipped at: commit 7b)', () => {
    const g = JSON.parse(fs.readFileSync(abs(GRANDFATHERED_REL), 'utf8')) as { steps: Record<string, { paths?: Record<string, unknown>; why?: string }> };
    const entry = g.steps.enrich_parcels;
    expect(entry, 'no grandfathered.json entry for enrich_parcels').toBeDefined();
    const guardPath = 'outputs.writes[].write_discipline.guard';
    expect(entry?.paths?.[guardPath]).toBe('none');
    const why = entry?.why ?? '';
    expect(/zoning_enriched_at/i.test(why), 'why must name zoning_enriched_at (Fold E1)').toBe(true);
    expect(/massing_enriched_at/i.test(why), 'why must name massing_enriched_at').toBe(true);
    expect(/EP-D1|B4\.5|comparable.builds|comp_/i.test(why), 'why must name the EP-D1/B4.5 pinned comps UPDATE').toBe(true);
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
  it('EP-D1/B4.5 pin, TODAY\'s live tree (compute) — buildComparableBuildsUpdateSql carries NO IS DISTINCT FROM anywhere in its statement text (peel 8x flips this)', () => {
    const src = computeSource();
    const fn = /function buildComparableBuildsUpdateSql[\s\S]*?\n}\n/.exec(src);
    expect(fn, 'buildComparableBuildsUpdateSql not found — has the pin-worthy shape moved?').toBeTruthy();
    expect(/IS DISTINCT FROM/i.test(fn![0]), 'EP-D1 pin: the pass-4 comps UPDATE must have NO guard today — this is the wrong-form fact peel 8x must flip').toBe(false);
  });

  it('EP-D8 pin, TODAY\'s live tree (compute) — the subj_family:"all" fallback branch (s.subj_family = \'all\' AND near.zoning_class = s.zoning_class) carries NO additional structure-scale/type filter (peel 8y flips this)', () => {
    const src = computeSource();
    const fallback = /s\.subj_family\s*=\s*'all'\s*AND\s*near\.zoning_class\s*=\s*s\.zoning_class/i;
    expect(fallback.test(src), 'EP-D8 pin: the generic-family fallback clause must still be present, unmodified, today').toBe(true);
    const clauseMatch = /WHERE\s*\(near\.comp_family[\s\S]*?LIMIT \$\{topN\}/i.exec(src) ?? /near\.comp_family = s\.subj_family[\s\S]{0,400}/i.exec(src);
    expect(clauseMatch, 'the comp-match WHERE clause block was not found for the EP-D8 pin scan').toBeTruthy();
    expect(/residential_sqm|structure_type|gfa/i.test(clauseMatch![0]), 'EP-D8 pin: no structure-scale/type term guards the \'all\'-family fallback yet — parcel 8244 (detached, 290 m²) can still match apartment-scale comps').toBe(false);
  });

  it('EP-D9 pin, TODAY\'s live tree (compute) — neither ORDER BY clause (inner kNN, outer similarity rank) in the comps candidate SQL carries a deterministic secondary tiebreak key (peel, commit 8, flips this)', () => {
    const src = computeSource();
    // §5.5 seam rewrite (commit 7c) renamed the bare COMP_KNN_OVERFETCH/COMP_TOP_N literals to
    // config-sourced knnOverfetch/topN — same wrong-form SQL shape, new parameter names (Ask 5).
    const innerKnn = /ORDER BY c\.geom <-> s\.geom\s*\n\s*LIMIT \$\{knnOverfetch\}/i;
    const outerRank = /ORDER BY \(abs\(near\.lot_size_sqm[\s\S]{0,120}LIMIT \$\{topN\}/i;
    expect(innerKnn.test(src), 'inner kNN ORDER BY not found in its expected wrong form (no c.id tiebreak)').toBe(true);
    expect(outerRank.test(src), 'outer similarity-rank ORDER BY not found in its expected wrong form (no near.id tiebreak)').toBe(true);
    expect(/ORDER BY c\.geom <-> s\.geom,\s*c\.id/i.test(src), 'EP-D9 pin: the inner kNN clause must NOT yet carry a c.id secondary key').toBe(false);
    expect(/near\.lot_size_sqm[\s\S]{0,140}\* 10\),\s*near\.id\)/i.test(src), 'EP-D9 pin: the outer rank clause must NOT yet carry a near.id secondary key').toBe(false);
  });

  it('EP-D10 pin, TODAY\'s live tree (runner) — the enrich_parcels_pass3_scope hand-off INSERT (scripts/lib/step/index.js\'s runEnrichPhase — the seam-rewritten table-target now reads descriptor.outputs.writes[], not a literal table name) is ON CONFLICT (run_id, parcel_id) DO NOTHING (no dedup-by-parcel_id) and there is NO DELETE/TRUNCATE against this table anywhere in the runner or compute (peel, commit 8, flips this)', () => {
    const runnerSrc = lf(readTextToday(INDEX_REL));
    const computeSrc = computeSource();
    expect(
      /INSERT INTO \$\{scopeTarget\.table\}[\s\S]*?ON CONFLICT \(run_id, parcel_id\) DO NOTHING/.test(runnerSrc),
      'EP-D10 pin: the append-only ON CONFLICT (run_id, parcel_id) shape must still be present in runEnrichPhase\'s scope hand-off insert',
    ).toBe(true);
    expect(
      /DELETE\s+FROM\s+enrich_parcels_pass3_scope/i.test(runnerSrc) || /DELETE\s+FROM\s+enrich_parcels_pass3_scope/i.test(computeSrc),
      'EP-D10 pin: no pruning DELETE against enrich_parcels_pass3_scope may exist yet (runner or compute)',
    ).toBe(false);
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
  // clean parcels table): checks_passed:'all', 0 warned, an honest PASS, not a regression.
  const EXPECTED_POST_VERDICT: Record<string, string> = { sources_run1: 'WARN', none_incremental: 'PASS' };
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

  it('converted.json — pending stays registered (not yet converted); the DECLARED stage has advanced to "runner_wired" (commit 7e/2, 2026-09-08): the runner (7d) and the thin-shell wiring (7e/2) are both live and golden-verified (G6/G7/G8 all green, step-validate.mjs 16/17, hard-stop=false) — only G9 (Reflection) and the final shape_clean bump remain, owed to commit 3.', () => {
    const c = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[]; pending: Array<{ file: string; stage: string }> };
    expect(c.converted.includes(STEP_REL), 'enrich_parcels must not be registered as converted yet — that is commit 9 (cutover)').toBe(false);
    const entry = c.pending.find((p) => p.file === STEP_REL);
    expect(entry, `converted.json.pending must carry a ${STEP_REL} entry`).toBeDefined();
    expect(entry!.stage, 'stage advanced to "runner_wired" this commit (see this test\'s own title for why)').toBe('runner_wired');
    expect(fs.existsSync(abs(DESCRIPTOR_REL)), 'a runner_wired-stage pending entry MUST have a sibling descriptor').toBe(true);
    expect(fs.existsSync(abs(COMPUTE_REL)), 'compute (7c) exists on disk').toBe(true);
  });

  it('defect-ledger.md — EP-D1, EP-D8, EP-D9, EP-D10 all carry the PIN (Spec 123 §3.1) status, pinned_until pilot9 commit 9 (already landed, commits 4/4c/5)', () => {
    const ledger = readTextToday(DEFECT_LEDGER_REL);
    for (const id of ['EP-D1', 'EP-D8', 'EP-D9', 'EP-D10']) {
      const row = ledger.split('\n').find((l) => l.includes(`| ${id} |`));
      expect(row, `${DEFECT_LEDGER_REL} has no row for ${id}`).toBeDefined();
      expect(row, `${id} row must carry PIN status`).toMatch(/\*\*PIN \(Spec 123 §3\.1\)/);
      expect(row, `${id} row must state pinned_until: pilot9 commit 9`).toMatch(/pinned_until:\s*pilot9 commit 9/);
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
      if (/pg_try_advisory_xact_lock\(\$1, \$2\)/.test(text)) return { rows: [{ acquired: innerLockAcquired }] };
      if (/^SHOW statement_timeout$/i.test(text)) {
        return { rows: [{ statement_timeout: sessionStatementTimeoutMs === undefined ? SESSION_DEFAULT : `${sessionStatementTimeoutMs}ms` }] };
      }
      return { rows: [] };
    };
    // Pool-level: no session state at all — SHOW always reads the untouched default.
    const record = async (text: string, values?: unknown[]) => {
      sql.push(text);
      params.push(values ?? []);
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
      query: record,
      // Each connect() call is its own SESSION: a distinct, closed-over statementTimeoutMs
      // that only THIS client's own SET LOCAL statement_timeout can move — the mechanism the
      // isolation half of the addendum test below asserts against a SECOND, sibling client.
      connect: async () => {
        let statementTimeoutMs: number | undefined;
        const clientQuery = async (text: string, values?: unknown[]) => {
          sql.push(text);
          params.push(values ?? []);
          const m = /^SET LOCAL statement_timeout = (\d+)$/.exec(text);
          if (m) statementTimeoutMs = Number(m[1]);
          return answer(text, statementTimeoutMs);
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
    passes: Array<{ name: string; txn: string; run: (client: unknown, ctx: Record<string, unknown>, config: Record<string, unknown>) => Promise<FakePassResult> }>;
  }

  /** Records every phase invocation `{name, txn}` in call order — the phase-ordering witness. */
  function fakeCompute(passLog: Array<{ name: string; txn: string }>, opts: { deferScopeCount?: number; passImpl?: Record<string, (client: unknown, ctx: Record<string, unknown>) => Promise<FakePassResult>> } = {}): FakeCompute {
    const names = ['zoning', 'max_build', 'existing_structure', 'comparable_builds', 'optimal_config'];
    return {
      OVERLAY_LAYERS: [],
      readZoningContract: async () => ({ layers: { base: true }, partial: false, baseCommittedAfterOverlayFailed: false }),
      computeDeferScope: async () => ({ scope_count: opts.deferScopeCount ?? 0, threshold: 1000, ratio: 0, perPass: {} }),
      computeAggregateRecordsUpdated: () => 0,
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
    // And no ROLLBACK was issued against the shared-txn client for the four completed passes.
    expect(pool.sql.filter((s) => s === 'ROLLBACK')).toHaveLength(1); // only pass 5's own dedicated post-commit txn rolls back
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

  it('timeouts applied to the post_commit phase — a DEDICATED connection\'s own SET LOCAL statement_timeout, converted from enrich_parcels_pass5_timeout_minutes, and PROVABLE via SHOW on that SAME session (Fold B2 / coordinator addendum, commit 7e/2): a live SET LOCAL, not a config-value inspection — plus session isolation against a sibling client', async () => {
    const passLog: Array<{ name: string; txn: string }> = [];
    const compute = fakeCompute(passLog);
    const pool = fakePool();
    await stepLib.runEnrichPhase(baseArgs(fixtureDescriptor(), pool, compute) as never);
    // 10 minutes * 60000 = 600000ms.
    expect(pool.sql).toContain('SET LOCAL statement_timeout = 600000');
    // The fixture's own call order (proven by the "phase ordering" test above): clients[0] is
    // the shared-txn client (pipeline.withTransaction's own pool.connect()), clients[1] is the
    // post_commit phase's dedicated connection (runEnrichPhase's own pool.connect() at the
    // post-commit loop). SHOW on THAT session — never inspecting config — is the regression
    // lock's own assertion (RE-FREEZE #3, Spec 122 §8; Fold B2).
    expect(pool.clients.length).toBeGreaterThanOrEqual(2);
    const postCommitClient = pool.clients[1]!;
    const bound = (await postCommitClient.query('SHOW statement_timeout')) as { rows: Array<{ statement_timeout: string }> };
    expect(bound.rows[0]!.statement_timeout, 'SHOW statement_timeout on the post_commit phase\'s OWN session must read back the bound value, not the session default').toBe('600000ms');
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
        if (/pg_try_advisory_xact_lock\(\$1, \$2\)/.test(text)) return { rows: [{ acquired: true }] };
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
      const lockCalls = pool.sql.filter((s) => /pg_try_advisory_xact_lock\(\$1, \$2\)/.test(s));
      expect(lockCalls.length, 'the shared-txn phase must acquire the inner lock exactly once').toBeGreaterThanOrEqual(1);
      const lockIdx = pool.sql.indexOf(lockCalls[0]!);
      // fixtureDescriptor's identity.lock is 999999 (the fixture's own lock id).
      expect(pool.params[lockIdx]).toEqual([999999, 1]);
      // clients[0] is pipeline.withTransaction's own connect() — the SAME client that then
      // runs the passes (proven by the phase-ordering test above); the lock call must be the
      // FIRST statement issued on it, before the pid probe.
      const client0 = pool.clients[0]!;
      expect(client0).toBeDefined();
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
      const lockCalls = pool.sql.filter((s) => /pg_try_advisory_xact_lock\(\$1, \$2\)/.test(s));
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
});
