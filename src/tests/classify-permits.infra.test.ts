// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step-13
// SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3 (is_active always-true WF1)
//
// Infra tests for scripts/classify-permits.js:
//   (a) is_active is ALWAYS true — phase-based time-gating removed (WF1)
//   (b) isTradeActiveInPhase still exists for the lead-score +15 phase boost
//   (c) --full mode support
//   (d) Advisory lock, streaming, dual code path shape

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'classify-permits.js');
const TS_PATH = path.join(
  REPO_ROOT,
  'src',
  'lib',
  'classification',
  'classifier.ts',
);

function src(): string {
  return fs.readFileSync(SCRIPT_PATH, 'utf8');
}
function tsSrc(): string {
  return fs.readFileSync(TS_PATH, 'utf8');
}

describe('classify-permits.js — file existence', () => {
  it('script file exists', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });
});

describe('classify-permits.js — is_active always true (WF1: phase time-gate removed)', () => {
  it('is_active is hardcoded to true in classifyPermit — never set from isTradeActiveInPhase result', () => {
    const content = src();
    // Must NOT assign is_active from the isActive variable inside classifyPermit
    expect(content).not.toMatch(/is_active\s*:\s*isActive/);
    // Must NOT call isTradeActiveInPhase and assign result to is_active directly
    expect(content).not.toMatch(/is_active\s*:\s*isTradeActiveInPhase/);
  });

  it('all four classification tiers set is_active: true', () => {
    const content = src();
    // Count occurrences of is_active: true in tradeMatch objects — must be >= 4
    const matches = content.match(/is_active\s*:\s*true/g);
    expect(matches).toBeTruthy();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('isTradeActiveInPhase function still exists — used by calculateLeadScore for +15 boost', () => {
    const content = src();
    expect(content).toMatch(/function isTradeActiveInPhase/);
    // Must still be called inside calculateLeadScore for the phase-match boost
    expect(content).toMatch(/isTradeActiveInPhase\(match\.trade_slug/);
  });

  it('calculateLeadScore still awards +15 boost for phase-matching trades', () => {
    const content = src();
    expect(content).toMatch(/isTradeActiveInPhase/);
    expect(content).toMatch(/score\s*\+=\s*15/);
  });
});

describe('classifier.ts — dual code path mirrors is_active: true (§7.1)', () => {
  it('TS classifier does not set is_active from isTradeActiveInPhase result', () => {
    const content = tsSrc();
    expect(content).not.toMatch(/is_active\s*:\s*isActive\b/);
    expect(content).not.toMatch(/is_active\s*:\s*isTradeActiveInPhase/);
  });

  it('TS classifier sets is_active: true at all trade match sites', () => {
    const content = tsSrc();
    const matches = content.match(/is_active\s*:\s*true/g);
    expect(matches).toBeTruthy();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('classify-permits.js — protocol compliance', () => {
  it('uses ADVISORY_LOCK_ID = 88 with pipeline.withAdvisoryLock', () => {
    const content = src();
    expect(content).toMatch(/ADVISORY_LOCK_ID\s*=\s*88/);
    expect(content).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
  });

  it('supports --full re-run via pipeline.isFullMode()', () => {
    const content = src();
    expect(content).toMatch(/pipeline\.isFullMode\(\)/);
    expect(content).toMatch(/fullMode/);
  });

  it('uses keyset-paginated pool.query loop for the main permit scan', () => {
    const content = src();
    // classify-permits uses keyset pagination (while-true + cursor) rather than streamQuery
    expect(content).toMatch(/while\s*\(\s*true\s*\)/);
    expect(content).toMatch(/permit_num.*revision_num.*>\s*\(\s*\$\d+/);
  });

  it('emits PIPELINE_SUMMARY with audit_table', () => {
    const content = src();
    expect(content).toMatch(/pipeline\.emitSummary/);
    expect(content).toMatch(/audit_table\s*:/);
  });

  it('emits PIPELINE_META with reads and writes', () => {
    const content = src();
    expect(content).toMatch(/pipeline\.emitMeta/);
    expect(content).toMatch(/permit_trades/);
  });
});
