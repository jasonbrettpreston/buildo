// 🔗 SPEC LINK: docs/reports/lifecycle_phase_implementation.md (Phase 4)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) =>
  fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

describe('scripts/compute-trade-forecasts.js — script shape', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/compute-trade-forecasts.js');
  });

  it('uses pipeline.run wrapper', () => {
    expect(content).toMatch(
      /pipeline\.run\(\s*['"]compute-trade-forecasts['"]/,
    );
  });

  it('imports TRADE_TARGET_PHASE from shared lib', () => {
    expect(content).toMatch(/TRADE_TARGET_PHASE/);
    expect(content).toMatch(/require\(['"]\.\/lib\/lifecycle-phase['"]\)/);
  });

  it('loads calibration data into a nested Map', () => {
    expect(content).toMatch(/calMap/);
    expect(content).toMatch(/new Map\(\)/);
    expect(content).toMatch(/FROM phase_calibration/);
  });

  it('implements 4-level fallback hierarchy + default', () => {
    expect(content).toMatch(/lookupCalibration/);
    expect(content).toMatch(/exact/);
    expect(content).toMatch(/fallback_all_types/);
    expect(content).toMatch(/fallback_issued_type/);
    expect(content).toMatch(/fallback_issued_all/);
    expect(content).toMatch(/default/);
  });

  it('queries active permit-trade pairs via JOIN', () => {
    expect(content).toMatch(/permit_trades pt/);
    expect(content).toMatch(/JOIN trades t/);
    expect(content).toMatch(/JOIN permits p/);
    expect(content).toMatch(/pt\.is_active = true/);
  });

  it('skips terminal, orphan (including O4), and CoA phases', () => {
    expect(content).toMatch(/SKIP_PHASES/);
    expect(content).toMatch(/'P19'/);
    expect(content).toMatch(/'P20'/);
    expect(content).toMatch(/'O1'/);
    expect(content).toMatch(/'O4'/); // independent D3: defensive skip
  });

  it('purges stale forecasts for permits now in terminal/orphan phases', () => {
    // Independent D4 + adversarial Probe 4: permits that transition
    // to P19/P20 keep stale forecast rows because the script skips them.
    expect(content).toMatch(/DELETE FROM trade_forecasts/);
    expect(content).toMatch(/stalePurged/);
  });

  it('detects permits already past target phase via ordinal comparison (including P18)', () => {
    expect(content).toMatch(/PHASE_ORDINAL/);
    expect(content).toMatch(/isPastTarget/);
    expect(content).toMatch(/currentOrdinal.*>=.*targetOrdinal/);
    // P18 must have an ordinal (independent D2 + adversarial Probe 3)
    expect(content).toMatch(/P18:\s*4/);
  });

  it('uses pre-construction → ISSUED fallback for P3-P8/P7* but NOT P18', () => {
    expect(content).toMatch(/PRE_CONSTRUCTION_PHASES/);
    expect(content).toMatch(/'ISSUED'/);
    // P18 must NOT be in PRE_CONSTRUCTION_PHASES (adversarial Probe 2)
    const preConMatch = content.match(/PRE_CONSTRUCTION_PHASES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(preConMatch).toBeTruthy();
    expect(preConMatch![1]).not.toMatch(/P18/);
  });

  it('classifies urgency with correct thresholds', () => {
    expect(content).toMatch(/classifyUrgency/);
    expect(content).toMatch(/overdue/);
    expect(content).toMatch(/delayed/);
    expect(content).toMatch(/imminent/);
    expect(content).toMatch(/upcoming/);
    expect(content).toMatch(/on_time/);
    // Threshold checks
    expect(content).toMatch(/<= -30/);
    expect(content).toMatch(/<= 0/);
    expect(content).toMatch(/<= 14/);
    expect(content).toMatch(/<= 30/);
  });

  it('classifies confidence from sample_size', () => {
    expect(content).toMatch(/classifyConfidence/);
    expect(content).toMatch(/>= 30/);
    expect(content).toMatch(/>= 10/);
  });

  it('batch-upserts into trade_forecasts with ON CONFLICT', () => {
    expect(content).toMatch(/INSERT INTO trade_forecasts/);
    expect(content).toMatch(
      /ON CONFLICT \(permit_num, revision_num, trade_slug\)/,
    );
    expect(content).toMatch(/DO UPDATE SET/);
  });

  it('uses 11 params per row (no computed_at in VALUES — DEFAULT handles it)', () => {
    expect(content).toMatch(/j \* 11/);
    // The INSERT column list must NOT include computed_at
    const insertMatch = content.match(
      /INSERT INTO trade_forecasts\s*\([^)]+\)/,
    );
    expect(insertMatch).toBeTruthy();
    expect(insertMatch![0]).not.toMatch(/computed_at/);
  });

  it('emits PIPELINE_SUMMARY with urgency distribution', () => {
    expect(content).toMatch(/pipeline\.emitSummary/);
    expect(content).toMatch(/urgency_distribution/);
    expect(content).toMatch(/forecasts_computed/);
  });

  it('logs unmapped trades as a warning', () => {
    expect(content).toMatch(/unmappedTrades/);
    expect(content).toMatch(/pipeline\.log\.warn/);
  });
});
