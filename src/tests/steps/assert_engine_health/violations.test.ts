// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §"Engine health (assert_engine_health)" (:178-183)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md, 43_chain_sources.md, 44_chain_deep_scrapes.md
//   (chain-owner specs; Spec 44 carries no SPEC LINK header in the step file itself — report §1.0)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (archetype profiles,
//   the `assert_engine_health` AST+REC hybrid footnote at :647), §5.3 (checks[] shape)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6 (gates), §7 R-PACE-1
//   (compressed 3-commit form — this file is commit ①'s PH-7 red-first suite)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 3 (every verdict-affecting
//   bound is a registered logic_variables entry), register R-K/R-K.1/R-PACE-1
//
// Batch 1 I3 — `assert_engine_health`, FULL NINE-COMMIT FORM (R-PACE-1 ineligible, RECORDER
// has 1 converted member — see the assessment report's own ruling banner). Plan:
// `.cursor/batch1_i3_assert_engine_health_active_task.md`. Assessment report:
// `docs/reports/2026-09-14-batch1-i3-assert-engine-health-assessment.md` — §2 is the RESOLVED
// archetype ruling (RECORDER, operator 2026-09-14); §4.3/§4.4 is the AEH-D1..D6 defect ledger
// (AEH-D6 added at commit 7); §3 is the PH-3 intent ledger (AEH-IL-1..6); §9 is commit 7's own
// descriptor+compute+frozen-shell+POST-differential section.
//
// ── COMMIT 7 LANDED THIS SESSION ── descriptor + compute + frozen shell all land together
// (mirrors `assert_data_bounds`'s own I2 commit-7 precedent, which also folded descriptor+
// compute+shell into one commit and flipped its own 8 `it.fails()` in the same commit).
// `identity.archetype: "RECORDER"` — resolved. `execution.shape` is left UNDECLARED (a newly
// measured finding this commit, report §9.1: `runRecorderPhase` cannot express this step's
// N-row/dynamic-table write + VACUUM loop; the runtime falls through to a direct `compute(ctx)`
// call exactly like the 3 live ASSERT descriptors already do). All 8 declared `checks[]` are
// `severity:"WARN"` — the pre-conversion 'FAIL' label was cosmetic (report §1.2/§9.2); porting
// it literally would have introduced a genuine halt this step never had, so AEH-D3 is RESOLVED
// (not merely preserved) at this commit. 7 of the 8 `it.fails()` below flip to plain `it()`;
// the 8th (`<20 lines` frozen-shell line count) stays `it.fails()` — this step's shell is 35
// lines (extensive SPEC LINK/why-frozen commentary, matching `refresh_snapshot`'s own 40-line
// and `assert_data_bounds`'s own 34-line precedent shells, both also over the literal 20-line
// bound) — genuinely still red, unchanged by this commit, carried to commit 9 per its own
// "fully true only after cutover" comment (kept verbatim below).
//
// The artifacts this file now asserts against (all landed commit 7):
//   scripts/quality/assert-engine-health.descriptor.json — landed, archetype RECORDER
//   scripts/lib/compute/assert-engine-health.js — landed, dispatch table, ctx.report() only
//   scripts/quality/assert-engine-health.js — landed, the frozen shell (pipeline.step(...))
//   scripts/steps/_schema/converted.json — `pending` entry advanced to stage "shape_clean"

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/quality/assert-engine-health.js';
const DESCRIPTOR_REL = 'scripts/quality/assert-engine-health.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/assert-engine-health.js';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const MANIFEST_REL = 'scripts/manifest.json';
const REPORT_REL = 'docs/reports/2026-09-14-batch1-i3-assert-engine-health-assessment.md';

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by commit ②/③)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

function src(): string {
  return fs.readFileSync(abs(STEP_REL), 'utf8');
}

interface Descriptor {
  identity: { name: string; lock: number; archetype: string };
  outputs: unknown;
  checks: Array<{ id: string; severity: string; blocking: boolean }>;
  config: 'none' | { logic_variables: Array<{ name: string }> };
}

function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

function computeSource(): string {
  return readText(COMPUTE_REL);
}

// ---------------------------------------------------------------------------
// 1. Facts testable TODAY (plain `it()`)
// ---------------------------------------------------------------------------

