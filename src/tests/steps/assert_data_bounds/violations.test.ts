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
// ⚠️ COMMIT 6 (red-first): EVERY CLAIM TEST HAD TO BE RED, AND RED FOR THE RIGHT REASON. Claims
// that read a FUTURE artifact (the descriptor, the compute module) open with `artifact()` →
// `expect(existsSync).toBe(true)`, so the failure names the missing artifact rather than surfacing
// as an import/parse error. Genuinely-red claims were wrapped `it.fails(...)` with a
// `// flips at: commit 7` comment — `it.fails()` INVERTS: the wrapped body genuinely throws
// internally and vitest reports the wrapped test as PASSED; if a claim were NOT actually red, vitest
// reported "expected test to fail but it passed," a real suite failure. A fully green run of the
// file at commit 6 was the proof every `it.fails()` claim was genuinely red at that point.
// COMMIT 7 (this commit): the descriptor + compute now exist — every one of those `it.fails(...)`
// call sites is flipped to a plain `it(...)` (mechanical, body unchanged), and a green run is now
// the proof every one of those claims is genuinely TRUE, not merely "still red." Plain
// `it()` covers claims testable TODAY: facts already true (lock 103 in the step file, the 4 chains +
// measured positions in manifest.json, the 8 live (non-retired) logic vars registered in seeds, the 5
// golden PRE captures with exit 0 and their recorded verdicts, the report's sections/ledger rows) and the
// six G4d fence detectors (IL-1 through IL-6, the named-fence set the executor brief scoped). AT COMMIT 6
// these ran against the CURRENT (pre-conversion) step source, exactly as `assert_schema`'s `FENCES` array
// ran against its own legacy step pre-conversion. AT COMMIT 7 (this commit) they are REPOINTED to
// `computeAndFieldsSource()` (scripts/lib/compute/assert-data-bounds.js + scripts/lib/assert-data-bounds-
// fields.js) — the pre-conversion step file no longer contains this domain logic at all, so the fences
// now prove the SAME facts against where the logic actually lives, mirroring the identical repoint
// Fold A item 1 authorizes for src/tests/assert-data-bounds.infra.test.ts. See the block's own header
// comment (§2 below) for the full repoint rationale, including IL-1's one genuine narrowing.
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
  why?: { text: string; liveness: unknown };
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

  // COMMIT 7 UPDATE (mechanical, required by this commit's own change): this test
  // originally read `src()` — the pre-conversion step file — to prove the var was
  // dead THERE before retiring it. `src()` is now the frozen shell and contains
  // none of the old domain logic at all (0 occurrences of anything), so that
  // mechanism is retired along with the file it read. Repointed to prove the
  // ACTUAL commit-7 outcome instead: the seed row survives (a genuine second
  // consumer was found this session, scripts/compute-phase-calibration.js — NOT
  // deleted, see scripts/lib/assert-data-bounds-fields.js's header), but
  // assert_data_bounds' own descriptor no longer declares or consumes it.
  //
  // COMMIT 9 UPDATE (ADB-conformance-gap): the description's ORIGINAL wording
  // ("no longer CONSUMED by assert_data_bounds") is itself a false-positive
  // trigger for step-conformance.infra.test.ts's taggedToStep() — a naive
  // substring scan for "CONSUMED by <slug>" with no negation-awareness — which
  // read RED the moment this step joined `converted[]` at cutover (the exact
  // "invisible until registration" shape prior cutovers have already hit).
  // Reworded to state the same fact without the literal false-positive
  // substring; this lock now checks the MEANING (seed survives, is retired
  // from THIS step, compute_phase_calibration is the live consumer) via 3
  // narrower matches instead of one substring that happened to double as a
  // scanner trigger.
  it('calibration_freshness_warn_hours (ADB-D5 dead var) — seed row SURVIVES (a genuine second consumer, scripts/compute-phase-calibration.js, found this session — not deleted), but is retired from assert_data_bounds\' own descriptor + compute', () => {
    const seed = JSON.parse(fs.readFileSync(abs(SEED_REL), 'utf8')) as Record<string, { default: number; description: string }>;
    expect(seed.calibration_freshness_warn_hours, 'seed row must survive — a live second consumer exists').toBeDefined();
    expect(seed.calibration_freshness_warn_hours?.default).toBe(48);
    const desc = seed.calibration_freshness_warn_hours?.description ?? '';
    expect(desc, 'seed description should note assert_data_bounds\' own retirement (ADB-D5)').toMatch(/ADB-D5/);
    expect(desc, 'seed description should state the dead pre-conversion read is retired').toMatch(/dead since migration 106/);
    expect(desc, 'seed description should name the live second consumer').toMatch(/CONSUMED by compute_phase_calibration/);
    const d = loadDescriptor();
    const cfg = d.config as { logic_variables: Array<{ name: string }> };
    expect(cfg.logic_variables.map((v) => v.name), 'assert_data_bounds\' own config.logic_variables must NOT declare the dead var').not.toContain('calibration_freshness_warn_hours');
    expect(computeSource(), 'assert_data_bounds\' own compute must not reference the dead var').not.toMatch(/calibration_freshness_warn_hours/);
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

  it('the row-builder census parser (§2.3, 49 distinct metric names) is not vacuous — proves the checks[] floor test below exercises a real number, not zero', () => {
    const floor = censusDistinctMetricCount();
    expect(floor).toBe(49);
  });

  // COMMIT 9 UPDATE (R-K): converted.json registers this step and deletes its pending
  // entry in the SAME commit — mirrors the pilot 9/enrich_parcels precedent (3c1f1923)
  // and batch1 I1's own assert_global_coverage cutover. A step cannot be both converted
  // AND pending at once (the mutual-exclusion lock this test now proves).
  it('converted.json registers this step and deletes its pending entry in the SAME commit (R-K, commit 9 cutover) — mirrors the pilot 9/enrich_parcels precedent (3c1f1923)', () => {
    const doc = JSON.parse(fs.readFileSync(artifact(CONVERTED_REL), 'utf8')) as {
      converted: string[];
      pending: Array<{ file: string; registers_at: string; reason: string; declared: string; stage: string }>;
    };
    expect(doc.converted, `${CONVERTED_REL} must register ${STEP_REL}`).toContain(STEP_REL);
    const entry = doc.pending.find((p) => p.file === STEP_REL);
    expect(entry, `${CONVERTED_REL} must have NO pending entry for ${STEP_REL} once converted (R-K)`).toBeUndefined();
  });

  // COMMIT 8a UPDATE — the 6 ADB-D rows this conversion found (report §4.3/§4.4)
  // were, correctly, ALL still OPEN · PIN as of commit 7 ("none fixed during this
  // conversion" — Spec 123 §3.1, no silent fix mid-conversion). Commit 8 is the
  // PEEL commit, exactly where Spec 123 §3.1 says a pinned DEFECT gets resolved —
  // 4 of the 6 closed (verified/ruled, no code change: ADB-D1/D2 were retired
  // structurally by the library adoption itself; ADB-D4 by the operator's R1
  // ruling; ADB-D5 was already resolved at commit 7 per §7.3's STOP finding), 1
  // re-scoped but genuinely still open (ADB-D3 — fleet library-owned, out of this
  // step's Operating Boundary). ADB-D6 (Spec 44 §4's wording vs the fixed-date
  // reality) closes at commit 9 — ruled to correct the spec text (no behavioural
  // code change belongs in a cutover commit, Spec 123 §3). See report §8a/§9. A row
  // silently disappearing, or a CLOSED row silently reverting to OPEN with no
  // ledger text explaining why, is what this lock catches — not "must stay open
  // forever," which was only ever true up to the conversion's own boundary.
  it('the defect ledger carries all 6 ADB-D rows found at conversion time, each with its truthful commit-9 disposition (report §4.3/§4.4 + §8a/§9 — closed where verified/ruled, still OPEN · PIN where genuinely deferred)', () => {
    const ledger = fs.readFileSync(artifact(DEFECT_LEDGER_REL), 'utf8');
    const EXPECT_CLOSED = new Set([1, 2, 4, 5, 6]); // ADB-D1/D2 (verified), ADB-D4 (R1 ruling), ADB-D5 (already-resolved at commit 7), ADB-D6 (commit 9 spec-diff ruling)
    for (let n = 1; n <= 6; n++) {
      const row = ledger.split(/\r?\n/).find((l) => l.startsWith(`| ADB-D${n} `));
      expect(row, `defect ledger missing ADB-D${n}`).toBeDefined();
      if (EXPECT_CLOSED.has(n)) {
        expect(row, `ADB-D${n} expected CLOSED at commit 8a`).toMatch(/\*\*CLOSED/);
      } else {
        expect(row, `ADB-D${n} expected still OPEN · PIN at commit 8a (genuinely deferred, with a stated reason)`).toMatch(/OPEN\s*·\s*PIN/);
      }
    }
  });

  // COMMIT 8b — ADB-D7 (found re-reading the source AT commit 7, not one of the
  // original 6 — see report §7.2 item 8) is fixed at commit 8b: `ancient_dates`
  // now genuinely compares against `inspection_ancient_dates_count_warn_max`
  // (kind: boolcfg_gt), measured verdict-safe (value 0 in every golden capture).
  it('ADB-D7 (found post-conversion, commit 7) is CLOSED at commit 8b — ancient_dates now genuinely wired', () => {
    const ledger = fs.readFileSync(artifact(DEFECT_LEDGER_REL), 'utf8');
    const row = ledger.split(/\r?\n/).find((l) => l.startsWith('| ADB-D7 '));
    expect(row, 'defect ledger missing ADB-D7').toBeDefined();
    expect(row, 'ADB-D7 expected CLOSED at commit 8b').toMatch(/CLOSED/);

    const fields = fs.readFileSync(artifact('scripts/lib/assert-data-bounds-fields.js'), 'utf8');
    const ancientLine = fields.split(/\r?\n/).find((l) => l.includes("id: 'ancient_dates'"));
    expect(ancientLine, 'ancient_dates CHECK_DEFS entry not found').toBeDefined();
    expect(ancientLine, 'ancient_dates must now use kind boolcfg_gt, not raw0').toMatch(/kind:\s*'boolcfg_gt'/);
    expect(ancientLine, 'ancient_dates must now bind inspection_ancient_dates_count_warn_max').toMatch(/cfgVar:\s*'inspection_ancient_dates_count_warn_max'/);
  });
});

