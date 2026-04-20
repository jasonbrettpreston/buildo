// SPEC LINK: docs/specs/product/future/81_opportunity_score_engine.md §3 (asymptotic decay + NULL guard), §4 (infra tests)
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

  it('delegates advisory lock 81 to pipeline.withAdvisoryLock — Phase 2 migration (spec 47 §5)', () => {
    // Phase 2: hand-rolled lockClient + SIGTERM boilerplate replaced with SDK helper.
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 81/);
    expect(content).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
    // Must NOT hand-roll — any direct lock call bypasses the spec helper
    expect(content).not.toMatch(/pg_try_advisory_lock/);
    expect(content).not.toMatch(/pg_advisory_unlock/);
    // Must NOT install its own SIGTERM — helper handles it
    expect(content).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
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
    // spec §8.2 mandatory rows for "Score engine" type
    expect(content).toMatch(/records_scored/);
    expect(content).toMatch(/records_unchanged/);
    expect(content).toMatch(/null_input_rate/);
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

  it('handles lock-held path: checks lockResult.acquired and emits skip meta (spec 47 §5)', () => {
    // Rich SKIP path (skipEmit:false): script emits custom summary with audit_table,
    // then emitMeta. Helper suppresses its own SKIP emit on opts.skipEmit:false.
    expect(content).toMatch(/lockResult\.acquired/);
    expect(content).toMatch(/skipEmit\s*:\s*false/);
    expect(content).toMatch(/advisory_lock_held_elsewhere/);
  });

  it('captures RUN_AT from DB at startup — MANDATORY skeleton §R3.5 (spec 47 §14.1)', () => {
    // Required by the pipeline skeleton even when no timestamp column is written.
    // Documents run identity and prevents Midnight Cross on any future timestamp writes.
    // Accepts either the old inline pattern or the new SDK helper (pipeline.getDbTimestamp).
    expect(content).toMatch(/RUN_AT/);
    const hasInlineNow = /SELECT NOW\(\) AS now/.test(content);
    const hasSdkHelper = /pipeline\.getDbTimestamp\s*\(/.test(content);
    expect(hasInlineNow || hasSdkHelper,
      'Must capture RUN_AT via SELECT NOW() inline or pipeline.getDbTimestamp()'
    ).toBe(true);
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

  it('reads score tier thresholds from logicVars — no hardcoded 80/50/20 in SQL (WF3-E15)', () => {
    // E15: score_tier_elite, score_tier_strong, score_tier_moderate externalized to logic_variables.
    expect(content).toMatch(/vars\.score_tier_elite/);
    expect(content).toMatch(/vars\.score_tier_strong/);
    expect(content).toMatch(/vars\.score_tier_moderate/);
    // Hardcoded values must be gone from the CASE expression
    expect(content).not.toMatch(/opportunity_score >= 80 THEN 'elite'/);
    expect(content).not.toMatch(/opportunity_score >= 50 THEN 'strong'/);
    expect(content).not.toMatch(/opportunity_score >= 20 THEN 'moderate'/);
  });
});

// ── WF1 asymptotic decay + NULL guard + los_decay_divisor (spec 81 §3 + §4) ──

describe('scripts/compute-opportunity-scores.js — asymptotic decay + NULL guard (WF1 April 2026)', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/compute-opportunity-scores.js'),
      'utf-8',
    );
  });

  it('LOGIC_VARS_SCHEMA includes los_decay_divisor as finite positive number (spec 81 §2)', () => {
    expect(content).toMatch(/los_decay_divisor/);
    // Must be in the Zod schema — not just used raw
    expect(content).toMatch(/los_decay_divisor\s*:\s*z\.number\(\)\.finite\(\)\.positive\(\)/);
  });

  it('uses asymptotic decay formula — divides by (1 + decayFactor) not subtracts penalty (spec 81 §3)', () => {
    // New formula: raw = (base * urgencyMultiplier) / (1 + decayFactor)
    expect(content).toMatch(/\(1 \+ decayFactor\)/);
    expect(content).toMatch(/decayFactor\s*=/);
    // Old linear subtraction pattern must be gone
    expect(content).not.toMatch(/\(base \* urgencyMultiplier\) - competitionPenalty/);
    expect(content).not.toMatch(/raw\s*=\s*\(base \* \w+\) - \w*[Pp]enalty/);
  });

  it('derives decayFactor from vars.los_decay_divisor — not a hardcoded constant (spec 81 §3)', () => {
    expect(content).toMatch(/decayFactor\s*=\s*rawPenalty\s*\/\s*vars\.los_decay_divisor/);
  });

  it('NULL guard: sets score = null when estimated_cost is null or trade_contract_values is empty (spec 81 §3)', () => {
    expect(content).toMatch(/hasNoCostData/);
    expect(content).toMatch(/estimated_cost\s*==\s*null/);
    expect(content).toMatch(/Object\.keys\(tradeValues\)\.length\s*===\s*0/);
    // When null guard fires, score must be null (not 0)
    expect(content).toMatch(/score\s*=\s*null/);
  });

  it('nullInputScores counter is declared and incremented only in the NULL guard branch (spec 81 §4)', () => {
    expect(content).toMatch(/nullInputScores/);
    // Counter must be incremented — searching for the increment pattern
    expect(content).toMatch(/nullInputScores\+\+/);
  });

  it('integrity audit (integrityFlags++) runs regardless of cost data availability (spec 81 §3)', () => {
    // The integrity check must appear BEFORE the hasNoCostData guard in source order.
    // We verify both patterns exist; ordering is verified by their relative positions.
    const integrityIdx = content.indexOf('integrityFlags++');
    const nullGuardIdx = content.indexOf('hasNoCostData');
    expect(integrityIdx).toBeGreaterThan(-1);
    expect(nullGuardIdx).toBeGreaterThan(-1);
    expect(integrityIdx).toBeLessThan(nullGuardIdx);
  });

  it('null_scores audit row has status INFO — not WARN (nulls are intentional, spec 81 §4)', () => {
    // null_scores is now INFO because NULLs are a deliberate signal (missing cost data)
    // not an anomaly. The old WARN path is removed.
    expect(content).toMatch(/metric:\s*['"]null_scores['"][\s\S]{0,100}status:\s*['"]INFO['"]/);
    // The old conditional WARN/PASS pattern must be gone
    expect(content).not.toMatch(/nullScores > 0\s*\?\s*['"]WARN['"]\s*:\s*['"]PASS['"]/);
  });

  it('null_input_scores row present in audit_table with status INFO (spec 81 §4)', () => {
    expect(content).toMatch(/metric:\s*['"]null_input_scores['"]/);
    expect(content).toMatch(/null_input_scores[\s\S]{0,100}status:\s*['"]INFO['"]/);
  });

  it('null_input_scores is included in records_meta for pipeline telemetry (spec 81 §4)', () => {
    // records_meta must expose nullInputScores so the chain orchestrator can surface it
    expect(content).toMatch(/null_input_scores\s*:\s*nullInputScores/);
  });
});
