// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DE, R-DF, R-DL
//
// C6-1 — `assert_lifecycle_phase_distribution` (scripts/quality/assert-lifecycle-phase-distribution.js), ASSERT:
// fifteen SELECTs over permits / coa_applications / universal_stream_catalog, per-seq distribution bands
// with three operator posture flags, an unclassified hard limit, three cross-status checks, no write; it
// HALTS only on the two C1 halting classes (67663a81). Runs in two chains (permits, coa). McDonald's
// Airtight V3 from ①. Commit form compressed (R-PACE-1): ① assessment + this suite, ② descriptor + compute +
// notes + shell + seeds migration, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L15: plain `it(...)`, GREEN today, executing the VERBATIM legacy text
// via `./fixtures/legacy-harness` (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D7: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS or named legacy facts
// until ② / ③. D6 is a plain `it`: step-validate --write generates the scorecard for every registry step
// (R-R / Rule 13).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type LegacyOracle, type LegacyOpts } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/quality/assert-lifecycle-phase-distribution.descriptor.json';
const NOTES_REL = 'scripts/quality/assert-lifecycle-phase-distribution.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/assert-lifecycle-phase-distribution.js';
const SHELL_REL = 'scripts/quality/assert-lifecycle-phase-distribution.js';
const REPORT_REL = 'docs/reports/2026-10-19-batch5-p1-4-assert-lifecycle-phase-distribution-assessment.md';
/** Spec 47 §A.5 advisory lock of the legacy step (`assert-lifecycle-phase-distribution.js:32`). */
const LOCK_ID = 109;

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
interface Violation { seq: number; actual: number; band_min: number | null; band_max: number | null; kind: string; posture: string }
type RecordsMeta = Record<string, unknown> & {
  seq_violations?: Violation[];
  seq_violations_truncated_count?: number;
  audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] };
};

async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy(opts);
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[assert_lifecycle_phase_distribution ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[assert_lifecycle_phase_distribution ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[assert_lifecycle_phase_distribution ①] audit row ' + metric + ' missing');
  return r;
}
const verdict = (o: LegacyOracle) => meta(o).audit_table?.verdict;
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('assert_lifecycle_phase_distribution ① — legacy oracle pins A: module shape and reads (GREEN today)', () => {
  it('L1 — the body runs only as a CLI (§R1 guard :147): required as a module it registers no run and exports exactly { classifyHaltDecision }', () => {
    const lib = loadLegacy({ asCli: false });
    expect(lib.ran).toBe(false);
    expect(Object.keys(lib.exports)).toEqual(['classifyHaltDecision']);
    expect(loadLegacy().ran).toBe(true);
  });

  it('L2 — classifyHaltDecision is the pure halting rule: halt on seq bands failing > 0 or unclassified over its max (strict); never on anything else', () => {
    const f = loadLegacy({ asCli: false }).exports.classifyHaltDecision as (a: { unclassifiedCount: number; unclassifiedMax: number; seqBandsFailing: number }) => { shouldHalt: boolean; reasons: string[] };
    expect(f({ unclassifiedCount: 100, unclassifiedMax: 100, seqBandsFailing: 0 })).toEqual({ shouldHalt: false, reasons: [] });
    expect(f({ unclassifiedCount: 101, unclassifiedMax: 100, seqBandsFailing: 0 })).toEqual({ shouldHalt: true, reasons: ['unclassified_hard_limit'] });
    expect(f({ unclassifiedCount: 0, unclassifiedMax: 100, seqBandsFailing: 2 })).toEqual({ shouldHalt: true, reasons: ['seq_band_violation'] });
    expect(f({ unclassifiedCount: 101, unclassifiedMax: 100, seqBandsFailing: 1 }).reasons).toEqual(['seq_band_violation', 'unclassified_hard_limit']);
  });

  it('L3 — fifteen SELECTs in order with the catalog present; config tag assert-lifecycle-phase-distribution; the dead-status arrays are the two parameters', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();
    expect(o.configLoads).toEqual(['assert-lifecycle-phase-distribution']);
    expect(o.queries.map((q) => q.answered)).toEqual([
      'catalog_exists', 'catalog', 'permit_phases', 'coa_phases', 'seq_distribution',
      'seq_unclassified_permits', 'seq_unclassified_coa', 'unclassified_permits', 'unclassified_coa',
      'live_status_null', 'never_classified', 'bid_coverage', 'cross_stalled', 'cross_active', 'cross_issued',
    ]);
    const withParams = o.queries.filter((q) => q.params.length > 0).map((q) => q.answered);
    expect(withParams).toEqual(['seq_unclassified_permits', 'seq_unclassified_coa', 'unclassified_permits', 'unclassified_coa', 'live_status_null']);
  });

  it('L4 — the phase-keyed CoA unclassified count KEEPS `linked_permit_num IS NULL`; the per-seq one does not (the diff-review v4 baseline fence)', async () => {
    const { o } = await run();
    const sqlOf = (a: string) => o.queries.find((q) => q.answered === a)?.sql ?? '';
    expect(sqlOf('unclassified_coa')).toContain('linked_permit_num IS NULL');
    expect(sqlOf('seq_unclassified_coa')).not.toContain('linked_permit_num');
  });
});