// ---------------------------------------------------------------------------
// 2. G4d — six fences (IL-1 through IL-6, the executor brief's named set), both directions.
//
// ── COMMIT 7 REPOINT (mirrors Fold A item 1's exact methodology, applied here to the
//    SAME class of problem it names for src/tests/assert-data-bounds.infra.test.ts) ──
// These fences were authored at commit 6 against `src()` (the pre-conversion, monolithic
// step file) — the only artifact that existed then. Commit 7 replaces that file with the
// 8-line frozen shell (scripts/quality/assert-data-bounds.js), so `src()` no longer
// contains ANY of this domain logic; every fence's `detect()` now targets
// `computeAndFieldsSource()` (scripts/lib/compute/assert-data-bounds.js +
// scripts/lib/assert-data-bounds-fields.js, concatenated), where the SAME fences now
// live, verbatim-preserved but relocated and renamed per the compute's own variable/
// access-pattern conventions (`ctx.config.<name>` replaces `logicVars.<name>`, etc.).
// IL-1 is the one GENUINE exception: `calibration_freshness_warn_hours` is the ADB-D5
// dead var, KNOWINGLY retired from this step at commit 7 (not preserved) — its fence
// is narrowed to the 5 vars that DO survive, plus a POSITIVE assertion that the 6th is
// gone (the opposite of every other fence, and itself a fence: a future accidental
// re-add of a dead var would trip it).
// ---------------------------------------------------------------------------

