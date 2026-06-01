// SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md
//
// Unit boundary tests for the pure calibratedStatus() helper used by
// assert-global-coverage.js calibratedRow (WF3 #406, DEC-1 gated zoning_class).
// Re-review fold (Gemini MED#5 + DeepSeek LOW#4): direct PASS/WARN/FAIL/INFO
// boundary coverage + the warnPct < passPct guard that prevents inverted
// thresholds from silently mis-statusing.

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { calibratedStatus } = require('../../scripts/lib/coverage-status.js');

describe('calibratedStatus — boundary logic (DEC-1 80/75 gate)', () => {
  it('PASS exactly at the pass floor (80.0 with pass=80)', () => {
    expect(calibratedStatus(80.0, 80, 75)).toBe('PASS');
  });

  it('PASS above the floor (83.6 — live permits coverage)', () => {
    expect(calibratedStatus(83.6, 80, 75)).toBe('PASS');
  });

  it('WARN just below the pass floor (79.9)', () => {
    expect(calibratedStatus(79.9, 80, 75)).toBe('WARN');
  });

  it('WARN exactly at the warn floor (75.0 with warn=75)', () => {
    expect(calibratedStatus(75.0, 80, 75)).toBe('WARN');
  });

  it('FAIL just below the warn floor (74.9)', () => {
    expect(calibratedStatus(74.9, 80, 75)).toBe('FAIL');
  });

  it('INFO when pct is null (no denominator)', () => {
    expect(calibratedStatus(null, 80, 75)).toBe('INFO');
  });

  it('throws when warnPct >= passPct (inverted thresholds — DeepSeek LOW#4 guard)', () => {
    expect(() => calibratedStatus(90, 75, 80)).toThrow(/warnPct must be < passPct/);
    expect(() => calibratedStatus(90, 80, 80)).toThrow(/warnPct must be < passPct/);
  });
});