describe('assert_lifecycle_phase_distribution ① — legacy oracle pins B: per-seq bands (GREEN today)', () => {
  it('L5 — one row per catalog seq with a band, zero-padded: in band PASS ("min..max"), catalog rows_count 0 INFO ("no upper bound (catalog rows_count=0)"); a healthy estate verdict PASS', async () => {
    const { o } = await run();
    expect(row(o, 'lifecycle_seq_01_count')).toEqual({ metric: 'lifecycle_seq_01_count', value: 100, threshold: '1..1000', status: 'PASS' });
    expect(row(o, 'lifecycle_seq_02_count')).toEqual({ metric: 'lifecycle_seq_02_count', value: 0, threshold: 'no upper bound (catalog rows_count=0)', status: 'INFO' });
    expect(row(o, 'lifecycle_seq_03_count').status).toBe('PASS');
    expect(verdict(o)).toBe('PASS');
  });

  it('L6 — out of band at the default posture (flag 0): the row WARNs, seq_bands_warn counts it, a warn-posture violation is recorded, the verdict is WARN and nothing halts', async () => {
    const { o, err } = await run({ db: { seqCounts: { 1: 5000, 3: 50 } } });
    expect(err).toBeNull();
    expect(row(o, 'lifecycle_seq_01_count').status).toBe('WARN');
    expect(row(o, 'seq_bands_warn')).toMatchObject({ value: 1, status: 'WARN' });
    expect(meta(o).seq_violations).toEqual([{ seq: 1, actual: 5000, band_min: 1, band_max: 1000, kind: 'band_violation', posture: 'warn' }]);
    expect(verdict(o)).toBe('WARN');
  });

  it('L7 — the band_violation flag at 1: the same seq FAILs, seq_bands_failing counts it, and the run HALTS after emitting ("Distribution sanity check FAILED")', async () => {
    const { o, err } = await run({ db: { seqCounts: { 1: 5000, 3: 50 } }, logicVars: { lifecycle_seq_band_promote_to_fail_band_violation: 1 } });
    expect(err?.message).toMatch(/^Distribution sanity check FAILED \(1 halting failures of 1 total\)/);
    expect(row(o, 'lifecycle_seq_01_count').status).toBe('FAIL');
    expect(row(o, 'seq_bands_failing')).toMatchObject({ value: 1, status: 'FAIL' });
    expect(row(o, 'lifecycle_seq_band_promote_to_fail_band_violation')).toMatchObject({ value: 1, status: 'WARN' });
    expect(o.summaries).toHaveLength(1);
  });

  it('L8 — the other two directions: data with no band → no_band_configured (no audit row of its own); a banded seq with no data is counted TWICE — a band_violation (actual 0 < min) AND an expected_data_missing (ALPD-D5); all WARN at posture 0', async () => {
    const { o } = await run({ db: { seqCounts: { 1: 100, 7: 9 } } });
    expect(meta(o).seq_violations).toEqual([
      { seq: 3, actual: 0, band_min: 1, band_max: 1000, kind: 'band_violation', posture: 'warn' },
      { seq: 7, actual: 9, band_min: null, band_max: null, kind: 'no_band_configured', posture: 'warn' },
      { seq: 3, actual: 0, band_min: 1, band_max: 1000, kind: 'expected_data_missing', posture: 'warn' },
    ]);
    expect(rows(o).some((r) => r.metric === 'lifecycle_seq_07_count')).toBe(false);
    expect(row(o, 'lifecycle_seq_03_count')).toMatchObject({ value: 0, status: 'WARN' });
    expect(row(o, 'seq_bands_warn').value).toBe(3);
  });

  it('L9 — a MISSING catalog disables per-seq checks with a warn log, and seq_bands_total reads 0 "== 0 expected" PASS; an EMPTY-but-present catalog reads WARN (ALPD-D4)', async () => {
    const missing = (await run({ db: { catalogExists: false, catalog: [], seqCounts: {} } })).o;
    expect(missing.queries.map((q) => q.answered)).not.toContain('catalog');
    expect(missing.logs.some((l) => l.level === 'warn' && String(l.args[1]).startsWith('universal_stream_catalog table missing'))).toBe(true);
    expect(row(missing, 'seq_bands_total')).toMatchObject({ value: 0, status: 'PASS' });
    const empty = (await run({ db: { catalog: [], seqCounts: {} } })).o;
    expect(row(empty, 'seq_bands_total')).toMatchObject({ value: 0, status: 'WARN', threshold: '0 rows in universal_stream_catalog — verify mig 129 seed applied (expected ~110)' });
  });
});

