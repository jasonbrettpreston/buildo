// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §4 (Data bounds, assert_data_bounds —
//   the plan's Target Spec; no system-map owner row exists for this file, see report §1.0)
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md, 42_chain_coa.md, 43_chain_sources.md
//   (chain-owner specs; Spec 42 step 8/Spec 43 step 26 chain-position drift corrections land at commit 9)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (ASSERT archetype —
//   outputs/recovery/counters forced "none"), §5.3 (checks[] shape, 10 required fields)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6 (gates), §7 commit 6
//   (PH-7 red-first test design, prove RED — G7)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 3 (every verdict-affecting
//   bound is a registered logic_variables entry), register R-K/R-K.1 (converted.json pending vocabulary)
//
// Batch 1 I2 — `assert_data_bounds`, the THIRD ASSERT-archetype conversion (after `assert_schema`
// pilot 1, `assert_global_coverage` I1). Plan: `.cursor/batch1_i2_assert_data_bounds_active_task.md`.
// Assessment report (PH-0/3/5/6 + non-determinism inventory, commits 1-5, + the Spec 123 §7.1
// adjudication, commit 6): `docs/reports/2026-09-12-batch1-i2-assert-data-bounds-assessment.md` —
// §4.1 is the CONTRACT list this file locks; §2.4 is the operator's PH-3 adjudication (11 rulings,
// 18 new logic_variables + 1 knowingly-retired); §4.3/§4.4 is the ADB-D1..D6 defect ledger
// (`docs/reports/defect-ledger.md`), every row OPEN · PIN, none fixed here.
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Claims that read a FUTURE
// artifact (the descriptor, the compute module) open with `artifact()` → `expect(existsSync).toBe(true)`,
// so the failure names the missing artifact rather than surfacing as an import/parse error. Genuinely-red
// claims are wrapped `it.fails(...)` with a `// flips at: commit 7` comment — `it.fails()` INVERTS: the
// wrapped body genuinely throws internally and vitest reports the wrapped test as PASSED; if a claim were
// NOT actually red, vitest reports "expected test to fail but it passed," a real suite failure. A fully
// green run of this file is therefore the proof every `it.fails()` claim is genuinely red today. Plain
// `it()` covers claims testable TODAY: facts already true (lock 103 in the step file, the 4 chains +
// measured positions in manifest.json, the 8 live (non-retired) logic vars registered in seeds, the 5
// golden PRE captures with exit 0 and their recorded verdicts, the report's sections/ledger rows) and the
// six G4d fence detectors (IL-1 through IL-6, the named-fence set the executor brief scoped), which run
// against the CURRENT (pre-conversion) step source exactly as `assert_schema`'s `FENCES` array runs
// against its legacy step pre-conversion, and `assert_global_coverage`'s own I1 precedent — both
// directions (fence intact / fence reverted) are provable today because the subject artifact (the step
// file) already exists; only the descriptor/compute do not.
//
// The artifacts this file asserts against (commits 7-9, `.cursor/batch1_i2_assert_data_bounds_active_task.md`):
//   scripts/quality/assert-data-bounds.descriptor.json — new, ASSERT archetype, outputs/recovery/
//     counters "none", config.logic_variables = 8 existing (live) + 18 new (report §2.4)
//   scripts/lib/compute/assert-data-bounds.js — new, dispatch table, ctx.report() only, no pool access
//   scripts/quality/assert-data-bounds.js — commit 9's frozen 8-line shell (pipeline.step(...))
//   scripts/steps/_schema/converted.json — this commit's `pending` entry (stage: "red_suite")

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/quality/assert-data-bounds.js';
const DESCRIPTOR_REL = 'scripts/quality/assert-data-bounds.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/assert-data-bounds.js';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const MANIFEST_REL = 'scripts/manifest.json';
const SEED_REL = 'scripts/seeds/logic_variables.json';
const REPORT_REL = 'docs/reports/2026-09-12-batch1-i2-assert-data-bounds-assessment.md';
const DEFECT_LEDGER_REL = 'docs/reports/defect-ledger.md';
const GOLDEN_DIR_REL = 'docs/reports/golden/assert_data_bounds/pre';
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
  why?: string;
}
interface Descriptor {
  identity: { name: string; lock: number; archetype: string };
  outputs: unknown;
  recovery: unknown;
  counters: unknown;
  checks: Check[];
  config: 'none' | { logic_variables: Array<{ name: string; min: number | 'none'; max: number | 'none'; on_invalid: string }> };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library, same as pilot 1 / I1
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
// Report table parsing — found by HEADER, never by position (assert_schema / I1 precedent)
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

/** The 49-row census (report §2.3) — distinct metric names, the floor for checks.length. */
function censusDistinctMetricCount(): number {
  const md = fs.readFileSync(abs(REPORT_REL), 'utf8');
  const { table, col } = reportTable(md, [
    ['metric', /^metric$/],
    ['chains', /chain/],
  ]);
  const keys = new Set(table.rows.map((r) => r[col('metric')]?.toLowerCase()).filter(Boolean));
  return keys.size;
}

// ---------------------------------------------------------------------------
// 1. Facts testable TODAY (plain `it()`)
// ---------------------------------------------------------------------------

describe('assert_data_bounds — measured facts, true today (plain it)', () => {
  it('advisory lock 103 is declared in the pre-conversion step file (Spec 47 §A.5)', () => {
    expect(src()).toContain('ADVISORY_LOCK_ID = 103');
  });

  it('manifest.json declares the 4 chains at the measured positions (report §1.1/§1.0 claim 4)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require(abs(MANIFEST_REL)) as { chains: Record<string, string[]> };
    const permits = manifest.chains.permits ?? [];
    const coa = manifest.chains.coa ?? [];
    const sources = manifest.chains.sources ?? [];
    const deepScrapes = manifest.chains.deep_scrapes ?? [];
    expect(permits.indexOf('assert_data_bounds'), 'permits chain position').toBe(21); // 22 of 33
    expect(permits.length).toBe(33);
    expect(coa.indexOf('assert_data_bounds'), 'coa chain position').toBe(10); // 11 of 16
    expect(coa.length).toBe(16);
    expect(sources.indexOf('assert_data_bounds'), 'sources chain position').toBe(26); // 27 of 28
    expect(sources.length).toBe(28);
    expect(deepScrapes.indexOf('assert_data_bounds'), 'deep_scrapes chain position').toBe(4); // 5 of 7
    expect(deepScrapes.length).toBe(7);
  });

  it('the 8 live (non-retired) verdict-affecting logic variables are registered with their measured defaults (report §1.5)', () => {
    const seed = JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8')) as Record<string, { default: number }>;
    const expected: Record<string, number> = {
      cost_outlier_ceiling_cad: 2000000000,
      desc_null_rate_warn_pct: 5,
      builder_null_rate_warn_pct: 95,
      cost_est_null_rate_warn_pct: 80,
      cost_est_min_tiers: 2,
      coa_forward_link_sub085_warn_pct: 59,
      cost_est_legacy_cost_ceiling_cad: 50000000,
      cost_est_legacy_gfa_ceiling_sqm: 50000,
    };
    for (const [name, def] of Object.entries(expected)) {
      expect(seed[name], `seed is missing ${name}`).toBeDefined();
      expect(seed[name]?.default, `${name} default drifted from the report's measured value`).toBe(def);
    }
  });

  it('the 9th registered var (calibration_freshness_warn_hours) is declared but has ZERO runtime consumption — the ADB-D5 dead var, confirming it as the correct commit-7 retirement target', () => {
    const seed = JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8')) as Record<string, { default: number }>;
    expect(seed.calibration_freshness_warn_hours, 'seed must still carry the var today — it retires at commit 7, not before').toBeDefined();
    expect(seed.calibration_freshness_warn_hours?.default).toBe(48);
    const assignSites = [...src().matchAll(/calibFreshnessHours/g)];
    expect(assignSites.length, 'expected exactly ONE occurrence (the dead assignment at :73) — any 2nd occurrence would mean it IS consumed and ADB-D5/the retirement ruling is wrong').toBe(1);
  });

  it('the 5 golden PRE captures exist, exit 0, and carry the recorded per-chain verdicts (commit 5)', () => {
    const expected: Record<string, { chain: string; verdict: string }> = {
      'permits.json': { chain: 'permits', verdict: 'WARN' },
      'coa.json': { chain: 'coa', verdict: 'PASS' },
      'sources.json': { chain: 'sources', verdict: 'WARN' },
      'deep_scrapes.json': { chain: 'deep_scrapes', verdict: 'PASS' },
      'standalone.json': { chain: 'none', verdict: 'WARN' },
    };
    expect(fs.existsSync(abs(GOLDEN_DIR_REL)), `${GOLDEN_DIR_REL} missing — commit 5 golden PRE captures`).toBe(true);
    for (const [file, want] of Object.entries(expected)) {
      const p = path.join(abs(GOLDEN_DIR_REL), file);
      expect(fs.existsSync(p), `missing PRE capture ${file}`).toBe(true);
      const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as {
        exit_code: number;
        chain: string;
        summary: { records_meta: { audit_table?: { verdict: string } } };
      };
      expect(doc.exit_code, `${file} exit_code`).toBe(0);
      expect(doc.chain, `${file} chain`).toBe(want.chain);
      expect(doc.summary.records_meta.audit_table?.verdict, `${file} verdict`).toBe(want.verdict);
    }
  });

  it('the assessment report exists with its G0/G3/G5/G6 verdict lines and the §4.1 CONTRACT list', () => {
    const md = fs.readFileSync(artifact(REPORT_REL), 'utf8');
    for (const marker of ['G0: PASS', 'G6: PASS']) {
      expect(md.includes(marker), `report is missing "${marker}"`).toBe(true);
    }
    const start = md.indexOf('### 4.1 CONTRACT');
    const end = md.indexOf('### 4.2 INCIDENTAL');
    expect(start, 'report has no §4.1 CONTRACT section').toBeGreaterThan(0);
    expect(end, 'report has no §4.2 INCIDENTAL section').toBeGreaterThan(start);
    const bullets = md.slice(start, end).split(/\r?\n/).filter((l) => l.trim().startsWith('- '));
    expect(bullets.length, '§4.1 CONTRACT bullet count').toBeGreaterThanOrEqual(6);
  });

  it('the report carries the Spec 123 §7.1 adjudication section (§2.4) with all 11 rows flipped PROPOSED -> RULED', () => {
    const md = fs.readFileSync(artifact(REPORT_REL), 'utf8');
    const start = md.indexOf('### 2.4 Adjudication');
    expect(start, 'report has no §2.4 Adjudication section').toBeGreaterThan(0);
    for (const marker of ['IL-1 ACCEPT', 'IL-2 CHANGE-TO logic var', 'IL-3 ACCEPT', 'IL-4 ACCEPT', 'IL-5 CHANGE-TO guard', 'IL-6 ACCEPT', 'IL-7 ACCEPT', 'IL-8 CHANGE-TO 3 logic vars', 'IL-9 CHANGE-TO logic var', 'IL-10 SPLIT', 'IL-11 CHANGE-TO 5 logic vars']) {
      expect(md.includes(marker), `§2.4 is missing the ruling marker "${marker}"`).toBe(true);
    }
    // no residual "PROPOSED —" disposition should remain in the §2.1/§2.2 tables this commit touched
    expect(md.includes('**PROPOSED —'), 'a §2.1/§2.2 disposition cell was not flipped to RULED').toBe(false);
  });

  it('the row-builder census parser (§2.3, 49 distinct metric names) is not vacuous — proves the it.fails() checks[] floor test below will exercise a real number, not zero', () => {
    const floor = censusDistinctMetricCount();
    expect(floor).toBe(49);
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
    expect(entry?.declared).toBe('2026-09-12');
  });

  it('the defect ledger carries all 6 ADB-D rows, each OPEN · PIN (report §4.3/§4.4, none fixed during this conversion)', () => {
    const ledger = fs.readFileSync(artifact(DEFECT_LEDGER_REL), 'utf8');
    for (let n = 1; n <= 6; n++) {
      const row = ledger.split(/\r?\n/).find((l) => l.startsWith(`| ADB-D${n} `));
      expect(row, `defect ledger missing ADB-D${n}`).toBeDefined();
      expect(row, `ADB-D${n} must be OPEN · PIN, not silently closed during this conversion`).toMatch(/OPEN\s*·\s*PIN/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. G4d — six fences (IL-1 through IL-6, the executor brief's named set), both directions, against
//    the CURRENT (pre-conversion) step source. Provable today because the subject (the step file)
//    already exists — mirrors assert_schema's FENCES array and assert_global_coverage's I1 precedent.
// ---------------------------------------------------------------------------

interface Fence {
  name: string;
  commit: string;
  detect: (text: string) => string[]; // [] = fence intact
  revert: (text: string) => string; // simulate the fence being silently dropped
}

const FENCES: Fence[] = [
  {
    name: 'IL-1 — E7-E10 threshold externalization (6 of the file\'s 9 logic vars read via logicVars)',
    commit: '4f6114ce',
    detect: (t) => {
      const v: string[] = [];
      for (const name of [
        'cost_outlier_ceiling_cad', 'desc_null_rate_warn_pct', 'builder_null_rate_warn_pct',
        'cost_est_null_rate_warn_pct', 'cost_est_min_tiers', 'calibration_freshness_warn_hours',
      ]) {
        if (!t.includes(`logicVars.${name}`)) v.push(`logicVars.${name} read is gone`);
      }
      return v;
    },
    revert: (t) => t.replace(/logicVars\.(cost_outlier_ceiling_cad|desc_null_rate_warn_pct|builder_null_rate_warn_pct|cost_est_null_rate_warn_pct|cost_est_min_tiers|calibration_freshness_warn_hours)/g, 'REMOVED'),
  },
  {
    name: 'IL-2 — f238b814 cost_outliers >= 20 false-WARN fix (stays hardcoded per Spec 30 §5.4.1, promoted to a logic var at commit 7 per the §2.4 adjudication)',
    commit: 'f238b814',
    detect: (t) => {
      const v: string[] = [];
      const hits = [...t.matchAll(/costOutliers >= 20/g)];
      if (hits.length < 2) v.push(`expected 2 occurrences of "costOutliers >= 20" (the gate + the audit-row status expression), found ${hits.length}`);
      if (!/f238b814/.test(t)) v.push('the f238b814 citation comment is gone');
      return v;
    },
    revert: (t) => t.replace(/costOutliers >= 20/g, 'costOutliers > 0').replace(/f238b814/g, 'removed'),
  },
  {
    name: 'IL-3 — adec1f68 Phase-G Pre-Permit duplicated gate, 2 independent sites, NOT collapsed',
    commit: 'adec1f68',
    detect: (t) => {
      const v: string[] = [];
      const hits = [...t.matchAll(/metric: 'permits_pre_permit_count'/g)];
      if (hits.length !== 2) v.push(`expected exactly 2 "permits_pre_permit_count" check sites (permits + coa branches), found ${hits.length}`);
      if (!t.includes('prePermitCount')) v.push('the permits-branch prePermitCount var is gone');
      if (!t.includes('coaPrePermitCount')) v.push('the coa-branch coaPrePermitCount var is gone');
      return v;
    },
    revert: (t) => t.replace(/coaAuditRows\.push\(\{\s*metric: 'permits_pre_permit_count',\s*value: coaPrePermitCount,/, "coaAuditRows.push({\n        metric: 'removed_duplicate',\n        value: coaPrePermitCount,"),
  },
  {
    name: 'IL-4 — 326bb847 WSIB dual-injection: ONE array, pushed by reference into BOTH permitsAuditTable and sourcesAuditTable',
    commit: '326bb847',
    detect: (t) => {
      const v: string[] = [];
      if (!t.includes('const wsibAuditRows = [')) v.push('the single wsibAuditRows array literal is gone');
      if (!t.includes('permitsAuditTable.rows.push(...wsibAuditRows)')) v.push('the permits-side spread-push is gone');
      if (!t.includes('sourcesAuditTable.rows.push(...wsibAuditRows)')) v.push('the sources-side spread-push is gone');
      return v;
    },
    revert: (t) => t.replace('sourcesAuditTable.rows.push(...wsibAuditRows);', 'sourcesAuditTable.rows.push(); // reverted for fence test'),
  },
  {
    name: 'IL-5 — ea087109 ghost_permits_30d excludes P19/P20 terminal permits',
    commit: 'ea087109',
    detect: (t) => {
      const v: string[] = [];
      if (!/lifecycle_phase NOT IN \('P19', 'P20'\)/.test(t)) v.push('the P19/P20 terminal-phase exclusion predicate is gone');
      return v;
    },
    revert: (t) => t.replace(/AND lifecycle_phase IS NOT NULL\s*\n\s*AND lifecycle_phase NOT IN \('P19', 'P20'\)/, ''),
  },
  {
    name: 'IL-6 — e99ae61a COST_MAG_ACCEPT 3-entry allowlist + the 2 magnitude-ceiling logic vars',
    commit: 'e99ae61a',
    detect: (t) => {
      const v: string[] = [];
      if (!t.includes("const COST_MAG_ACCEPT = ['04 202812 BLD', '07 129713 BLD', '06 196930 BLD'];")) v.push('the 3-entry COST_MAG_ACCEPT allowlist is gone or changed');
      if (!t.includes('logicVars.cost_est_legacy_cost_ceiling_cad')) v.push('the legacy cost ceiling logic-var read is gone');
      if (!t.includes('logicVars.cost_est_legacy_gfa_ceiling_sqm')) v.push('the legacy GFA ceiling logic-var read is gone');
      return v;
    },
    revert: (t) => t.replace("const COST_MAG_ACCEPT = ['04 202812 BLD', '07 129713 BLD', '06 196930 BLD'];", 'const COST_MAG_ACCEPT = [];'),
  },
];

describe('assert_data_bounds — G4d fence locks (both directions, pre-conversion source)', () => {
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

describe('assert_data_bounds — genuinely red until commit 7 (it.fails)', () => {
  it.fails('descriptor exists and validates against the ASSERT profile: outputs/recovery/counters "none"', () => { // flips at: commit 7
    const d = loadDescriptor();
    expect(d.identity.archetype).toBe('ASSERT');
    expect(d.identity.lock).toBe(103);
    expect(d.outputs).toBe('none');
    expect(d.recovery).toBe('none');
    expect(d.counters).toBe('none');
  });

  it.fails('config.logic_variables = 8 existing (live) + 18 newly-declared tunables (report §2.4); the retired calibration_freshness_warn_hours is ABSENT', () => { // flips at: commit 7
    const d = loadDescriptor();
    expect(d.config).not.toBe('none');
    const cfg = d.config as { logic_variables: Array<{ name: string }> };
    const names = new Set(cfg.logic_variables.map((v) => v.name));
    const expected = [
      // 8 existing (live), unchanged
      'cost_outlier_ceiling_cad', 'desc_null_rate_warn_pct', 'builder_null_rate_warn_pct',
      'cost_est_null_rate_warn_pct', 'cost_est_min_tiers', 'coa_forward_link_sub085_warn_pct',
      'cost_est_legacy_cost_ceiling_cad', 'cost_est_legacy_gfa_ceiling_sqm',
      // 18 new (report §2.4)
      'cost_outlier_count_warn_max', 'sources_address_points_floor', 'sources_parcels_floor',
      'sources_building_footprints_floor', 'sources_neighbourhoods_floor', 'sources_ravines_floor',
      'sources_heritage_properties_floor', 'sources_heritage_districts_floor', 'sources_centreline_floor',
      'coa_null_address_count_warn_max', 'coa_ancient_hearing_count_warn_max', 'coa_future_hearing_window_years',
      'coa_cost_gt_threshold_cad', 'coa_cost_gt_threshold_warn_max', 'coa_fsi_gt_threshold',
      'coa_gfa_over_lot_multiple', 'coa_gfa_over_lot_warn_max', 'inspection_ancient_dates_count_warn_max',
    ];
    for (const name of expected) expect(names.has(name), `config.logic_variables missing ${name}`).toBe(true);
    expect(names.has('calibration_freshness_warn_hours'), 'the retired dead var must be ABSENT, not carried forward (ADB-D5, §2.4)').toBe(false);
    expect(cfg.logic_variables.length).toBe(26);
  });

  it.fails('checks[] count is at least the row-builder census distinct-metric floor (report §2.3, 49 metrics)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const floor = censusDistinctMetricCount();
    expect(floor, 'census produced zero distinct metrics — parser regression').toBe(49);
    expect(d.checks.length).toBeGreaterThanOrEqual(floor);
  });

  it.fails('the 4 WSIB metrics are declared as ONE check group with chains:["permits","sources"] (IL-4, both destinations, not an 8-entry split)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const wsibIds = ['wsib_no_legal_name', 'wsib_no_g_class', 'wsib_invalid_naics', 'wsib_orphaned_links'];
    const hits = d.checks.filter((c) => wsibIds.includes(c.id));
    expect(hits.length, 'expected exactly 4 WSIB checks (one per metric, not 8)').toBe(4);
    for (const c of hits) {
      expect(Array.isArray(c.chains), `${c.id}.chains must be an array`).toBe(true);
      expect(c.chains).toEqual(['permits', 'sources']);
    }
  });

  it.fails('ghost_permits_30d is declared with its P19/P20 terminal-phase exclusion named in `why` (IL-5, a declared population-scope predicate, not a bare threshold)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const check = d.checks.find((c) => c.id === 'ghost_permits_30d');
    expect(check, 'ghost_permits_30d check missing').toBeDefined();
    expect(check?.why ?? '', 'why must cite ea087109').toMatch(/ea087109/);
    expect(check?.why ?? '', 'why must name the P19/P20 exclusion').toMatch(/P19.*P20|P20.*P19/);
  });

  it.fails('the COST_MAG_ACCEPT 3-entry allowlist is declared and cited in `why` (IL-6, an audited exception list, not a threshold)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const hits = d.checks.filter((c) => /cost_estimate_over_ceiling|modeled_gfa_over_ceiling/.test(c.id));
    expect(hits.length, 'expected both magnitude-gate checks declared').toBe(2);
    for (const c of hits) {
      expect(c.why ?? '', `${c.id}.why must cite e99ae61a`).toMatch(/e99ae61a/);
      for (const permitNum of ['04 202812 BLD', '07 129713 BLD', '06 196930 BLD']) {
        expect(JSON.stringify(c), `${c.id} must declare the accepted permit_num ${permitNum} somewhere`).toContain(permitNum);
      }
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

  it.fails('commit 9\'s frozen shell calls pipeline.step(...) while keeping the lock-103 constant (thin shell)', () => { // flips at: commit 7 (compute), fully true only after commit 9's cutover peel
    expect(src()).toContain('ADVISORY_LOCK_ID = 103');
    expect(src()).toMatch(/pipeline\.step\(/);
  });
});
