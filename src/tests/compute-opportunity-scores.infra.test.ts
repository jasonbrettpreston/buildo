// SPEC LINK: docs/specs/product/future/81_opportunity_score_engine.md
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

// ── WF3-09 spec 47 compliance tests (added as failing tests before fixes) ──

describe('scripts/compute-opportunity-scores.js — spec 47 compliance (WF3-09)', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(path.resolve(__dirname, '../..', 'scripts/compute-opportunity-scores.js'), 'utf-8');
  });

  it('has correct SPEC LINK pointing to spec 81 (not lifecycle report)', () => {
    expect(content).toMatch(/SPEC LINK:.*81_opportunity_score_engine\.md/);
    expect(content).not.toMatch(/SPEC LINK:.*lifecycle_phase_implementation/);
  });

  it('validates logicVars with Zod schema via validateLogicVars (spec 47 §4)', () => {
    expect(content).toMatch(/validateLogicVars/);
    expect(content).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(content).toMatch(/los_base_divisor/);
    expect(content).toMatch(/los_base_cap/);
  });

  it('guards parseFloat multipliers with Number.isFinite to prevent NaN scores (spec 47 §4)', () => {
    expect(content).toMatch(/Number\.isFinite/);
  });

  it('uses streamQuery for the unbounded trade_forecasts JOIN — not pool.query (spec 47 §6.1)', () => {
    expect(content).toMatch(/pipeline\.streamQuery/);
    // The main 4-table JOIN must not go through pool.query
    expect(content).not.toMatch(
      /await pool\.query\(`[\s\S]{0,100}trade_forecasts tf[\s\S]{0,500}WHERE/,
    );
  });

  it('includes a real audit_table in emitSummary — not the UNKNOWN auto-stub (spec 47 §8.2)', () => {
    expect(content).toMatch(/audit_table/);
    expect(content).toMatch(/null_scores/);
    expect(content).toMatch(/out_of_range/);
  });

  it('uses pipeline.maxRowsPerInsert(4) for BATCH_SIZE — not hardcoded 1000 (spec 47 §6.2)', () => {
    expect(content).toMatch(/maxRowsPerInsert\(4\)/);
    expect(content).not.toMatch(/const BATCH_SIZE = 1000/);
  });

  it('accumulates result.rowCount not batch.length for records_updated (spec §7 #5)', () => {
    expect(content).toMatch(/result\.rowCount/);
    // The old pattern that overcounts
    expect(content).not.toMatch(/updated \+= batch\.length/);
  });

  it('filters with NULL-safe urgency clause (spec §7 #6)', () => {
    expect(content).toMatch(/urgency IS NULL OR/);
    // The old clause that excludes NULL urgency leads must be gone
    expect(content).not.toMatch(/urgency NOT IN \('expired'\)/);
  });
});

// ── WF3-11 spec 47 §12 compliance tests ──

describe('scripts/compute-opportunity-scores.js — spec 47 §12 compliance (WF3-11)', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/compute-opportunity-scores.js'),
      'utf-8',
    );
  });

  it('registers a SIGTERM handler to release advisory lock gracefully (spec 47 §5.5)', () => {
    // MANDATORY: Cloud/K8s SIGTERM bypasses finally blocks. Without this,
    // advisory lock 81 stays held on a dead session and bricks the pipeline.
    expect(content).toMatch(/process\.on\('SIGTERM'/);
    expect(content).toMatch(/pg_advisory_unlock/);
    expect(content).toMatch(/process\.exit\(143\)/);
  });

  it('uses lockClientReleased flag to prevent double-release on SIGTERM (spec 47 §5.5)', () => {
    // If SIGTERM fires after the skip-path releases lockClient, the SIGTERM handler
    // must not call lockClient.release() a second time — pg throws on double-release.
    expect(content).toMatch(/lockClientReleased/);
  });

  it('captures RUN_AT from DB at startup — MANDATORY skeleton §R3.5 (spec 47 §14.1)', () => {
    // Required by the pipeline skeleton even when no timestamp column is written.
    // Documents run identity and prevents Midnight Cross on any future timestamp writes.
    expect(content).toMatch(/RUN_AT/);
    expect(content).toMatch(/SELECT NOW\(\) AS now/);
  });

  it('flushes scores per-batch during streaming — no global updates[] accumulator (spec 47 §6.2)', () => {
    // The old pattern accumulated ALL rows into `const updates = []` before any writes,
    // loading the entire 2.5M row trade_forecasts join into Node heap and defeating
    // the memory-backpressure benefit of streamQuery.
    // Fix: flush each batch immediately inside the for-await loop.
    expect(content).not.toMatch(/const updates = \[\]/);
    // Regression anchor: the flush must happen inside the streaming loop
    expect(content).toMatch(/batch\.length >= BATCH_SIZE/);
  });
});
