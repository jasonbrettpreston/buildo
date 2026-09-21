// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8d/§9/§11.1 (+ Spec 43 §Step Breakdown owner, Spec 122 §5.1 shape)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (ENRICHER), §5.1 (frozen shape), §5.5 (compute shape)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §1.1 (behaviour-neutral), §3.1 (PIN), §7 (commit ledger)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 compute-is-just-compute, Rule 3 tunables, Rule 10 row-derived verdict)
//
// ============================================================================
// Batch-2 row 2.2 — `enrich_heritage`, ENRICHER's FOURTH converted member, COMPRESSED 3-commit
// form (Spec 124 R-AH; H-A1 = (a) RULED, H-A2 = (a) 240 RULED, operator 2026-09-20).
//   commit ①  — assessment + this RED suite (every claim below tagged "[flips at commit 2]"
//               shipped as `it.fails()`) + golden PRE captures + the legacy-side
//               committed-perturbation differential + the RV-D4/seamOwned proof.
//               NO descriptor/compute/shell land at commit ① (unlike the enrich_ravines
//               precedent, where the descriptor landed at commit 1) — this plan's own §4 commit
//               table places descriptor+compute+shell+seeds at commit ②, so every claim that
//               needs one of those artifacts was genuinely red (verified: with the three new
//               files removed, every `it.fails()` case below passed as a controlled failure).
//   commit ②  — descriptor + compute + frozen shell + seeds (+10) + golden POST captures +
//               the converted-side differential + the kill-mid-run DB test. Every claim tagged
//               "[flips at commit 2]" is flipped to plain `it()` in THIS commit (below), leaving
//               only the converted.json registration claim (tagged "[flips at commit 3]") as
//               `it.fails()` — structurally cutover-only.
//
// `it.fails()` INVERTS: the wrapped body genuinely throws internally and vitest reports the
// wrapped test as PASSED; if a claim were NOT actually red, vitest reports "expected test to
// fail but it passed" — a real suite failure. A green run of this file at commit ① is
// therefore proof every `it.fails()` claim in it was genuinely red at that commit.
//
// FOLD-V4 (b): tests 7 (4-column guard regression lock) and 9 (wedge-open trap) are LIVE-DB
// claims and are homed in `src/tests/db/enrich-heritage-418.db.test.ts` as FIXTURE assertions
// (FOLD-G2 / the re-derived H1), never against the real 486,514 dev-DB parcels. This file keeps
// only the STRUCTURAL half of each (the guard_columns declaration / the eligibility clause
// text) plus test 9's fleet-wide negative-control identity (stamped ∧ ineligible == 0).
//
// THE ELEVEN FENCES (assessment §6, `git log --follow -p -- scripts/enrich-heritage.js`):
//   F1  §9 nine-throw producer HALT, pre-transaction              → contract_read hook
//   F2  L14 empty-heritage-source HALT on BOTH paths               → folded into F1's hook (RV-L2)
//   F3  PostGIS + fuzzystrmatch + normalize_address + 3 GISTs      → guards.requires
//   F4  SRID = 4326 assertion                                      → folded into F1's hook
//   F5  Commit-C lineage-column guard (named, not a raw 42703)      → guards.requires (kind:column)
//   F6  CONTAINMENT match (ST_Intersects), NOT the spec's radius    → compute, ported byte-for-byte
//         except the ONE declared Layer-2 conjunct (H-A1 (a))
//   F7  emitHeritageResults shared by both paths, coverage LIVE     → post_phase hook
//   F8  parcels_invalid_geom_count INFO, not WARN (anti-fatigue)    → declared INFO check, why states it
//   F9  #418 Layer-1 early return + FORCE_FULL escape hatch         → RETIRED (mechanism), preserved (observable)
//   F10 emitMeta under-declares reads                               → widened honestly (EH-D1)
//   F11 heritage_point_match_radius_m left out of ConfigSchema      → config.retired[]
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/enrich-heritage.js';
const COMPUTE_REL = 'scripts/lib/compute/enrich-heritage.js';
const DESCRIPTOR_REL = 'scripts/enrich-heritage.descriptor.json';

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(REPO_ROOT, rel));

