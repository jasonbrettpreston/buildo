// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7, §8.7
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md §x-stages.1-.2, §materializer.1, §core.6-.9
//
// C6-3 — `compute_phase_calibration` (scripts/compute-phase-calibration.js), MATERIALIZER: two aggregate
// SELECTs over the two transition ledgers (permit_phase_transitions, lifecycle_transitions) -> per-cohort
// median/p25/p75 day counts, written as ONE whole-table replace of phase_stay_calibration (staging table,
// TRUNCATE, INSERT … SELECT, one transaction, :413-434). Runs in two chains (permits, coa). McDonald's
// Airtight V3 from ①. Commit form compressed (R-PACE-1): ① assessment + this suite, ② descriptor + compute +
// notes + shell, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L16: plain `it(...)`, GREEN today, executing the VERBATIM legacy text
// via `./fixtures/legacy-harness` (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D8: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS or named legacy facts
// until ② / ③. D6 is a plain `it`: step-validate --write generates the scorecard for every registry step
// (R-R / Rule 13).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, permitBucket, coaBucket, RUN_AT, type LegacyOracle, type LegacyOpts, type Bucket } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/compute-phase-calibration.descriptor.json';
const NOTES_REL = 'scripts/compute-phase-calibration.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/compute-phase-calibration.js';
const SHELL_REL = 'scripts/compute-phase-calibration.js';
const REPORT_REL = 'docs/reports/2026-10-23-batch5-p3-5-compute-phase-calibration-assessment.md';
/** Spec 47 §A.5 advisory lock of the legacy step (`compute-phase-calibration.js:60`). */
const LOCK_ID = 93;
const COLS = ['permit_type', 'project_type', 'coa_type_class', 'from_seq', 'to_seq', 'phase', 'median_days', 'p25_days', 'p75_days', 'sample_size', 'computed_at'];
const AUDIT_METRICS = [
  'total_buckets', 'permit_types_calibrated', 'phases_calibrated', 'unreliable_buckets',
  'permit_cohort_count', 'coa_cohort_count', 'coa_transition_count',
  'high_volume_buckets', 'mid_volume_buckets', 'low_volume_buckets', 'outlier_buckets',
  'coa_cohort_presence', 'coa_project_type_coverage_pct', 'unknown_cohort_count', 'coa_type_class_null_transition_count',
];

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & {
  audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] };
  cohort_dimension_coverage?: Record<string, number>;
  sample_size_distribution?: Record<string, number>;
};

function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
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
  if (last === undefined) throw new Error('[compute_phase_calibration ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[compute_phase_calibration ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (r === undefined) throw new Error(`[compute_phase_calibration ①] audit row ${metric} missing`);
  return r;
}
function answered(o: LegacyOracle): string[] {
  return o.queries.map((q) => q.answered);
}
function sqlOf(o: LegacyOracle, name: string): string {
  const q = o.queries.find((x) => x.answered === name);
  if (q === undefined) throw new Error(`[compute_phase_calibration ①] query ${name} was never issued`);
  return q.sql;
}

