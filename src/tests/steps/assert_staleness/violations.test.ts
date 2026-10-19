// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DE, R-DF, R-DL
//
// C6-1 — `assert_staleness` (scripts/quality/assert-staleness.js), ASSERT: two SELECTs over permits ×
// permit_inspections (scrape coverage, then per-permit freshness), a three-tier stale-count gate that HALTS
// on FAIL (the mig-121 documented fence, kept by 4d5df9e7), no write; McDonald's Airtight V3 from ①.
// Commit form compressed (R-PACE-1): ① assessment + this suite, ② descriptor + compute + notes + shell +
// seeds migration, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L12: plain `it(...)`, GREEN today, executing the VERBATIM legacy text
// via `./fixtures/legacy-harness` (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D7: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS until ② / ③.
// D6 is a plain `it`: step-validate --write generates the scorecard for every registry step (R-R / Rule 13).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type LegacyOracle, type LegacyOpts } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/quality/assert-staleness.descriptor.json';
const NOTES_REL = 'scripts/quality/assert-staleness.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/assert-staleness.js';
const SHELL_REL = 'scripts/quality/assert-staleness.js';
const REPORT_REL = 'docs/reports/2026-10-19-batch5-p1-3-assert-staleness-assessment.md';
/** Spec 47 §A.5 advisory lock of the legacy step (`assert-staleness.js:44`). */
const LOCK_ID = 106;
/** The scrape-target permit types (`assert-staleness.js:38-42`; must match the scraper's ALL_TARGET_TYPES). */
const TARGET_TYPES = ['Small Residential Projects', 'Building Additions/Alterations', 'New Houses'];

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { checks_passed?: unknown; checks_failed?: number; checks_warned?: number; audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

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
  if (last === undefined) throw new Error('[assert_staleness ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[assert_staleness ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[assert_staleness ①] audit row ' + metric + ' missing');
  return r;
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
const flat = (sql: string | undefined) => (sql ?? '').replace(/\s+/g, ' ').trim();

describe('assert_staleness ① — legacy oracle pins A: the two reads (GREEN today)', () => {
  it('L1 — exactly two pool SELECTs in order: coverage over permits LEFT JOIN permit_inspections, then the per-permit freshness CTE; config tag assert-staleness', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();
    expect(o.queries).toHaveLength(2);
    expect(flat(o.queries[0]?.sql)).toBe("SELECT COUNT(DISTINCT p.permit_num) AS total_target, COUNT(DISTINCT pi.permit_num) AS scraped FROM permits p LEFT JOIN permit_inspections pi ON pi.permit_num = p.permit_num WHERE p.status = 'Inspection' AND p.permit_type = ANY($1)");
    expect(flat(o.queries[1]?.sql)).toBe("WITH permit_freshness AS ( SELECT p.permit_num, MAX(pi.scraped_at) AS last_scraped FROM permits p JOIN permit_inspections pi ON pi.permit_num = p.permit_num WHERE p.status = 'Inspection' AND p.permit_type = ANY($1) GROUP BY p.permit_num ) SELECT MAX(CURRENT_DATE - last_scraped::date) AS max_days_stale, COUNT(*) FILTER (WHERE last_scraped < NOW() - $2 * INTERVAL '1 day') AS stale_30d FROM permit_freshness");
    expect(o.configLoads).toEqual(['assert-staleness']);
  });

  it('L2 — the parameters: $1 is the three scrape-target permit types (a code literal mirrored from the scraper), $2 the configured scrape_stale_days', async () => {
    const { o } = await run({ logicVars: { scrape_stale_days: 45 } });
    expect(o.queries[0]?.params).toEqual([TARGET_TYPES]);
    expect(o.queries[1]?.params).toEqual([TARGET_TYPES, 45]);
  });
});

