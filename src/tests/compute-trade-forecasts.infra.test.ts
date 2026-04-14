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

  it('uses bimodal TRADE_TARGET_PHASE routing (bid_phase vs work_phase)', () => {
    expect(content).toMatch(/bid_phase/);
    expect(content).toMatch(/work_phase/);
    expect(content).toMatch(/targets\.bid_phase/);
    expect(content).toMatch(/targets\.work_phase/);
    // Bimodal routing: target bid_phase if AT or before it, else work_phase.
    // WF3: was `<`, now `<=` so permits AT the bid_phase still target it
    // (the bid window is open, not closed).
    expect(content).toMatch(/currentOrdinal\s*<=\s*bidOrdinal/);
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

  it('purges ghost forecasts via NOT EXISTS against active permit_trades', () => {
    // WF3 ghost purge: deletes forecasts if the permit died OR the
    // trade was deactivated. NOT EXISTS is ironclad — catches both.
    expect(content).toMatch(/DELETE FROM trade_forecasts/);
    expect(content).toMatch(/NOT EXISTS/);
    expect(content).toMatch(/pt\.is_active = true/);
    expect(content).toMatch(/stalePurged/);
  });

  it('imports PHASE_ORDINAL from shared lib and uses for ordinal comparison', () => {
    // WF3: was duplicated, now imported from scripts/lib/lifecycle-phase.js
    expect(content).toMatch(/PHASE_ORDINAL/);
    expect(content).toMatch(/isPastTarget/);
    expect(content).toMatch(/currentOrdinal.*>=.*targetOrdinal/);
    // Must NOT define PHASE_ORDINAL locally (it's imported)
    expect(content).not.toMatch(/const PHASE_ORDINAL\s*=\s*\{/);
  });

  it('uses pre-construction → ISSUED fallback for P3-P8/P7* but NOT P18', () => {
    expect(content).toMatch(/PRE_CONSTRUCTION_PHASES/);
    expect(content).toMatch(/'ISSUED'/);
    // P18 must NOT be in PRE_CONSTRUCTION_PHASES (adversarial Probe 2)
    const preConMatch = content.match(/PRE_CONSTRUCTION_PHASES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(preConMatch).toBeTruthy();
    expect(preConMatch![1]).not.toMatch(/P18/);
  });

  it('classifies urgency with expired decay + correct thresholds (no on_hold)', () => {
    expect(content).toMatch(/classifyUrgency/);
    // WF3 2026-04-13: expired threshold now loaded from logic_variables
    // (expired_threshold_days, seeded as -90). Previously hardcoded.
    expect(content).toMatch(/expired/);
    expect(content).toMatch(/expired_threshold_days/);
    // Ensure the hardcoded -90 is gone from the classify function
    expect(content).not.toMatch(/daysUntil <= -90/);
    // Stall handling is now via Instant Recalibration math, NOT a
    // separate urgency tier. classifyUrgency has no isStalled param.
    expect(content).not.toMatch(/return 'on_hold'/);
    // Standard tiers
    expect(content).toMatch(/overdue/);
    expect(content).toMatch(/delayed/);
    expect(content).toMatch(/imminent/);
    expect(content).toMatch(/upcoming/);
    expect(content).toMatch(/on_time/);
  });

  it('acquires advisory lock 85 on a pinned pool.connect() client (WF3-03 / H-W1)', () => {
    // Lock ID convention: lock_id = spec number. Mirrors the canonical
    // pattern in classify-lifecycle-phase.js. Lock MUST be acquired on a
    // dedicated `pool.connect()` client because session locks are bound to
    // the backend that acquired them — `pool.query` would acquire on an
    // ephemeral connection and the unlock would no-op (cf. 83-W5).
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 85/);
    expect(content).toMatch(/await pool\.connect\(\)/);
    expect(content).toMatch(/SELECT pg_try_advisory_lock\(\$1\)/);
    expect(content).toMatch(/SELECT pg_advisory_unlock\(\$1\)/);
    expect(content).not.toMatch(/pool\.query\([^)]*pg_try_advisory_lock/);
    expect(content).not.toMatch(/pool\.query\([^)]*pg_advisory_unlock/);
  });

  it('wraps stale-purge DELETE + batch UPSERT loop in a single withTransaction (WF3-03 / H-W2 / 85-W2)', () => {
    // Crash between DELETE and UPSERT used to leave stale rows purged but
    // new rows missing. Both phases now run inside a single transaction —
    // crash → rollback → table unchanged.
    expect(content).toMatch(/pipeline\.withTransaction/);
    // Regression anchor: the old code had bare pool.query for both DELETE
    // (stale purge) and UPSERT loop. Both are now client.query inside the
    // transaction callback.
    expect(content).not.toMatch(/await pool\.query\([\s\S]{0,40}DELETE FROM trade_forecasts/);
    expect(content).not.toMatch(/await pool\.query\(\s*`INSERT INTO trade_forecasts/);
  });

  it('consumes per-trade imminent_window_days from trade_configurations (WF3-05, H-W13)', () => {
    // H-W13: the Control Panel `trade_configurations.imminent_window_days`
    // knob must drive the `urgency='imminent'` threshold, not the hardcoded 14.
    // Signature must accept a 4th parameter (the per-trade window).
    expect(
      content,
      'classifyUrgency signature must accept an imminentWindow parameter',
    ).toMatch(/function classifyUrgency\([^)]*imminentWindow/);

    // Body must use the parameter, not the hardcoded 14.
    expect(
      content,
      'imminent classification must compare against the parameter, not 14',
    ).toMatch(/daysUntil <= imminentWindow/);
    expect(
      content,
      'hardcoded `daysUntil <= 14` must be removed from classifyUrgency',
    ).not.toMatch(/if \(daysUntil <= 14\) return 'imminent'/);

    // Call site must pass the per-trade value from tradeConfigs with
    // nullish-coalesce (NOT || 14, which would erase a legitimate 0-day
    // window).
    expect(
      content,
      'call site must thread tradeConfigs[trade_slug]?.imminent_window_days',
    ).toMatch(
      /classifyUrgency\([^)]*logicVars\.expired_threshold_days[^)]*tradeConfigs\[[^\]]+\]\?\.imminent_window_days\s*\?\?\s*14/,
    );
    expect(
      content,
      '`|| 14` would silently rewrite a legitimate 0-day window; use `?? 14`',
    ).not.toMatch(/imminent_window_days\s*\|\|\s*14/);
  });

  it('applies stall recalibration with context-aware penalty + rolling snowplow', () => {
    // Pre-construction stalls = stall_penalty_precon (bureaucracy)
    // Active construction stalls = stall_penalty_active
    // Now loaded from control panel via logicVars (was hardcoded 45/14)
    expect(content).toMatch(/stallPenalty/);
    expect(content).toMatch(/logicVars\.stall_penalty_precon/);
    expect(content).toMatch(/logicVars\.stall_penalty_active/);
    // Rolling snowplow: predicted date can never be closer than
    // penalty buffer from today
    expect(content).toMatch(/minimumStallDate/);
    expect(content).toMatch(/predictedStart < minimumStallDate/);
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

  it('uses 12 params per row (includes target_window, no computed_at)', () => {
    expect(content).toMatch(/j \* 12/);
    // The INSERT column list must include target_window
    const insertMatch = content.match(
      /INSERT INTO trade_forecasts\s*\([^)]+\)/,
    );
    expect(insertMatch).toBeTruthy();
    expect(insertMatch![0]).toMatch(/target_window/);
    expect(insertMatch![0]).not.toMatch(/computed_at/);
  });

  it('emits PIPELINE_SUMMARY with urgency distribution', () => {
    expect(content).toMatch(/pipeline\.emitSummary/);
    expect(content).toMatch(/urgency_distribution/);
    expect(content).toMatch(/forecasts_computed/);
  });

  it('uses UTC date math to prevent timezone off-by-one', () => {
    // WF3: setHours(0) uses local TZ but toISOString() outputs UTC.
    // On a Toronto server, this can shift dates backward by a full day.
    expect(content).toMatch(/setUTCHours\(0,\s*0,\s*0,\s*0\)/);
    expect(content).toMatch(/setUTCDate/);
    // Must NOT use local-TZ setHours for date normalization
    expect(content).not.toMatch(/\.setHours\(0,\s*0,\s*0,\s*0\)/);
  });

  it('logs unmapped trades as a warning', () => {
    expect(content).toMatch(/unmappedTrades/);
    expect(content).toMatch(/pipeline\.log\.warn/);
  });
});
