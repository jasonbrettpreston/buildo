// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DE, R-DF, R-DL
//
// C6-1 — `assert_entity_tracing` (scripts/quality/assert-entity-tracing.js), ASSERT: up to seven SELECTs
// tracing permits seen in a 26-hour window through five downstream tables/columns, a row-derived
// verdict, NON-halting, no write; McDonald's Airtight V3 from ①. Commit form compressed (R-PACE-1):
// ① assessment + this suite, ② descriptor + compute + notes + shell + seeds migration, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L12: plain `it(...)`, GREEN today, executing the VERBATIM legacy text
// via `./fixtures/legacy-harness` (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D7: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS until ② / ③.
// D6 is a plain `it`: step-validate --write generates the scorecard for every registry step (R-R / Rule 13).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, HEALTHY, type Counts, type LegacyOracle, type LegacyOpts } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/quality/assert-entity-tracing.descriptor.json';
const NOTES_REL = 'scripts/quality/assert-entity-tracing.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/assert-entity-tracing.js';
const SHELL_REL = 'scripts/quality/assert-entity-tracing.js';
const REPORT_REL = 'docs/reports/2026-10-19-batch5-p1-1-assert-entity-tracing-assessment.md';
/** Spec 47 §A.5 advisory lock of the legacy step (`assert-entity-tracing.js:42`). */
const LOCK_ID = 110;
const WINDOW = '26 hours';

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string; matched?: number; denominator?: number; denominator_type?: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy(opts);
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}
const withCounts = (counts: Counts): LegacyOpts => ({ counts });
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[assert_entity_tracing ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[assert_entity_tracing ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[assert_entity_tracing ①] audit row ' + metric + ' missing');
  return r;
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
const flat = (sql: string | undefined) => (sql ?? '').replace(/\s+/g, ' ').trim();

describe('assert_entity_tracing ① — legacy oracle pins A: reads and the skip lanes (GREEN today)', () => {
  it('L1 — seven SELECTs in order (window, eligible, permit_trades, cost_estimates, trade_forecasts, lifecycle_phase, opportunity_score), each with the one parameter "26 hours"; no config load', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();
    expect(o.queries.map((q) => q.answered)).toEqual(['window_permits', 'eligible_permits', 'permit_trades', 'cost_estimates', 'trade_forecasts', 'lifecycle_phase', 'opportunity_score']);
    for (const q of o.queries) expect(q.params).toEqual([WINDOW]);
    expect(flat(o.queries[0]?.sql)).toBe('SELECT COUNT(*)::int AS window_permits FROM permits WHERE last_seen_at > NOW() - $1::interval');
  });

  it('L2 — the eligible denominator mirrors compute-trade-forecasts SOURCE_SQL: an active trade, a phase, not SKIP_PHASES (P19, P20, O1–O3), and a 3-year COALESCE recency gate', async () => {
    const { o } = await run();
    expect(flat(o.queries[1]?.sql)).toBe(
      "SELECT COUNT(DISTINCT p.permit_num || '--' || p.revision_num)::int AS eligible_permits FROM permits p JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num AND pt.is_active = true WHERE p.last_seen_at > NOW() - $1::interval AND p.lifecycle_phase IS NOT NULL AND p.lifecycle_phase NOT IN ('P19','P20','O1','O2','O3') AND COALESCE(p.phase_started_at, p.issued_date, p.application_date) >= NOW() - INTERVAL '3 years'",
    );
  });

  it('L3 — an EMPTY window: one query, summary {0, 0, 0} with records_meta {skipped, reason no_permits_in_window, window}, emitMeta({}, {}), no audit table', async () => {
    const { o, err } = await run(withCounts({ window_permits: 0 }));
    expect(err).toBeNull();
    expect(o.queries).toHaveLength(1);
    expect(o.summaries).toEqual([{ records_total: 0, records_new: 0, records_updated: 0, records_meta: { skipped: true, reason: 'no_permits_in_window', window: WINDOW } }]);
    expect(o.metas).toEqual([{ reads: {}, writes: {} }]);
  });

  it('L4 — no eligible permits: the trade_forecasts SELECT is NOT issued and its row is SKIP {value null, matched 0, denominator 0, eligible_permits}', async () => {
    const { o } = await run(withCounts({ eligible_permits: 0 }));
    expect(o.queries.map((q) => q.answered)).not.toContain('trade_forecasts');
    expect(row(o, 'trade_forecasts_coverage_pct')).toEqual({ metric: 'trade_forecasts_coverage_pct', value: null, threshold: '>= 85%', matched: 0, denominator: 0, denominator_type: 'eligible_permits', status: 'SKIP' });
  });
});

describe('assert_entity_tracing ① — legacy oracle pins B: the five coverage rows (GREEN today)', () => {
  it('L5 — a healthy window: five rows in order, each {metric, value (pct to 1 dp), threshold, matched, denominator, denominator_type, status}; verdict PASS', async () => {
    const { o } = await run();
    expect(rows(o).map((r) => r.metric)).toEqual(['permit_trades_coverage_pct', 'cost_estimates_coverage_pct', 'trade_forecasts_coverage_pct', 'lifecycle_phase_coverage_pct', 'opportunity_score_coverage_pct']);
    expect(row(o, 'permit_trades_coverage_pct')).toEqual({ metric: 'permit_trades_coverage_pct', value: 98.3, threshold: '>= 95%', matched: 207757, denominator: 211289, denominator_type: 'window_permits', status: 'PASS' });
    expect(row(o, 'cost_estimates_coverage_pct')).toMatchObject({ threshold: '>= 90%', denominator_type: 'window_permits' });
    expect(row(o, 'trade_forecasts_coverage_pct')).toMatchObject({ value: 90.1, threshold: '>= 85%', denominator: 165111, denominator_type: 'eligible_permits' });
    expect(row(o, 'lifecycle_phase_coverage_pct')).toMatchObject({ threshold: '>= 95%', denominator_type: 'window_permits' });
    expect(row(o, 'opportunity_score_coverage_pct')).toMatchObject({ threshold: '>= 80% of forecast rows', denominator: 1046140, denominator_type: 'forecast_rows', status: 'PASS' });
    expect(meta(o).audit_table?.verdict).toBe('PASS');
  });

  it('L6 — the four trace rows compare the RAW fraction, inclusive: exactly 95% PASS, one permit short FAIL (value still rounds to 95.0)', async () => {
    expect(row((await run(withCounts({ window_permits: 1000, permit_trades: 950, cost_estimates: 1000, lifecycle_phase: 1000 }))).o, 'permit_trades_coverage_pct').status).toBe('PASS');
    const short = (await run(withCounts({ window_permits: 100000, permit_trades: 94999, cost_estimates: 100000, lifecycle_phase: 100000 }))).o;
    expect(row(short, 'permit_trades_coverage_pct')).toMatchObject({ value: 95, status: 'FAIL' });
  });

  it('L7 — opportunity_score decides on the ROUNDED pct (the 2026-08-03 fold): a raw 79.96% rounds to 80.0 and PASSES', async () => {
    const { o } = await run(withCounts({ forecast_rows: 10000, opportunity_scored: 7996 }));
    expect(row(o, 'opportunity_score_coverage_pct')).toMatchObject({ value: 80, status: 'PASS' });
    expect(rows(o).some((r) => r.metric === 'permits_opportunity_score_gate_accepted')).toBe(false);
  });

  it('L8 — below 80% the accepted baseline fires: the row WARNs and two rows follow it (…_gate_accepted WARN, …_retighten INFO); the threshold text names the acceptance', async () => {
    const { o } = await run(withCounts({ forecast_rows: 1000, opportunity_scored: 799 }));
    expect(row(o, 'opportunity_score_coverage_pct')).toMatchObject({ value: 79.9, status: 'WARN', threshold: '>= 80% of forecast rows — accepted baseline, see permits_opportunity_score_gate_accepted' });
    expect(rows(o).slice(-2).map((r) => [r.metric, r.status])).toEqual([['permits_opportunity_score_gate_accepted', 'WARN'], ['permits_opportunity_score_gate_accepted_retighten', 'INFO']]);
    expect(meta(o).audit_table?.verdict).toBe('WARN');
  });

  it('L9 — the acceptance has NO floor: 0% scored still reads WARN, so the opportunity_score FAIL branch is unreachable (AET-D3)', async () => {
    const { o } = await run(withCounts({ forecast_rows: 1000, opportunity_scored: 0 }));
    expect(row(o, 'opportunity_score_coverage_pct')).toMatchObject({ value: 0, status: 'WARN' });
    expect(meta(o).audit_table?.verdict).toBe('WARN');
  });

  it('L10 — zero forecast rows (or NULL counts) read 100% PASS for opportunity_score', async () => {
    const { o } = await run(withCounts({ forecast_rows: null, opportunity_scored: null }));
    expect(row(o, 'opportunity_score_coverage_pct')).toMatchObject({ value: 100, denominator: 0, status: 'PASS' });
  });
});

describe('assert_entity_tracing ① — legacy oracle pins C: verdict, summary, lock (GREEN today)', () => {
  it('L11 — NON-halting: a FAIL row makes the verdict FAIL, logs "TRACE COVERAGE FAILURES" at warn, and does not throw; summary records_total = the window count, {window, eligible_permits, audit_table phase 26 "Assert Entity Tracing"}', async () => {
    const { o, err } = await run(withCounts({ lifecycle_phase: 1000 }));
    expect(err).toBeNull();
    expect(meta(o).audit_table).toMatchObject({ phase: 26, name: 'Assert Entity Tracing', verdict: 'FAIL' });
    expect(o.logs.some((l) => l.level === 'warn' && l.args[1] === 'TRACE COVERAGE FAILURES')).toBe(true);
    expect(o.summaries[0]).toMatchObject({ records_total: 211289, records_new: 0, records_updated: 0 });
    expect(Object.keys(meta(o))).toEqual(['window', 'eligible_permits', 'audit_table']);
    expect(meta(o)).toMatchObject({ window: WINDOW, eligible_permits: 165111 });
    expect(o.metas).toEqual([{ reads: { permits: ['permit_num', 'revision_num', 'last_seen_at', 'lifecycle_phase'], permit_trades: ['permit_num', 'revision_num'], cost_estimates: ['permit_num', 'revision_num'], trade_forecasts: ['permit_num', 'revision_num', 'opportunity_score'] }, writes: {} }]);
  });

  it('L12 — advisory lock 110 (skipEmit false); when not acquired: no query, an info log, and a skipped summary {reason lock_held, advisory_lock_id 110} with emitMeta({}, {})', async () => {
    const held = await run({ lockAcquired: false });
    expect(held.err).toBeNull();
    expect(held.o.lockIds).toEqual([LOCK_ID]);
    expect(held.o.lockOpts).toEqual([{ skipEmit: false }]);
    expect(held.o.queries).toHaveLength(0);
    expect(held.o.summaries).toEqual([{ records_total: 0, records_new: 0, records_updated: 0, records_meta: { skipped: true, reason: 'lock_held', advisory_lock_id: LOCK_ID } }]);
    expect(held.o.metas).toEqual([{ reads: {}, writes: {} }]);
    expect(HEALTHY.window_permits).toBeGreaterThan(0);
  });
});

// PART 2 — the converted claims D1–D7 (`it.fails` at ①), RED as NAMED MISSING ARTIFACTS or named legacy facts.
interface Check { id: string; kind: string; limit: string; limit_from_config?: string; severity: string; blocking?: boolean; accept_until?: string }
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  outputs: { writes: unknown };
  checks: Check[];
  config: { logic_variables: { name: string }[] };
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('assert_entity_tracing ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype ASSERT, lock 110, spec "41", writes nothing; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'assert_entity_tracing', archetype: 'ASSERT', spec: '41', lock: LOCK_ID });
    expect(d.outputs.writes).toBe('none');
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  it.fails('D2 — R-DF EXTERNALIZED + R-DE (v): the five coverage floors and the trace window are step-owned assert_entity_tracing_* variables, not code literals (flips at ②)', () => {
    const names = loadDescriptor().config.logic_variables.map((v) => v.name);
    expect(names.length).toBeGreaterThanOrEqual(6);
    for (const n of names) expect(n).toMatch(/^assert_entity_tracing_/);
  });

  it.fails('D3 — the verdict is declared: five coverage checks, each a FAIL bound from config; the opportunity_score acceptance is a declared accept_until, not a helper call that can never FAIL (flips at ②)', () => {
    const checks = loadDescriptor().checks;
    for (const id of ['permit_trades_coverage_pct', 'cost_estimates_coverage_pct', 'trade_forecasts_coverage_pct', 'lifecycle_phase_coverage_pct', 'opportunity_score_coverage_pct']) {
      expect(checks.find((c) => c.id === id)).toMatchObject({ severity: 'FAIL', limit_from_config: expect.stringMatching(/^assert_entity_tracing_/) });
    }
    expect(checks.find((c) => c.id === 'opportunity_score_coverage_pct')?.accept_until).toBeDefined();
  });

  it.fails('D4 — compute is pure (R-BZ): the run clock is a parameter (no NOW() in the compute SQL); no acceptedBaselineRows call, no lock, no emits (flips at ②)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).not.toMatch(/NOW\(\)/);
    expect(c).not.toMatch(/acceptedBaselineRows|withAdvisoryLock|emitSummary|emitMeta/);
  });

  it.fails('D5 — R-DL admin visibility: PIPELINE_TABLE_MAP names assert_entity_tracing → pipeline_runs (absent today) (flips at ②)', () => {
    const funnel = readText('src/lib/admin/funnel.ts');
    const map = funnel.slice(funnel.indexOf('export const PIPELINE_TABLE_MAP'));
    expect(map.slice(0, map.indexOf('};'))).toMatch(/assert_entity_tracing:\s*'pipeline_runs'/);
  });

  // Written by step-validate --step=assert_entity_tracing --write at ① (Spec 124 R-R / Rule 13; the N1 finding that
  // flipped the assert_coa_freshness D6 to `it`, operator y 2026-10-19).
  it('D6 — the assessment report carries the generated validation scorecard (R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D7 — registered: census archetype ASSERT and converted.json converted[] holds scripts/quality/assert-entity-tracing.js (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/quality/assert-entity-tracing.js');
    const census = readText('scripts/steps/_schema/step-archetype-census.json');
    expect(census).toMatch(/"slug": "assert_entity_tracing",[\s\S]{0,200}"archetype": "ASSERT"/);
  });
});
