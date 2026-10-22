// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-EH (c) (finalizeMatched derives the run-level values once
//            over the runner-summed matched), R-EX (the settled rerun proof: a second run streams nothing)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (1) (every declared check reads a measurement)
//
// classify_coa_trades on an EMPTY cursor (Night A-swap 2026-10-22: the settled POST capture, COA-ASWAP). The runner sums
// per-batch `matched` over zero batches, so finalizeMatched receives {} (scripts/lib/step/index.js:3517-3525). The legacy
// step read 0 for every counter on an empty cursor (finalizeMatched comment "Legacy parity (pinned L16): an empty cursor reads
// 0, never N/A"); before this fix slug_resolution_miss_count / product_slug_miss_count / processed came out undefined, the two
// FAIL invariants rendered "unevaluable" and a settled run recorded a FAILED pipeline_runs row.
import { describe, it, expect } from 'vitest';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
/* eslint-disable @typescript-eslint/no-require-imports -- the real CJS module under test */
const compute = require(path.join(ROOT, 'scripts/lib/compute/classify-coa-trades.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

describe('classify_coa_trades finalizeMatched over an empty cursor (runner sum of zero batches)', () => {
  const out = compute.finalizeMatched({}, { config: { classify_coa_trades_max_detail_keys: 5, p16_inference_layer_enabled: 1 }, post: {} });

  it('reads 0 for every additive counter a declared check reports', () => {
    for (const k of ['processed', 'slug_resolution_miss_count', 'product_slug_miss_count', 'coa_zero_trades', 'residential_count', 'realtor_unavailable']) {
      expect(out[k], k).toBe(0);
    }
  });

  it('keeps the legacy empty-cursor derivations (unmapped_scope_pct reads 0, ratios stay null)', () => {
    expect(out.unmapped_scope_pct).toBe(0);
    expect(out.slug_resolution_misses).toEqual([]);
    expect(out.realtor_inclusion_pct).toBeNull();
    expect(out.avg_active_trades_per_lead).toBeNull();
  });

  it('leaves a non-empty sum untouched (the summed value wins over the zero default)', () => {
    const non = compute.finalizeMatched({ processed: 7, slug_resolution_miss_count: 2, slug_resolution_miss_slugs: ['x'] }, { config: { classify_coa_trades_max_detail_keys: 5, p16_inference_layer_enabled: 1 }, post: {} });
    expect(non.processed).toBe(7);
    expect(non.slug_resolution_miss_count).toBe(2);
    expect(non.slug_resolution_misses).toEqual(['x']);
  });
});