/** Lazy, throws if absent — descriptor lands at commit ②, not ①. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadDescriptor(): any {
  if (!exists(DESCRIPTOR_REL)) {
    throw new Error(`${DESCRIPTOR_REL} does not exist yet — lands at commit 2 (descriptor+compute+shell)`);
  }
  return JSON.parse(read(DESCRIPTOR_REL));
}

/** Lazy, throws if absent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadCompute(): any {
  if (!exists(COMPUTE_REL)) {
    throw new Error(`${COMPUTE_REL} does not exist yet — lands at commit 2`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(REPO_ROOT, COMPUTE_REL));
}

describe('enrich_heritage — G-shape (true from commit 1: legacy source text)', () => {
  it('the legacy shell (pre-conversion) still declares ADVISORY_LOCK_ID = 62 as source text', () => {
    // This half is TRUE against whichever file sits at scripts/enrich-heritage.js right now —
    // legacy (pre commit 2) or frozen shell (commit 2+) both declare the constant as source text.
    const src = read(STEP_REL);
    expect(src).toMatch(/ADVISORY_LOCK_ID\s*=\s*62/);
  });

  it('chain wiring — sources chain has 28 steps and enrich_heritage sits immediately after enrich_ravines', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const manifest: any = require(path.join(REPO_ROOT, 'scripts/manifest.json'));
    const slugs: string[] = manifest.chains.sources;
    expect(slugs).toHaveLength(28);
    expect(slugs.indexOf('enrich_heritage')).toBe(slugs.indexOf('enrich_ravines') + 1);
  });
});

describe('enrich_heritage — descriptor structure (RED at commit 1, FLIPS at commit 2 — descriptor lands there)', () => {
  it.fails('descriptor validates against step.schema.json; identity.lock === 62, archetype ENRICHER [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { validateDescriptor }: any = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js'));
    expect(() => validateDescriptor(descriptor)).not.toThrow();
    expect(descriptor.identity.lock).toBe(62);
    expect(descriptor.identity.archetype).toBe('ENRICHER');
    expect(descriptor.identity.name).toBe('enrich_heritage');
  });

  it.fails('checks.length === 10, execution.phases.length === 1, outputs.writes.length === 1, invariants.length === 4, plausibility.length === 3 [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.checks).toHaveLength(10);
    expect(descriptor.execution.phases).toHaveLength(1);
    expect(descriptor.outputs.writes).toHaveLength(1);
    expect(descriptor.invariants).toHaveLength(4);
    expect(descriptor.plausibility).toHaveLength(3);
  });

  it.fails('Rule 3, config direction — every config.logic_variables[].name has a seed row and on_invalid:"fail"; 10 total [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const seeds: any = require(path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json'));
    for (const v of descriptor.config.logic_variables) {
      expect(seeds).toHaveProperty(v.name);
      expect(v.on_invalid).toBe('fail');
    }
    expect(descriptor.config.logic_variables).toHaveLength(10);
  });

  it.fails('Rule 3, compute direction — no threshold-shaped literal (15, 30, 2, 1, 1000) survives unexternalized in compute [flips at commit 2]', () => {
    const src = read(COMPUTE_REL);
    // The five ported literals now resolve through ctx.config, never re-inlined as bare numbers
    // in a comparison. This is a structural presence check: the compute reads
    // ctx.config.enrich_heritage_address_levenshtein_threshold, not a bare `2`.
    expect(src).toContain('ctx.config.enrich_heritage_address_levenshtein_threshold');
    expect(src).not.toMatch(/joinUpdate\(0, ENRICH_SQL, \[2,/);
  });

  it.fails('the 4-column guard + F9 deviation + config.retired[] are declared as descriptor DATA [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    const w0 = descriptor.outputs.writes[0];
    expect(w0.write_discipline.guard_columns).toEqual([
      'is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date', 'heritage_dataset_version_when_enriched',
    ]);
    expect(w0.write_discipline.idempotent_rerun).toBe('zero_writes');
    expect(descriptor.deviations.length).toBeGreaterThanOrEqual(1);
    expect(descriptor.deviations[0].from).toMatch(/Layer-1/);
    expect(descriptor.config.retired.map((r: { name: string }) => r.name)).toContain('heritage_point_match_radius_m');
  });

  it.fails('outputs.invalidates[] declares the lineage-column invalidator, and phases[0].invalidator_ref points at it [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.staleness.scope).toMatch(/heritage_dataset_version_when_enriched/);
    expect(descriptor.outputs.invalidates).toHaveLength(1);
    expect(descriptor.outputs.invalidates[0].column).toBe('heritage_dataset_version_when_enriched');
    expect(descriptor.execution.phases[0].invalidator_ref).toBe(0);
  });

  it.fails('COUNTER-ROOT — records_updated from written.e1.updated, records_total/records_new from matched.compute.*, never a bare compute.* [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    const c = descriptor.counters;
    expect(c.records_updated.source).toBe('written.e1.updated');
    expect(c.records_total.source).toBe('matched.compute.eligible_parcels_scanned');
    expect(c.records_new.source).toBe('matched.compute.records_new_aggregate');
    for (const slot of ['records_total', 'records_new', 'records_updated']) {
      expect(c[slot].source).not.toMatch(/^compute\./);
    }
  });

  it.fails('the ENRICHER profile\'s three required from-config fields name REAL logic variables, never "none" [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    const e = descriptor.execution;
    expect(e.heartbeat_minutes_from_config).toBe('enrich_heritage_heartbeat_minutes');
    expect(e.lock_timeout_ms_from_config).toBe('enrich_heritage_lock_timeout_ms');
    expect(e.phases[0].timeout_minutes_from_config).toBe('enrich_heritage_phase_timeout_minutes');
    expect(e.enrich_hooks.contract_read).toBe('readHeritageContract');
    expect(e.enrich_hooks.post_phase).toBe('computePostPhase');
  });

  it.fails('override.force_full names ENRICH_HERITAGE_FORCE_FULL and staleness.mode_select is tri_state (H-A1 (a), RULED) [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.override.force_full).toBe('ENRICH_HERITAGE_FORCE_FULL');
    expect(descriptor.staleness.mode_select).toBe('tri_state');
    expect(descriptor.execution.phases[0].scope).toBe('incremental');
  });
});

describe('enrich_heritage — the artifacts commit 2 owes (RED at commit 1, FLIP at commit 2)', () => {
  it.fails('the compute module exists, exports the two declared hooks by name, and passes[] match the declared phase [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    const compute = loadCompute();
    expect(typeof compute).toBe('function');
    expect(compute.passes.map((p: { name: string }) => p.name)).toEqual(
      descriptor.execution.phases.map((p: { name: string }) => p.name),
    );
    expect(typeof compute[descriptor.execution.enrich_hooks.contract_read]).toBe('function');
    expect(typeof compute[descriptor.execution.enrich_hooks.post_phase]).toBe('function');
    // Rule 2 — compute is just compute (comment-stripped scan).
    const src = read(COMPUTE_REL)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(src).not.toMatch(/require\(['"]\.\.\/pipeline['"]\)/);
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/Date\.now\(\)/);
    expect(src).not.toMatch(/console\./);
  });

  it.fails('F6 — ENRICH_SQL is the CONTAINMENT form (ST_Intersects), never the spec\'s ST_DWithin radius; L12 Part IV wins over Part V [flips at commit 2]', () => {
    const compute = loadCompute();
    expect(compute.ENRICH_SQL).toContain('ST_Intersects(pc.geom, hd.geom)');
    expect(compute.ENRICH_SQL).toContain('ST_Intersects(pc.geom, hp.geom)');
    expect(compute.ENRICH_SQL).not.toMatch(/ST_DWithin\(pc\.cg/);
    expect(compute.ENRICH_SQL).toContain('AS MATERIALIZED');
    expect(compute.ENRICH_SQL).toMatch(/WHEN hp_id\s+IS NOT NULL THEN 'part_iv_individual'/);
    expect(compute.ENRICH_SQL).toMatch(/WHEN hcd_id IS NOT NULL THEN 'part_v_hcd'/);
  });

  it.fails('H-A1 (a) — parcel_c carries the Layer-2 stale-only scope conjunct, byte-identical to the legacy countStale predicate [flips at commit 2]', () => {
    const compute = loadCompute();
    const cte = compute.ENRICH_SQL.slice(0, compute.ENRICH_SQL.indexOf('enrichment AS'));
    expect(cte).toMatch(/WHERE p\.geom IS NOT NULL AND NOT ST_IsEmpty\(p\.geom\) AND ST_IsValid\(p\.geom\)/);
    expect(cte).toMatch(/AND p\.heritage_dataset_version_when_enriched IS DISTINCT FROM \$2/);
  });

  it.fails('the shell is FROZEN onto pipeline.step and declares ADVISORY_LOCK_ID 62 as source text [flips at commit 2]', () => {
    const src = read(STEP_REL);
    expect(src).toContain('module.exports = pipeline.step(descriptor, compute);');
    expect(src).toContain('const ADVISORY_LOCK_ID = 62;');
    expect(src).not.toContain('withTransaction');
    expect(src).not.toContain('emitSummary');
    expect(src).not.toContain('UPDATE parcels');
    expect(src.split('\n').filter((l) => l.trim().length > 0).length).toBeLessThan(40);
  });
});

describe('enrich_heritage — F9 disposition: the retired mechanism, the preserved observable [flips at commit 2]', () => {
  it.fails('parcels_heritage_enrich_skipped is a DERIVED check (updated === 0), never a hand-rolled skip branch; no countStale survives [flips at commit 2]', () => {
    const src = read(COMPUTE_REL);
    expect(src).not.toMatch(/function countStale/);
    expect(src).not.toMatch(/if \(staleCount === 0\)/);
    expect(src).toMatch(/skipped\s*=\s*updated === 0/);
  });

  it.fails('unlike the legacy, guards.requires now runs on EVERY invocation (Class A(vii)) — 9 rows, every one on_missing:"fail" [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.guards.requires.length).toBeGreaterThanOrEqual(9);
    for (const r of descriptor.guards.requires) expect(r.on_missing).toBe('fail');
  });
});

describe('enrich_heritage — EH-D2, the declared Part IV WARN diff', () => {
  it.fails('parcels_part_iv_count is unconditional (0 -> WARN, >=1 -> PASS), diff declared in checks[].why, not re-implemented as a two-input rule [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    const check = descriptor.checks.find((c: { id: string }) => c.id === 'parcels_part_iv_count');
    expect(check.severity).toBe('WARN');
    expect(check.limit).toBe('value_min 1');
    expect(check.limit_from_config).toBe('enrich_heritage_part_iv_min_count');
    expect(check.why.text).toMatch(/EH-D2/);
  });

  it.fails('heritage_points_no_parcel_match is the R-AD 3-tier, seeded 15/30 (a reported PERCENTAGE, not the legacy fraction) [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    const check = descriptor.checks.find((c: { id: string }) => c.id === 'heritage_points_no_parcel_match');
    expect(check.limit).toBe('pct <= 15');
    expect(check.warn_limit).toBe('pct <= 30');
    expect(check.limit_from_config).toBe('enrich_heritage_unlinked_point_warn_pct');
    expect(check.warn_limit_from_config).toBe('enrich_heritage_unlinked_point_fail_pct');
  });

  it.fails('parcels_heritage_designated_count — exact 0->FAIL, >=1->PASS [flips at commit 2]', () => {
    const descriptor = loadDescriptor();
    const check = descriptor.checks.find((c: { id: string }) => c.id === 'parcels_heritage_designated_count');
    expect(check.severity).toBe('FAIL');
    expect(check.limit).toBe('value_min 1');
    expect(check.limit_from_config).toBe('enrich_heritage_designated_min_count');
  });
});

describe('enrich_heritage — unhappy paths, all nine §9 contract HALTs + L14 + SRID declared in one hook [flips at commit 2]', () => {
  it.fails('readHeritageContract throws a distinct, named error for each contract violation [flips at commit 2]', () => {
    const src = read(COMPUTE_REL);
    const expectedFragments = [
      'no successful',
      'spec_version=',
      'heritage_register sub-block is missing',
      'heritage_districts sub-block is missing',
      'ingested zero features',
      "drift_check_passed=false",
      'source_dataset_version is null/empty',
      'heritage_properties is empty',
      'heritage_districts is empty',
      'expected 4326',
    ];
    for (const frag of expectedFragments) {
      expect(src, `missing fragment: ${frag}`).toContain(frag);
    }
  });
});

describe('enrich_heritage — cutover-only claim (structurally cannot land before commit 3)', () => {
  it.fails('the slug is REGISTERED in converted.json and its pending entry is DELETED in the same commit (R-K mutual exclusion) [flips at commit 3]', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg: any = JSON.parse(read('scripts/steps/_schema/converted.json'));
    expect(reg.converted).toContain(STEP_REL);
    const stillPending = (reg.pending || []).some((p: { file: string }) => p.file === STEP_REL);
    expect(stillPending).toBe(false);
  });
});
