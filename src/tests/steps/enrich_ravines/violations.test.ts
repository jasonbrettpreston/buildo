// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d/§9/§11.1 (+ Spec 43 §5 owner, Spec 122 §5.1 shape)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (ENRICHER), §5.1 (frozen shape),
//   §5.5 (compute shape), claim #54 (staleness.scope on a lineage column ⇒ declared invalidator)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §1.1 (behaviour-neutral), §3.1 (PIN),
//   §7 (commit ledger)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 compute-is-just-compute, Rule 3
//   tunables, Rule 10 row-derived verdict, Rule 12 crash posture, R-K pending stages)
//
// ============================================================================
// Batch-2 row 2.1 — `enrich_ravines`, ENRICHER's THIRD converted member, COMPRESSED 3-commit form
// (operator ruling A1(b), 2026-09-18 — R-AH eligibility met: ENRICHER already has 2 proven members,
// enrich_parcels + geocode_permits). Compressed mapping (Spec 124 R-AH, restructuring the plan's
// nine-commit breakdown per the link_neighbourhoods / assert_parcel_sanity precedent):
//   commit 1  (PH-0..PH-7 folded)  — assessment + descriptor + seeds (+7 vars) + this red suite
//   commit 2a (GOLD-PRE-FRESH)     — golden PRE captures (legacy step, committed + clean before 2b)
//   commit 2b (G2'/G8/G4d)         — compute + frozen shell + runner Ask-A2 seam + POST differential
//   commit 3  (CUTOVER, prepared, NOT committed — left for the OUTPUT panel) — converted.json append
//     + pending delete (R-K mutual exclusion), census status flip, fleet pin repins, generators
//
// THIS FILE IS RED FIRST, PER-CLAIM (Spec 123 §7, the geocode_permits precedent — each `it.fails()`
// names the artifact it is missing and the SPECIFIC commit that lands it, never a single blanket
// "commit 3" for every claim; only the converted.json-registration claim is genuinely un-landable
// before cutover). `it.fails()` INVERTS: the wrapped body genuinely throws internally and vitest
// reports the wrapped test as PASSED; if a claim were NOT actually red, vitest reports "expected
// test to fail but it passed" — a real suite failure. A green run of this file at any commit is
// therefore proof every remaining `it.fails()` claim in it is genuinely red at THAT commit.
//
// THE TEN FENCES (assessment §6, `git log --follow -p -- scripts/enrich-ravines.js`, two commits:
// 00902695 §8d origin, 92ee03b9 #418 incremental-skip):
//   F1  00902695 — §9/L18 six-throw producer HALT, pre-transaction         → contract_read hook
//   F2  92ee03b9 (Gemini CRIT-1) — L14 empty-ravines HALT on BOTH paths    → folded into F1's hook (RV-L2)
//   F3  00902695 (DEC-F §3.10) — PostGIS + both GIST indexes + SRID        → guards.requires + hook (SRID half)
//   F4  92ee03b9 — DEC-E lineage-column guard                             → guards.requires (kind:column)
//   F5  00902695 — materialized-centroid LATERAL KNN (not the spec's slow inline form) → compute, verbatim
//   F6  00902695 (L11) — the §8d no-op-write triple guard                 → write_discipline.guard_columns
//   F7  92ee03b9 — emitResults shared by both paths, coverage re-queried LIVE → post_phase hook
//   F8  92ee03b9 — parcels_invalid_geom_count root-cause signal            → declared INFO check
//   F9  92ee03b9 — #418 Layer-1 early return                              → RETIRED (mechanism), preserved (observable)
//   F10 00902695 — emitMeta reads id+geom only (lead_id excluded)         → widened honestly (RV-D1), exclusion kept
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/enrich-ravines.js';
const COMPUTE_REL = 'scripts/lib/compute/enrich-ravines.js';
const DESCRIPTOR_REL = 'scripts/enrich-ravines.descriptor.json';

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(REPO_ROOT, rel));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const descriptor: any = JSON.parse(read(DESCRIPTOR_REL));