function computeAndFieldsSource(): string {
  return `${computeSource()}\n${readText('scripts/lib/assert-data-bounds-fields.js')}`;
}

interface Fence {
  name: string;
  commit: string;
  detect: (text: string) => string[]; // [] = fence intact
  revert: (text: string) => string; // simulate the fence being silently dropped
}

const FENCES: Fence[] = [
  {
    name: 'IL-1 — E7-E10 threshold externalization: 5 of the file\'s original 6 logicVars-read vars survive (3 as direct ctx.config SQL binds, 2 — desc/builder null-rate — via the descriptor\'s limit_from_config substitution, declared as LOGIC_VAR_DEFS entries here); calibration_freshness_warn_hours is KNOWINGLY RETIRED (ADB-D5), not preserved',
    commit: '4f6114ce',
    detect: (t) => {
      const v: string[] = [];
      for (const name of [
        'cost_outlier_ceiling_cad', 'desc_null_rate_warn_pct', 'builder_null_rate_warn_pct',
        'cost_est_null_rate_warn_pct', 'cost_est_min_tiers',
      ]) {
        // Either form counts as "consumed": a direct ctx.config.<name> SQL bind
        // (compute.js), or a declared LOGIC_VAR_DEFS entry that feeds the
        // descriptor's limit_from_config substitution (fields.js) — the pct-form
        // checks (desc/builder null-rate) never touch ctx.config directly in
        // compute; the library substitutes their bound at verdict-evaluation time.
        if (!t.includes(`ctx.config.${name}`) && !t.includes(`name: '${name}'`)) v.push(`neither a ctx.config.${name} read nor a LOGIC_VAR_DEFS name: '${name}' declaration found`);
      }
      // Documentation prose (the fields module's own header explains the retirement
      // BY NAME) legitimately mentions the string — only a LIVE declaration/read is
      // disallowed: a LOGIC_VAR_DEFS entry or a ctx.config access.
      if (t.includes("name: 'calibration_freshness_warn_hours'") || t.includes('ctx.config.calibration_freshness_warn_hours')) {
        v.push('calibration_freshness_warn_hours must be ABSENT as a live LOGIC_VAR_DEFS entry / ctx.config read (ADB-D5 retirement), found one');
      }
      return v;
    },
    revert: (t) => t
      .replace(/ctx\.config\.(cost_outlier_ceiling_cad|desc_null_rate_warn_pct|builder_null_rate_warn_pct|cost_est_null_rate_warn_pct|cost_est_min_tiers)/g, 'REMOVED')
      .replace(/name: '(cost_outlier_ceiling_cad|desc_null_rate_warn_pct|builder_null_rate_warn_pct|cost_est_null_rate_warn_pct|cost_est_min_tiers)'/g, "name: 'REMOVED'"),
  },
  {
    name: 'IL-2 — f238b814 cost_outliers >= 20 false-WARN fix (promoted to logic var cost_outlier_count_warn_max at commit 7 per the §2.4 adjudication, config-driven boolean comparison in compute)',
    commit: 'f238b814',
    detect: (t) => {
      const v: string[] = [];
      if (!t.includes('cost_outlier_count_warn_max')) v.push('the cost_outlier_count_warn_max config var is gone');
      if (!t.includes("id: 'cost_outliers'")) v.push('the cost_outliers check id is gone');
      if (!/f238b814/.test(t)) v.push('the f238b814 citation is gone');
      return v;
    },
    revert: (t) => t.replace(/cost_outlier_count_warn_max/g, 'REMOVED').replace(/f238b814/g, 'removed'),
  },
  {
    name: 'IL-3 — adec1f68 Phase-G Pre-Permit duplicated gate, 2 independent check ids, NOT collapsed',
    commit: 'adec1f68',
    detect: (t) => {
      const v: string[] = [];
      if (!t.includes("id: 'permits_pre_permit_count'")) v.push('the permits-branch permits_pre_permit_count check id is gone');
      if (!t.includes("id: 'coa_permits_pre_permit_count'")) v.push('the coa-branch coa_permits_pre_permit_count check id is gone');
      if (!t.includes('prePermitCount')) v.push('the permits-branch prePermitCount var is gone');
      if (!t.includes('coaPrePermitCount')) v.push('the coa-branch coaPrePermitCount var is gone');
      return v;
    },
    revert: (t) => t.replace("id: 'coa_permits_pre_permit_count'", "id: 'removed_duplicate'"),
  },
  {
    name: 'IL-4 — 326bb847 WSIB dual-injection: ONE memoized loader, ONE check group, chains:["permits","sources"]',
    commit: '326bb847',
    detect: (t) => {
      const v: string[] = [];
      if (!t.includes('loadWsibBranch')) v.push('the single loadWsibBranch loader is gone');
      const wsibChainHits = [...t.matchAll(/chains:\s*\['permits',\s*'sources'\]/g)];
      if (wsibChainHits.length < 4) v.push(`expected >= 4 checks[].chains:['permits','sources'] declarations (the 4 WSIB metrics), found ${wsibChainHits.length}`);
      return v;
    },
    revert: (t) => t.replace(/chains:\s*\['permits',\s*'sources'\]/g, "chains: ['permits']"),
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
      if (!t.includes('cost_est_legacy_cost_ceiling_cad')) v.push('the legacy cost ceiling logic-var is gone');
      if (!t.includes('cost_est_legacy_gfa_ceiling_sqm')) v.push('the legacy GFA ceiling logic-var is gone');
      return v;
    },
    revert: (t) => t.replace("const COST_MAG_ACCEPT = ['04 202812 BLD', '07 129713 BLD', '06 196930 BLD'];", 'const COST_MAG_ACCEPT = [];'),
  },
];

