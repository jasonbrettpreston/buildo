// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DE, R-DF, R-DL
//
// Phase 4 wave 4 — `assert_coa_freshness` (scripts/quality/assert-coa-freshness.js), ASSERT: one aggregate
// SELECT over coa_applications, a three-tier portal-rot verdict, no write; McDonald's Airtight V3 from ①.
// Commit form compressed (R-PACE-1): ① assessment + this suite, ② descriptor + compute + notes + shell +
// seeds migration, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L13: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM legacy
// text via `./fixtures/legacy-harness` (never source-text assertions), recording what the legacy script
// DOES so the conversion can prove it reproduced the same observables (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D7: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS (descriptor /
// compute / notes / shell / registry) until ② and ③ land them.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type AggregateRow, type LegacyOracle, type LegacyOpts } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/quality/assert-coa-freshness.descriptor.json';
const NOTES_REL = 'scripts/quality/assert-coa-freshness.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/assert-coa-freshness.js';
const SHELL_REL = 'scripts/quality/assert-coa-freshness.js';
const REPORT_REL = 'docs/reports/2026-10-18-batch4-p4-1-assert-coa-freshness-assessment.md';
/** Spec 47 §A.5 advisory lock of the legacy step (`assert-coa-freshness.js:38`). */
const LOCK_ID = 108;
const NOW_MS = Date.parse('2026-10-18T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { duration_ms?: number; audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

/** A non-empty table whose newest touch is `daysAgo` (fractional allowed) before the frozen clock. */
function seen(daysAgo: number, over: AggregateRow = {}): AggregateRow {
  return { max_last_seen: new Date(NOW_MS - daysAgo * DAY_MS), max_hearing_date: '2027-10-08', max_decision_date: '2026-12-21', total_records: '33949', ...over };
}

async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy({ nowMs: NOW_MS, ...opts });
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[assert_coa_freshness ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[assert_coa_freshness ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[assert_coa_freshness ①] audit row ' + metric + ' missing');
  return r;
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('assert_coa_freshness ① — legacy oracle pins A: read and measure (GREEN today)', () => {
  it('L1 — exactly one pool SELECT: MAX(last_seen_at), MAX(hearing_date)::date, MAX(decision_date)::date, COUNT(*) FROM coa_applications; no write, no params', async () => {
    const { o, err } = await run({ row: seen(1) });
    expect(err).toBeNull();
    expect(o.queries).toHaveLength(1);
    const sql = (o.queries[0]?.sql ?? '').replace(/\s+/g, ' ').trim();
    expect(sql).toBe('SELECT MAX(last_seen_at) AS max_last_seen, MAX(hearing_date)::date AS max_hearing_date, MAX(decision_date)::date AS max_decision_date, COUNT(*) AS total_records FROM coa_applications');
    expect(o.queries[0]?.params).toEqual([]);
    expect(o.configLoads).toEqual(['assert-coa-freshness']);
  });

  it('L2 — ingestion_days_ago = Math.round((Date.now() − MAX(last_seen_at)) / 86 400 000): 1.4 d → 1, 1.5 d → 2', async () => {
    expect(row((await run({ row: seen(1.4) })).o, 'ingestion_days_ago').value).toBe(1);
    expect(row((await run({ row: seen(1.5) })).o, 'ingestion_days_ago').value).toBe(2);
  });

  it('L3 — a last_seen_at in the future clamps to 0 days (Math.max(0, …)), PASS', async () => {
    const r = row((await run({ row: seen(-3) })).o, 'ingestion_days_ago');
    expect(r).toMatchObject({ value: 0, status: 'PASS' });
  });

  it('L4 — three tiers, both boundaries INCLUSIVE at the defaults: 44 PASS, 45 WARN (>= warn), 134 WARN, 135 FAIL (>= fail)', async () => {
    const at = async (d: number) => row((await run({ row: seen(d) })).o, 'ingestion_days_ago').status;
    expect(await at(44)).toBe('PASS');
    expect(await at(45)).toBe('WARN');
    expect(await at(134)).toBe('WARN');
    expect(await at(135)).toBe('FAIL');
  });

  it('L5 — the tiers read the CONFIGURED variables, not the defaults: warn 10 / fail 20 → 10 WARN, 20 FAIL', async () => {
    const lv = { coa_freshness_warn_days: 10, coa_freshness_fail_days: 20 };
    expect(row((await run({ row: seen(9), logicVars: lv })).o, 'ingestion_days_ago').status).toBe('PASS');
    expect(row((await run({ row: seen(10), logicVars: lv })).o, 'ingestion_days_ago').status).toBe('WARN');
    expect(row((await run({ row: seen(20), logicVars: lv })).o, 'ingestion_days_ago').status).toBe('FAIL');
  });
});

describe('assert_coa_freshness ① — legacy oracle pins B: audit, summary, meta (GREEN today)', () => {
  it('L6 — five audit rows in order, phase 3 "Source Freshness", verdict = the freshness tier, threshold text names both variables\' values', async () => {
    const { o } = await run({ row: seen(50) });
    const t = meta(o).audit_table;
    expect(t).toMatchObject({ phase: 3, name: 'Source Freshness', verdict: 'WARN' });
    expect(rows(o).map((r) => r.metric)).toEqual(['total_records', 'last_ingestion', 'ingestion_days_ago', 'max_decision_date', 'max_hearing_date']);
    expect(row(o, 'total_records')).toEqual({ metric: 'total_records', value: 33949, threshold: null, status: 'INFO' });
    expect(row(o, 'ingestion_days_ago')).toEqual({ metric: 'ingestion_days_ago', value: 50, threshold: '>= 45d WARN / >= 135d FAIL — CKAN feed likely frozen; check the scraper', status: 'WARN' });
    expect(row(o, 'max_decision_date')).toMatchObject({ value: '2026-12-21', threshold: null, status: 'INFO' });
    expect(row(o, 'max_hearing_date')).toMatchObject({ value: '2027-10-08', threshold: null, status: 'INFO' });
  });

  it('L7 — last_ingestion is the UTC calendar date of MAX(last_seen_at) (toISOString), not the Toronto date', async () => {
    const { o } = await run({ row: seen(1, { max_last_seen: new Date('2026-10-16T02:00:00Z') }) });
    expect(row(o, 'last_ingestion').value).toBe('2026-10-16');
  });

  it('L8 — absent hearing/decision maxima render "none"', async () => {
    const { o } = await run({ row: seen(1, { max_hearing_date: null, max_decision_date: null }) });
    expect(row(o, 'max_decision_date').value).toBe('none');
    expect(row(o, 'max_hearing_date').value).toBe('none');
  });

  it('L9 — summary: records_total 0, records_new null, records_updated null, records_meta {duration_ms, audit_table}; emitMeta reads coa_applications[last_seen_at, hearing_date, decision_date], writes {}', async () => {
    const { o } = await run({ row: seen(1) });
    expect(o.summaries).toHaveLength(1);
    const s = o.summaries[0];
    expect(s).toMatchObject({ records_total: 0, records_new: null, records_updated: null });
    expect(Object.keys(s?.records_meta ?? {})).toEqual(['duration_ms', 'audit_table']);
    expect(o.metas).toEqual([{ reads: { coa_applications: ['last_seen_at', 'hearing_date', 'decision_date'] }, writes: {} }]);
  });

  it('L13 — a non-empty table whose MAX(last_seen_at) is NULL: ingestion_days_ago null reads PASS and last_ingestion "never" (ACF-D6; unreachable live — NOT NULL)', async () => {
    const { o } = await run({ row: seen(1, { max_last_seen: null }) });
    expect(row(o, 'ingestion_days_ago')).toMatchObject({ value: null, status: 'PASS' });
    expect(row(o, 'last_ingestion').value).toBe('never');
    expect(meta(o).audit_table?.verdict).toBe('PASS');
  });

  it('L10 — an EMPTY table: WARN with ONE row total_records 0 "> 0", no duration_ms, the same emitMeta, and no freshness row', async () => {
    const { o, err } = await run({ row: { total_records: '0' } });
    expect(err).toBeNull();
    expect(meta(o)).toEqual({ audit_table: { phase: 3, name: 'Source Freshness', verdict: 'WARN', rows: [{ metric: 'total_records', value: 0, threshold: '> 0', status: 'WARN' }] } });
    expect(o.metas).toHaveLength(1);
    expect(o.logs.some((l) => l.level === 'warn')).toBe(true);
  });
});

describe('assert_coa_freshness ① — legacy oracle pins C: config and lock (GREEN today)', () => {
  it('L11 — config refused BEFORE any query: fail <= warn, or a non-integer bound, throws "logicVars validation failed"', async () => {
    const eq = await run({ row: seen(1), logicVars: { coa_freshness_warn_days: 45, coa_freshness_fail_days: 45 } });
    expect(eq.err?.message).toMatch(/^logicVars validation failed: .*strictly greater/);
    expect(eq.o.queries).toHaveLength(0);
    expect(eq.o.summaries).toHaveLength(0);
    const frac = await run({ row: seen(1), logicVars: { coa_freshness_warn_days: 4.5 } });
    expect(frac.err?.message).toMatch(/^logicVars validation failed/);
  });

  it('L12 — advisory lock 108; when not acquired, nothing is read or emitted (config is loaded INSIDE the lock)', async () => {
    const held = await run({ row: seen(1), lockAcquired: false });
    expect(held.err).toBeNull();
    expect(held.o.lockIds).toEqual([LOCK_ID]);
    expect(held.o.configLoads).toHaveLength(0);
    expect(held.o.queries).toHaveLength(0);
    expect(held.o.summaries).toHaveLength(0);
  });
});

// PART 2 — the converted claims D1–D7 (`it.fails` at ①). Each is RED as a NAMED MISSING ARTIFACT or a named
// legacy fact the conversion removes, never as a TS/import error. They flip to `it` at ② (D1–D6) and ③ (D7).
interface Check { id: string; kind: string; limit: string; limit_from_config?: string; warn_limit?: string; warn_limit_from_config?: string; severity: string }
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  outputs: { writes: unknown };
  checks: Check[];
  config: { logic_variables: { name: string }[]; retired?: { name: string }[] };
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('assert_coa_freshness ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype ASSERT, lock 108, spec "42", writes nothing; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'assert_coa_freshness', archetype: 'ASSERT', spec: '42', lock: LOCK_ID });
    expect(d.outputs.writes).toBe('none');
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
    // ACF-D5 — the shell cites the census owner spec 42, not the stale 41/43 links (the step runs only in chains.coa).
    expect(shell).toContain('SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md');
    expect(shell).not.toMatch(/SPEC LINK: docs\/specs\/01-pipeline\/4[13]_/);
  });

  it.fails('D2 — R-DE (v) + EXTERNALIZED: the two bounds are step-owned assert_coa_freshness_* variables; the coa_freshness_* names are retired (flips at ②)', () => {
    const c = loadDescriptor().config;
    expect(c.logic_variables.map((v) => v.name).sort()).toEqual(['assert_coa_freshness_fail_max_days', 'assert_coa_freshness_warn_max_days']);
    expect((c.retired ?? []).map((v) => v.name).sort()).toEqual(['coa_freshness_fail_days', 'coa_freshness_warn_days']);
  });

  it.fails('D3 — the verdict is declared: ingestion_days_ago is a two-tier value_max bound (FAIL tier + WARN tier, both from config); the empty table and the bound order are viol == 0 checks (flips at ②)', () => {
    const byId = new Map(loadDescriptor().checks.map((c) => [c.id, c]));
    expect(byId.get('ingestion_days_ago')).toMatchObject({
      kind: 'bound', severity: 'FAIL',
      limit: 'value_max 135', limit_from_config: 'assert_coa_freshness_fail_max_days',
      warn_limit: 'value_max 45', warn_limit_from_config: 'assert_coa_freshness_warn_max_days',
    });
    expect(byId.get('total_records_present')).toMatchObject({ limit: 'viol == 0', severity: 'WARN' });
    expect(byId.get('freshness_bounds_ordered')).toMatchObject({ limit: 'viol == 0', severity: 'FAIL' });
  });

  it.fails('D4 — compute is pure (R-BZ): ctx.clock, never Date.now; MS_PER_DAY from scripts/lib/units, never a 1000·60·60·24 literal; no config loader, no lock, no emits (flips at ②)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).not.toMatch(/Date\.now\(/);
    expect(c).toContain('ctx.clock()');
    expect(c).toMatch(/MS_PER_DAY/);
    expect(c).not.toMatch(/1000\s*\*\s*60\s*\*\s*60\s*\*\s*24/);
    expect(c).not.toMatch(/loadMarketplaceConfigs|withAdvisoryLock|emitSummary|emitMeta/);
  });

  it.fails('D5 — R-DF EXTERNALIZED in admin text: STEP_DESCRIPTIONS.assert_coa_freshness copies no day count (flips at ②)', () => {
    const funnel = readText('src/lib/admin/funnel.ts');
    const line = funnel.split('\n').find((l) => /^\s*assert_coa_freshness:\s*\{\s*summary:/.test(l)) ?? '';
    expect(line).not.toBe('');
    expect(line).not.toMatch(/\d/);
  });

  // FLIPPED at RE-FREEZE #37 / replay night N1 (operator y 2026-10-19): step-validate --all --write writes the generated
  // scorecard into the assessment report of EVERY registry step — converted[] and pending[] alike, red_suite included —
  // as designed by Spec 124 R-R / Rule 13 (step-validate.mjs is the ONE command that generates the Spec 123 §6
  // scorecard, over the registry derived from converted.json + pending). The block now exists before ②.
  it('D6 — the assessment report carries the generated validation scorecard (written by step-validate --all --write at N1, R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D7 — registered: census archetype ASSERT and converted.json converted[] holds scripts/quality/assert-coa-freshness.js (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/quality/assert-coa-freshness.js');
    const census = readText('scripts/steps/_schema/step-archetype-census.json');
    expect(census).toMatch(/"slug": "assert_coa_freshness",[\s\S]{0,200}"archetype": "ASSERT"/);
  });
});
