// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-CQ
//
// R-CQ (2026-10-15, Mac mini): the pre-job memory floor is `memory_pressure -Q`
// free ≥ 25 %, replacing the Windows-era "≥ 4 GB free". The line is printed by
// scripts/ai-env-check.mjs; the parse + classify logic is locked here.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { HOST_MEMORY_FLOOR_PCT, parseMemoryPressureFreePct, hostMemoryLine } = require('../../scripts/lib/host-memory.js') as {
  HOST_MEMORY_FLOOR_PCT: number;
  parseMemoryPressureFreePct: (t: string | null) => number | null;
  hostMemoryLine: (platform: string, t: string | null) => string;
};

// Real `memory_pressure -Q` output captured on the Mac mini 2026-10-15.
const probe = (pct: number) =>
  `The system has 25769803776 (1572864 pages with a page size of 16384).\nSystem-wide memory free percentage: ${pct}%\n`;

describe('host memory floor (Spec 124 R-CQ)', () => {
  it('the floor is 25 % (operator 2026-10-15; lowest measured under two concurrent suites = 40 %)', () => {
    expect(HOST_MEMORY_FLOOR_PCT).toBe(25);
  });

  it('parses the free percentage from real memory_pressure -Q output', () => {
    expect(parseMemoryPressureFreePct(probe(64))).toBe(64);
    expect(parseMemoryPressureFreePct('no such line')).toBeNull();
    expect(parseMemoryPressureFreePct(null)).toBeNull();
  });

  it('at or above the floor → ✔; below → ⚠ with the wait/park instruction', () => {
    expect(hostMemoryLine('darwin', probe(25))).toMatch(/^✔ Host memory: 25% free/);
    expect(hostMemoryLine('darwin', probe(24))).toMatch(/^⚠ {2}Host memory: 24% free < R-CQ floor 25%.*park/);
  });

  it('an unreadable probe is a WARN, never a silent pass', () => {
    expect(hostMemoryLine('darwin', '')).toMatch(/^⚠ {2}Host memory: probe FAILED/);
  });

  it('non-macOS hosts report skipped (the probe is macOS-only)', () => {
    expect(hostMemoryLine('linux', null)).toMatch(/^⚠ {2}Host memory: skipped/);
  });
});
