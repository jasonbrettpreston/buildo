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
//
// WF3 (2026-08-24) — OUTCOME GATE + RATIO FLOOR. Cloud run 32753034613 drove exit 1
// on 6 "pathological, likely axed by the platform timeout" annotations for steps
// that had all COMPLETED with real records (compute_centroids 5.4 min vs a 0.1-min
// starved median = 40.8x, having refilled 9,976 centroids; enrich_parcels 135.6 min
// vs medians of 0.1-1.5 min at n=3-6). A completed step CANNOT have been axed, so:
//   (a) severity consults the OUTCOME, not the ratio alone — a run whose step
//       reached a clean terminal state and wrote its own duration is at most WARN;
//       ERROR/pathological is reserved for the axed shape the message names
//       (failed / ceiling-killed / stranded / unknown-outcome);
//   (b) the ratio is taken against max(median, 1 min) — a sub-minute baseline is
//       dominated by fixed startup cost (spawn + pool connect + advisory lock) and
//       a 6s -> 60s step cannot threaten a 150-min envelope; the floor mutes that
//       noise WITHOUT muting a real blow-up (6s -> 60 min still reads 60x).
// The WARN path is deliberately NOT weakened: creep must still be visible BEFORE
// the ceiling kills it (Spec 118 §7.3).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Trend = {
  level: 'warning' | 'error';
  ratio: number;
  medianMs: number;
  effectiveMedianMs: number;
  currentMs: number;
  completed: boolean;
  status: string | null;
  message: string;
} | null;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const checkChainVerdict = require('../../scripts/check-chain-verdict.js') as {
  classifyDurationTrend: (history: number[], current: number, currentStatus?: string | null) => Trend;
  checkStepDurationTrends: (pool: unknown, chainId: string, executedSteps: string[]) => Promise<unknown[]>;
  COMPLETED_STEP_STATUSES: Set<string>;
  TREND_MEDIAN_FLOOR_MS: number;
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

  // KNOWINGLY UPDATED (WF3 2026-08-24): both of these ERROR locks predate the
  // outcome gate and passed NO status, i.e. they asserted "10x alone => ERROR".
  // That premise is exactly the defect (cloud run 32753034613). The intent they
  // encoded — a step that blew up ~10x-21x and was axed must read ERROR — is
  // preserved by naming the axed outcome explicitly; the ratio-alone reading is
  // knowingly retired, and its inverse (same ratio, COMPLETED) is locked below.
  it('ERROR at exactly 10x the median when the step did NOT complete (the boundary is inclusive)', () => {
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 600_000, 'failed');
    expect(res).not.toBeNull();
    expect(res!.level).toBe('error');
    expect(res!.ratio).toBeCloseTo(10, 5);
  });

  it('ERROR well above 10x (the 08-14 shape: 3min historical, 64min actual = ~21x, platform-axed)', () => {
    const threeMinMs = 3 * 60_000;
    const sixtyFourMinMs = 64 * 60_000;
    const res = checkChainVerdict.classifyDurationTrend(
      [threeMinMs, threeMinMs, threeMinMs, threeMinMs],
      sixtyFourMinMs,
      'running', // stranded row — run-chain never got to write a terminal status
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

describe('classifyDurationTrend — outcome gate (WF3 2026-08-24, cloud run 32753034613)', () => {
  const SIX_SEC = 6_000; // 0.1 min — the starved incremental median

  it('RED-FIRST: the compute_centroids shape — COMPLETED at 40.8x a 0.1-min median is WARN, never FAIL', () => {
    // Live shape: median 0.1 min (n=3+), current 5.4 min, status='completed',
    // 9,976 centroids refilled. Old code: ratio 54 -> ERROR -> exit 1.
    const res = checkChainVerdict.classifyDurationTrend(
      [SIX_SEC, SIX_SEC, SIX_SEC],
      5.4 * 60_000,
      'completed',
    );
    expect(res).not.toBeNull();
    expect(res!.level).toBe('warning');
    expect(res!.completed).toBe(true);
  });

  it('RED-FIRST: the enrich_parcels shape — COMPLETED at 135.6 min vs a 1-min median is WARN, never FAIL', () => {
    // median([0.1, 1.0, 1.5] min) = 1.0 min -> the floor is a no-op here; the
    // ratio really is ~135x. It is still only WARN: the step COMPLETED.
    const res = checkChainVerdict.classifyDurationTrend(
      [SIX_SEC, 60_000, 90_000],
      135.6 * 60_000,
      'completed',
    );
    expect(res).not.toBeNull();
    expect(res!.level).toBe('warning');
    expect(res!.ratio).toBeGreaterThan(100);
  });

  it('RED-FIRST: a WARN message never claims the step was axed', () => {
    const res = checkChainVerdict.classifyDurationTrend([SIX_SEC, SIX_SEC, SIX_SEC], 5.4 * 60_000, 'completed');
    expect(res!.message).not.toMatch(/axed/i);
    expect(res!.message).not.toMatch(/pathological/i);
    // ...and it still says the thing the fence exists to say.
    expect(res!.message).toMatch(/creep/i);
  });

  it('completed_with_warnings and deferred_to_full are clean completions too (at most WARN)', () => {
    for (const status of ['completed_with_warnings', 'deferred_to_full']) {
      const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 600_000, status);
      expect(res!.level, status).toBe('warning');
    }
  });

  it('TRUE POSITIVE: a NON-completed step at 10x is still FAIL, and the message names the axed shape', () => {
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 600_000, 'failed');
    expect(res!.level).toBe('error');
    expect(res!.completed).toBe(false);
    expect(res!.message).toMatch(/pathological/i);
    expect(res!.message).toMatch(/did not complete/i);
    expect(res!.message).toContain('status=failed');
  });

  it('TRUE POSITIVE: a ceiling/platform kill leaves a stranded `running` row — still FAIL at 10x', () => {
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 900_000, 'running');
    expect(res!.level).toBe('error');
  });

  it('an ABSENT/unknown status is NOT treated as a clean completion (unproven outcome fails closed)', () => {
    expect(checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 600_000)!.level).toBe('error');
    expect(checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 600_000, null)!.level).toBe('error');
  });

  it('the WARN fence is NOT weakened — a COMPLETED step at 3x still annotates', () => {
    const res = checkChainVerdict.classifyDurationTrend([60_000, 60_000, 60_000], 180_000, 'completed');
    expect(res).not.toBeNull();
    expect(res!.level).toBe('warning');
  });

  it('the completed set is exactly the clean terminal states (skipped/failed/running are not in it)', () => {
    expect([...checkChainVerdict.COMPLETED_STEP_STATUSES].sort()).toEqual(
      ['completed', 'completed_with_warnings', 'deferred_to_full'],
    );
  });
});

