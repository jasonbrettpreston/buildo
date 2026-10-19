// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-EP (dynamic-keyed telemetry is a check-row detail),
//            R-DE (iv) (emits are flat), R-EB (a) (step_audit_value_max_chars)
//
// classify_coa_trades (operator y 2026-10-19, R-EP): trade_slug_distribution and coa_trades_per_lead_histogram have
// keys unknown at declaration, so they are not emits. They travel as the avg_active_trades_per_lead row's detail,
// capped by classify_coa_trades_max_detail_keys, with a _truncated flag read from the slice.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
/* eslint-disable @typescript-eslint/no-require-imports -- the real CJS / ESM modules under test */
const compute = require(path.join(ROOT, 'scripts/lib/compute/classify-coa-trades.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const descriptor = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/classify-coa-trades.descriptor.json'), 'utf8'));

type Observation = { value: unknown; detail?: unknown; inert?: boolean };

function observe(matched: Record<string, unknown>, cap: number): Observation {
  const seen: Record<string, Observation> = {};
  const ctx = { matched, config: { classify_coa_trades_max_detail_keys: cap }, report: (id: string, o: never) => { seen[id] = o; } };
  compute.checks.avg_active_trades_per_lead(ctx);
  const o = seen.avg_active_trades_per_lead;
  if (!o) throw new Error('avg_active_trades_per_lead was not reported');
  return o;
}

describe('classify_coa_trades — Spec 124 R-EP', () => {
  it('declares neither dynamic-keyed tally as an emit, and every remaining emit is flat (R-DE (iv))', async () => {
    const keys = descriptor.emits.map((e: { key: string }) => e.key);
    expect(keys).not.toContain('trade_slug_distribution');
    expect(keys).not.toContain('coa_trades_per_lead_histogram');
    const { emitShapeViolations } = await import(path.join(ROOT, 'scripts/analysis/gates/emits-equiv.mjs'));
    expect(emitShapeViolations(descriptor)).toEqual([]);
  });

  it('carries both tallies in the avg_active_trades_per_lead detail beside the measured mean', () => {
    const o = observe({
      coa_with_active_trades: 2, avg_active_trades_per_lead: 2.5,
      trade_slug_distribution: { plumbing: 2, realtor: 2, framing: 1 },
      coa_trades_per_lead_histogram: { 10: 1, 2: 1, 0: 1 },
    }, 50);
    expect(o.value).toBe(2.5);
    expect(o.detail).toEqual({
      avg_active_trades_per_lead: 2.5,
      trade_slug_distribution: { plumbing: 2, realtor: 2, framing: 1 },
      trade_slug_distribution_truncated: false,
      coa_trades_per_lead_histogram: { 0: 1, 2: 1, 10: 1 },
      coa_trades_per_lead_histogram_truncated: false,
    });
    // Ordered: slugs by count desc then name; histogram buckets numerically.
    const d = o.detail as Record<string, Record<string, number>>;
    expect(Object.keys(d.trade_slug_distribution ?? {})).toEqual(['plumbing', 'realtor', 'framing']);
  });

  it('caps each tally at classify_coa_trades_max_detail_keys and flags the truncation', () => {
    const o = observe({
      coa_with_active_trades: 3, avg_active_trades_per_lead: 1,
      trade_slug_distribution: { a: 1, b: 3, c: 2 },
      coa_trades_per_lead_histogram: { 3: 1, 1: 1, 2: 1 },
    }, 2);
    expect(o.detail).toMatchObject({
      trade_slug_distribution: { b: 3, c: 2 }, trade_slug_distribution_truncated: true,
      coa_trades_per_lead_histogram: { 1: 1, 2: 1 }, coa_trades_per_lead_histogram_truncated: true,
    });
  });

  it('keeps the empty-population row unchanged (legacy INFO N/A)', () => {
    expect(observe({ coa_with_active_trades: 0, trade_slug_distribution: {}, coa_trades_per_lead_histogram: { 0: 4 } }, 50))
      .toEqual({ value: 0, inert: true, detail: 'N/A' });
  });
});
