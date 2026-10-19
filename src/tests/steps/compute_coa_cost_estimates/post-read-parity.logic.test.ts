// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-EH (e) (buildPostSql, once after the loop),
//            R-DE (iv) ("Emits are flat"); 124a R-AD (warn_limit: one row PASS/WARN/FAIL)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (1) (the checks dispatch table)
//
// compute_coa_cost_estimates' post read and its two checks against the FROZEN legacy text (operator Q-W4G-2 y,
// 2026-10-19), run through the existing legacy harness with the real Brain:
//   (1) the distribution / corpus statement reads what the two legacy post-run queries read;
//   (2) the same database answers render the same distribution string and corpus coverage;
//   (3) the coverage check's status equals the legacy row across every branch (Q-CE3's one boundary named);
//   (4) the fixed-key objects are flat emits (R-DE (iv)) carrying the same numbers.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadLegacy } from './fixtures/legacy-harness';

const ROOT = path.resolve(__dirname, '../../../..');
/* eslint-disable @typescript-eslint/no-require-imports -- the real CJS modules under test */
const compute = require(path.join(ROOT, 'scripts/lib/compute/compute-coa-cost-estimates.js'));
const { checkRow } = require(path.join(ROOT, 'scripts/lib/step/verdict.js'));
/* eslint-enable @typescript-eslint/no-require-imports */
const descriptor = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/compute-coa-cost-estimates.descriptor.json'), 'utf8'));
const seeds = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));
const RUN_AT = new Date('2026-10-18T12:00:00Z');
const squash = (s: string) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const config = Object.fromEntries(['compute_coa_cost_estimates_distribution_p25', 'compute_coa_cost_estimates_distribution_p50', 'compute_coa_cost_estimates_distribution_p75',
  'compute_coa_cost_estimates_coverage_threshold_pct', 'compute_coa_cost_estimates_coverage_fail_pct', 'archetype_nofit_residential_warn_pct'].map((k) => [k, seeds[k].default]));

const priced = { id: 1, lead_id: 'coa:A1', scope_tags: ['rear-addition'], structure_type: 'sfd', project_type: 'Addition', cost_addition_total: 250000, neighbourhood_cost_premium: 1.1, opt_aor_gfa_sqm: 40, parcel_id: 7, lot_size_sqm: 300, frontage_m: 10, active_trade_slugs: ['plumbing'] };

async function legacy(opts: Record<string, unknown> = {}) {
  const o = loadLegacy({ runAt: RUN_AT, rows: [priced], ...opts });
  await o.runMain();
  const rows = (o.summaries[o.summaries.length - 1]!.records_meta as { audit_table: { rows: Array<{ metric: string; value: unknown; status: string }> } }).audit_table.rows;
  return { o, row: (metric: string) => rows.find((r) => r.metric === metric)! };
}
const baseMatched = { processed: 0, coa_with_cost: 0, coa_with_fallback: 0, archetype_t1: 0, archetype_t2: 0, archetype_t3: 0, archetype_additive: 0, archetype_fit_blocked: 0, archetype_zero_total: 0, archetype_nofit_residential: 0, archetype_unpriceable_t4: 0, null_cost_reasons: { no_parcel: 1, no_scope_tags: 2, no_active_trades: 3, no_matching_rate: 4 }, null_cost_reasons_additive: { no_parcel: 5, no_scope_tags: 6, no_active_trades: 7 } };
function converted(id: string, matchedIn: Record<string, unknown>, post: Record<string, unknown> = {}) {
  const matched = compute.finalizeMatched({ ...baseMatched, ...matchedIn }, { config, post });
  const seen: Record<string, unknown> = {};
  compute.checks[id]({ matched, report: (k: string, o: unknown) => { seen[k] = o; } });
  return { matched, row: checkRow(descriptor.checks.find((c: { id: string }) => c.id === id), seen[id], null, config) };
}