describe('classifyDurationTrend — median floor (WF3 2026-08-24)', () => {
  it('the floor is 1 minute', () => {
    expect(checkChainVerdict.TREND_MEDIAN_FLOOR_MS).toBe(60_000);
  });

  it('RED-FIRST: a 0.1-min median cannot make a 1-min run "10x" — it is SILENT', () => {
    // Old code: 60_000 / 6_000 = 10x -> ERROR -> exit 1 on a step that ran ONE MINUTE.
    expect(checkChainVerdict.classifyDurationTrend([6_000, 6_000, 6_000], 60_000, 'failed')).toBeNull();
  });

  it('the floor does NOT mute a real blow-up off a sub-minute baseline (6s -> 60 min = 60x, FAIL)', () => {
    const res = checkChainVerdict.classifyDurationTrend([6_000, 6_000, 6_000], 60 * 60_000, 'failed');
    expect(res).not.toBeNull();
    expect(res!.level).toBe('error');
    expect(res!.ratio).toBeCloseTo(60, 5);
  });

  it('above the floor the raw median governs — the ratio is unchanged', () => {
    const res = checkChainVerdict.classifyDurationTrend([180_000, 180_000, 180_000], 540_000, 'completed');
    expect(res!.medianMs).toBe(180_000);
    expect(res!.effectiveMedianMs).toBe(180_000);
    expect(res!.ratio).toBeCloseTo(3, 5);
  });

  it('the message reports the RAW trailing median and discloses the floor when it applied', () => {
    const res = checkChainVerdict.classifyDurationTrend([6_000, 6_000, 6_000], 30 * 60_000, 'completed');
    expect(res!.medianMs).toBe(6_000);
    expect(res!.effectiveMedianMs).toBe(60_000);
    expect(res!.message).toContain('0.1 min');   // the raw, starved median
    expect(res!.message).toMatch(/floor/i);       // the floor is disclosed, not hidden
    expect(res!.ratio).toBeCloseTo(30, 5);        // 30 min / 1 min floor, not 300x
  });

  it('a zero median is still a SKIP (a floor must not manufacture a baseline from nothing)', () => {
    expect(checkChainVerdict.classifyDurationTrend([0, 0, 0], 60 * 60_000, 'failed')).toBeNull();
  });
});

