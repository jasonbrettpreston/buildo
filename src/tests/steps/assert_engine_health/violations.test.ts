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
// Batch 1 I3 — `assert_engine_health`, compressed 3-commit form (R-PACE-1). Plan:
// `.cursor/batch1_i3_assert_engine_health_active_task.md`. Assessment report (PH-0/3/5/6, commit ①):
// `docs/reports/2026-09-14-batch1-i3-assert-engine-health-assessment.md` — §2 is the OPEN archetype
// ruling (Ask 1: ASSERT-with-exception vs RECORDER) this file's it.fails() claims are written AROUND
// (some genuinely cannot be asserted precisely until the operator rules — those check only the
// artifact's EXISTENCE, not its archetype-specific shape, and are commented accordingly); §4.3/§4.4
// is the AEH-D1..D5 defect ledger, every row OPEN · PIN, none fixed here; §3 is the PH-3 intent ledger
// (AEH-IL-1..6), every row PROPOSED, none adjudicated here (Spec 123 §7.1: discoverer != adjudicator).
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Claims that read a FUTURE
// artifact (the descriptor, the compute module — both land at commit ②, folded per R-PACE-1) open
// with `artifact()` -> `expect(existsSync).toBe(true)`, so the failure names the missing artifact
// rather than surfacing as an import/parse error. Genuinely-red claims are wrapped `it.fails(...)`
// with a `// flips at: commit 2` comment — `it.fails()` INVERTS: the wrapped body genuinely throws
// internally and vitest reports the wrapped test as PASSED; if a claim were NOT actually red, vitest
// reports "expected test to fail but it passed," a real suite failure. A fully green run of this file
// is therefore the proof every `it.fails()` claim is genuinely red today. Plain `it()` covers claims
// testable TODAY: facts already true (lock 104 in the step file, the 4 chains + measured positions in
// manifest.json, the 6 threshold literals — 4 top-level + 2 per-audit-table, report §4.4 — the
// never-halts-on-threshold verdict shape, the report's sections/ledger rows, the converted.json
// pending entry) and the 4 named G4d fences (AEH-IL-1 through AEH-IL-4), which run against the
// CURRENT (pre-conversion) step source exactly as `assert_data_bounds`'s own I2 precedent — both
// directions (fence intact / fence reverted) are provable today because the subject artifact (the
// step file) already exists; only the descriptor/compute do not.
//
// The artifacts this file asserts against (commit ②, `.cursor/batch1_i3_assert_engine_health_active_task.md`):
//   scripts/quality/assert-engine-health.descriptor.json — new, archetype PER THE ASK 1 RULING
//   scripts/lib/compute/assert-engine-health.js — new, dispatch table, ctx.report() only
//   scripts/quality/assert-engine-health.js — commit ③'s frozen shell (pipeline.step(...))
//   scripts/steps/_schema/converted.json — THIS commit's `pending` entry (stage: "red_suite")

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
  it('advisory lock 104 is declared in the pre-conversion step file (Spec 47 §A.5)', () => {
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

  it('the 4 top-level threshold literals carry their measured values (report §1.1 claim 5)', () => {
    expect(src()).toMatch(/DEAD_TUPLE_RATIO\s*=\s*0\.10/);
    expect(src()).toMatch(/SEQ_SCAN_RATIO\s*=\s*0\.80/);
    expect(src()).toMatch(/SEQ_SCAN_MIN_ROWS\s*=\s*10000/);
    expect(src()).toMatch(/PING_PONG_RATIO\s*=\s*10/);
  });

  it('the 2 per-audit-table literals carry their measured values and their measured INCONSISTENCY (report §1.1 claim 6, AEH-D3/AEH-IL-5/6)', () => {
    const text = src();
    // inspAuditTable (Phase 6, deep_scrapes): FAIL at >=10% dead / >=5x update-insert
    expect(text).toMatch(/deadPctNum >= 10 \? 'FAIL' : 'PASS'/);
    expect(text).toMatch(/uiRatioNum >= 5 \? 'FAIL' : 'PASS'/);
    // coaAuditTable (Phase 9, coa): WARN (not FAIL) at the SAME >=10% dead-tuple bound — the
    // measured severity inconsistency for the identical predicate.
    expect(text).toMatch(/coaDeadPctNum >= 10 \? 'WARN' : 'PASS'/);
  });

  it('no threshold breach in this file ever reaches the step-level throw — only a genuine exception does (report §1.2, the load-bearing Ask 1 evidence)', () => {
    const text = src();
    // The only push sites into `errors[]` are the outer catch (never a threshold comparison).
    const errorsPushSites = [...text.matchAll(/errors\.push\(/g)];
    expect(errorsPushSites.length, 'errors[] must have exactly one push site (the outer catch, :191)').toBe(1);
    // The throw is driven by hasErrors := errors.length > 0, never by warnings.length or a FAIL row.
    expect(text).toMatch(/const hasErrors = errors\.length > 0;/);
    expect(text).toMatch(/if \(hasErrors\) throw new Error\('Engine health check failed'\);/);
    // The two 'FAIL'-capable audit tables (insp/coa) never feed `errors[]` or `hasErrors`.
    expect(text.indexOf("hasFails ? 'FAIL'")).toBeGreaterThan(-1);
    expect(text).not.toMatch(/hasFails\s*&&\s*errors\.push/);
  });

  it('no `new Date()` is written to the DB — only Date.now() for elapsed-ms (report §1.3, clock seam compliant)', () => {
    const text = src();
    const newDateSites = [...text.matchAll(/new Date\(/g)];
    expect(newDateSites.length, 'new Date() must not appear anywhere in this file').toBe(0);
  });

  it('the VACUUM ANALYZE target set is runtime-discovered, never a hardcoded table list (report §1.4/§4.1 CONTRACT)', () => {
    const text = src();
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

  it('converted.json declares this step pending at stage "red_suite" (R-K/R-K.1) — well-formed, and not double-registered in `converted`', () => {
    const doc = JSON.parse(fs.readFileSync(artifact(CONVERTED_REL), 'utf8')) as {
      converted: string[];
      pending: Array<{ file: string; registers_at: string; reason: string; declared: string; stage: string }>;
    };
    expect(doc.converted, 'must not be double-registered while still pending').not.toContain(STEP_REL);
    const entry = doc.pending.find((p) => p.file === STEP_REL);
    expect(entry, `${CONVERTED_REL} has no pending entry for ${STEP_REL}`).toBeDefined();
    expect(entry?.stage).toBe('red_suite');
  });

  it('template-freeze.json shows BOTH ASSERT and RECORDER proven, with different converted-member counts — the measured R-PACE-1 consequence named in report §2 (Ask 1)', () => {
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
    expect(archCounts.get('RECORDER'), '1 RECORDER member — compressed form would NOT be eligible under RECORDER today').toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. G4d — the 4 named fences (AEH-IL-1 through AEH-IL-4), both directions, against the CURRENT
//    (pre-conversion) step source. Provable today because the subject (the step file) already
//    exists — mirrors assert_data_bounds's own I2 precedent (FENCES array).
// ---------------------------------------------------------------------------

interface Fence {
  name: string;
  commit: string;
  detect: (text: string) => string[]; // [] = fence intact
  revert: (text: string) => string; // simulate the fence being silently dropped
}

const FENCES: Fence[] = [
  {
    name: 'AEH-IL-1 — PING_PONG_RATIO raised 2 -> 10 (8c9e64d7), operational-baseline rationale documented (bdcbb58a)',
    commit: '8c9e64d7',
    detect: (t) => {
      const v: string[] = [];
      if (!/PING_PONG_RATIO = 10/.test(t)) v.push('PING_PONG_RATIO is no longer 10');
      if (!/review_followups\.md/.test(t)) v.push('the review_followups.md citation comment is gone');
      return v;
    },
    revert: (t) => t.replace(
      /const PING_PONG_RATIO = 10;[^\n]*/,
      "const PING_PONG_RATIO = 2;           // updates > 2x inserts",
    ),
  },
  {
    name: 'AEH-IL-2 — vacuumTargets hoisted to `let` before the try block (9d9acf7a, scope-crash fix)',
    commit: '9d9acf7a',
    detect: (t) => {
      const v: string[] = [];
      // The declaration must exist, be a `let` (not `const`, which crashed pre-9d9acf7a), and
      // precede the domain-discovery try block (`:71`) it is read/written inside of.
      const declIdx = t.search(/let vacuumTargets = \[\];/);
      const tryIdx = t.indexOf('    // Discover all public-schema tables dynamically');
      if (declIdx === -1) v.push('vacuumTargets is no longer declared with `let`');
      else if (tryIdx === -1 || !(declIdx < tryIdx)) v.push('vacuumTargets declaration no longer precedes the discovery try block');
      return v;
    },
    revert: (t) => t.replace(/ {2}let vacuumTargets = \[\];\r?\n/, ''),
  },
  {
    name: 'AEH-IL-3 — ledger-strand window (P3, f32b1485): the throw fires AFTER the finalize UPDATE, load-bearing ordering comment intact',
    commit: 'f32b1485',
    detect: (t) => {
      const v: string[] = [];
      if (!/Load-bearing ordering; do not move the throw up\./.test(t)) v.push('the load-bearing-ordering comment is gone');
      if (!/finalizeStrandedRun/.test(t)) v.push('finalizeStrandedRun is no longer imported/called');
      const finalizeUpdateIdx = t.indexOf('ledgerFinalized = true');
      const throwIdx = t.indexOf("throw new Error('Engine health check failed')");
      if (finalizeUpdateIdx === -1 || throwIdx === -1 || !(finalizeUpdateIdx < throwIdx)) {
        v.push('the finalize UPDATE no longer precedes the throw in source order');
      }
      return v;
    },
    revert: (t) => t.replace(
      /\s*\/\/ NOTE: fires AFTER the finalize UPDATE above, so the row already carries the\s*\n\s*\/\/ real status\/errors — the window sees ledgerFinalized=true and does not\s*\n\s*\/\/ relabel it\. Load-bearing ordering; do not move the throw up\.\s*\n/,
      '\n',
    ),
  },
  {
    name: 'AEH-IL-4 — chain-aware per-chain audit_table dispatch (ab3dc8a1): exactly one table selected by CHAIN_ID',
    commit: 'ab3dc8a1',
    detect: (t) => {
      const v: string[] = [];
      for (const needle of [
        "CHAIN_ID === 'deep_scrapes' && inspAuditTable",
        "CHAIN_ID === 'coa' && coaAuditTable",
        'const phaseMap = { permits: 16, sources: 15, coa: 9, deep_scrapes: 6 };',
      ]) {
        if (!t.includes(needle)) v.push(`missing: ${needle}`);
      }
      return v;
    },
    revert: (t) => t.replace(
      "if (CHAIN_ID === 'deep_scrapes' && inspAuditTable) return { audit_table: inspAuditTable };",
      '// removed',
    ),
  },
];

describe('assert_engine_health — G4d fence locks (both directions, pre-conversion source)', () => {
  for (const fence of FENCES) {
    describe(`${fence.name} (${fence.commit})`, () => {
      it('is intact in the current step source', () => {
        expect(fence.detect(src()), `fence violated in the live file: ${fence.name}`).toEqual([]);
      });

      it('a reverted copy is detected as violated (proves the detector is not vacuous)', () => {
        expect(fence.detect(fence.revert(src())).length, `reverted text should trip ${fence.name}`).toBeGreaterThan(0);
      });
    });
  }
});

// ===========================================================================
// 3. Genuinely RED today — flips at commit ② (descriptor + compute land, per the Ask 1 ruling)
// ===========================================================================

describe('assert_engine_health — genuinely red until commit ② (it.fails)', () => {
  it.fails('the descriptor exists at all', () => { // flips at: commit 2
    artifact(DESCRIPTOR_REL, 'lands at commit 2, after the Ask 1 archetype ruling');
  });

  it.fails('the descriptor declares an identity.archetype that is one of the two Ask-1 candidates, with lock 104', () => { // flips at: commit 2
    const d = loadDescriptor();
    expect(['ASSERT', 'RECORDER']).toContain(d.identity.archetype);
    expect(d.identity.lock).toBe(104);
  });

  it.fails('config.logic_variables declares the 6 tunables named in report §4.4 (4 top-level + 2 per-audit-table)', () => { // flips at: commit 2
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
    ]) {
      expect(names.has(name), `config.logic_variables missing ${name}`).toBe(true);
    }
  });

  it.fails('checks[] declares at least one check per measured metric family (dead tuple, seq scan, ping-pong, insp dead-tuple, insp update-ratio, coa dead-tuple)', () => { // flips at: commit 2
    const d = loadDescriptor();
    expect(d.checks.length).toBeGreaterThanOrEqual(6);
  });

  it.fails('identity.gate_exempt is declared true (assert_* prefix, matches the live isInfraStep verdict, report §1.1 claim 10)', () => { // flips at: commit 2
    const d = loadDescriptor() as unknown as { identity: { gate_exempt?: boolean } };
    expect(d.identity.gate_exempt).toBe(true);
  });

  it.fails('the compute module exists and exports compute', () => { // flips at: commit 2
    const text = computeSource();
    expect(text).toMatch(/module\.exports/);
  });

  it.fails('the deviations[] entry for the VACUUM-tail mechanism cites the 2026-09-10 EP-D17 DEFER ruling verbatim (Ask 2, report §5 — NOT a grandfathered.json entry)', () => { // flips at: commit 2
    const d = loadDescriptor() as unknown as { deviations: 'none' | Array<{ from: string; adjudicated_by: string }> };
    expect(d.deviations).not.toBe('none');
    const deviations = d.deviations as Array<{ from: string; adjudicated_by: string }>;
    expect(deviations.some((dv) => /VACUUM|maintenance/i.test(dv.from))).toBe(true);
  });

  it.fails('commit ③\'s frozen shell calls pipeline.step(...) while keeping the lock-104 constant (thin shell)', () => { // flips at: commit 2 (compute), fully true only after commit 3's cutover peel
    const text = src();
    expect(text).toMatch(/pipeline\.step\(/);
    expect(text.split('\n').length).toBeLessThan(20);
  });
});