describe('compute_phase_calibration ① — legacy oracle pins (GREEN at ①; the conversion must reproduce or declare each)', () => {
  it('L1 — the CLI guard and exports: required (not launched) the body never registers; the module exports lock 93, the 11 insert columns, classifyTier, buildBulkInsertSQL and flattenBuckets', () => {
    const o = loadLegacy({ asCli: false });
    expect(o.ran).toBe(false);
    expect(Object.keys(o.exports).sort()).toEqual(['ADVISORY_LOCK_ID', 'COHORT_INSERT_COLS', 'buildBulkInsertSQL', 'classifyTier', 'flattenBuckets']);
    expect(o.exports.ADVISORY_LOCK_ID).toBe(LOCK_ID);
    expect(o.exports.COHORT_INSERT_COLS).toEqual(COLS);
    const tier = o.exports.classifyTier as (n: number) => string;
    expect([100, 99, 30, 29, 10, 9, 0].map(tier)).toEqual(['high', 'mid', 'mid', 'low', 'low', 'outlier', 'outlier']);
    expect(() => (o.exports.buildBulkInsertSQL as (t: string, c: string[], n: number) => string)('t', ['a'], 0)).toThrow(/rowCount must be > 0/);
  });

  it('L2 — the read order under lock 93: DB clock, three existence probes, the CoA-row count, two coverage reads, the two aggregates, then the two CoA counts; config loaded once under the script name', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();
    expect(o.lockIds).toEqual([LOCK_ID]);
    expect(o.configLoads).toEqual(['compute-phase-calibration']);
    expect(answered(o)).toEqual([
      'db_clock', 'lt_exists', 'psc_exists', 'coa_lead_rows', 'coa_apps_exists', 'coa_apps_coverage', 'lt_coverage',
      'permit_agg', 'coa_agg', 'coa_transition_count', 'coa_null_count',
    ]);
  });

  it('L3 — the aggregate SQL: ROUND before ::INTEGER, LAG ordered by (transitioned_at, id); permit cohorts (permit_type, from_phase); CoA cohorts the 5-tuple over lead_id LIKE coa:% AND the seq range 1..22, with NO project_type / coa_type_class filter', async () => {
    const { o } = await run();
    const p = sqlOf(o, 'permit_agg');
    expect(p).toContain('ORDER BY transitioned_at, id');
    expect(p).toContain('ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS median_days');
    expect(p).toContain('GROUP BY permit_type, from_phase');
    expect(p).toContain('WHERE from_phase IS NOT NULL AND permit_type IS NOT NULL AND phase_duration IS NOT NULL');
    const c = sqlOf(o, 'coa_agg');
    expect(c).toContain("WHERE lt.lead_id LIKE 'coa:%'");
    expect(c).toContain('AND (lt.from_seq BETWEEN 1 AND 22 OR lt.to_seq BETWEEN 1 AND 22)');
    expect(c).toContain('GROUP BY project_type, coa_type_class, from_seq, to_seq');
    expect(c).toContain('MIN(from_phase)    AS phase');
    expect(c).not.toMatch(/coa_type_class IS NOT NULL|project_type IS NOT NULL/);
    expect(sqlOf(o, 'coa_transition_count')).toContain('BETWEEN 1 AND 22');
    expect(sqlOf(o, 'coa_null_count')).toContain('coa_type_class IS NULL');
  });

  it('L4 — THE WRITE: one transaction — staging table LIKE … INCLUDING DEFAULTS ON COMMIT DROP, one bulk INSERT (permit buckets then CoA buckets, computed_at = the DB clock), TRUNCATE, INSERT … SELECT * from staging', async () => {
    const { o } = await run();
    expect(o.txns).toHaveLength(1);
    const t = o.txns[0]!;
    expect(t).toHaveLength(4);
    expect(t[0]!.sql).toMatch(/^CREATE TEMP TABLE phase_stay_calibration_staging \(LIKE phase_stay_calibration /);
    expect(t[1]!.sql).toMatch(/^INSERT INTO phase_stay_calibration_staging \(permit_type, project_type, coa_type_class, from_seq, to_seq, phase, median_days, p25_days, p75_days, sample_size, computed_at\) VALUES /);
    expect(t[2]!.sql).toBe('TRUNCATE phase_stay_calibration');
    expect(t[3]!.sql).toBe('INSERT INTO phase_stay_calibration SELECT * FROM phase_stay_calibration_staging');
    expect(t[0]!.sql).toContain('INCLUDING DEFAULTS) ON COMMIT DROP');
    expect(t[0]!.sql).not.toContain('INCLUDING CONSTRAINTS');
    const params = t[1]!.params;
    expect(params).toHaveLength(4 * COLS.length);
    expect(params.slice(0, COLS.length)).toEqual(['New Building', null, null, null, null, 'P7a', 10, 5, 20, 150, RUN_AT]);
    expect(params.slice(2 * COLS.length, 3 * COLS.length)).toEqual([null, 'addition', 'minor_variance', 1, 2, 'P1', 30, 15, 45, 120, RUN_AT]);
  });

  it('L5 — zero buckets EMPTIES the table: the transaction issues only TRUNCATE, total_buckets is FAIL and the verdict FAIL; the run still completes and emits (CPC-D4)', async () => {
    const { o, err } = await run({ db: { permitBuckets: [], coaBuckets: [] } });
    expect(err).toBeNull();
    expect(o.txns).toEqual([[{ sql: 'TRUNCATE phase_stay_calibration', params: [] }]]);
    expect(row(o, 'total_buckets')).toMatchObject({ value: 0, status: 'FAIL' });
    expect(row(o, 'coa_cohort_presence').status).toBe('WARN');
    expect(meta(o).audit_table?.verdict).toBe('FAIL');
  });

  it('L6 — more than 5000 buckets THROWS before the two CoA counts and before any write; exactly 5000 writes (CPC-D5)', async () => {
    const many = (n: number): Bucket[] => Array.from({ length: n }, (_, i) => permitBucket(`T${i}`, 'P7a', 200));
    const over = await run({ db: { permitBuckets: many(5001), coaBuckets: [] } });
    expect(over.err?.message).toMatch(/bucket count 5001 exceeds 5000-row safety cap/);
    expect(over.o.txns).toHaveLength(0);
    expect(over.o.summaries).toHaveLength(0);
    expect(answered(over.o)).not.toContain('coa_transition_count');
    const at = await run({ db: { permitBuckets: many(5000), coaBuckets: [] } });
    expect(at.err).toBeNull();
    expect(at.o.txns[0]![1]!.params).toHaveLength(5000 * COLS.length);
  });

  it('L7 — startup guards THROW: a missing lifecycle_transitions or phase_stay_calibration ends the run before any aggregate, write or summary (CPC-D6)', async () => {
    const lt = await run({ db: { ltExists: false } });
    expect(lt.err?.message).toMatch(/lifecycle_transitions table missing/);
    expect(answered(lt.o)).toEqual(['db_clock', 'lt_exists']);
    const psc = await run({ db: { pscExists: false } });
    expect(psc.err?.message).toMatch(/phase_stay_calibration target table missing/);
    expect(answered(psc.o)).toEqual(['db_clock', 'lt_exists', 'psc_exists']);
    for (const r of [lt, psc]) { expect(r.o.txns).toHaveLength(0); expect(r.o.summaries).toHaveLength(0); }
  });

  it('L8 — a missing coa_applications skips both coverage reads: coverage is null with status INFO, one warn log, and the run continues (CPC-D6)', async () => {
    const { o, err } = await run({ db: { coaAppsExists: false } });
    expect(err).toBeNull();
    expect(answered(o)).not.toContain('coa_apps_coverage');
    expect(answered(o)).not.toContain('lt_coverage');
    expect(row(o, 'coa_project_type_coverage_pct')).toMatchObject({ value: null, status: 'INFO' });
    expect(o.logs.some((l) => l.level === 'warn' && String(l.args[1]).includes('coa_applications table missing'))).toBe(true);
    expect(meta(o).coa_lt_project_type_coverage_pct).toBeNull();
  });

  it('L9 — cohorts and tiers: a permit_type bucket is a permit cohort; a CoA bucket with project_type OR coa_type_class is a CoA cohort; all three null is unknown; tiers at 100 / 30 / 10; unreliable = low + outlier', async () => {
    const { o } = await run({ db: {
      permitBuckets: [permitBucket('A', 'P7a', 100), permitBucket('A', 'P8', 99)],
      coaBuckets: [coaBucket('addition', null, 1, 2, 30), coaBucket(null, null, 2, 3, 29), coaBucket(null, 'consent', 3, 4, 10), coaBucket(null, null, 4, 5, 9)],
    } });
    const v = (m: string) => row(o, m).value;
    expect([v('permit_cohort_count'), v('coa_cohort_count'), v('unknown_cohort_count')]).toEqual([2, 2, 2]);
    expect([v('high_volume_buckets'), v('mid_volume_buckets'), v('low_volume_buckets'), v('outlier_buckets')]).toEqual([1, 2, 2, 1]);
    expect(v('unreliable_buckets')).toBe(3);
    expect(v('permit_types_calibrated')).toBe(1);
    expect(v('phases_calibrated')).toBe(3);
    expect(meta(o).sample_size_distribution).toEqual({ high: 1, mid: 2, low: 2, outlier: 1 });
  });

  it('L10 — the 15 audit rows in order; the verdict is derived in the step from the row statuses: PASS on the healthy estate, WARN once unreliable_buckets or unknown_cohort_count is non-zero (CPC-D1)', async () => {
    const healthy = (await run()).o;
    expect(rows(healthy).map((r) => r.metric)).toEqual(AUDIT_METRICS);
    expect(rows(healthy).map((r) => r.status)).toEqual(['PASS', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO', 'INFO', 'PASS', 'PASS', 'PASS', 'PASS']);
    expect(meta(healthy).audit_table).toMatchObject({ phase: 84, name: 'Phase Calibration', verdict: 'PASS' });
    const small = (await run({ db: { coaBuckets: [coaBucket('addition', 'minor_variance', 1, 2, 29)] } })).o;
    expect(row(small, 'unreliable_buckets').status).toBe('WARN');
    expect(meta(small).audit_table?.verdict).toBe('WARN');
    const unknown = (await run({ db: { coaBuckets: [coaBucket(null, null, 1, 2, 200)] } })).o;
    expect(row(unknown, 'unknown_cohort_count')).toMatchObject({ value: 1, status: 'WARN' });
    expect(row(unknown, 'coa_cohort_presence')).toMatchObject({ value: 0, status: 'WARN' });
  });

  it('L11 — coverage and null-ratio statuses: coverage < 50 WARN, = 50 PASS; null ratio > 0.05 WARN, = 0.05 PASS; zero CoA transitions reads PASS whatever the null count', async () => {
    expect(row((await run({ db: { coaAppsPct: 49 } })).o, 'coa_project_type_coverage_pct').status).toBe('WARN');
    expect(row((await run({ db: { coaAppsPct: 50 } })).o, 'coa_project_type_coverage_pct').status).toBe('PASS');
    expect(row((await run({ db: { coaTransitionCount: 380, coaNullCount: 20 } })).o, 'coa_type_class_null_transition_count')).toMatchObject({ value: 20, status: 'WARN' });
    expect(row((await run({ db: { coaTransitionCount: 380, coaNullCount: 19 } })).o, 'coa_type_class_null_transition_count').status).toBe('PASS');
    expect(row((await run({ db: { coaTransitionCount: 0, coaNullCount: 5 } })).o, 'coa_type_class_null_transition_count').status).toBe('PASS');
  });

  it('L12 — log-only measurements: the zero-CoA-rows probe and the >10-point coverage lag only log; no audit row, no verdict changes (CPC-D7)', async () => {
    const base = (await run()).o;
    const zero = (await run({ db: { coaLeadRows: 0 } })).o;
    expect(zero.logs.some((l) => l.level === 'warn' && String(l.args[1]).includes('zero CoA-side rows'))).toBe(true);
    expect(rows(zero)).toEqual(rows(base));
    const lag = (await run({ db: { coaAppsPct: 90, ltPct: 70 } })).o;
    expect(lag.logs.some((l) => l.level === 'warn' && String(l.args[1]).includes('lags coa_applications by >10%'))).toBe(true);
    expect(rows(lag)).toEqual(rows(base));
    expect(meta(lag).coa_lt_project_type_coverage_pct).toBe(70);
  });

  it('L13 — the summary: records_total = the summed sample sizes, records_new = the bucket count, records_updated = 0; records_meta keys; cohort_dimension_coverage.coa_type_class_non_null holds the CoA COHORT count, not the non-null coa_type_class count (CPC-D8, CPC-D9)', async () => {
    const { o } = await run({ db: { coaBuckets: [coaBucket('addition', null, 1, 2, 50), coaBucket('new_build', 'consent', 2, 3, 60)] } });
    const s = o.summaries[o.summaries.length - 1]!;
    expect([s.records_total, s.records_new, s.records_updated]).toEqual([150 + 40 + 50 + 60, 4, 0]);
    expect(Object.keys(s.records_meta).sort()).toEqual(['audit_table', 'coa_lt_project_type_coverage_pct', 'coa_project_type_coverage_pct', 'cohort_dimension_coverage', 'sample_size_distribution']);
    expect(meta(o).cohort_dimension_coverage).toEqual({ permit_type_non_null: 2, coa_type_class_non_null: 2, project_type_non_null: 2, from_seq_non_null: 2, to_seq_non_null: 2 });
  });

  it('L14 — emitMeta declares to_phase on both ledgers, which no SQL the step issues reads (CPC-D13); writes are the 11 insert columns', async () => {
    const { o } = await run();
    expect(o.metas).toHaveLength(1);
    expect(o.metas[0]!.reads.permit_phase_transitions).toContain('to_phase');
    expect(o.metas[0]!.reads.lifecycle_transitions).toContain('to_phase');
    expect(o.metas[0]!.reads.coa_applications).toEqual(['project_type']);
    expect(o.queries.some((q) => q.sql.includes('to_phase'))).toBe(false);
    expect(o.metas[0]!.writes).toEqual({ phase_stay_calibration: COLS });
  });

  it('L15 — calibration_freshness_warn_hours is validated (an invalid value throws before any read but the clock) but never read: 1 and 1000 give identical output (CPC-D2)', async () => {
    const bad = await run({ logicVars: { calibration_freshness_warn_hours: -1 } });
    expect(bad.err?.message).toMatch(/logicVars validation failed/);
    expect(answered(bad.o)).toEqual(['db_clock']);
    const a = (await run({ logicVars: { calibration_freshness_warn_hours: 1 } })).o;
    const b = (await run({ logicVars: { calibration_freshness_warn_hours: 1000 } })).o;
    expect(a.summaries).toEqual(b.summaries);
    expect(a.txns).toEqual(b.txns);
  });

  it('L16 — lock 93 held elsewhere: no read, no write, the pipeline helper\'s skip summary', async () => {
    const { o, err } = await run({ lockAcquired: false });
    expect(err).toBeNull();
    expect(o.lockIds).toEqual([LOCK_ID]);
    expect(o.queries).toHaveLength(0);
    expect(o.txns).toHaveLength(0);
    expect(o.summaries).toEqual([{ records_total: 0, records_new: 0, records_updated: 0, records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere' } }]);
  });
});

// PART 2 — the converted claims D1–D8 (`it.fails` at ①), RED as NAMED MISSING ARTIFACTS or named legacy facts.
interface Check { id: string; kind: string; severity: string }
interface WriteSpec { table: string; write_discipline: { class: string } }
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  execution: { shape?: string; materialize_form?: string };
  outputs: { writes: WriteSpec[] };
  checks: Check[];
  config: { logic_variables: { name: string }[] };
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('compute_phase_calibration ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype MATERIALIZER, lock 93, spec "84"; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'compute_phase_calibration', archetype: 'MATERIALIZER', spec: '84', lock: LOCK_ID });
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  it.fails('D2 — R-DE (v) / R-DF EXTERNALIZED: every declared logic variable is step-owned (compute_phase_calibration_*) and the tier boundaries, coverage floor and null-ratio ceiling are variables (flips at ②)', () => {
    const names = loadDescriptor().config.logic_variables.map((v) => v.name);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).toMatch(/^compute_phase_calibration_/);
    expect(names).not.toContain('calibration_freshness_warn_hours');
  });

  it.fails('D3 — the verdict is declared: total_buckets is a FAIL check, the four legacy WARN gates are declared checks; the library derives the verdict (flips at ②)', () => {
    const byId = new Map(loadDescriptor().checks.map((c) => [c.id, c]));
    expect(byId.get('total_buckets')).toMatchObject({ severity: 'FAIL' });
    for (const id of ['coa_cohort_presence', 'coa_project_type_coverage_pct', 'unknown_cohort_count', 'coa_type_class_null_transition_count']) {
      expect(byId.has(id)).toBe(true);
    }
  });

  it.fails('D4 — compute is pure (R-BZ): the compute module exists and opens no transaction, issues no TRUNCATE, loads no config and emits nothing (flips at ②)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).not.toMatch(/withTransaction|withAdvisoryLock|loadMarketplaceConfigs|emitSummary|emitMeta|getDbTimestamp/);
    expect(c).not.toMatch(/TRUNCATE|pool\.query/);
  });

  it.fails('D5 — R-DL admin visibility: the STEP_DESCRIPTIONS summary names both ledgers (it names only permit_phase_transitions today, CPC-D10) (flips at ②)', () => {
    const funnel = readText('src/lib/admin/funnel.ts');
    const line = funnel.split('\n').find((l) => l.includes('compute_phase_calibration: { summary:')) ?? '';
    expect(line).toContain('lifecycle_transitions');
  });

  // Written by step-validate --step=compute_phase_calibration --write at ① (Spec 124 R-R / Rule 13).
  it('D6 — the assessment report carries the generated validation scorecard (R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D7 — registered: census archetype MATERIALIZER and converted.json converted[] holds scripts/compute-phase-calibration.js (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/compute-phase-calibration.js');
  });

  it.fails('D8 — the write is ONE runner-owned whole-table replace of phase_stay_calibration (shape materialize, class staging_full_replace; held on card CPC-Q1: no materialize arm executes it today) (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.execution.shape).toBe('materialize');
    expect(d.outputs.writes).toHaveLength(1);
    expect(d.outputs.writes[0]).toMatchObject({ table: 'phase_stay_calibration', write_discipline: { class: 'staging_full_replace' } });
  });
});
