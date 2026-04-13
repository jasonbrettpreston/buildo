// 🔗 SPEC LINK: Opportunity Score Engine
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

describe('scripts/compute-opportunity-scores.js — script shape', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/compute-opportunity-scores.js');
  });

  it('uses pipeline.run wrapper', () => {
    expect(content).toMatch(/pipeline\.run\(\s*['"]compute-opportunity-scores['"]/);
  });

  it('JOINs trade_forecasts + cost_estimates + lead_analytics', () => {
    expect(content).toMatch(/trade_forecasts tf/);
    expect(content).toMatch(/cost_estimates ce/);
    expect(content).toMatch(/lead_analytics la/);
  });

  it('extracts per-trade dollar value from JSONB', () => {
    expect(content).toMatch(/trade_contract_values/);
    expect(content).toMatch(/tradeValue/);
  });

  it('computes base from trade value normalized by control panel divisor', () => {
    // Now uses vars.los_base_divisor from logic_variables (was hardcoded 10000)
    expect(content).toMatch(/tradeValue \/ vars\.los_base_divisor/);
    expect(content).toMatch(/Math\.min/);
  });

  it('applies urgency multiplier (bid=2.5, work=1.5)', () => {
    expect(content).toMatch(/2\.5/);
    expect(content).toMatch(/1\.5/);
    expect(content).toMatch(/target_window === 'bid'/);
  });

  it('applies competition penalty from control panel variables', () => {
    // Now uses vars.los_penalty_tracking + vars.los_penalty_saving
    expect(content).toMatch(/tracking_count \* vars\.los_penalty_tracking/);
    expect(content).toMatch(/saving_count \* vars\.los_penalty_saving/);
  });

  it('clamps score to 0-100', () => {
    expect(content).toMatch(/Math\.max\(0/);
    expect(content).toMatch(/Math\.min\(100/);
  });

  it('runs integrity audit for tracked leads missing geometric basis', () => {
    expect(content).toMatch(/integrityFlags/);
    expect(content).toMatch(/modeled_gfa_sqm/);
    expect(content).toMatch(/tracking_count > 0/);
  });

  it('batch-updates opportunity_score via VALUES', () => {
    expect(content).toMatch(/UPDATE trade_forecasts/);
    expect(content).toMatch(/opportunity_score = v\.score/);
  });

  it('emits score distribution in telemetry', () => {
    expect(content).toMatch(/score_distribution/);
    expect(content).toMatch(/elite/);
    expect(content).toMatch(/strong/);
    expect(content).toMatch(/moderate/);
  });
});