describe('assert_data_bounds — G4d fence locks (both directions, commit 7: repointed to compute+fields)', () => {
  for (const fence of FENCES) {
    describe(`${fence.name} (${fence.commit})`, () => {
      it('is intact in the compute+fields source', () => {
        expect(fence.detect(computeAndFieldsSource()), `fence violated: ${fence.name}`).toEqual([]);
      });

      it('a reverted copy is detected as violated (proves the detector is not vacuous)', () => {
        expect(fence.detect(fence.revert(computeAndFieldsSource())).length, `reverted text should trip ${fence.name}`).toBeGreaterThan(0);
      });
    });
  }
});

// ===========================================================================
// 3. Flipped at commit 7 (descriptor + compute now exist) — was `it.fails(...)`
//    at commit 6, red-first; now plain `it(...)`, mechanically flipped, body
//    unchanged, per `.cursor/batch1_i2_assert_data_bounds_active_task.md`
//    deliverable 5.
// ===========================================================================

describe('assert_data_bounds — descriptor + compute (flipped from it.fails at commit 7)', () => {
  it('descriptor exists and validates against the ASSERT profile: outputs/recovery/counters "none"', () => { // flips at: commit 7
    const d = loadDescriptor();
    expect(d.identity.archetype).toBe('ASSERT');
    expect(d.identity.lock).toBe(103);
    expect(d.outputs).toBe('none');
    expect(d.recovery).toBe('none');
    expect(d.counters).toBe('none');
  });

  it('config.logic_variables = 8 existing (live) + 18 newly-declared tunables (report §2.4); the retired calibration_freshness_warn_hours is ABSENT', () => { // flips at: commit 7
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

  it('checks[] count is at least the row-builder census distinct-metric floor (report §2.3, 49 metrics)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const floor = censusDistinctMetricCount();
    expect(floor, 'census produced zero distinct metrics — parser regression').toBe(49);
    expect(d.checks.length).toBeGreaterThanOrEqual(floor);
  });

  it('the 4 WSIB metrics are declared as ONE check group with chains:["permits","sources"] (IL-4, both destinations, not an 8-entry split)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const wsibIds = ['wsib_no_legal_name', 'wsib_no_g_class', 'wsib_invalid_naics', 'wsib_orphaned_links'];
    const hits = d.checks.filter((c) => wsibIds.includes(c.id));
    expect(hits.length, 'expected exactly 4 WSIB checks (one per metric, not 8)').toBe(4);
    for (const c of hits) {
      expect(Array.isArray(c.chains), `${c.id}.chains must be an array`).toBe(true);
      expect(c.chains).toEqual(['permits', 'sources']);
    }
  });

  it('ghost_permits_30d is declared with its P19/P20 terminal-phase exclusion named in `why` (IL-5, a declared population-scope predicate, not a bare threshold)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const check = d.checks.find((c) => c.id === 'ghost_permits_30d');
    expect(check, 'ghost_permits_30d check missing').toBeDefined();
    expect(check?.why?.text ?? '', 'why must cite ea087109').toMatch(/ea087109/);
    expect(check?.why?.text ?? '', 'why must name the P19/P20 exclusion').toMatch(/P19.*P20|P20.*P19/);
  });

  it('the COST_MAG_ACCEPT 3-entry allowlist is declared and cited in `why` (IL-6, an audited exception list, not a threshold)', () => { // flips at: commit 7
    const d = loadDescriptor();
    const hits = d.checks.filter((c) => /cost_estimate_over_ceiling|modeled_gfa_over_ceiling/.test(c.id));
    expect(hits.length, 'expected both magnitude-gate checks declared').toBe(2);
    for (const c of hits) {
      expect(c.why?.text ?? '', `${c.id}.why must cite e99ae61a`).toMatch(/e99ae61a/);
      for (const permitNum of ['04 202812 BLD', '07 129713 BLD', '06 196930 BLD']) {
        expect(JSON.stringify(c), `${c.id} must declare the accepted permit_num ${permitNum} somewhere`).toContain(permitNum);
      }
    }
  });

  it('the compute module exists, exports compute, and passes the compute-shape ast-grep rule (Spec 122 §5.5)', () => { // flips at: commit 7
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

  it('commit 9\'s frozen shell calls pipeline.step(...) while keeping the lock-103 constant (thin shell)', () => { // flips at: commit 7 (compute), fully true only after commit 9's cutover peel
    expect(src()).toContain('ADVISORY_LOCK_ID = 103');
    expect(src()).toMatch(/pipeline\.step\(/);
  });
});