describe('assert_lifecycle_phase_distribution ① — legacy oracle pins C: unclassified, cross checks, verdict (GREEN today)', () => {
  it('L10 — unclassified_count (permits + unlinked CoA) is a hard limit, inclusive: at the max PASS; above it FAIL and HALT', async () => {
    expect(row((await run({ db: { unclassifiedPermits: 60, unclassifiedCoa: 40 } })).o, 'unclassified_count')).toEqual({ metric: 'unclassified_count', value: 100, threshold: '<= 100', status: 'PASS' });
    const { o, err } = await run({ db: { unclassifiedPermits: 61, unclassifiedCoa: 40 } });
    expect(row(o, 'unclassified_count').status).toBe('FAIL');
    expect(err?.message).toMatch(/unclassified_count 101 exceeds hard limit 100/);
  });

  it('L11 — the three cross checks: 0 PASS, below threshold WARN, at/above FAIL; a cross-check FAIL makes the verdict FAIL but does NOT halt (C1)', async () => {
    const { o, err } = await run({ db: { crossStalled: 1000, crossActive: 1, crossIssued: 0 } });
    expect(err).toBeNull();
    expect(row(o, 'cross_check_stalled')).toEqual({ metric: 'cross_check_stalled', value: 1000, threshold: '< 1000 (WARN), >= 1000 (FAIL)', status: 'FAIL' });
    expect(row(o, 'cross_check_active_inspection').status).toBe('WARN');
    expect(row(o, 'cross_check_permit_issued').status).toBe('PASS');
    expect(verdict(o)).toBe('FAIL');
  });

  it('L12 — the verdict reads the failures/warnings ARRAYS, not the rows: a cross_check_permit_issued WARN row, or an armed posture-flag WARN row, alone leaves the verdict PASS (ALPD-D3)', async () => {
    const issued = (await run({ db: { crossIssued: 3 } })).o;
    expect(row(issued, 'cross_check_permit_issued').status).toBe('WARN');
    expect(verdict(issued)).toBe('PASS');
    const armed = (await run({ logicVars: { lifecycle_seq_band_promote_to_fail_no_band_configured: 1 } })).o;
    expect(row(armed, 'lifecycle_seq_band_promote_to_fail_no_band_configured').status).toBe('WARN');
    expect(verdict(armed)).toBe('PASS');
  });

  it('L13 — summary: records_total sums every phase key (NULL included) but not the P9-P17 aggregate; records_meta {phase_distribution, unclassified_count, seq_distribution, seq_violations, seq_violations_truncated_count, audit_table phase 22}; emitMeta reads three tables, writes {}', async () => {
    const { o } = await run();
    expect(o.summaries[0]).toMatchObject({ records_total: 105, records_new: 0, records_updated: 0 });
    expect(Object.keys(meta(o))).toEqual(['phase_distribution', 'unclassified_count', 'seq_distribution', 'seq_violations', 'seq_violations_truncated_count', 'audit_table']);
    expect(meta(o).phase_distribution).toMatchObject({ P7a: 40, P12: 30, null: 5, P1: 20, P2: 10, 'P9-P17': 30 });
    expect(meta(o).audit_table).toMatchObject({ phase: 22, name: 'Assert Lifecycle Phase Distribution' });
    expect(o.metas).toEqual([{ reads: {
      permits: ['lifecycle_phase', 'lifecycle_seq', 'lifecycle_stalled', 'enriched_status', 'status', 'matched_rule', 'lifecycle_classified_at'],
      coa_applications: ['lifecycle_phase', 'lifecycle_seq', 'linked_permit_num', 'decision'],
      universal_stream_catalog: ['seq', 'rows_count'],
    }, writes: {} }]);
  });

  it('L14 — config and lock: an orphan seq band key throws before any distribution read; a phase band with min > max refuses the config; lock 109 not acquired → a skipped summary {reason classifier_running}', async () => {
    const orphan = await run({ logicVars: { lifecycle_seq_band_99_min: 1 } });
    expect(orphan.err?.message).toMatch(/Orphan band keys in logic_variables .*lifecycle_seq_band_99_min/);
    expect(orphan.o.queries.map((q) => q.answered)).toEqual(['catalog_exists', 'catalog']);
    const inverted = await run({ logicVars: { lifecycle_band_p3_min: 9, lifecycle_band_p3_max: 1 } });
    expect(inverted.err?.message).toMatch(/^logicVars validation failed: .*lifecycle_band_p3: min \(9\) > max \(1\)/);
    expect(inverted.o.queries).toHaveLength(0);
    const held = await run({ lockAcquired: false });
    expect(held.err).toBeNull();
    expect(held.o.lockIds).toEqual([LOCK_ID]);
    expect(held.o.queries).toHaveLength(0);
    expect(held.o.summaries).toEqual([{ records_total: 0, records_new: 0, records_updated: 0, records_meta: { skipped: true, reason: 'classifier_running', advisory_lock_id: LOCK_ID } }]);
  });

  it('L15 — the 36 phase-band variables are validated but never read: a band that every phase count falls outside changes no row, no verdict and no meta (ALPD-D2)', async () => {
    const wide = (await run()).o;
    const tight: Record<string, unknown> = {};
    for (const s of ['p3', 'p7a', 'p9_p17_agg', 'coa_p1', 'coa_p2']) { tight[`lifecycle_band_${s}_min`] = 999998; tight[`lifecycle_band_${s}_max`] = 999999; }
    const narrow = (await run({ logicVars: tight })).o;
    expect(narrow.summaries).toEqual(wide.summaries);
  });
});