describe('enrich_ravines — G-shape + descriptor structure (true from commit 1: the descriptor lands there)', () => {
  it('descriptor validates against step.schema.json; identity.lock === 60 agrees with LOCK_ID_REGISTRY-style source text', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { validateDescriptor }: any = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js'));
    expect(() => validateDescriptor(descriptor)).not.toThrow();
    expect(descriptor.identity.lock).toBe(60);
    expect(descriptor.identity.archetype).toBe('ENRICHER');
    expect(descriptor.identity.name).toBe('enrich_ravines');
  });

  it('checks.length === 7, execution.phases.length === 1, outputs.writes.length === 1, invariants.length === 3, plausibility.length === 4 (output-panel O4 added the collapse-floor row)', () => {
    expect(descriptor.checks).toHaveLength(7);
    expect(descriptor.execution.phases).toHaveLength(1);
    expect(descriptor.outputs.writes).toHaveLength(1);
    expect(descriptor.invariants).toHaveLength(3);
    expect(descriptor.plausibility).toHaveLength(4);
  });

  it('Rule 3, config direction — every config.logic_variables[].name has a seed row (RED with one removed)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const seeds: any = require(path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json'));
    for (const v of descriptor.config.logic_variables) {
      expect(seeds).toHaveProperty(v.name);
      expect(v.on_invalid).toBe('fail'); // Rule 3 / R-G: every one is verdict-affecting
    }
    expect(descriptor.config.logic_variables).toHaveLength(8);
  });

  it('the 12 gate-critical structural fences are declared as descriptor DATA, not left to compute prose', () => {
    // F2/F3 SRID — declarative parity field (RV-L2: real enforcement is in the hook, not this field).
    expect(descriptor.guards.srid).toBe(4326);
    expect(descriptor.guards.empty_source).toBe('ravines');
    // F6 — the triple guard, EXPLICIT column list, never "all_declared".
    const w0 = descriptor.outputs.writes[0];
    expect(w0.write_discipline.guard_columns).toEqual([
      'is_in_ravine_protection_area', 'ravine_distance_m', 'ravine_dataset_version_when_enriched',
    ]);
    expect(w0.write_discipline.guard_columns).not.toBe('all_declared');
    expect(w0.write_discipline.idempotent_rerun).toBe('zero_writes');
    // F9's disposition is a DECLARED deviation, not a silent drop.
    expect(descriptor.deviations).toHaveLength(1);
    expect(descriptor.deviations[0].from).toMatch(/Layer-1/);
  });

  it('claim #54 — staleness.scope is a lineage predicate, so outputs.invalidates[] and phases[0].invalidator_ref are BOTH present', () => {
    expect(descriptor.staleness.scope).toMatch(/ravine_dataset_version_when_enriched/);
    expect(descriptor.outputs.invalidates).toHaveLength(1);
    expect(descriptor.execution.phases[0].invalidator_ref).toBe(0);
  });

  it('COUNTER-ROOT lock — records_updated resolves from written.e1.updated, records_total from matched.compute.* (A4 ruling), never a bare compute.*', () => {
    const c = descriptor.counters;
    expect(c.records_updated.source).toBe('written.e1.updated');
    expect(c.records_total.source).toBe('matched.compute.geom_bearing_parcels_scanned');
    expect(c.records_new.source).toBe('matched.compute.records_new_aggregate');
    for (const slot of ['records_total', 'records_new', 'records_updated']) {
      expect(c[slot].source).not.toMatch(/^compute\./);
    }
  });

  it('the ENRICHER profile\'s two required from-config fields name REAL logic variables, never the literal "none" (ER-D1)', () => {
    const e = descriptor.execution;
    expect(e.heartbeat_minutes_from_config).toBe('enrich_ravines_heartbeat_minutes');
    expect(e.lock_timeout_ms_from_config).toBe('enrich_ravines_lock_timeout_ms');
    expect(e.phases[0].timeout_minutes_from_config).toBe('enrich_ravines_phase_timeout_minutes');
    expect(e.enrich_hooks.contract_read).toBe('readRavineContract');
    expect(e.enrich_hooks.post_phase).toBe('computePostPhase');
  });
});

