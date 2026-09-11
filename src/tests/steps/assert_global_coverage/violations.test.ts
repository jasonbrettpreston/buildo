// SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md (owning spec — §2 chain-position
//   text corrected at commit 9, AGC-D2)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (ASSERT archetype — outputs/
//   recovery/counters forced "none"), §5.3 (checks[] shape, 10 required fields)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6 (gates), §7 commit 6 (PH-7
//   red-first test design, prove RED — G7)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 3 (every verdict-affecting bound
//   is a registered logic_variables entry), register R-K/R-K.1 (converted.json pending vocabulary)
//
// Batch 1 I1 — `assert_global_coverage`, the SECOND ASSERT-archetype conversion (after `assert_schema`,
// pilot 1). Plan: `.cursor/batch1_i1_assert_global_coverage_active_task.md`. Assessment report (PH-0/3/5/6
// + non-determinism inventory, commits 1-5): `docs/reports/2026-09-11-batch1-i1-assert-global-coverage-
// assessment.md` — §4.1 is the CONTRACT list this file locks; §2.4 is the operator's PH-3 adjudication
// (14 new logic_variables, 7 pairs); §4.3/§4.4 is the AGC-D1..D7 defect ledger (`docs/reports/
// defect-ledger.md`), every row PIN, none fixed here.
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Claims that read a FUTURE artifact
// (the descriptor, the compute module) open with `artifact()` → `expect(existsSync).toBe(true)`, so the
// failure names the missing artifact rather than surfacing as an import/parse error. Genuinely-red claims
// are wrapped `it.fails(...)` with a `// flips at: commit 7` comment — `it.fails()` INVERTS: the wrapped
// body genuinely throws internally and vitest reports the wrapped test as PASSED; if a claim were NOT
// actually red, vitest reports "expected test to fail but it passed," a real suite failure. A fully green
// run of this file is therefore the proof every `it.fails()` claim is genuinely red today. Plain `it()`
// covers claims testable TODAY: facts already true (lock 111 in the step file, the 3 chains + measured
// positions in manifest.json, the 6 pre-existing registered logic vars, the 4 golden PRE captures with
// exit 0 and their recorded verdicts, the assessment report's sections/ledger rows) and the three G4d
// fence detectors (C6, C3, DEC-1), which run against the CURRENT (pre-conversion) step source exactly as
// `assert_schema`'s `FENCES` array runs against its legacy step pre-conversion — both directions
// (fence intact / fence reverted) are provable today because the subject artifact (the step file) already
// exists; only the descriptor/compute do not.
//
// The artifacts this file asserts against (commits 7-9, `.cursor/batch1_i1_assert_global_coverage_active_task.md`):
//   scripts/quality/assert-global-coverage.descriptor.json — new, ASSERT archetype, outputs/recovery/
//     counters "none", config.logic_variables ⊇ 6 existing + 14 new (report §2.4)
//   scripts/lib/compute/assert-global-coverage.js — new, dispatch table, ctx.report() only, no pool access
//   scripts/quality/assert-global-coverage.js — commit 9's frozen 8-line shell (pipeline.step(...))
//   scripts/steps/_schema/converted.json — this commit's `pending` entry (stage: "red_suite")

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/quality/assert-global-coverage.js';
const DESCRIPTOR_REL = 'scripts/quality/assert-global-coverage.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/assert-global-coverage.js';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const MANIFEST_REL = 'scripts/manifest.json';
const SEED_REL = 'scripts/seeds/logic_variables.json';
const REPORT_REL = 'docs/reports/2026-09-11-batch1-i1-assert-global-coverage-assessment.md';
const DEFECT_LEDGER_REL = 'docs/reports/defect-ledger.md';
const GOLDEN_DIR_REL = 'docs/reports/golden/assert_global_coverage/pre';
const COMPUTE_SHAPE_RULE_REL = 'scripts/ast-grep-rules/compute-shape.yml';

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by this step's commit 7-9 sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

function src(): string {
  return fs.readFileSync(abs(STEP_REL), 'utf8');
}

interface Check {
  id: string;
  kind: string;
  expect: unknown;
  limit: unknown;
  limit_from_config?: string;
  severity: string;
  blocking: boolean;
  when: string;
  chains: string[] | 'all';
}
interface Descriptor {
  identity: { name: string; lock: number; archetype: string };
  outputs: unknown;
  recovery: unknown;
  counters: unknown;
  checks: Check[];
  config: 'none' | { logic_variables: Array<{ name: string; min: number | 'none'; max: number | 'none'; on_invalid: string }> };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library, same as pilot 1
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d); // throws with the AJV error list if the ASSERT profile is violated
  return d;
}