describe('checkStepDurationTrends — the outcome gate end-to-end (WF3 2026-08-24)', () => {
  const fakePool = (rowsBySlug: Record<string, Array<{ duration_ms: number; status: string }>>) => ({
    query: (_sql: string, params: unknown[]) =>
      Promise.resolve({ rows: rowsBySlug[String(params[0])] ?? [] }),
  });

  it('the run-32753034613 shape: 2 COMPLETED steps at 40x/135x produce WARNs only — nothing reaches error/exit 1', async () => {
    const pool = fakePool({
      'deep_scrapes:compute_centroids': [
        { duration_ms: 5.4 * 60_000, status: 'completed' }, // the just-finished run
        { duration_ms: 6_000, status: 'completed' },
        { duration_ms: 6_000, status: 'completed' },
        { duration_ms: 6_000, status: 'completed' },
      ],
      'deep_scrapes:enrich_parcels': [
        { duration_ms: 135.6 * 60_000, status: 'completed' },
        { duration_ms: 6_000, status: 'completed' },
        { duration_ms: 60_000, status: 'completed' },
        { duration_ms: 90_000, status: 'completed' },
      ],
    });
    const res = (await checkChainVerdict.checkStepDurationTrends(pool, 'deep_scrapes', [
      'compute_centroids',
      'enrich_parcels',
    ])) as Array<{ slug: string; trend: NonNullable<Trend> }>;
    expect(res.map((r) => r.slug)).toEqual(['compute_centroids', 'enrich_parcels']);
    expect(res.every((r) => r.trend.level === 'warning')).toBe(true);
    expect(res.some((r) => r.trend.level === 'error')).toBe(false);
  });

  it('a genuinely axed step in the same batch still reaches error (the fence is intact end-to-end)', async () => {
    const pool = fakePool({
      'deep_scrapes:refresh_snapshot': [
        { duration_ms: 64 * 60_000, status: 'failed' }, // run-chain's ceiling kill
        { duration_ms: 3 * 60_000, status: 'completed' },
        { duration_ms: 3 * 60_000, status: 'completed' },
        { duration_ms: 3 * 60_000, status: 'completed' },
      ],
    });
    const res = (await checkChainVerdict.checkStepDurationTrends(pool, 'deep_scrapes', [
      'refresh_snapshot',
    ])) as Array<{ slug: string; trend: NonNullable<Trend> }>;
    expect(res).toHaveLength(1);
    expect(res[0]!.trend.level).toBe('error');
  });

  it('a deferred_to_full run in the HISTORY is excluded from the baseline (short by design, must not depress the median)', async () => {
    const pool = fakePool({
      'deep_scrapes:enrich_parcels': [
        { duration_ms: 12 * 60_000, status: 'completed' },
        { duration_ms: 1_000, status: 'deferred_to_full' }, // excluded
        { duration_ms: 4 * 60_000, status: 'completed' },
        { duration_ms: 4 * 60_000, status: 'completed' },
        { duration_ms: 4 * 60_000, status: 'completed' },
      ],
    });
    const res = (await checkChainVerdict.checkStepDurationTrends(pool, 'deep_scrapes', [
      'enrich_parcels',
    ])) as Array<{ slug: string; trend: NonNullable<Trend> }>;
    expect(res[0]!.trend.medianMs).toBe(4 * 60_000); // not 1s, not a 3-value median including the defer
    expect(res[0]!.trend.ratio).toBeCloseTo(3, 5);
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

  it('checkStepDurationTrends passes the CURRENT row status into classifyDurationTrend (the outcome gate is wired, not just implemented)', () => {
    expect(SRC).toMatch(/classifyDurationTrend\(\s*historyMs,\s*currentMs,\s*current\.status\s*\)/);
  });

  it('the current-row status is SELECTed (the gate cannot read what the query does not fetch)', () => {
    expect(SRC).toMatch(/SELECT duration_ms, status FROM pipeline_runs/);
  });

  it('the per-step trend check runs BEFORE classifyVerdict (visible even on a chain that also failed)', () => {
    const trendIdx = SRC.indexOf('checkStepDurationTrends(pool');
    const verdictIdx = SRC.indexOf('classifyVerdict(latest)');
    expect(trendIdx).toBeGreaterThan(-1);
    expect(verdictIdx).toBeGreaterThan(-1);
    expect(trendIdx).toBeLessThan(verdictIdx);
  });
});