describe('assert_staleness ① — legacy oracle pins B: rows and tiers (GREEN today)', () => {
  it('L3 — six rows in order; the three counts are INFO; coverage_pct is a one-decimal string with threshold ">= <floor>%"', async () => {
    const { o } = await run({ coverage: { total_target: '58983', scraped: '6500' } });
    expect(rows(o).map((r) => r.metric)).toEqual(['total_target_permits', 'scraped_permits', 'never_scraped', 'coverage_pct', 'max_days_stale', 'stale_over_30d']);
    expect(row(o, 'total_target_permits')).toEqual({ metric: 'total_target_permits', value: 58983, threshold: null, status: 'INFO' });
    expect(row(o, 'scraped_permits')).toEqual({ metric: 'scraped_permits', value: 6500, threshold: null, status: 'INFO' });
    expect(row(o, 'never_scraped')).toEqual({ metric: 'never_scraped', value: 52483, threshold: null, status: 'INFO' });
    expect(row(o, 'coverage_pct')).toEqual({ metric: 'coverage_pct', value: '11.0%', threshold: '>= 10%', status: 'INFO' });
  });

  it('L4 — coverage below the floor WARNs (strict <); a zero target reads "0%" INFO, never WARN; the floor itself is INFO', async () => {
    expect(row((await run({ coverage: { total_target: '58983', scraped: '65' } })).o, 'coverage_pct')).toMatchObject({ value: '0.1%', status: 'WARN' });
    expect(row((await run({ coverage: { total_target: '0', scraped: '0' } })).o, 'coverage_pct')).toMatchObject({ value: '0%', status: 'INFO' });
    expect(row((await run({ coverage: { total_target: '100', scraped: '10' } })).o, 'coverage_pct')).toMatchObject({ value: '10.0%', status: 'INFO' });
  });

  it('L5 — max_days_stale WARNs strictly above the ceiling: 60 INFO, 61 WARN; threshold "<= 60 days"', async () => {
    expect(row((await run({ staleness: { max_days_stale: '60' } })).o, 'max_days_stale')).toEqual({ metric: 'max_days_stale', value: 60, threshold: '<= 60 days', status: 'INFO' });
    expect(row((await run({ staleness: { max_days_stale: '61' } })).o, 'max_days_stale')).toMatchObject({ value: 61, status: 'WARN' });
  });

  it('L6 — stale_over_30d has three tiers: 0 PASS, 1..max WARN (inclusive), > max FAIL; the metric name stays "stale_over_30d" whatever scrape_stale_days is', async () => {
    const at = async (n: string, lv: Record<string, unknown> = {}) => row((await run({ staleness: { stale_30d: n }, logicVars: lv })).o, 'stale_over_30d');
    expect(await at('0')).toEqual({ metric: 'stale_over_30d', value: 0, threshold: '<= 10000', status: 'PASS' });
    expect((await at('1')).status).toBe('WARN');
    expect((await at('10000')).status).toBe('WARN');
    const failRun = await run({ staleness: { stale_30d: '10001' } });
    expect(row(failRun.o, 'stale_over_30d').status).toBe('FAIL');
    expect((await at('5', { scrape_stale_days: 45 })).metric).toBe('stale_over_30d');
  });

  it('L7 — scrape_early_phase_threshold_pct reaches only a console line ("(early phase)"); rows and verdict are identical at 1% and 99%', async () => {
    const lo = (await run({ logicVars: { scrape_early_phase_threshold_pct: 1 } })).o;
    const hi = (await run({ logicVars: { scrape_early_phase_threshold_pct: 99 } })).o;
    expect(rows(hi)).toEqual(rows(lo));
    expect(meta(hi).audit_table?.verdict).toBe(meta(lo).audit_table?.verdict);
    const said = (o: LegacyOracle) => o.logs.some((l) => String(l.args[0]).includes('(early phase)'));
    expect(said(hi)).toBe(true);
    expect(said(lo)).toBe(false);
  });

  it('L8 — unparseable or absent counts read 0: no staleness row → max_days_stale 0 INFO, stale_over_30d 0 PASS', async () => {
    const { o } = await run({ staleness: null });
    expect(row(o, 'max_days_stale')).toMatchObject({ value: 0, status: 'INFO' });
    expect(row(o, 'stale_over_30d')).toMatchObject({ value: 0, status: 'PASS' });
  });
});

describe('assert_staleness ① — legacy oracle pins C: verdict, halt, summary, config, lock (GREEN today)', () => {
  it('L9 — HALTING: a FAIL emits the summary and meta FIRST, then throws "Staleness check failed: …" (the mig-121 fence, kept by 4d5df9e7)', async () => {
    const { o, err } = await run({ staleness: { stale_30d: '20000' } });
    expect(err?.message).toMatch(/^Staleness check failed: 20000 permits stale >30d exceeds threshold 10000/);
    expect(o.summaries).toHaveLength(1);
    expect(meta(o).audit_table?.verdict).toBe('FAIL');
    expect(o.metas).toHaveLength(1);
  });

  it('L10 — a WARN does not throw; summary records_total 0, records_new null, records_updated 0, records_meta {checks_passed, checks_failed, checks_warned, audit_table phase 4 "Staleness Monitor"}; emitMeta reads permits + permit_inspections, writes {}', async () => {
    const { o, err } = await run({ coverage: { total_target: '58983', scraped: '65' }, staleness: { max_days_stale: '140', stale_30d: '59' } });
    expect(err).toBeNull();
    expect(o.summaries[0]).toMatchObject({ records_total: 0, records_new: null, records_updated: 0 });
    expect(Object.keys(meta(o))).toEqual(['checks_passed', 'checks_failed', 'checks_warned', 'audit_table']);
    expect(meta(o)).toMatchObject({ checks_passed: 'all', checks_failed: 0, checks_warned: 3 });
    expect(meta(o).audit_table).toMatchObject({ phase: 4, name: 'Staleness Monitor', verdict: 'WARN' });
    expect(o.metas).toEqual([{ reads: { permits: ['permit_num', 'status', 'permit_type'], permit_inspections: ['permit_num', 'scraped_at'] }, writes: {} }]);
  });

  it('L11 — config refused BEFORE any query: a negative stale-count ceiling or a fractional scrape_stale_days throws "logicVars validation failed"', async () => {
    const neg = await run({ logicVars: { staleness_max_stale_over_30d: -1 } });
    expect(neg.err?.message).toMatch(/^logicVars validation failed/);
    expect(neg.o.queries).toHaveLength(0);
    const frac = await run({ logicVars: { scrape_stale_days: 7.5 } });
    expect(frac.err?.message).toMatch(/^logicVars validation failed/);
    expect(frac.o.summaries).toHaveLength(0);
  });

  it('L12 — advisory lock 106; when not acquired, nothing is loaded, read or emitted', async () => {
    const held = await run({ lockAcquired: false });
    expect(held.err).toBeNull();
    expect(held.o.lockIds).toEqual([LOCK_ID]);
    expect(held.o.configLoads).toHaveLength(0);
    expect(held.o.queries).toHaveLength(0);
    expect(held.o.summaries).toHaveLength(0);
  });
});