function computeSource(): string {
  return readText(COMPUTE_REL);
}

// ---------------------------------------------------------------------------
// Report table parsing — found by HEADER, never by position (assert_schema precedent)
// ---------------------------------------------------------------------------

interface MdTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

function cleanCell(s: string): string {
  return s.replace(/[`*]/g, '').trim();
}

function mdTables(md: string): MdTable[] {
  const lines = md.split(/\r?\n/);
  const tables: MdTable[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
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
      tables.push({ headers, rows });
      i = j - 1;
    }
  }
  return tables;
}

function reportTable(md: string, want: Array<[string, RegExp]>): { table: MdTable; col: (name: string) => string } {
  const found = mdTables(md).find((t) => want.every(([, re]) => t.headers.some((h) => re.test(h))));
  expect(found, `${REPORT_REL} has no table with columns ${want.map(([n]) => n).join(' · ')}`).toBeDefined();
  const t = found as MdTable;
  const col = (name: string): string => {
    const [, re] = want.find(([n]) => n === name) as [string, RegExp];
    return t.headers.find((h) => re.test(h)) as string;
  };
  return { table: t, col };
}

/** The 273-row builder census (report §2.3) — distinct (step target + field) pairs, the floor for checks.length. */
function censusDistinctMetricCount(): number {
  const md = fs.readFileSync(abs(REPORT_REL), 'utf8');
  const { table, col } = reportTable(md, [
    ['step target', /step target/],
    ['field', /field.*metric/],
  ]);
  const keys = new Set(table.rows.map((r) => `${r[col('step target')]}::${r[col('field')]}`.toLowerCase()));
  return keys.size;
}

// ---------------------------------------------------------------------------
// 1. Facts testable TODAY (plain `it()`)
// ---------------------------------------------------------------------------

describe('assert_global_coverage — measured facts, true today (plain it)', () => {
  it('advisory lock 111 is declared in the pre-conversion step file (Spec 47 §A.5)', () => {
    expect(src()).toContain('ADVISORY_LOCK_ID = 111');
  });

  it('manifest.json declares the 3 chains at the measured positions (report §1.1 claim 3)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require(abs(MANIFEST_REL)) as { chains: Record<string, string[]> };
    const permits = manifest.chains.permits ?? [];
    const coa = manifest.chains.coa ?? [];
    const sources = manifest.chains.sources ?? [];
    expect(permits.indexOf('assert_global_coverage'), 'permits chain position').toBe(31); // 32 of 33
    expect(permits.length).toBe(33);
    expect(coa.indexOf('assert_global_coverage'), 'coa chain position').toBe(15); // 16 of 16, last
    expect(coa.length).toBe(16);
    expect(sources.indexOf('assert_global_coverage'), 'sources chain position').toBe(23); // 24 of 28
    expect(sources.length).toBe(28);
  });

  it('the 6 pre-existing verdict-affecting logic variables are registered with their measured defaults (report §1.3)', () => {
    const seed = JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8')) as Record<string, { default: number }>;
    const expected: Record<string, number> = {
      profiling_coverage_pass_pct: 90,
      profiling_coverage_warn_pct: 70,
      vocab_coverage_pass_pct: 90,
      vocab_coverage_warn_pct: 70,
      cost_coverage_pass_pct: 55,
      cost_coverage_warn_pct: 50,
    };
    for (const [name, def] of Object.entries(expected)) {
      expect(seed[name], `seed is missing ${name}`).toBeDefined();
      expect(seed[name]?.default, `${name} default drifted from the report's measured value`).toBe(def);
    }
  });

  it('the 4 golden PRE captures exist, exit 0, and carry the recorded per-chain verdicts (commit 5)', () => {
    const expected: Record<string, { chain: string | null; verdict: string }> = {
      'permits.json': { chain: 'permits', verdict: 'FAIL' },
      'coa.json': { chain: 'coa', verdict: 'WARN' },
      'sources.json': { chain: 'sources', verdict: 'PASS' },
      'standalone.json': { chain: null, verdict: 'FAIL' },
    };
    expect(fs.existsSync(abs(GOLDEN_DIR_REL)), `${GOLDEN_DIR_REL} missing — commit 5 golden PRE captures`).toBe(true);
    for (const [file, want] of Object.entries(expected)) {
      const p = path.join(abs(GOLDEN_DIR_REL), file);
      expect(fs.existsSync(p), `missing PRE capture ${file}`).toBe(true);
      const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as { exit_code: number; verdict: string; chain: string | null };
      expect(doc.exit_code, `${file} exit_code`).toBe(0);
      expect(doc.verdict, `${file} verdict`).toBe(want.verdict);
    }
  });

  it('the assessment report exists with its G0/G3/G5/G6 verdict lines and the §4.1 CONTRACT list', () => {
    const md = fs.readFileSync(artifact(REPORT_REL), 'utf8');
    for (const marker of ['G0: PASS', 'G3: PASS', 'G5: PASS', 'G6: PASS']) {
      expect(md.includes(marker), `report is missing "${marker}"`).toBe(true);
    }
    const start = md.indexOf('### 4.1 CONTRACT');
    const end = md.indexOf('### 4.2 INCIDENTAL');
    expect(start, 'report has no §4.1 CONTRACT section').toBeGreaterThan(0);
    expect(end, 'report has no §4.2 INCIDENTAL section').toBeGreaterThan(start);
    const bullets = md.slice(start, end).split(/\r?\n/).filter((l) => l.trim().startsWith('- '));
    expect(bullets.length, '§4.1 CONTRACT bullet count').toBeGreaterThanOrEqual(8);
  });

  it('the row-builder census parser (§2.3, 273 static call sites) is not vacuous — proves the it.fails() checks[] floor test below will exercise a real number, not zero', () => {
    const floor = censusDistinctMetricCount();
    expect(floor).toBeGreaterThan(200);
    expect(floor).toBeLessThanOrEqual(273);
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
    expect(entry?.declared).toBe('2026-09-11');
  });

  it('the defect ledger carries all 7 AGC-D rows, each OPEN · PIN (report §4.3/§4.4, none fixed during this conversion)', () => {
    const ledger = fs.readFileSync(artifact(DEFECT_LEDGER_REL), 'utf8');
    for (let n = 1; n <= 7; n++) {
      const row = ledger.split(/\r?\n/).find((l) => l.startsWith(`| AGC-D${n} `));
      expect(row, `defect ledger missing AGC-D${n}`).toBeDefined();
      expect(row, `AGC-D${n} must be OPEN · PIN, not silently closed during this conversion`).toMatch(/OPEN\s*·\s*PIN/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. G4d — three fences, both directions, against the CURRENT (pre-conversion) step source.
//    Provable today because the subject (the step file) already exists — mirrors assert_schema's
//    FENCES array run against `inputFromLegacyStep()` pre-conversion.
// ---------------------------------------------------------------------------

interface Fence {
  name: string;
  commit: string;
  detect: (text: string) => string[]; // [] = fence intact
  revert: (text: string) => string; // simulate the fence being silently dropped
}

const FENCES: Fence[] = [
  {
    name: 'C6 — lead_id integrity (migration 138_a/241)',
    commit: '5ef51de7',
    detect: (t) => {
      const v: string[] = [];
      if (!t.includes('lead_id_administrative_drift')) v.push('lead_id_administrative_drift row is gone');
      if (!t.includes('lead_id_duplicate_groups')) v.push('lead_id_duplicate_groups row is gone');
      if (!/138_a/.test(t)) v.push('the migration 138_a citation is gone');
      return v;
    },
    revert: (t) =>
      t
        .replace(/lead_id_administrative_drift/g, 'removed')
        .replace(/lead_id_duplicate_groups/g, 'removed')
        .replace(/138_a/g, 'removed'),
  },
  {
    name: 'C3/C7 — enriched_status scope-drift self-retiring WARN+INFO pair (Spec 48 §4.9)',
    commit: '5ec3523a',
    detect: (t) => {
      const v: string[] = [];
      if (!t.includes('enriched_status_status_scope_drift')) v.push('enriched_status_status_scope_drift row is gone');
      if (!t.includes('_retighten')) v.push('the retighten companion row is gone');
      if (!/driftRows\s*>\s*0/.test(t)) v.push('the self-retiring conditional (driftRows > 0) is gone');
      return v;
    },
    revert: (t) =>
      t
        .replace(/enriched_status_status_scope_drift/g, 'removed')
        .replace(/_retighten/g, 'removed')
        .replace(/driftRows\s*>\s*0/g, 'false'),
  },
  {
    name: 'DEC-1 — zoning_class calibrated 80/75 threshold (#406), both call sites (CoA + permits)',
    commit: '3ab4fa83',
    detect: (t) => {
      const v: string[] = [];
      const hits = [...t.matchAll(/zoning_class['"],[^\n]*?,\s*80,\s*75\)/g)];
      if (hits.length < 2) v.push(`expected 2 zoning_class 80/75 call sites (CoA + permits), found ${hits.length}`);
      return v;
    },
    revert: (t) => t.replace(/(zoning_class['"],[^\n]*?,\s*)80,\s*75\)/g, '$1999, 999)'),
  },
];

describe('assert_global_coverage — G4d fence locks (both directions, pre-conversion source)', () => {
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
// 3. Genuinely RED today — flips at commit 7 (descriptor + compute land)
// ===========================================================================

describe('assert_global_coverage — genuinely red until commit 7 (it.fails)', () => {
  it.fails('descriptor exists and validates against the ASSERT profile: outputs/recovery/counters "none"', () => { // flips at: commit 7
    const d = loadDescriptor();
    expect(d.identity.archetype).toBe('ASSERT');
    expect(d.outputs).toBe('none');
    expect(d.recovery).toBe('none');
    expect(d.counters).toBe('none');
  });

  it.fails('config.logic_variables is a superset of the 6 existing + 14 newly-declared tunables (report §2.4)', () => { // flips at: commit 7
    const d = loadDescriptor();
    expect(d.config).not.toBe('none');
    const cfg = d.config as { logic_variables: Array<{ name: string }> };
    const names = new Set(cfg.logic_variables.map((v) => v.name));
    const expected = [
      'profiling_coverage_pass_pct', 'profiling_coverage_warn_pct',
      'vocab_coverage_pass_pct', 'vocab_coverage_warn_pct',
      'cost_coverage_pass_pct', 'cost_coverage_warn_pct',
      'zoning_class_coverage_pass_pct', 'zoning_class_coverage_warn_pct',
      'coa_neighbourhood_coverage_pass_pct', 'coa_neighbourhood_coverage_warn_pct',
      'coa_structure_type_coverage_pass_pct', 'coa_structure_type_coverage_warn_pct',
      'sources_zoning_class_coverage_pass_pct', 'sources_zoning_class_coverage_warn_pct',
      'sources_maxbuild_coverage_pass_pct', 'sources_maxbuild_coverage_warn_pct',
      'parcel_cost_menu_coverage_pass_pct', 'parcel_cost_menu_coverage_warn_pct',
      'external_coverage_pass_pct', 'external_coverage_warn_pct',
    ];
    for (const name of expected) expect(names.has(name), `config.logic_variables missing ${name}`).toBe(true);
  });

  it.fails('checks[] count is at least the row-builder census distinct-metric floor (report §2.3, tool-generated per Ask A1)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const floor = censusDistinctMetricCount();
    expect(floor, 'census produced zero distinct metrics — parser regression').toBeGreaterThan(200);
    expect(d.checks.length).toBeGreaterThanOrEqual(floor);
  });

  it.fails('DEC-1 (zoning_class 80/75) is reachable via limit_from_config at both call sites (CoA + permits)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const hits = d.checks.filter((c) => c.limit_from_config === 'zoning_class_coverage_pass_pct');
    expect(hits.length, 'expected 2 checks (CoA + permits) declaring limit_from_config zoning_class_coverage_pass_pct').toBe(2);
  });

  it.fails('the C6 lead-id invariants are declared as kind:"invariant", severity:"FAIL", limit 0 (IL-1, both-directions fence)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const drift = d.checks.filter((c) => /lead_id_administrative_drift|lead_id_duplicate_groups/.test(c.id));
    expect(drift.length, 'expected both C6 invariant checks declared').toBe(2);
    for (const c of drift) {
      expect(c.kind).toBe('invariant');
      expect(c.severity).toBe('FAIL');
      expect(c.limit).toBe(0);
    }
  });

  it.fails('the compute module exists, exports compute, and passes the compute-shape ast-grep rule (Spec 122 §5.5)', () => { // flips at: commit 7
    computeSource(); // throws via artifact() if missing
    const ruleAbs = abs(COMPUTE_SHAPE_RULE_REL);
    expect(fs.existsSync(ruleAbs), `${COMPUTE_SHAPE_RULE_REL} missing`).toBe(true);
    const binCandidates = [
      path.join(REPO_ROOT, 'node_modules', '@ast-grep', 'cli-win32-x64-msvc', 'ast-grep.exe'),
      path.join(REPO_ROOT, 'node_modules', '.bin', 'ast-grep'),
    ];
    const bin = binCandidates.find((c) => fs.existsSync(c));
    expect(bin, 'ast-grep binary not found — run npm ci').toBeDefined();
    const res = execFileSync(bin as string, ['scan', '--rule', ruleAbs, '--report-style=short', '--color=never', COMPUTE_REL], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(res.trim(), `compute-shape violations:\n${res}`).toBe('');
  });

  it.fails('commit 9\'s frozen shell calls pipeline.step(...) while keeping the lock-111 constant (thin shell)', () => { // flips at: commit 7 (compute), fully true only after commit 9's cutover peel
    expect(src()).toContain('ADVISORY_LOCK_ID = 111');
    expect(src()).toMatch(/pipeline\.step\(/);
  });
});
