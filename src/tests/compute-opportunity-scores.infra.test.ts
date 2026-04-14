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

  it('uses shared config loader for control panel variables', () => {
    expect(content).toMatch(/loadMarketplaceConfigs/);
    expect(content).toMatch(/require\('\.\/lib\/config-loader'\)/);
  });

  it('computes base from trade value normalized by control panel divisor', () => {
    // Now uses vars.los_base_divisor from logic_variables (was hardcoded 10000)
    expect(content).toMatch(/tradeValue \/ vars\.los_base_divisor/);
    expect(content).toMatch(/Math\.min/);
  });

  it('uses per-trade multipliers from trade_configurations JOIN', () => {
    // Bug 2 fix: JOINs trade_configurations for per-trade multipliers
    // instead of global los_multiplier_bid / los_multiplier_work
    expect(content).toMatch(/LEFT JOIN trade_configurations tc/);
    expect(content).toMatch(/tc\.multiplier_bid/);
    expect(content).toMatch(/tc\.multiplier_work/);
    // Falls back to global vars when trade config is missing
    expect(content).toMatch(/vars\.los_multiplier_bid/);
    expect(content).toMatch(/vars\.los_multiplier_work/);
  });

  it('applies competition penalty from control panel variables', () => {
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

  it('acquires advisory lock 81 on a pinned pool.connect() client (WF3-03 PR-B / H-W1)', () => {
    // Lock ID convention: lock_id = spec number. Mirrors the canonical
    // pattern in classify-lifecycle-phase.js. Lock acquired on a dedicated
    // `pool.connect()` client because session locks are bound to the
    // backend that acquired them — `pool.query` would acquire on an
    // ephemeral connection and the unlock would no-op (cf. 83-W5).
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 81/);
    expect(content).toMatch(/await pool\.connect\(\)/);
    expect(content).toMatch(/SELECT pg_try_advisory_lock\(\$1\)/);
    expect(content).toMatch(/SELECT pg_advisory_unlock\(\$1\)/);
    expect(content).not.toMatch(/pool\.query\([^)]*pg_try_advisory_lock/);
    expect(content).not.toMatch(/pool\.query\([^)]*pg_advisory_unlock/);
  });

  it('wraps the multi-batch UPDATE loop in a single withTransaction (WF3-03 PR-B / H-W2 / 81-W1)', () => {
    // Crash mid-loop used to leave trade_forecasts in mixed-vintage state
    // (some rows had this run's scores, others had yesterday's). The full
    // batch sequence now runs inside one transaction — crash → rollback.
    expect(content).toMatch(/pipeline\.withTransaction/);
    // Regression anchor: the inner UPDATE inside the for-loop must NOT
    // bypass the transaction by going to pool.query.
    expect(content).not.toMatch(
      /for \(let i = 0[\s\S]{0,200}await pool\.query\(\s*`UPDATE trade_forecasts/,
    );
  });
});