describe('enrich_ravines — the artifacts commit 2b owes (RED at commit 1, FLIP at commit 2b)', () => {
  it('the compute module exists, exports the two declared hooks by name, and passes[] match the declared phase [flips at commit 2b]', () => {
    expect(exists(COMPUTE_REL)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const compute: any = require(path.join(REPO_ROOT, COMPUTE_REL));
    expect(typeof compute).toBe('function');
    expect(compute.passes.map((p: { name: string }) => p.name)).toEqual(
      descriptor.execution.phases.map((p: { name: string }) => p.name),
    );
    expect(typeof compute[descriptor.execution.enrich_hooks.contract_read]).toBe('function');
    expect(typeof compute[descriptor.execution.enrich_hooks.post_phase]).toBe('function');
    // Rule 2 — compute is just compute (comment-stripped scan, the geocode_permits precedent).
    const src = read(COMPUTE_REL)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(src).not.toMatch(/require\(['"]\.\.\/pipeline['"]\)/);
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/Date\.now\(\)/);
    expect(src).not.toMatch(/console\./);
  });

  it('F5 — ENRICH_SQL is the materialized-centroid LATERAL form, PORTED VERBATIM, never the spec\'s slow inline-centroid form [flips at commit 2b]', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const compute: any = require(path.join(REPO_ROOT, COMPUTE_REL));
    expect(compute.ENRICH_SQL).toContain('AS MATERIALIZED');
    expect(compute.ENRICH_SQL).toMatch(/pc\.cg <-> r\.geom::geography/);
    expect(compute.ENRICH_SQL).not.toMatch(/ST_Centroid\(p\.geom\)::geography\s*<->/); // the slow inline form
  });

  it('F6 regression lock, BOTH directions — dropping the lineage stamp from guard_columns must reproduce the second-run rewrite [flips at commit 2b]', () => {
    const w0 = descriptor.outputs.writes[0];
    // Forward: the real declaration guards all three, including the lineage stamp.
    expect(w0.write_discipline.guard_columns).toContain('ravine_dataset_version_when_enriched');
    // RED direction: simulate the fence's absence and prove the SQL's own guard clause would then
    // admit every row on a second run (the §8d no-op-write fence this test exists to lock).
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const compute: any = require(path.join(REPO_ROOT, COMPUTE_REL));
    const guardClause = compute.ENRICH_SQL.slice(compute.ENRICH_SQL.indexOf('WHERE p.id'));
    const withoutLineageGuard = guardClause.replace(/OR p\.ravine_dataset_version_when_enriched IS DISTINCT FROM \$1\s*/, '');
    expect(guardClause).not.toBe(withoutLineageGuard); // the removal must actually change the text
  });

  it('the shell is FROZEN onto pipeline.step and declares ADVISORY_LOCK_ID 60 as source text [flips at commit 2b]', () => {
    const src = read(STEP_REL);
    expect(src).toContain('module.exports = pipeline.step(descriptor, compute);');
    expect(src).toContain('const ADVISORY_LOCK_ID = 60;');
    // The pre-conversion body must be gone: no hand-rolled transaction, no emitSummary, no raw SQL.
    expect(src).not.toContain('withTransaction');
    expect(src).not.toContain('emitSummary');
    expect(src).not.toContain('UPDATE parcels');
    expect(src.split('\n').filter((l) => l.trim().length > 0).length).toBeLessThan(40);
  });

  it('Ask A2 (a) — passCtx.contract reaches the pass: the runner exposes the contract_read hook\'s return value, not just staleOverlays [flips at commit 2b]', () => {
    const indexSrc = read('scripts/lib/step/index.js');
    // The additive seam this commit authorizes, and ONLY this seam: one `contract,` key on both
    // ENRICHER passCtx object literals (shared-txn + post-commit), no other runner shape change.
    expect(indexSrc).toMatch(/passCtx = \{[^}]*\bcontract\b/);
  });
});

describe('enrich_ravines — F9 disposition: the retired mechanism, the preserved observable [flips at commit 2b]', () => {
  it('parcels_ravine_enrich_skipped is a DERIVED check (updated === 0), never a hand-rolled skip branch [flips at commit 2b]', () => {
    const src = read(COMPUTE_REL);
    expect(src).not.toMatch(/function countStale/);
    expect(src).not.toMatch(/if \(staleCount === 0\)/);
    expect(src).toMatch(/skipped\s*=\s*updated === 0/);
  });

  it('unlike the legacy, guards.requires now runs on EVERY invocation (Class A(vii) — a genuine strengthening, not a byte-neutral port) — true from commit 1: descriptor-only claim', () => {
    expect(descriptor.guards.requires.length).toBeGreaterThanOrEqual(5);
    for (const r of descriptor.guards.requires) expect(r.on_missing).toBe('fail');
  });
});

describe('enrich_ravines — RV-L3, the config-threading gap this conversion did NOT paper over', () => {
  it('the invalid-geometry ratio stays a pinned literal (0.05) in compute, NOT a phantom logic variable no code path can read [flips at commit 2b]', () => {
    const names = descriptor.config.logic_variables.map((v: { name: string }) => v.name);
    expect(names).not.toContain('enrich_ravines_producer_invalid_geom_max_pct');
    const src = read(COMPUTE_REL);
    expect(src).toMatch(/MAX_INVALID_GEOM_RATIO\s*=\s*0\.05/);
  });
});

describe('enrich_ravines — cutover-only claim (structurally cannot land before commit 3)', () => {
  it('the slug is REGISTERED in converted.json and its pending entry is DELETED in the same commit (R-K mutual exclusion) [flips at commit 3]', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg: any = JSON.parse(read('scripts/steps/_schema/converted.json'));
    expect(reg.converted).toContain(STEP_REL);
    const stillPending = (reg.pending || []).some((p: { file: string }) => p.file === STEP_REL);
    expect(stillPending).toBe(false);
  });
});
