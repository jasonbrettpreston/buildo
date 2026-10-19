// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DE, R-DF, R-DL
//
// C6-1 — `assert_network_health` (scripts/quality/assert-network-health.js), ASSERT: one SELECT of the
// latest inspections pipeline_runs row, five graded checks over its scraper_telemetry, no write;
// McDonald's Airtight V3 from ①. Commit form compressed (R-PACE-1): ① assessment + this suite,
// ② descriptor + compute + notes + shell + seeds migration, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L12: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM legacy
// text via `./fixtures/legacy-harness` (never source-text assertions), recording what the legacy script
// DOES so the conversion can prove it reproduced the same observables (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D7: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS (descriptor /
// compute / notes / shell / registry) until ② and ③ land them. D6 is a plain `it`: step-validate
// --write generates the scorecard for every registry step, pending included (Spec 124 R-R / Rule 13).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type LegacyOracle, type LegacyOpts, type Telemetry } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/quality/assert-network-health.descriptor.json';
const NOTES_REL = 'scripts/quality/assert-network-health.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/assert-network-health.js';
const SHELL_REL = 'scripts/quality/assert-network-health.js';
const REPORT_REL = 'docs/reports/2026-10-19-batch5-p1-2-assert-network-health-assessment.md';
/** Spec 47 §A.5 advisory lock of the legacy step (`assert-network-health.js:33`). */
const LOCK_ID = 105;

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { checks_passed?: unknown; checks_failed?: number; checks_warned?: number; audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

/** A healthy telemetry object (the live run 1602 shape, 2026-08-01). */
function tel(over: Telemetry = {}): Telemetry {
  return { schema_drift: [], permits_attempted: 100, proxy_errors: 0, latency: { p50: 900, max: 3640 }, consecutive_empty_max: 0, session_bootstraps: 1, session_failures: 0, ...over };
}
function withTel(t: Telemetry, rest: Omit<LegacyOpts, 'lastRun'> = {}): LegacyOpts {
  return { lastRun: { records_meta: { scraper_telemetry: t }, records_updated: 0 }, ...rest };
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
  if (last === undefined) throw new Error('[assert_network_health ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[assert_network_health ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[assert_network_health ①] audit row ' + metric + ' missing');
  return r;
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('assert_network_health ① — legacy oracle pins A: read and the skip lane (GREEN today)', () => {
  it('L1 — exactly one pool SELECT of the latest inspections pipeline_runs row (no status filter, newest started_at), no params; config tag assert-network-health', async () => {
    const { o, err } = await run(withTel(tel()));
    expect(err).toBeNull();
    expect(o.queries).toHaveLength(1);
    const sql = (o.queries[0]?.sql ?? '').replace(/\s+/g, ' ').trim();
    expect(sql).toBe("SELECT records_meta, records_updated FROM pipeline_runs WHERE (pipeline = 'inspections' OR pipeline LIKE '%:inspections') ORDER BY started_at DESC LIMIT 1");
    expect(o.queries[0]?.params).toEqual([]);
    expect(o.configLoads).toEqual(['assert-network-health']);
  });

  it('L2 — no inspections row, or a row with no scraper_telemetry: verdict SKIP with ONE row scraper_telemetry SKIP; records_total 0, records_updated 0; emitMeta reads pipeline_runs[records_meta, status, pipeline], writes {}', async () => {
    for (const lastRun of [null, { records_meta: {} }, { records_meta: null }]) {
      const { o, err } = await run({ lastRun });
      expect(err).toBeNull();
      expect(o.summaries).toHaveLength(1);
      expect(o.summaries[0]).toMatchObject({ records_total: 0, records_new: null, records_updated: 0 });
      expect(meta(o)).toEqual({ audit_table: { phase: 2, name: 'Network Health', verdict: 'SKIP', rows: [{ metric: 'scraper_telemetry', value: null, threshold: null, status: 'SKIP' }] } });
      expect(o.metas).toEqual([{ reads: { pipeline_runs: ['records_meta', 'status', 'pipeline'] }, writes: {} }]);
    }
  });
});

describe('assert_network_health ① — legacy oracle pins B: the five graded checks (GREEN today)', () => {
  it('L3 — a healthy run: seven rows in order, verdict PASS, thresholds rendered from the configured variables', async () => {
    const { o } = await run(withTel(tel()));
    expect(meta(o).audit_table).toMatchObject({ phase: 2, name: 'Network Health', verdict: 'PASS' });
    expect(rows(o)).toEqual([
      { metric: 'schema_drift_count', value: 0, threshold: '== 0', status: 'PASS' },
      { metric: 'proxy_error_rate', value: '0.0%', threshold: '< 5%', status: 'PASS' },
      { metric: 'avg_latency_ms', value: 900, threshold: '< 2000', status: 'PASS' },
      { metric: 'max_latency_ms', value: 3640, threshold: null, status: 'INFO' },
      { metric: 'consecutive_empty_hit', value: false, threshold: '== false', status: 'PASS' },
      { metric: 'session_bootstraps', value: 1, threshold: null, status: 'INFO' },
      { metric: 'session_failures', value: 0, threshold: null, status: 'PASS' },
    ]);
  });

  it('L4 — proxy_error_rate is the ONLY FAIL check, with an INCLUSIVE floor at the configured percent: 4/100 PASS, 5/100 FAIL; attempted 0 reads "0.0%" PASS whatever the errors', async () => {
    expect(row((await run(withTel(tel({ proxy_errors: 4 })))).o, 'proxy_error_rate')).toMatchObject({ value: '4.0%', status: 'PASS' });
    const fail = (await run(withTel(tel({ proxy_errors: 5 })))).o;
    expect(row(fail, 'proxy_error_rate')).toEqual({ metric: 'proxy_error_rate', value: '5.0%', threshold: '< 5%', status: 'FAIL' });
    expect(meta(fail).audit_table?.verdict).toBe('FAIL');
    expect(row((await run(withTel(tel({ permits_attempted: 0, proxy_errors: 9 })))).o, 'proxy_error_rate')).toMatchObject({ value: '0.0%', status: 'PASS' });
  });

  it('L5 — avg_latency_ms is the p50 (not an average) and WARNs INCLUSIVELY at the configured ms: 1999 PASS, 2000 WARN; a missing latency object reads 0', async () => {
    expect(row((await run(withTel(tel({ latency: { p50: 1999, max: 1 } })))).o, 'avg_latency_ms').status).toBe('PASS');
    const w = (await run(withTel(tel({ latency: { p50: 2000, max: 2000 } })))).o;
    expect(row(w, 'avg_latency_ms')).toEqual({ metric: 'avg_latency_ms', value: 2000, threshold: '< 2000', status: 'WARN' });
    expect(meta(w).audit_table?.verdict).toBe('WARN');
    const noLatency = tel();
    delete noLatency.latency;
    const none = (await run(withTel(noLatency))).o;
    expect(row(none, 'avg_latency_ms').value).toBe(0);
    expect(row(none, 'max_latency_ms').value).toBe(0);
  });

  it('L6 — consecutive_empty_hit is a BOOLEAN row: consecutive_empty_max >= the configured streak (inclusive) → value true, WARN', async () => {
    expect(row((await run(withTel(tel({ consecutive_empty_max: 19 })))).o, 'consecutive_empty_hit')).toMatchObject({ value: false, status: 'PASS' });
    expect(row((await run(withTel(tel({ consecutive_empty_max: 20 })))).o, 'consecutive_empty_hit')).toEqual({ metric: 'consecutive_empty_hit', value: true, threshold: '== false', status: 'WARN' });
  });

  it('L7 — schema drift is WARN, never FAIL, despite its "== 0" threshold text; value is the drift-entry count', async () => {
    const { o } = await run(withTel(tel({ schema_drift: ['inspectionProcesses missing', 'x renamed'] })));
    expect(row(o, 'schema_drift_count')).toEqual({ metric: 'schema_drift_count', value: 2, threshold: '== 0', status: 'WARN' });
    expect(meta(o).audit_table?.verdict).toBe('WARN');
  });

  it('L8 — session_failures > 0 WARNs with a NULL threshold; permits_closed adds an INFO row only when > 0', async () => {
    const { o } = await run(withTel(tel({ session_failures: 3, permits_closed: 7 })));
    expect(row(o, 'session_failures')).toEqual({ metric: 'session_failures', value: 3, threshold: null, status: 'WARN' });
    expect(row(o, 'permits_closed')).toEqual({ metric: 'permits_closed', value: 7, threshold: null, status: 'INFO' });
    expect(rows((await run(withTel(tel()))).o).some((r) => r.metric === 'permits_closed')).toBe(false);
  });
});

describe('assert_network_health ① — legacy oracle pins C: verdict, summary, config, lock (GREEN today)', () => {
  it('L9 — verdict from the errors/warnings ARRAYS (FAIL beats WARN), and a FAIL does NOT throw (non-halting, Spec 30 §5.4.1)', async () => {
    const { o, err } = await run(withTel(tel({ proxy_errors: 50, latency: { p50: 5000, max: 5000 } })));
    expect(err).toBeNull();
    expect(meta(o).audit_table?.verdict).toBe('FAIL');
  });

  it('L10 — summary: records_total 0, records_new null, records_updated 0, records_meta {checks_passed "all"|undefined, checks_failed, checks_warned, audit_table}; emitMeta as L2', async () => {
    const ok = (await run(withTel(tel({ latency: { p50: 2500, max: 2500 } })))).o;
    expect(ok.summaries).toHaveLength(1);
    expect(ok.summaries[0]).toMatchObject({ records_total: 0, records_new: null, records_updated: 0 });
    expect(Object.keys(meta(ok))).toEqual(['checks_passed', 'checks_failed', 'checks_warned', 'audit_table']);
    expect(meta(ok)).toMatchObject({ checks_passed: 'all', checks_failed: 0, checks_warned: 1 });
    const bad = (await run(withTel(tel({ proxy_errors: 50 })))).o;
    expect(meta(bad).checks_passed).toBeUndefined();
    expect(meta(bad).checks_failed).toBe(1);
    expect(ok.metas).toEqual([{ reads: { pipeline_runs: ['records_meta', 'status', 'pipeline'] }, writes: {} }]);
  });

  it('L11 — config refused BEFORE any query: a non-integer empty streak, or a non-positive rate, throws "logicVars validation failed"', async () => {
    const frac = await run({ ...withTel(tel()), logicVars: { scraper_empty_streak_warn: 2.5 } });
    expect(frac.err?.message).toMatch(/^logicVars validation failed/);
    expect(frac.o.queries).toHaveLength(0);
    expect(frac.o.summaries).toHaveLength(0);
    const zero = await run({ ...withTel(tel()), logicVars: { scraper_error_rate_warn_pct: 0 } });
    expect(zero.err?.message).toMatch(/^logicVars validation failed/);
  });

  it('L12 — advisory lock 105; when not acquired, nothing is loaded, read or emitted (config is loaded INSIDE the lock)', async () => {
    const held = await run({ ...withTel(tel()), lockAcquired: false });
    expect(held.err).toBeNull();
    expect(held.o.lockIds).toEqual([LOCK_ID]);
    expect(held.o.configLoads).toHaveLength(0);
    expect(held.o.queries).toHaveLength(0);
    expect(held.o.summaries).toHaveLength(0);
  });
});

// PART 2 — the converted claims D1–D7 (`it.fails` at ①). Each is RED as a NAMED MISSING ARTIFACT or a named
// legacy fact the conversion removes, never as a TS/import error. They flip to `it` at ② (D1–D5) and ③ (D7).
interface Check { id: string; kind: string; limit: string; limit_from_config?: string; severity: string; blocking?: boolean }
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  inputs: { reads: { tables?: { table: string; columns: string[] }[] } };
  outputs: { writes: unknown };
  checks: Check[];
  config: { logic_variables: { name: string }[]; retired?: { name: string }[] };
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('assert_network_health ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype ASSERT, lock 105, spec "44", writes nothing; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'assert_network_health', archetype: 'ASSERT', spec: '44', lock: LOCK_ID });
    expect(d.outputs.writes).toBe('none');
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  // The exact `<name>` suffixes are chosen at ② (its seeds migration); ① fixes the R-DE (v) prefix and the retired set.
  it.fails('D2 — R-DE (v) + EXTERNALIZED: three step-owned assert_network_health_* variables carry the bounds; the scraper_* names are retired (flips at ②)', () => {
    const c = loadDescriptor().config;
    const names = c.logic_variables.map((v) => v.name);
    expect(names).toHaveLength(3);
    for (const n of names) expect(n).toMatch(/^assert_network_health_/);
    expect((c.retired ?? []).map((v) => v.name).sort()).toEqual(['scraper_empty_streak_warn', 'scraper_error_rate_warn_pct', 'scraper_latency_p50_warn_ms']);
  });

  it.fails('D3 — the verdict is declared: proxy_error_rate a FAIL bound from config; latency and the empty streak WARN bounds from config; schema drift and session failures WARN viol == 0 checks (flips at ②)', () => {
    const byId = new Map(loadDescriptor().checks.map((c) => [c.id, c]));
    const own = /^assert_network_health_/;
    expect(byId.get('proxy_error_rate')).toMatchObject({ kind: 'bound', severity: 'FAIL', limit_from_config: expect.stringMatching(own) });
    expect(byId.get('avg_latency_ms')).toMatchObject({ kind: 'bound', severity: 'WARN', limit_from_config: expect.stringMatching(own) });
    expect(byId.get('consecutive_empty_hit')).toMatchObject({ severity: 'WARN', limit_from_config: expect.stringMatching(own) });
    expect(byId.get('schema_drift_count')).toMatchObject({ limit: 'viol == 0', severity: 'WARN' });
    expect(byId.get('session_failures')).toMatchObject({ limit: 'viol == 0', severity: 'WARN' });
  });

  it.fails('D4 — compute is pure (R-BZ): no config loader, no lock, no emits, no console output, no toFixed rendering of a verdict operand (flips at ②)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).not.toMatch(/loadMarketplaceConfigs|withAdvisoryLock|emitSummary|emitMeta/);
    expect(c).not.toMatch(/console\.(log|error|warn)/);
    expect(c).not.toMatch(/\.toFixed\(/);
  });

  it.fails('D5 — Rule 1 nothing hidden: the declared pipeline_runs reads are the columns the SELECT touches (records_meta, pipeline, started_at), not the legacy emitMeta list that names an unread `status` (flips at ②)', () => {
    const t = (loadDescriptor().inputs.reads.tables ?? []).find((x) => x.table === 'pipeline_runs');
    expect(t).toBeDefined();
    expect([...(t?.columns ?? [])].sort()).toEqual(['pipeline', 'records_meta', 'started_at']);
  });

  // Written by step-validate --step=assert_network_health --write at ① (Spec 124 R-R / Rule 13: the ONE command
  // that generates the Spec 123 §6 scorecard, over every registry step, pending included — the RE-FREEZE #37 /
  // N1 finding that flipped the assert_coa_freshness D6 to `it`, operator y 2026-10-19).
  it('D6 — the assessment report carries the generated validation scorecard (R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D7 — registered: census archetype ASSERT and converted.json converted[] holds scripts/quality/assert-network-health.js (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/quality/assert-network-health.js');
    const census = readText('scripts/steps/_schema/step-archetype-census.json');
    expect(census).toMatch(/"slug": "assert_network_health",[\s\S]{0,200}"archetype": "ASSERT"/);
  });
});