// PART 2 — the converted claims D1–D7 (`it.fails` at ①), RED as NAMED MISSING ARTIFACTS or named legacy facts.
interface Check { id: string; kind: string; limit: string; limit_from_config?: string; severity: string; blocking?: boolean }
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  outputs: unknown;
  checks: Check[];
  config: { logic_variables: { name: string }[] };
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('assert_lifecycle_phase_distribution ② — converted claims (D1a–D5 GREEN at ②; D1b at the shell swap, D2b / D7 at ③)', () => {
  // ② (C6-1, lane V3-COA-F, 2026-10-23): flipped to `it` — red evidence is the ① run
  // (docs/reports/red-evidence/assert_lifecycle_phase_distribution/pre2-artifacts-missing.json: D1–D5 fail as named
  // missing artifacts). The ② split mirrors assert_coa_freshness ffec8296 (D1b frozen shell / D2b retirement stay
  // it.fails): the legacy shell is the live step until the swap (Spec 132 §x-stages.2 (R-EQ)).
  it('D1a — identity: descriptor exists, archetype ASSERT, lock 109, spec "84", writes nothing; notes sidecar present (flipped at ②)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'assert_lifecycle_phase_distribution', archetype: 'ASSERT', spec: '84', lock: LOCK_ID });
    expect(d.outputs).toBe('none');
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
  });

  it.fails('D1b — frozen shell: the shell is pipeline.step(), not pipeline.run() (flips at the shell swap, runner_wired)', () => {
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  it('D2a — R-DE (v): every declared logic variable is step-owned (assert_lifecycle_phase_distribution_*); no lifecycle_* name is declared (flipped at ②)', () => {
    const names = loadDescriptor().config.logic_variables.map((v) => v.name);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).toMatch(/^assert_lifecycle_phase_distribution_/);
  });

  it.fails('D2b — R-A retirement: config.retired names the 36 lifecycle_band_* phase bands (operator y 2026-10-19 Q-ALPD-1) and the renamed lifecycle_* names (flips at ③)', () => {
    const retired = ((loadDescriptor().config as { retired?: { name: string }[] }).retired ?? []).map((r) => r.name);
    expect(retired.filter((n) => n.startsWith('lifecycle_band_'))).toHaveLength(36);
    expect(retired).toContain('lifecycle_unclassified_max');
  });

  it('D3 — the verdict is declared: the unclassified hard limit is a blocking FAIL bound from config; the cross checks are non-blocking FAIL bounds with a WARN tier (flipped at ②)', () => {
    const byId = new Map(loadDescriptor().checks.map((c) => [c.id, c]));
    expect(byId.get('unclassified_count')).toMatchObject({ kind: 'bound', severity: 'FAIL', blocking: true });
    for (const id of ['cross_check_stalled', 'cross_check_active_inspection', 'cross_check_permit_issued']) {
      expect(byId.get(id)).toMatchObject({ severity: 'FAIL', blocking: false });
    }
  });

  it('D4 — compute is pure (R-BZ): no config loader, no lock, no emits, no module-level throw on the imported dead-status arrays (flipped at ②)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).not.toMatch(/loadMarketplaceConfigs|withAdvisoryLock|emitSummary|emitMeta/);
    expect(c).not.toMatch(/DEAD_STATUS_ARRAY\.length === 0/);
  });

  it('D5 — R-DL admin visibility: PIPELINE_TABLE_MAP names assert_lifecycle_phase_distribution → pipeline_runs (flipped at ②)', () => {
    const funnel = readText('src/lib/admin/funnel.ts');
    const map = funnel.slice(funnel.indexOf('export const PIPELINE_TABLE_MAP'));
    expect(map.slice(0, map.indexOf('};'))).toMatch(/assert_lifecycle_phase_distribution:\s*'pipeline_runs'/);
  });

  // Written by step-validate --step=assert_lifecycle_phase_distribution --write at ① (Spec 124 R-R / Rule 13; the
  // N1 finding that flipped the assert_coa_freshness D6 to `it`, operator y 2026-10-19).
  it('D6 — the assessment report carries the generated validation scorecard (R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D7 — registered: census archetype ASSERT and converted.json converted[] holds scripts/quality/assert-lifecycle-phase-distribution.js (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/quality/assert-lifecycle-phase-distribution.js');
    const census = readText('scripts/steps/_schema/step-archetype-census.json');
    expect(census).toMatch(/"slug": "assert_lifecycle_phase_distribution",[\s\S]{0,200}"archetype": "ASSERT"/);
  });
});