// PART 2 — the converted claims D1–D7 (`it.fails` at ①), RED as NAMED MISSING ARTIFACTS or named legacy facts.
interface Check { id: string; kind: string; limit: string; limit_from_config?: string; warn_limit_from_config?: string; severity: string; blocking?: boolean }
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  outputs: { writes: unknown };
  checks: Check[];
  config: { logic_variables: { name: string }[]; retired?: { name: string }[] };
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('assert_staleness ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype ASSERT, lock 106, spec "44", writes nothing; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'assert_staleness', archetype: 'ASSERT', spec: '44', lock: LOCK_ID });
    expect(d.outputs.writes).toBe('none');
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  // The exact `<name>` suffixes are chosen at ② (its seeds migration); ① fixes the R-DE (v) prefix and the retired set.
  it.fails('D2 — R-DE (v) + EXTERNALIZED: every declared variable is assert_staleness_*; the scrape_* and staleness_* names are retired (flips at ②)', () => {
    const c = loadDescriptor().config;
    for (const v of c.logic_variables) expect(v.name).toMatch(/^assert_staleness_/);
    expect((c.retired ?? []).map((v) => v.name)).toEqual(expect.arrayContaining(['scrape_stale_days', 'staleness_max_days_stale', 'staleness_max_stale_over_30d', 'staleness_min_coverage_pct']));
  });

  it.fails('D3 — the verdict is declared: the stale-permit count is a blocking FAIL bound with a WARN tier, both from config; coverage and max days stale are WARN bounds from config (flips at ②)', () => {
    const checks = loadDescriptor().checks;
    const own = /^assert_staleness_/;
    const stale = checks.find((c) => /stale/.test(c.id) && c.severity === 'FAIL');
    expect(stale).toMatchObject({ kind: 'bound', blocking: true, limit_from_config: expect.stringMatching(own) });
    expect(checks.find((c) => c.id === 'coverage_pct')).toMatchObject({ severity: 'WARN', limit_from_config: expect.stringMatching(own) });
    expect(checks.find((c) => c.id === 'max_days_stale')).toMatchObject({ severity: 'WARN', limit_from_config: expect.stringMatching(own) });
  });

  it.fails('D4 — compute is pure (R-BZ): the run clock is a parameter (no CURRENT_DATE / NOW() in the compute SQL); no config loader, no lock, no emits, no console (flips at ②)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).not.toMatch(/CURRENT_DATE|NOW\(\)/);
    expect(c).not.toMatch(/loadMarketplaceConfigs|withAdvisoryLock|emitSummary|emitMeta/);
    expect(c).not.toMatch(/console\.(log|error|warn)/);
  });

  it.fails('D5 — R-DF EXTERNALIZED in admin text: STEP_DESCRIPTIONS.assert_staleness copies no day count (today it says "14 days", which is neither variable) (flips at ②)', () => {
    const funnel = readText('src/lib/admin/funnel.ts');
    const line = funnel.split('\n').find((l) => /^\s*assert_staleness:\s*\{\s*summary:/.test(l)) ?? '';
    expect(line).not.toBe('');
    expect(line).not.toMatch(/\d/);
  });

  // Written by step-validate --step=assert_staleness --write at ① (Spec 124 R-R / Rule 13; the N1 finding that
  // flipped the assert_coa_freshness D6 to `it`, operator y 2026-10-19).
  it('D6 — the assessment report carries the generated validation scorecard (R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D7 — registered: census archetype ASSERT and converted.json converted[] holds scripts/quality/assert-staleness.js (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/quality/assert-staleness.js');
    const census = readText('scripts/steps/_schema/step-archetype-census.json');
    expect(census).toMatch(/"slug": "assert_staleness",[\s\S]{0,200}"archetype": "ASSERT"/);
  });
});
