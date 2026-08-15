// SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §7.3
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
//
// WF3 F3 (2026-08-15) — the step-duration TREND tripwire: "the instrument whose
// absence cost two of the three [08-12/13/14] failure days" (Spec 118 §1). Every
// gate this repo had compared a VALUE against a THRESHOLD; none compared a value
// against its OWN HISTORY. classifyDurationTrend() is that instrument, generalized
// to every step of every chain (not just deep_scrapes' refresh_snapshot).
//
// WARN >= 3x the trailing median, ERROR >= 10x; median (not mean — a single
// blown-up run must not drag the baseline up with it); <3 usable history points
// is a SILENT skip (never annotate, never a spurious ratio from near-nothing).
// Carrier: GH annotations + exit code, never an audit row (this CLI is outside the
// Spec 47 skeleton — deliberate deviation, per this file's existing convention).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const checkChainVerdict = require('../../scripts/check-chain-verdict.js') as {
  classifyDurationTrend: (history: number[], current: number) =>
    { level: 'warning' | 'error'; ratio: number; medianMs: number; currentMs: number; message: string } | null;
  checkStepDurationTrends: (pool: unknown, chainId: string, executedSteps: string[]) => Promise<unknown[]>;
};

const SRC = readFileSync(join(process.cwd(), 'scripts/check-chain-verdict.js'), 'utf8');

describe('check-chain-verdict.js — classifyDurationTrend (WF3 F3)', () => {
  it('is exported (export-absence IS the red-first diagnostic)', () => {
    expect(typeof checkChainVerdict.classifyDurationTrend).toBe('function');
    expect(typeof checkChainVerdict.checkStepDurationTrends).toBe('function');
  });

  it('insufficient history (0, 1, or 2 usable points) is a SILENT skip — never annotates', () => {
    expect(checkChainVerdict.classifyDurationTrend([], 999_999)).toBeNull();
    expect(checkChainVerdict.classifyDurationTrend([60_000], 999_999)).toBeNull();
    expect(checkChainVerdict.classifyDurationTrend([60_000, 65_000], 999_999)).toBeNull();
  });

  it('EXACTLY 3 usable history points is sufficient (the stated floor, not 4)', () => {
    // median([60,60,60]s) = 60s; current = 300s = 5x -> warning.
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 300_000);
    expect(res).not.toBeNull();
    expect(res!.level).toBe('warning');
  });

  it('stays silent (null) below the 3x boundary', () => {
    // median = 60s; current = 179s -> ratio 2.98... < 3.
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 179_000);
    expect(res).toBeNull();
  });

  it('WARN at exactly 3x the median (the boundary is inclusive)', () => {
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 180_000);
    expect(res).not.toBeNull();
    expect(res!.level).toBe('warning');
    expect(res!.ratio).toBeCloseTo(3, 5);
  });

  it('stays WARN just under the 10x boundary', () => {
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 599_000);
    expect(res).not.toBeNull();
    expect(res!.level).toBe('warning');
  });

  it('ERROR at exactly 10x the median (the boundary is inclusive)', () => {
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 600_000);
    expect(res).not.toBeNull();
    expect(res!.level).toBe('error');
    expect(res!.ratio).toBeCloseTo(10, 5);
  });

  it('ERROR well above 10x (the 08-14 shape: 3min historical, 64min actual = ~21x)', () => {
    const threeMinMs = 3 * 60_000;
    const sixtyFourMinMs = 64 * 60_000;
    const res = checkChainVerdict.classifyDurationTrend(
      [threeMinMs, threeMinMs, threeMinMs, threeMinMs],
      sixtyFourMinMs,
    );
    expect(res).not.toBeNull();
    expect(res!.level).toBe('error');
    expect(res!.ratio).toBeGreaterThan(20);
  });

  it('MEDIAN, not mean — one blown-up history point does not drag the baseline up', () => {
    // History: [60s, 60s, 3000s] — mean = 1040s, median = 60s.
    // current = 250s: against the MEAN (1040s) this would be < 1x (silent);
    // against the MEDIAN (60s) it is ~4.2x -> warning. The median lock is what
    // makes this fire; a mean-based implementation would wrongly stay silent.
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 3_000_000], 250_000);
    expect(res).not.toBeNull();
    expect(res!.level).toBe('warning');
    expect(res!.medianMs).toBe(60_000);
  });

  it('MEDIAN of an even-length history averages the two middle values', () => {
    // [60s, 60s, 60s, 180s] sorted -> median = (60+60)/2 = 60s.
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000, 180_000], 180_000);
    expect(res!.medianMs).toBe(60_000);
  });

  it('non-finite / negative inputs never crash and never fabricate a warning', () => {
    expect(checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], NaN)).toBeNull();
    expect(checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], -1)).toBeNull();
    expect(checkChainVerdict.classifyDurationTrend([NaN, NaN, NaN], 60_000)).toBeNull();
    expect(checkChainVerdict.classifyDurationTrend([0, 0, 0], 60_000)).toBeNull(); // median 0 -> no ratio
  });

  it('the message names the live duration, the trailing median, and the ratio (actionable without reading code)', () => {
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 600_000);
    expect(res!.message).toContain('10.0x');
    expect(res!.message).toContain('1.0 min'); // trailing median
    expect(res!.message).toContain('10.0 min'); // current
  });
});

describe('check-chain-verdict.js — source-level wiring (WF3 F3)', () => {
  it('checkStepDurationTrends probes exactly LIMIT 7 (current + trailing history in one query)', () => {
    expect(SRC).toMatch(/LIMIT 7/);
  });

  it('NEVER produces the banned single-row ORDER BY started_at DESC + LIMIT-digit-1 text anywhere in this file', () => {
    // The defer-suite ⑧-lock (run-chain-defer.logic.test.ts) has no word boundary
    // after the digit — LIMIT 10-19 also trip it. This is the SAME lock, re-pinned
    // here so F3's own additions can never silently reintroduce it.
    const banned = /ORDER BY started_at DESC\s+LIMIT 1/;
    expect(banned.test(SRC)).toBe(false);
  });

  it('the executed-step list is sourced from records_meta.step_completeness.executed', () => {
    expect(SRC).toMatch(/step_completeness\?\.\executed|step_completeness\.executed/);
  });

  it('ERROR-level trends set process.exitCode = 1; WARN-level trends never do', () => {
    expect(SRC).toMatch(/hasErrorTrend/);
    expect(SRC).toMatch(/hasErrorTrend[\s\S]{0,60}process\.exitCode = 1/);
  });

  it('carrier is GH annotations (::warning/::error), not a records_meta audit row — the file emits no PIPELINE_SUMMARY', () => {
    expect(SRC).toMatch(/::warning title=Step duration trend::/);
    expect(SRC).toMatch(/::error title=Step duration trend::/);
    expect(SRC).not.toMatch(/PIPELINE_SUMMARY/);
  });

  it('the per-step trend check runs BEFORE classifyVerdict (visible even on a chain that also failed)', () => {
    const trendIdx = SRC.indexOf('checkStepDurationTrends(pool');
    const verdictIdx = SRC.indexOf('classifyVerdict(latest)');
    expect(trendIdx).toBeGreaterThan(-1);
    expect(verdictIdx).toBeGreaterThan(-1);
    expect(trendIdx).toBeLessThan(verdictIdx);
  });
});