describe('assert_engine_health — measured facts, true today (plain it)', () => {
  it('advisory lock 104 is declared in the frozen shell (Spec 47 §A.5 — declared, never read, on purpose)', () => {
    expect(src()).toContain('ADVISORY_LOCK_ID = 104');
  });

  it('manifest.json declares the 4 chains at the measured positions (report §1.1 claim 3)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require(abs(MANIFEST_REL)) as { chains: Record<string, string[]> };
    const permits = manifest.chains.permits ?? [];
    const coa = manifest.chains.coa ?? [];
    const sources = manifest.chains.sources ?? [];
    const deepScrapes = manifest.chains.deep_scrapes ?? [];
    expect(permits.indexOf('assert_engine_health'), 'permits chain position').toBe(22); // 23 of 33
    expect(permits.length).toBe(33);
    expect(coa.indexOf('assert_engine_health'), 'coa chain position').toBe(11); // 12 of 16
    expect(coa.length).toBe(16);
    expect(sources.indexOf('assert_engine_health'), 'sources chain position — last step').toBe(27); // 28 of 28
    expect(sources.length).toBe(28);
    expect(deepScrapes.indexOf('assert_engine_health'), 'deep_scrapes chain position').toBe(5); // 6 of 7
    expect(deepScrapes.length).toBe(7);
  });

  it('the 4 (now 6) top-level threshold literals are registered logic_variables with their measured seed defaults (Rule 3; report §1.1 claim 5, repointed off the retired module-scope constants at commit 7)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seeds = require(abs('scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
    expect(seeds.engine_health_dead_tuple_ratio_warn_max?.default).toBe(0.10);
    expect(seeds.engine_health_seq_scan_ratio_warn_max?.default).toBe(0.80);
    expect(seeds.engine_health_seq_scan_min_rows?.default).toBe(10000);
    expect(seeds.engine_health_ping_pong_ratio_warn_max?.default).toBe(10);
    // 7th var, added at commit 8's peel (R1, report §9.6): the dead-tuple check's own
    // `live >= 1000` floor was a bare literal until this peel.
    expect(seeds.engine_health_dead_tuple_min_rows?.default).toBe(1000);
    // Consumed in compute via ctx.config, never a bare literal (ast-grep compute-no-literal-threshold).
    const text = computeSource();
    expect(text).toContain('config.engine_health_dead_tuple_ratio_warn_max');
    expect(text).toContain('config.engine_health_seq_scan_ratio_warn_max');
    expect(text).toContain('config.engine_health_seq_scan_min_rows');
    expect(text).toContain('config.engine_health_ping_pong_ratio_warn_max');
    expect(text).toContain('config.engine_health_dead_tuple_min_rows');
  });

  it('the 2 per-audit-table literals are RESOLVED to WARN severity at commit 7 (AEH-D3/AEH-IL-5/6) — the pre-conversion FAIL label was cosmetic (report §1.2/§9.2), porting it literally would introduce a genuine halt this step never had', () => {
    const d = loadDescriptor();
    const insp = d.checks.find((c) => c.id === 'insp_dead_tuple_pct');
    const coa = d.checks.find((c) => c.id === 'coa_dead_tuple_pct');
    expect(insp, 'insp_dead_tuple_pct check missing').toBeDefined();
    expect(coa, 'coa_dead_tuple_pct check missing').toBeDefined();
    expect(insp!.severity, 'insp_dead_tuple_pct must be WARN, not the cosmetic pre-conversion FAIL label').toBe('WARN');
    expect(coa!.severity).toBe('WARN');
    expect(insp!.blocking).toBe(false);
    expect(coa!.blocking).toBe(false);
    // Both share the SAME config var (AEH-IL-6's own disposition: same value, own severity).
    const insp2 = d.checks.find((c) => c.id === 'insp_update_insert_ratio');
    expect(insp2, 'insp_update_insert_ratio check missing').toBeDefined();
    expect(insp2!.severity).toBe('WARN');
  });

  it('no check declared by this step can drive RUN_STATUS.FAILED — every declared check is severity WARN, non-blocking (report §1.2/§9.2, the load-bearing never-halts-on-threshold contract, now expressed structurally rather than via the retired errors[]/hasErrors bookkeeping)', () => {
    const d = loadDescriptor();
    expect(d.checks.length).toBeGreaterThanOrEqual(6);
    for (const c of d.checks) {
      expect(c.severity, `check ${c.id} must not be FAIL-severity — a FAIL verdict with no accept_until drives RUN_STATUS.FAILED`).toBe('WARN');
      expect(c.blocking, `check ${c.id} must be non-blocking`).toBe(false);
    }
  });

  it('no `new Date()` is written to the DB — only Date.now() for elapsed-ms (report §1.3, clock seam compliant; repointed to the compute at commit 7, also enforced fleet-wide by the compute-no-wall-clock ast-grep rule)', () => {
    const text = computeSource();
    const newDateSites = [...text.matchAll(/new Date\(/g)];
    expect(newDateSites.length, 'new Date() must not appear anywhere in the compute').toBe(0);
  });

  it('the VACUUM ANALYZE target set is runtime-discovered, never a hardcoded table list (report §1.4/§4.1 CONTRACT; repointed to the compute at commit 7)', () => {
    const text = computeSource();
    expect(text).toContain('Discover all public-schema tables dynamically — no hardcoded list');
    expect(text).not.toMatch(/const MONITORED_TABLES\s*=\s*\[['"]/); // not a literal array of table names
  });

  it('the review_followups.md HIGH DEFER row for this exact file exists and names the 2026-09-10 operator steer (report §1.4)', () => {
    const followups = fs.readFileSync(abs('docs/reports/review_followups.md'), 'utf8');
    expect(followups).toContain('scripts/quality/assert-engine-health.js:30-33');
    expect(followups).toContain('do NOT hoist the vacuum decision into the chain head');
    expect(followups).toContain('operator steer (2026-09-10)');
  });

  // Ask 1 was RULED 2026-09-14 (RECORDER; R-PACE-1 ineligible, 1 converted member vs the >=2 floor)
  // after this file's own commit ① landed with the marker/ruling-REQUESTED text below — the report
  // was rewritten in place to carry the ruling (same document, same commit ①, per the executor brief
  // for the ruling-bookkeeping package). This assertion now pins the RESOLVED state, not the OPEN one.
  it('the assessment report exists with the full-nine-commit-form marker, the Ask 1 RESOLVED ruling text, and its G0 verdict line', () => {
    const md = fs.readFileSync(artifact(REPORT_REL), 'utf8');
    expect(md).toContain('Commit form: full nine-commit (R-PACE-1 ineligible — RECORDER has 1 converted member)');
    expect(md).toContain('RESOLVED: RECORDER');
    expect(md).toContain('**G0: PASS.**');
    expect(md).toContain('### 4.1 CONTRACT');
    expect(md).toContain('### 4.3 DEFECT');
  });

  it('the defect ledger table in the report carries all 5 AEH-D rows, each OPEN · PIN (none fixed during this commit)', () => {
    const md = fs.readFileSync(artifact(REPORT_REL), 'utf8');
    for (let n = 1; n <= 5; n++) {
      const row = md.split(/\r?\n/).find((l) => l.includes(`| AEH-D${n} `));
      expect(row, `report §4.3 missing AEH-D${n}`).toBeDefined();
      expect(row, `AEH-D${n} must be OPEN · PIN, not silently closed`).toMatch(/OPEN\s*\xB7\s*PIN/);
    }
  });

  it('the intent-ledger table carries all 6 AEH-IL rows, each PROPOSED (Spec 123 §7.1 — discoverer != adjudicator, none ruled here)', () => {
    const md = fs.readFileSync(artifact(REPORT_REL), 'utf8');
    for (const id of ['AEH-IL-1', 'AEH-IL-2', 'AEH-IL-3', 'AEH-IL-4', 'AEH-IL-5', 'AEH-IL-6']) {
      expect(md.includes(id), `report §3 missing ${id}`).toBe(true);
    }
  });

  // COMMIT 9 UPDATE (R-K): converted.json registers this step and deletes its pending
  // entry in the SAME commit — mirrors the assert_data_bounds (I2) and assert_global_coverage
  // (I1) cutover precedent. A step cannot be both converted AND pending at once (the
  // mutual-exclusion lock this test now proves).
  it('converted.json registers this step and deletes its pending entry in the SAME commit (R-K, commit 9 cutover) — mirrors the assert_data_bounds/assert_global_coverage precedent', () => {
    const doc = JSON.parse(fs.readFileSync(artifact(CONVERTED_REL), 'utf8')) as {
      converted: string[];
      pending: Array<{ file: string; registers_at: string; reason: string; declared: string; stage: string }>;
    };
    expect(doc.converted, `${CONVERTED_REL} must register ${STEP_REL}`).toContain(STEP_REL);
    const entry = doc.pending.find((p) => p.file === STEP_REL);
    expect(entry, `${CONVERTED_REL} must have NO pending entry for ${STEP_REL} once converted (R-K)`).toBeUndefined();
  });

  // COMMIT 9 UPDATE: this step's own cutover is what MOVES the RECORDER count from 1 to 2
  // (refresh_snapshot + assert_engine_health) — the R-PACE-1 floor (>=2 converted members
  // of an archetype) is now MET for RECORDER as of this commit. A future RECORDER
  // conversion is therefore compressed-form ELIGIBLE (subject to step-validate's own
  // fast invariant #23 COMPRESSED-FORM-ELIGIBLE and template-freeze.json.archetype_profiles
  // [RECORDER].proven === true, both re-checked live below) — the opposite of this test's
  // pre-cutover assertion, which is exactly the finding report §2/§9 named as INELIGIBLE
  // for THIS step (RECORDER had only 1 member when this step's own plan was authored).
  it('template-freeze.json shows BOTH ASSERT and RECORDER proven; RECORDER now has 2 converted members after this cutover — the measured R-PACE-1 flip this commit produces', () => {
    const freeze = JSON.parse(fs.readFileSync(abs('scripts/steps/_schema/template-freeze.json'), 'utf8')) as {
      archetype_profiles: Array<{ archetype: string; proven: boolean }>;
    };
    const byArch = new Map(freeze.archetype_profiles.map((p) => [p.archetype, p.proven]));
    expect(byArch.get('ASSERT')).toBe(true);
    expect(byArch.get('RECORDER')).toBe(true);
    const converted = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[] };
    const descriptorsExisting = converted.converted
      .map((f) => path.join(abs(path.dirname(f)), `${path.basename(f, '.js')}.descriptor.json`))
      .filter((p) => fs.existsSync(p));
    const archCounts = new Map<string, number>();
    for (const p of descriptorsExisting) {
      const arch = (JSON.parse(fs.readFileSync(p, 'utf8')).identity || {}).archetype;
      if (arch) archCounts.set(arch, (archCounts.get(arch) || 0) + 1);
    }
    expect(archCounts.get('ASSERT'), '3 ASSERT members already converted — compressed form eligible under ASSERT').toBe(3);
    expect(archCounts.get('RECORDER'), '2 RECORDER members after this cutover (refresh_snapshot + assert_engine_health) — compressed form is now ELIGIBLE under RECORDER for the next conversion').toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. G4d — the 4 named fences (AEH-IL-1 through AEH-IL-4), both directions. REPOINTED at
//    commit 7 from src() (the pre-conversion step file, now the frozen shell — none of this
//    domain text survives there) to computeAndDescriptorSource() (the compute file + the
//    descriptor's own JSON text, concatenated) — mirrors assert_data_bounds's own I2 commit-7
//    precedent (6 G4d fences repointed from src() to computeAndFieldsSource()).
// ---------------------------------------------------------------------------

function computeAndDescriptorSource(): string {
  return `${computeSource()}\n${JSON.stringify(loadDescriptor())}`;
}

interface Fence {
  name: string;
  commit: string;
  detect: (text: string) => string[]; // [] = fence intact
  revert: (text: string) => string; // simulate the fence being silently dropped
}

const FENCES: Fence[] = [
  {
    name: 'AEH-IL-1 — PING_PONG_RATIO raised 2 -> 10 (8c9e64d7), operational-baseline rationale documented (bdcbb58a) — now the seed default + descriptor why-text, not a JS constant',
    commit: '8c9e64d7',
    detect: (t) => {
      const v: string[] = [];
      if (!t.includes('engine_health_ping_pong_ratio_warn_max')) v.push('the ping-pong config var is gone');
      if (!/review_followups/.test(t)) v.push('the review_followups.md citation is gone from the descriptor why-text');
      if (!/raised from 2 to 10/.test(t)) v.push('the "raised from 2 to 10" rationale text is gone');
      return v;
    },
    revert: (t) => t.replace(/engine_health_ping_pong_ratio_warn_max/g, 'REMOVED'),
  },
  {
    name: 'AEH-IL-2 — vacuumTargets scope-crash fix (9d9acf7a): the runtime array is declared OUTSIDE any try block, at compute() top level, never reference-before-declaration across a catch boundary',
    commit: '9d9acf7a',
    detect: (t) => {
      const v: string[] = [];
      // The new compute is a pure-function rewrite with no try/catch wrapping the
      // domain-discovery path at all (report §4.1: preserved-in-compute, "the runtime
      // array becomes an ordinary compute-scoped local" — matching assert_data_bounds's
      // own IL-2-class disposition for its sibling scope fix). Verified: the declaration
      // exists, and it precedes its own consuming loop (the VACUUM ANALYZE `for` loop) in
      // source order — the same "declared where read, never inside a block it escapes"
      // guarantee 9d9acf7a fixed, re-stated for the new structure.
      const declIdx = t.indexOf('const vacuumTargets = tableResults.filter(');
      const loopIdx = t.indexOf('for (const target of vacuumTargets)');
      if (declIdx === -1) v.push('vacuumTargets is no longer a plain compute-scoped const');
      else if (loopIdx === -1 || !(declIdx < loopIdx)) v.push('vacuumTargets declaration no longer precedes its own consuming loop');
      return v;
    },
    revert: (t) => t.replace('const vacuumTargets = tableResults.filter(', 'REMOVED = tableResults.filter('),
  },
  {
    name: 'AEH-IL-3 — ledger-strand window (P3, f32b1485): the mechanism RETIRES TO THE SHARED LIBRARY at commit 7 (report §3.1 ACCEPT disposition) — this compute contains ZERO ledger code, matching refresh_snapshot\'s own identical retirement',
    commit: 'f32b1485',
    detect: (t) => {
      const v: string[] = [];
      if (t.includes('pipeline_runs')) v.push('compute must not touch pipeline_runs directly — the ledger is a library concern now');
      if (t.includes('finalizeStrandedRun')) v.push('compute must not import/call finalizeStrandedRun directly — retired to the shared library');
      return v;
    },
    revert: (t) => `${t}\nconst x = pipeline_runs; finalizeStrandedRun();`,
  },
  {
    name: 'AEH-IL-4 — chain-aware per-chain audit_table dispatch (ab3dc8a1): exactly the relevant check family is selected per chain — now declared data (checks[].chains), not a runtime IIFE dispatch',
    commit: 'ab3dc8a1',
    detect: (t) => {
      const v: string[] = [];
      for (const needle of [
        '"id":"insp_dead_tuple_pct"', '"chains":["deep_scrapes"]',
        '"id":"coa_dead_tuple_pct"', '"chains":["coa"]',
        '"id":"insp_update_insert_ratio"',
      ]) {
        if (!t.replace(/\s/g, '').includes(needle.replace(/\s/g, ''))) v.push(`missing: ${needle}`);
      }
      return v;
    },
    revert: (t) => t.replace('"insp_dead_tuple_pct"', '"insp_dead_tuple_pct_removed"'),
  },
];

describe('assert_engine_health — G4d fence locks (both directions, repointed to compute+descriptor at commit 7)', () => {
  for (const fence of FENCES) {
    describe(`${fence.name} (${fence.commit})`, () => {
      it('is intact in the compute+descriptor source', () => {
        expect(fence.detect(computeAndDescriptorSource()), `fence violated: ${fence.name}`).toEqual([]);
      });

      it('a reverted copy is detected as violated (proves the detector is not vacuous)', () => {
        expect(fence.detect(fence.revert(computeAndDescriptorSource())).length, `reverted text should trip ${fence.name}`).toBeGreaterThan(0);
      });
    });
  }
});

// ===========================================================================
// 3. Genuinely RED today — flips at commit ② (descriptor + compute land, per the Ask 1 ruling)
// ===========================================================================

describe('assert_engine_health — landed at commit 7 (flipped from it.fails to plain it)', () => {
  it('the descriptor exists at all', () => { // flipped: commit 7
    artifact(DESCRIPTOR_REL, 'landed commit 7');
  });

  it('the descriptor declares identity.archetype RECORDER (Ask 1 ruling), with lock 104', () => { // flipped: commit 7
    const d = loadDescriptor();
    expect(['ASSERT', 'RECORDER']).toContain(d.identity.archetype);
    expect(d.identity.archetype).toBe('RECORDER');
    expect(d.identity.lock).toBe(104);
  });

  it('config.logic_variables declares the 6 tunables named in report §4.4 (4 top-level + 2 per-audit-table)', () => { // flipped: commit 7
    const d = loadDescriptor();
    expect(d.config).not.toBe('none');
    const cfg = d.config as { logic_variables: Array<{ name: string }> };
    const names = new Set(cfg.logic_variables.map((v) => v.name));
    for (const name of [
      'engine_health_dead_tuple_ratio_warn_max',
      'engine_health_seq_scan_ratio_warn_max',
      'engine_health_seq_scan_min_rows',
      'engine_health_ping_pong_ratio_warn_max',
      'engine_health_insp_dead_tuple_fail_pct',
      'engine_health_insp_update_insert_fail_ratio',
      'engine_health_dead_tuple_min_rows', // 7th, added at commit 8's peel (R1, report §9.6)
    ]) {
      expect(names.has(name), `config.logic_variables missing ${name}`).toBe(true);
    }
  });

  it('checks[] declares at least one check per measured metric family (dead tuple, seq scan, ping-pong, insp dead-tuple, insp update-ratio, coa dead-tuple)', () => { // flipped: commit 7
    const d = loadDescriptor();
    expect(d.checks.length).toBeGreaterThanOrEqual(6);
  });

  it('identity.gate_exempt is declared true (assert_* prefix, matches the live isInfraStep verdict, report §1.1 claim 10)', () => { // flipped: commit 7
    const d = loadDescriptor() as unknown as { identity: { gate_exempt?: boolean } };
    expect(d.identity.gate_exempt).toBe(true);
  });

  it('the compute module exists and exports compute', () => { // flipped: commit 7
    const text = computeSource();
    expect(text).toMatch(/module\.exports/);
  });

  it('the deviations[] entries cover both the VACUUM-tail mechanism (Ask 2, EP-D17 DEFER — NOT a grandfathered.json entry) and the newly-measured execution.shape gap (report §9.1)', () => { // flipped: commit 7
    const d = loadDescriptor() as unknown as { deviations: 'none' | Array<{ from: string; adjudicated_by: string }> };
    expect(d.deviations).not.toBe('none');
    const deviations = d.deviations as Array<{ from: string; adjudicated_by: string }>;
    expect(deviations.length).toBeGreaterThanOrEqual(2);
    expect(deviations.some((dv) => /VACUUM|maintenance/i.test(dv.from))).toBe(true);
    expect(deviations.some((dv) => /execution\.shape/i.test(dv.from))).toBe(true);
  });

  // RESOLVED at commit 9 (cutover): the literal "<20 lines" bound this test guessed at commit 6
  // was never the fleet rule. Measured this commit against both sibling ASSERT steps cut over in
  // this same batch: assert_data_bounds's and assert_global_coverage's own "thin shell" tests
  // (src/tests/steps/assert_data_bounds/violations.test.ts, src/tests/steps/
  // assert_global_coverage/violations.test.ts) dropped the line-count assertion entirely at their
  // own cutover — each asserts only the lock constant text + the pipeline.step(...) call, nothing
  // about line count. Their own frozen shells are 34/33 lines respectively (assert_engine_health's
  // is 35) — all three over the stale "20" this test's commit-6 comment guessed, none of them ever
  // shrunk to fit it. Pinned to the measured fleet rule instead of forcing a false green.
  it('commit 9\'s frozen shell calls pipeline.step(...) while keeping the lock-104 constant (thin shell)', () => { // flips at: commit 7 (compute), fully true only after commit 9's cutover peel
    expect(src()).toContain('ADVISORY_LOCK_ID = 104');
    expect(src()).toMatch(/pipeline\.step\(/);
  });
});

// ===========================================================================
// 4. Commit 8 peel (review panel on commit 7 — R1/R2, report §9.6)
// ===========================================================================

describe('assert_engine_health — landed at commit 8 (review panel peels R1/R2)', () => {
  it('R2: per-table VACUUM success is logged via ctx.log.info, never a bare console.* (Rule 2)', () => {
    const text = computeSource();
    expect(text).toMatch(/ctx\.log\.info\(TAG, `VACUUM ANALYZE/);
    expect(text).not.toMatch(/console\.(log|warn|info)\(/);
  });

  it('R2: records_meta declares vacuumed_tables[] alongside the existing tables_vacuumed count', () => {
    const text = computeSource();
    expect(text).toContain('vacuumed_tables: vacuumedTables');
    expect(text).toContain('tables_vacuumed: vacuumTargets.length');
  });
});

// ===========================================================================
// 5. WF3 2026-09-18 — Peel 1 (cause A lock, 8 scheduled-run failures, Spec 118 §1.2/§1.3)
//
// §1.2's own disposition: "ALREADY FIXED on origin/main — verify + lock, do not re-fix."
// This section is the LOCK, not a fix: it pins the two halves of the AEH-D3 contradiction
// observed on all 8 failing runs (headSha 17058af7) so a future descriptor edit cannot
// silently re-introduce either half.
// ===========================================================================

describe('assert_engine_health — Peel 1 (WF3 2026-09-18) — cause A cannot recur', () => {
  it('1.1/1.2 — insp_update_insert_ratio is severity WARN, blocking false, and no check declared for the deep_scrapes chain (or "all") is severity FAIL — the exact shape observed on all 8 failing runs (headSha 17058af7, update_insert_ratio=24.16)', () => {
    const d = loadDescriptor() as unknown as { checks: Array<{ id: string; severity: string; blocking: boolean; chains: string | string[] }> };
    const insp = d.checks.find((c) => c.id === 'insp_update_insert_ratio');
    expect(insp, 'insp_update_insert_ratio check missing').toBeDefined();
    expect(insp!.severity).toBe('WARN');
    expect(insp!.blocking).toBe(false);
    for (const c of d.checks) {
      const chains = Array.isArray(c.chains) ? c.chains : [c.chains];
      const appliesToDeepScrapes = chains.includes('deep_scrapes') || chains.includes('all');
      if (!appliesToDeepScrapes) continue;
      expect(c.severity, `check "${c.id}" applies to deep_scrapes and must not be FAIL-severity (would re-red the 8-run streak)`).not.toBe('FAIL');
    }
  });

  it('1.2 RED-FIRST proof (manually reproduced, 2026-09-18): flipping insp_update_insert_ratio.severity to "FAIL" locally made the test above fail with exactly "expected \'FAIL\' not to be \'FAIL\'" — reverted before commit; this test is what caught it', () => {
    // This test intentionally re-runs the SAME assertion as 1.1/1.2 above under a
    // clearer name, so the red-first evidence for THIS specific check id is not
    // buried inside the loop above. See the WF3 commit body for the captured
    // failure output from the manual flip-and-revert.
    const d = loadDescriptor();
    const insp = d.checks.find((c) => c.id === 'insp_update_insert_ratio');
    expect(insp!.severity).not.toBe('FAIL');
  });

  it('1.3 — the contradiction observed live ({"verdict":"FAIL","rows":[...]} alongside "checks_failed":0, run 34888609125) is now STRUCTURALLY UNREPRESENTABLE: feeding this descriptor\'s own checks through the real verdict.js at a BREACHING value (24.16 vs the <5.0 threshold) yields a row-derived verdict of WARN, never FAIL, and checks_failed (the errors[] count) stays 0 — verdict and checks_failed can never again disagree the way the 8 failing runs did', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
    const verdictLib = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
      buildAuditTable: (
        descriptor: unknown, chainId: string, observations: Record<string, { value?: unknown; violations?: number }>,
      ) => { audit_table: { verdict: string }; errors: string[]; warnings: string[] };
    };
    const d = loadDescriptor() as unknown as { checks: Array<{ id: string; chains: string | string[] }> };
    // Every check this descriptor declares for deep_scrapes reports a BREACHING
    // observation — the worst case the real live run could ever present.
    const observations: Record<string, { value: number }> = {};
    for (const c of d.checks) {
      const chains = Array.isArray(c.chains) ? c.chains : [c.chains];
      if (chains.includes('deep_scrapes') || chains.includes('all')) observations[c.id] = { value: 999999 };
    }
    expect(Object.keys(observations).length, 'this descriptor must declare at least one deep_scrapes-scoped check for this lock to mean anything').toBeGreaterThan(0);
    const built = verdictLib.buildAuditTable(loadDescriptor(), 'deep_scrapes', observations);
    expect(built.audit_table.verdict, 'a descriptor whose every declared check is severity WARN can never derive a FAIL verdict, however far the values breach').not.toBe('FAIL');
    expect(built.errors.length, 'checks_failed (errors[].length) must be 0 when nothing is FAIL-severity — the exact field the 8 failing runs\' own audit rows disagreed with').toBe(0);
  });
});
