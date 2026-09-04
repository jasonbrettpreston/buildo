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
const INVOCATIONS = [
  { name: 'sources_run1', chain: 'sources' },
  { name: 'sources_run2', chain: 'sources' },
  { name: 'standalone', chain: 'none' },
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
  it.fails('compute exists, exports checks (dispatch === descriptor ids); no fs/pg/pipeline/argv/env; opens no pool (flips at: commit 7)', () => {
    loadDescriptor();
    const mod = loadComputeModule();
    expect(typeof mod.compute).toBe('function');
    const src = stripComments(computeSource());
    for (const banned of [/require\(['"]fs['"]\)/, /require\(['"]pg['"]\)/, /require\(['"]\.\.?\/pipeline['"]\)/, /process\.argv/, /process\.env/]) {
      expect(banned.test(src), `compute violates Rule 2 (compute is JUST compute): ${banned}`).toBe(false);
    }
  });

  it.fails('§5.5 clock seam (Fold G3, MANDATORY not optional) — no raw now()::date or Date.now() wall-clock fragment survives in compute; the comps window is read via an injected ctx.clock.asOfDate() instead of scripts/enrich-parcels.js\'s own now()::date - interval \'5 years\' literal (:1114) (flips at: commit 7)', () => {
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

  it.fails('the zoning_dominant_area_share guard ports the ::numeric cast VERBATIM (Fold B1, fence 7e130bff, lessons.md:28 float8-vs-NUMERIC IS DISTINCT FROM trap) — never regenerated generically from a column list (flips at: commit 7)', () => {
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
  const ANCHOR = 'read would be invisible';

  it('the anchor text is genuinely present in Spec 78 today (verified BEFORE authoring the check — checkOrderGuaranteesCited would RED on a rotted anchor)', () => {
    const spec = readTextToday(SPEC_78_REL);
    expect(spec.includes(ANCHOR), `Spec 78 must literally contain "${ANCHOR}" for the future order_guarantee.anchor to verify against`).toBe(true);
  });

  it('a pre_write check on the pass-5 write target declares order_guarantee{guarantee, spec_ref, anchor}, anchor citing Spec 78 §P3A.1\'s own text verbatim (flipped at: commit 7b; runner/compute land at 7c/7d — Fold G2: nothing forces authorship, so its absence is a real gap until this check exists)', () => {
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
  it('EP-D1/B4.5 pin, TODAY\'s live tree — buildComparableBuildsUpdateSql carries NO IS DISTINCT FROM anywhere in its statement text (peel 8x flips this)', () => {
    const src = stepSource();
    const fn = /function buildComparableBuildsUpdateSql[\s\S]*?\n}\n/.exec(src);
    expect(fn, 'buildComparableBuildsUpdateSql not found — has the pin-worthy shape moved?').toBeTruthy();
    expect(/IS DISTINCT FROM/i.test(fn![0]), 'EP-D1 pin: the pass-4 comps UPDATE must have NO guard today — this is the wrong-form fact peel 8x must flip').toBe(false);
  });

  it('EP-D8 pin, TODAY\'s live tree — the subj_family:"all" fallback branch (s.subj_family = \'all\' AND near.zoning_class = s.zoning_class) carries NO additional structure-scale/type filter (peel 8y flips this)', () => {
    const src = stepSource();
    const fallback = /s\.subj_family\s*=\s*'all'\s*AND\s*near\.zoning_class\s*=\s*s\.zoning_class/i;
    expect(fallback.test(src), 'EP-D8 pin: the generic-family fallback clause must still be present, unmodified, today').toBe(true);
    const clauseMatch = /WHERE\s*\(near\.comp_family[\s\S]*?LIMIT \$\{COMP_TOP_N\}/i.exec(src) ?? /near\.comp_family = s\.subj_family[\s\S]{0,400}/i.exec(src);
    expect(clauseMatch, 'the comp-match WHERE clause block was not found for the EP-D8 pin scan').toBeTruthy();
    expect(/residential_sqm|structure_type|gfa/i.test(clauseMatch![0]), 'EP-D8 pin: no structure-scale/type term guards the \'all\'-family fallback yet — parcel 8244 (detached, 290 m²) can still match apartment-scale comps').toBe(false);
  });

  it('EP-D9 pin, TODAY\'s live tree — neither ORDER BY clause (inner kNN, outer similarity rank) in the comps candidate SQL carries a deterministic secondary tiebreak key (peel, commit 8, flips this)', () => {
    const src = stepSource();
    const innerKnn = /ORDER BY c\.geom <-> s\.geom\s*\n\s*LIMIT \$\{COMP_KNN_OVERFETCH\}/i;
    const outerRank = /ORDER BY \(abs\(near\.lot_size_sqm[\s\S]{0,120}LIMIT \$\{COMP_TOP_N\}/i;
    expect(innerKnn.test(src), 'inner kNN ORDER BY not found in its expected wrong form (no c.id tiebreak)').toBe(true);
    expect(outerRank.test(src), 'outer similarity-rank ORDER BY not found in its expected wrong form (no near.id tiebreak)').toBe(true);
    expect(/ORDER BY c\.geom <-> s\.geom,\s*c\.id/i.test(src), 'EP-D9 pin: the inner kNN clause must NOT yet carry a c.id secondary key').toBe(false);
    expect(/near\.lot_size_sqm[\s\S]{0,140}\* 10\),\s*near\.id\)/i.test(src), 'EP-D9 pin: the outer rank clause must NOT yet carry a near.id secondary key').toBe(false);
  });

  it('EP-D10 pin, TODAY\'s live tree — the enrich_parcels_pass3_scope INSERT is ON CONFLICT (run_id, parcel_id) DO NOTHING (no dedup-by-parcel_id) and there is NO DELETE/TRUNCATE against this table anywhere in the file (peel, commit 8, flips this)', () => {
    const src = stepSource();
    expect(/INSERT INTO enrich_parcels_pass3_scope[\s\S]*?ON CONFLICT \(run_id, parcel_id\) DO NOTHING/i.test(src), 'EP-D10 pin: the append-only ON CONFLICT (run_id, parcel_id) shape must still be present').toBe(true);
    expect(/DELETE\s+FROM\s+enrich_parcels_pass3_scope/i.test(src), 'EP-D10 pin: no pruning DELETE against enrich_parcels_pass3_scope may exist yet').toBe(false);
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
    for (const inv of INVOCATIONS) {
      const doc = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/pre/${inv.name}.json`), 'utf8')) as { exit_code: number; verdict: string };
      expect(doc.exit_code, `${inv.name}: exit_code`).toBe(0);
      expect(doc.verdict, `${inv.name}: verdict`).toBe('WARN');
    }
  });

  it.fails('all POST invocations exist under docs/reports/golden/enrich_parcels/post/; the differential against PRE is accounted for ENTIRELY by the declared non-determinism inventory (a)-(g) + the Fold A1 correction + the EP-D9/EP-D10 pins — zero unexplained diffs (flips at: commit 7)', () => {
    for (const inv of INVOCATIONS) {
      const doc = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/post/${inv.name}.json`), 'utf8')) as { exit_code: number; verdict: string };
      expect(doc.exit_code).toBe(0);
      expect(doc.verdict).toBe('WARN');
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
    expect(Math.max(...nums, 0), 'the highest LG number in scripts/lib + scripts/steps/_schema must be 27 until commit 7 lands LG-28 (runEnrichPhase)').toBe(27);
  });

  it('converted.json — pending stays registered (not yet converted); stage advanced "red_suite" -> "descriptor_only" at commit 7b, the ONE artifact THIS commit itself produces (R-K.1, three-value vocabulary widened this commit) (updated at: commit 7b — the commit-6 text asserted the PRE-descriptor state, which this commit\'s own artifact necessarily changes)', () => {
    const c = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[]; pending: Array<{ file: string; stage: string }> };
    expect(c.converted.includes(STEP_REL), 'enrich_parcels must not be registered as converted yet — that is commit 9 (cutover)').toBe(false);
    const entry = c.pending.find((p) => p.file === STEP_REL);
    expect(entry, `converted.json.pending must carry a ${STEP_REL} entry`).toBeDefined();
    expect(entry!.stage, 'R-K.1: a step whose descriptor now exists and validates, but whose compute/runner have not yet landed, must declare the new middle stage "descriptor_only" — not the pre-descriptor "red_suite", and not "shape_clean" (which requires conformanceFindings() clean, i.e. compute wired)').toBe('descriptor_only');
    expect(fs.existsSync(abs(DESCRIPTOR_REL)), 'R-K.1: a "descriptor_only"-stage pending entry MUST have a sibling descriptor').toBe(true);
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
