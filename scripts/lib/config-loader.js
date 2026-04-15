/**
 * Centralized Marketplace Config Loader.
 *
 * Provides a single `loadMarketplaceConfigs(pool)` function that all 4
 * pipeline scripts call instead of inline try/catch blocks. Returns
 * `{ tradeConfigs, logicVars }` with parsed, validated data and
 * hardcoded fallbacks if the DB query fails.
 *
 * Benefits:
 *   - Deduplicates the pattern across 4 scripts
 *   - Validates allocation_pct sum at load time
 *   - Single point of failure logging
 *
 * SPEC LINK: docs/specs/product/future/86_control_panel.md §3
 */
'use strict';

const pipeline = require('./pipeline');
const { z } = require('zod');

// ── Fallback trade allocations (match migration 092 seed) ────────
const FALLBACK_TRADE_CONFIGS = {
  excavation: { allocation_pct: 0.0244, bid_phase_cutoff: 'P3', work_phase_target: 'P9', imminent_window_days: 7, multiplier_bid: 3.0, multiplier_work: 1.8 },
  shoring: { allocation_pct: 0.0163, bid_phase_cutoff: 'P3', work_phase_target: 'P9', imminent_window_days: 7, multiplier_bid: 3.0, multiplier_work: 1.8 },
  demolition: { allocation_pct: 0.0163, bid_phase_cutoff: 'P3', work_phase_target: 'P9', imminent_window_days: 7, multiplier_bid: 2.5, multiplier_work: 1.5 },
  'temporary-fencing': { allocation_pct: 0.0081, bid_phase_cutoff: 'P3', work_phase_target: 'P9', imminent_window_days: 7, multiplier_bid: 2.0, multiplier_work: 1.2 },
  concrete: { allocation_pct: 0.0650, bid_phase_cutoff: 'P3', work_phase_target: 'P10', imminent_window_days: 14, multiplier_bid: 2.8, multiplier_work: 1.6 },
  waterproofing: { allocation_pct: 0.0163, bid_phase_cutoff: 'P3', work_phase_target: 'P10', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  framing: { allocation_pct: 0.0974, bid_phase_cutoff: 'P3', work_phase_target: 'P11', imminent_window_days: 14, multiplier_bid: 2.8, multiplier_work: 1.6 },
  'structural-steel': { allocation_pct: 0.0813, bid_phase_cutoff: 'P3', work_phase_target: 'P11', imminent_window_days: 14, multiplier_bid: 3.0, multiplier_work: 1.8 },
  masonry: { allocation_pct: 0.0488, bid_phase_cutoff: 'P7a', work_phase_target: 'P11', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  elevator: { allocation_pct: 0.0407, bid_phase_cutoff: 'P3', work_phase_target: 'P11', imminent_window_days: 21, multiplier_bid: 3.0, multiplier_work: 1.8 },
  plumbing: { allocation_pct: 0.0650, bid_phase_cutoff: 'P3', work_phase_target: 'P12', imminent_window_days: 14, multiplier_bid: 2.8, multiplier_work: 1.6 },
  hvac: { allocation_pct: 0.0813, bid_phase_cutoff: 'P3', work_phase_target: 'P12', imminent_window_days: 14, multiplier_bid: 2.8, multiplier_work: 1.6 },
  electrical: { allocation_pct: 0.0650, bid_phase_cutoff: 'P3', work_phase_target: 'P12', imminent_window_days: 14, multiplier_bid: 2.8, multiplier_work: 1.6 },
  'drain-plumbing': { allocation_pct: 0.0325, bid_phase_cutoff: 'P3', work_phase_target: 'P12', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  'fire-protection': { allocation_pct: 0.0244, bid_phase_cutoff: 'P3', work_phase_target: 'P12', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  roofing: { allocation_pct: 0.0407, bid_phase_cutoff: 'P7a', work_phase_target: 'P16', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  insulation: { allocation_pct: 0.0244, bid_phase_cutoff: 'P7a', work_phase_target: 'P13', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  glazing: { allocation_pct: 0.0244, bid_phase_cutoff: 'P7a', work_phase_target: 'P16', imminent_window_days: 21, multiplier_bid: 2.5, multiplier_work: 1.5 },
  drywall: { allocation_pct: 0.0325, bid_phase_cutoff: 'P3', work_phase_target: 'P15', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  painting: { allocation_pct: 0.0244, bid_phase_cutoff: 'P7a', work_phase_target: 'P15', imminent_window_days: 14, multiplier_bid: 2.0, multiplier_work: 1.2 },
  flooring: { allocation_pct: 0.0325, bid_phase_cutoff: 'P7a', work_phase_target: 'P15', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  tiling: { allocation_pct: 0.0163, bid_phase_cutoff: 'P7a', work_phase_target: 'P15', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  'trim-work': { allocation_pct: 0.0081, bid_phase_cutoff: 'P11', work_phase_target: 'P15', imminent_window_days: 14, multiplier_bid: 2.0, multiplier_work: 1.2 },
  'millwork-cabinetry': { allocation_pct: 0.0163, bid_phase_cutoff: 'P7a', work_phase_target: 'P15', imminent_window_days: 21, multiplier_bid: 2.5, multiplier_work: 1.5 },
  'stone-countertops': { allocation_pct: 0.0081, bid_phase_cutoff: 'P11', work_phase_target: 'P15', imminent_window_days: 21, multiplier_bid: 2.5, multiplier_work: 1.5 },
  security: { allocation_pct: 0.0081, bid_phase_cutoff: 'P11', work_phase_target: 'P15', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  'eavestrough-siding': { allocation_pct: 0.0163, bid_phase_cutoff: 'P7a', work_phase_target: 'P16', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  caulking: { allocation_pct: 0.0081, bid_phase_cutoff: 'P7a', work_phase_target: 'P16', imminent_window_days: 7, multiplier_bid: 2.0, multiplier_work: 1.2 },
  solar: { allocation_pct: 0.0163, bid_phase_cutoff: 'P7a', work_phase_target: 'P16', imminent_window_days: 21, multiplier_bid: 2.5, multiplier_work: 1.5 },
  landscaping: { allocation_pct: 0.0163, bid_phase_cutoff: 'P12', work_phase_target: 'P17', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  'decking-fences': { allocation_pct: 0.0081, bid_phase_cutoff: 'P12', work_phase_target: 'P17', imminent_window_days: 14, multiplier_bid: 2.5, multiplier_work: 1.5 },
  'pool-installation': { allocation_pct: 0.0163, bid_phase_cutoff: 'P7a', work_phase_target: 'P17', imminent_window_days: 21, multiplier_bid: 2.5, multiplier_work: 1.5 },
};

// ── Fallback logic variables (match migration 092 + 093 + 096 seed) ──────────
// NOTE: keep in sync with src/lib/admin/control-panel.ts LOGIC_VAR_DEFAULTS.
// Schema parity is enforced by src/tests/control-panel.logic.test.ts.
const FALLBACK_LOGIC_VARS = {
  los_multiplier_bid: 2.5,
  los_multiplier_work: 1.5,
  los_penalty_tracking: 50,
  los_penalty_saving: 10,
  los_base_cap: 30,
  los_base_divisor: 10000,
  stall_penalty_precon: 45,
  stall_penalty_active: 14,
  expired_threshold_days: -90,
  liar_gate_threshold: 0.25,
  lead_expiry_days: 90,
  coa_stall_threshold: 30,
  calibration_min_sample_size: 5,
  // migration 096 (Spec 83 surgical valuation)
  urban_coverage_ratio: 0.70,
  suburban_coverage_ratio: 0.40,
  trust_threshold_pct: 0.25,
  // migration 097 (Spec 86 control panel)
  commercial_shell_multiplier: 0.60,
  placeholder_cost_threshold: 1000,
};

/**
 * Load all marketplace configuration from the control panel tables.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {string} [tag='config-loader'] - Log tag for the calling script
 * @returns {Promise<{ tradeConfigs: Record<string, object>, logicVars: Record<string, number> }>}
 */
async function loadMarketplaceConfigs(pool, tag = 'config-loader') {
  let tradeConfigs = FALLBACK_TRADE_CONFIGS;
  let logicVars = { ...FALLBACK_LOGIC_VARS };

  try {
    // ── Trade configurations ─────────────────────────────────
    const { rows: tcRows } = await pool.query(
      `SELECT trade_slug, allocation_pct, bid_phase_cutoff, work_phase_target,
              imminent_window_days, multiplier_bid, multiplier_work
         FROM trade_configurations`,
    );

    if (tcRows.length > 0) {
      tradeConfigs = Object.fromEntries(
        tcRows.map((c) => [c.trade_slug, {
          allocation_pct: parseFloat(c.allocation_pct),
          bid_phase_cutoff: c.bid_phase_cutoff,
          work_phase_target: c.work_phase_target,
          imminent_window_days: c.imminent_window_days,
          multiplier_bid: parseFloat(c.multiplier_bid),
          multiplier_work: parseFloat(c.multiplier_work),
        }]),
      );

      // Validate allocation_pct sums to ~1.0 — normalize if drifted
      const allocSum = Object.values(tradeConfigs)
        .reduce((sum, tc) => sum + tc.allocation_pct, 0);
      if (Math.abs(allocSum - 1.0) > 0.001) {
        pipeline.log.warn(`[${tag}]`, `allocation_pct sum is ${allocSum.toFixed(4)} (expected 1.0) — normalizing`);
        for (const tc of Object.values(tradeConfigs)) {
          tc.allocation_pct = tc.allocation_pct / allocSum;
        }
      }

      pipeline.log.info(`[${tag}]`, `Loaded ${tcRows.length} trade configs from control panel`);
    }

    // ── Logic variables ──────────────────────────────────────
    const { rows: lvRows } = await pool.query(
      'SELECT variable_key, variable_value FROM logic_variables',
    );

    if (lvRows.length > 0) {
      // Guard against NaN (e.g. DECIMAL NULL in DB → parseFloat(null) = NaN)
      // and against zero on variables where 0 is semantically wrong
      // (e.g. expired_threshold_days = 0 would mark every permit expired
      // the day it starts). Fall back to hardcoded default for non-finite
      // or zero-sentinel values. Adversarial Probe 1.
      const ZERO_IS_INVALID = new Set([
        'expired_threshold_days', 'los_base_divisor', 'stall_penalty_precon',
        'stall_penalty_active', 'lead_expiry_days', 'coa_stall_threshold',
        // Spec 83 §4 — Liar's Gate + coverage ratios must never be 0.
        // A zero liar_gate_threshold would silently disable geometric overrides.
        // Zero coverage ratios would produce a zero GFA fallback, suppressing all estimates.
        'liar_gate_threshold', 'urban_coverage_ratio', 'suburban_coverage_ratio', 'trust_threshold_pct',
      ]);
      for (const { variable_key, variable_value } of lvRows) {
        const parsed = parseFloat(variable_value);
        if (!Number.isFinite(parsed)) {
          pipeline.log.warn(`[${tag}]`, `logic_variables.${variable_key} is non-finite — keeping fallback`, { raw: variable_value });
          continue;
        }
        if (parsed === 0 && ZERO_IS_INVALID.has(variable_key)) {
          pipeline.log.warn(`[${tag}]`, `logic_variables.${variable_key} is 0 (invalid) — keeping fallback`);
          continue;
        }
        logicVars[variable_key] = parsed;
      }
      pipeline.log.info(`[${tag}]`, `Loaded ${lvRows.length} logic variables from control panel`);
    }
  } catch (err) {
    pipeline.log.warn(`[${tag}]`, 'Control panel query failed — using hardcoded defaults', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return { tradeConfigs, logicVars };
}

/**
 * Validate a logicVars object against a Zod schema.
 * Call this after loadMarketplaceConfigs() to fail fast if required keys
 * are missing or non-finite (e.g. DB returned NULL, fallback was skipped).
 *
 * @param {Record<string, number>} logicVars
 * @param {import('zod').ZodSchema} schema
 * @param {string} [tag='config-loader']
 * @returns {{ valid: true } | { valid: false; errors: string[] }}
 */
function validateLogicVars(logicVars, schema, tag = 'config-loader') {
  const result = schema.safeParse(logicVars);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`
    );
    pipeline.log.error(`[${tag}]`, new Error('logicVars validation failed'), { errors });
    return { valid: false, errors };
  }
  return { valid: true };
}

module.exports = { loadMarketplaceConfigs, validateLogicVars, FALLBACK_TRADE_CONFIGS, FALLBACK_LOGIC_VARS };
