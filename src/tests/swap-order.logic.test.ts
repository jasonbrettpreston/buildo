// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EQ
//
// R-EQ (P4-SWAP; McDonald's Airtight V3, operator y 2026-10-19): a pending step at compute_ported may swap its frozen
// shell before ③ (stage runner_wired, POST captures the same night: G8 is not excluded at runner_wired), only after
// every declared upstream (`inputs.reads.steps[]`) is converted or itself swapped — never before the coa root ②.
// Fast invariant #54 SWAP-ORDER (scripts/analysis/gates/swap-order.mjs). Converted[] registration and the legacy-name
// retirement stay ③'s (EP-PIN-D17).

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

type Input = {
  converted: string[];
  pending: Array<{ file: string; stage: string }>;
  scripts: Record<string, { file: string }>;
  descriptorOf: (relFile: string) => unknown;
};
type Result = { pass: boolean; violations: string[]; blockedSlugs: string[] };
type SwapMod = {
  checkSwapOrder: (input: Input, awaits: (s: string) => boolean) => Result;
  loadSwapOrderInput: (root: string) => Input;
  SWAPPED_STAGES: readonly string[];
  selfTest: () => { ok: boolean };
};
type SvMod = { stageAwaitsCaptures: (s?: string) => boolean };

const ROOT = process.cwd();
const loadSwap = async (): Promise<SwapMod> =>
  (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/gates/swap-order.mjs')).href)) as unknown as SwapMod;
const loadSv = async (): Promise<SvMod> =>
  (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as SvMod;

/** The real tree with one pending entry's declared stage replaced (a projection, nothing written). */
function withStage(input: Input, file: string, stage: string): Input {
  return { ...input, pending: input.pending.map((p) => (p.file === file ? { ...p, stage } : p)) };
}

describe('R-EQ — #54 SWAP-ORDER: no shell swap before its upstreams', () => {
  it('the subject stages are the shell-swapped ones of the closed R-K vocabulary', async () => {
    const { SWAPPED_STAGES } = await loadSwap();
    expect([...SWAPPED_STAGES]).toEqual(['runner_wired', 'shape_clean', 'shape_clean_pending_recapture']);
  });

  it('GREEN: the committed tree has zero violations', async () => {
    const { checkSwapOrder, loadSwapOrderInput } = await loadSwap();
    const { stageAwaitsCaptures } = await loadSv();
    expect(checkSwapOrder(loadSwapOrderInput(ROOT), stageAwaitsCaptures).violations).toEqual([]);
  });

  it('RED: classify_coa_trades swapped while its upstream classify_coa_scope is before ② (red_suite)', async () => {
    const { checkSwapOrder, loadSwapOrderInput } = await loadSwap();
    const { stageAwaitsCaptures } = await loadSv();
    const base = loadSwapOrderInput(ROOT);
    const swapped = withStage(withStage(base, 'scripts/classify-coa-trades.js', 'runner_wired'), 'scripts/classify-coa-scope.js', 'red_suite');
    const r = checkSwapOrder(swapped, stageAwaitsCaptures);
    expect(r.blockedSlugs).toEqual(['classify_coa_trades']);
    expect(r.violations.join('\n')).toContain('classify_coa_trades (runner_wired) ← classify_coa_scope: pending at red_suite');
  });

  it('RED: swapped while the upstream is still in its copy window (compute_ported); GREEN once the upstream swaps', async () => {
    const { checkSwapOrder, loadSwapOrderInput } = await loadSwap();
    const { stageAwaitsCaptures } = await loadSv();
    const base = withStage(loadSwapOrderInput(ROOT), 'scripts/classify-coa-trades.js', 'runner_wired');
    const copy = checkSwapOrder(withStage(base, 'scripts/classify-coa-scope.js', 'compute_ported'), stageAwaitsCaptures);
    expect(copy.blockedSlugs).toEqual(['classify_coa_trades']);
    const both = checkSwapOrder(withStage(base, 'scripts/classify-coa-scope.js', 'runner_wired'), stageAwaitsCaptures);
    expect(both.blockedSlugs).not.toContain('classify_coa_trades');
  });

  // rule-map: Q-R-EQ-1 — #54 fails a runner_wired step whose upstream is unregistered (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
  it('RED: an upstream that is neither converted nor pending (unconverted legacy) has neither swapped nor been captured', async () => {
    const { checkSwapOrder, loadSwapOrderInput } = await loadSwap();
    const { stageAwaitsCaptures } = await loadSv();
    // assert_coa_freshness declares link_coa (scripts/link-coa.js), which is in neither list.
    const r = checkSwapOrder(withStage(loadSwapOrderInput(ROOT), 'scripts/quality/assert-coa-freshness.js', 'runner_wired'), stageAwaitsCaptures);
    expect(r.violations.join('\n')).toContain('assert_coa_freshness (runner_wired) ← link_coa: unconverted, not in pending[]');
  });

  it('R-JM: with the owed descriptor edit (link_coa dropped from the two reads.steps), the four CoA shells swapped together have zero violations; without it exactly the two link_coa violations remain', async () => {
    const { checkSwapOrder, loadSwapOrderInput } = await loadSwap();
    const { stageAwaitsCaptures } = await loadSv();
    let swapped = loadSwapOrderInput(ROOT);
    for (const f of ['scripts/quality/assert-coa-freshness.js', 'scripts/classify-coa-scope.js', 'scripts/classify-coa-trades.js', 'scripts/compute-coa-cost-estimates.js']) {
      swapped = withStage(swapped, f, 'runner_wired');
    }
    // The descriptor edit moves source_fingerprint, so it lands with the swap night's recaptures (R-JM OWED-NIGHT,
    // ~/Buildo-scratch/linkcoa/rjm-descriptors.patch); here it is applied in memory.
    const dropLink = (rel: string) => {
      const d = swapped.descriptorOf(rel) as { inputs?: { reads?: { steps?: Array<{ step: string }> } } } | null;
      if (d?.inputs?.reads?.steps) d.inputs.reads.steps = d.inputs.reads.steps.filter((x) => x.step !== 'link_coa');
      return d;
    };
    const before = checkSwapOrder(swapped, stageAwaitsCaptures);
    expect(before.violations.map((v) => v.replace(/:.*/, ''))).toEqual(['assert_coa_freshness (runner_wired) ← link_coa', 'classify_coa_scope (runner_wired) ← link_coa']);
    const after = checkSwapOrder({ ...swapped, descriptorOf: dropLink }, stageAwaitsCaptures);
    expect(after.violations).toEqual([]);
    expect(after.pass).toBe(true);
  });

  it('the module self-test passes', async () => {
    const { selfTest } = await loadSwap();
    expect(selfTest().ok).toBe(true);
  });
});