describe('compute_coa_cost_estimates post read ≡ the legacy distribution + corpus reads', () => {
  it('(1) the post statement reads the legacy percentiles (same predicate, same fractions) and the legacy corpus counts', async () => {
    const { o } = await legacy();
    const perc = squash(o.queries.find((q: { sql: string }) => /PERCENTILE_CONT/.test(q.sql))!.sql);
    const corpus = squash(o.queries.find((q: { sql: string }) => /AS priced/.test(q.sql))!.sql);
    const ps = compute.buildPostSql(descriptor, config);
    const post = squash(ps.post_sql);
    // The fractions are bound parameters ($2..$4 = the pinned p25/p50/p75 variables), the run clock is $1 (post_binds).
    expect(ps.post_binds).toEqual(['run_at']);
    expect(ps.post_params).toEqual([0.25, 0.5, 0.75]);
    expect(perc).toContain("FROM cost_estimates WHERE lead_id LIKE 'coa:%' AND computed_at = $1::timestamptz AND estimated_cost IS NOT NULL");
    expect(post).toContain("FROM cost_estimates WHERE lead_id LIKE 'coa:%' AND computed_at = $1::timestamptz AND estimated_cost IS NOT NULL");
    for (const [n, frac] of [[2, '0.25'], [3, '0.50'], [4, '0.75']] as const) {
      expect(perc).toContain(`PERCENTILE_CONT(${frac}) WITHIN GROUP (ORDER BY estimated_cost)`);
      expect(post).toContain(`PERCENTILE_CONT($${n}::float8) WITHIN GROUP (ORDER BY estimated_cost)`);
    }
    expect(corpus).toContain("(SELECT COUNT(*) FROM cost_estimates WHERE lead_id LIKE 'coa:%' AND estimated_cost IS NOT NULL)::int AS priced");
    expect(post).toContain("(SELECT COUNT(*) FROM cost_estimates WHERE lead_id LIKE 'coa:%' AND estimated_cost IS NOT NULL)::int AS coa_corpus_priced");
    expect(corpus).toContain('(SELECT COUNT(*) FROM coa_applications)::int AS total');
    expect(post).toContain('(SELECT COUNT(*) FROM coa_applications)::int AS coa_corpus_total');
  });

  it('(2) the same database answers render the same distribution string and corpus coverage', async () => {
    for (const [percentiles, corpus] of [[{ p25: '100000', p50: '250000', p75: '400000' }, { priced: 3, total: 12 }], [{ p25: '1234.4', p50: null, p75: '99999.5' }, { priced: 0, total: 5 }]] as const) {
      const { row } = await legacy({ percentiles, corpus });
      const { matched } = converted('cost_estimate_coverage_pct', { processed: 1, coa_with_cost: 1 }, { ...percentiles, coa_corpus_priced: corpus.priced, coa_corpus_total: corpus.total });
      expect(matched.cost_distribution_p25_p50_p75).toBe(row('cost_distribution_p25_p50_p75').value);
      expect(`${matched.coa_corpus_cost_coverage_pct.toFixed(1)}%`).toBe(row('coa_corpus_cost_coverage_pct').value);
    }
  });

  it('(3) the coverage check status equals the legacy row on every branch; exactly at the floor is the one named move (Q-CE3)', () => {
    const fail = config.compute_coa_cost_estimates_coverage_fail_pct as number;
    const pass = config.compute_coa_cost_estimates_coverage_threshold_pct as number;
    const legacyStatus = (processed: number, pct: number) => (processed === 0 ? 'INFO' : pct <= fail ? 'FAIL' : pct >= pass ? 'PASS' : 'WARN'); // :738-746, verbatim order
    for (const [processed, withCost] of [[0, 0], [100, 0], [100, 3], [100, 30], [100, 64], [100, 65], [100, 90]] as const) {
      const { row } = converted('cost_estimate_coverage_pct', { processed, coa_with_cost: withCost });
      expect(row.status, `${withCost}/${processed}`).toBe(legacyStatus(processed, processed ? (100 * withCost) / processed : 0));
    }
    const atFloor = converted('cost_estimate_coverage_pct', { processed: 100, coa_with_cost: fail });
    expect(legacyStatus(100, fail)).toBe('FAIL');
    expect(atFloor.row.status).toBe('WARN');
  });

  it('(4) the fixed-key tallies are flat emits with the same numbers (R-DE (iv)); no object emit remains for them', () => {
    const { matched } = converted('cost_estimate_coverage_pct', { processed: 1, coa_with_cost: 1 }, { p25: '1', p50: '2', p75: '3' });
    expect([matched.cost_distribution_p25, matched.cost_distribution_p50, matched.cost_distribution_p75]).toEqual([1, 2, 3]);
    expect([matched.null_cost_reasons_no_parcel, matched.null_cost_reasons_no_scope_tags, matched.null_cost_reasons_no_active_trades, matched.null_cost_reasons_no_matching_rate]).toEqual([1, 2, 3, 4]);
    expect([matched.null_cost_reasons_additive_no_parcel, matched.null_cost_reasons_additive_no_scope_tags, matched.null_cost_reasons_additive_no_active_trades]).toEqual([5, 6, 7]);
    const objectEmits = descriptor.emits.filter((e: { type: string; key: string }) => e.type === 'object').map((e: { key: string }) => e.key);
    expect(objectEmits).toEqual([]);
  });
});
