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
 * SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md
 * SPEC LINK: docs/specs/01-pipeline/40_pipeline_system.md
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

// ── Fallback logic variables (derived from scripts/seeds/logic_variables.json) ──
// Single source of truth: edit logic_variables.json to add/change defaults.
// Schema parity with src/lib/admin/control-panel.ts LOGIC_VAR_DEFAULTS is
// enforced by src/tests/control-panel.logic.test.ts (both surfaces derive
// from the same JSON — WF3-0 seed refactor).
const _LOGIC_VARS_JSON = require('../seeds/logic_variables.json');
const FALLBACK_LOGIC_VARS = Object.fromEntries(
  Object.entries(_LOGIC_VARS_JSON).map(([key, meta]) => [key, meta.default]),
);

/**
 * Load all marketplace configuration from the control panel tables.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {string} [tag='config-loader'] - Log tag for the calling script
 * @returns {Promise<{ tradeConfigs: Record<string, object>, logicVars: Record<string, number> }>}
 */
async function loadMarketplaceConfigs(pool, tag = 'config-loader') {
  // WF3 B3-H2 (2026-04-23): structuredClone isolates the mutable working
  // copies from FALLBACK_TRADE_CONFIGS / FALLBACK_LOGIC_VARS. The old
  // pattern (`= FALLBACK_TRADE_CONFIGS` and `{ ...FALLBACK_LOGIC_VARS }`)
  // either aliased the shared object outright or did a shallow copy that
  // still shared nested values (JSON-typed logic_variables like
  // income_premium_tiers). Any consumer that mutated a nested property
  // would corrupt the shared fallback for the rest of the process
  // lifetime — a latent bug waiting for a refactor to trip.
  let tradeConfigs = structuredClone(FALLBACK_TRADE_CONFIGS);
  let logicVars = structuredClone(FALLBACK_LOGIC_VARS);

  try {
    // ── Trade configurations ─────────────────────────────────
    const { rows: tcRows } = await pool.query(
      `SELECT trade_slug, allocation_pct, bid_phase_cutoff, work_phase_target,
              imminent_window_days, multiplier_bid, multiplier_work
         FROM trade_configurations`,
    );

    if (tcRows.length > 0) {
      // WF3 B3-H3 (2026-04-23): per-field isFinite + negative guards.
      // parseFloat(null) / parseFloat('abc') returns NaN, and NaN silently
      // propagates into allocation math, urgency multipliers, and score
      // calculations. `parseTradeNum` returns `null` for any non-finite or
      // negative input so the caller can decide per-trade whether to use
      // the DB row or fall back to FALLBACK_TRADE_CONFIGS[slug].
      const parseTradeNum = (value, slug, field) => {
        const n = parseFloat(value);
        if (!Number.isFinite(n)) {
          pipeline.log.warn(
            `[${tag}]`,
            `trade_configurations.${field} for ${slug} is non-finite`,
            { raw: value },
          );
          return null;
        }
        if (n < 0) {
          pipeline.log.warn(
            `[${tag}]`,
            `trade_configurations.${field} for ${slug} is negative (${n})`,
          );
          return null;
        }
        return n;
      };

      const dbTradeConfigs = {};
      for (const c of tcRows) {
        const slug = c.trade_slug;
        const fallback = FALLBACK_TRADE_CONFIGS[slug];
        const allocation_pct = parseTradeNum(c.allocation_pct, slug, 'allocation_pct');
        const multiplier_bid = parseTradeNum(c.multiplier_bid, slug, 'multiplier_bid');
        const multiplier_work = parseTradeNum(c.multiplier_work, slug, 'multiplier_work');

        if (allocation_pct === null || multiplier_bid === null || multiplier_work === null) {
          // Row is partially invalid. Fall back per-slug so the trade is
          // still represented in the map (compute-trade-forecasts' unmapped
          // trades counter would otherwise spike). If no fallback exists,
          // skip — consumers already tolerate missing slugs.
          if (fallback) {
            dbTradeConfigs[slug] = structuredClone(fallback);
            pipeline.log.warn(
              `[${tag}]`,
              `Using hardcoded fallback for ${slug} — DB row had invalid numeric values`,
            );
          }
          continue;
        }

        dbTradeConfigs[slug] = {
          allocation_pct,
          bid_phase_cutoff: c.bid_phase_cutoff,
          work_phase_target: c.work_phase_target,
          // WF3 (2026-04-23): nullable field — null is valid (callers use ?? 14
          // fallback). parseTradeNum guards against NaN strings and negative values.
          imminent_window_days: c.imminent_window_days != null
            ? parseTradeNum(c.imminent_window_days, slug, 'imminent_window_days')
            : null,
          multiplier_bid,
          multiplier_work,
        };
      }
      tradeConfigs = dbTradeConfigs;

      // Validate allocation_pct sums to ~1.0 — normalize if drifted.
      // WF3 B3-C1 (2026-04-23): if allocSum is non-finite or <= 0, the
      // normalization loop would produce Infinity / NaN / negative values
      // across every allocation_pct. Guard by reverting to the hardcoded
      // fallback — louder than a silent NaN cascade.
      const allocSum = Object.values(tradeConfigs)
        .reduce((sum, tc) => sum + tc.allocation_pct, 0);
      if (!Number.isFinite(allocSum) || allocSum <= 0) {
        pipeline.log.warn(
          `[${tag}]`,
          `allocation_pct sum is non-finite or zero (${allocSum}) — reverting to hardcoded fallback`,
        );
        tradeConfigs = structuredClone(FALLBACK_TRADE_CONFIGS);
      } else if (Math.abs(allocSum - 1.0) > 0.001) {
        pipeline.log.warn(`[${tag}]`, `allocation_pct sum is ${allocSum.toFixed(4)} (expected 1.0) — normalizing`);
        for (const tc of Object.values(tradeConfigs)) {
          tc.allocation_pct = tc.allocation_pct / allocSum;
        }
      }

      pipeline.log.info(`[${tag}]`, `Loaded ${Object.keys(tradeConfigs).length} trade configs from control panel`);
    }

    // ── Logic variables ──────────────────────────────────────
    const { rows: lvRows } = await pool.query(
      'SELECT variable_key, variable_value, variable_value_json FROM logic_variables',
    );

    if (lvRows.length > 0) {
      // Guard against NaN (e.g. DECIMAL NULL in DB → parseFloat(null) = NaN)
      // and against zero on variables where 0 is semantically wrong
      // (e.g. expired_threshold_days = 0 would mark every permit expired
      // the day it starts). Fall back to hardcoded default for non-finite
      // or zero-sentinel values. Adversarial Probe 1.
      const ZERO_IS_INVALID = new Set([
        'expired_threshold_days', 'los_base_divisor', 'stall_penalty_precon',
        'stall_penalty_active', 'coa_stall_threshold', 'snowplow_buffer_days',
        // Spec 83 §4 — Liar's Gate + coverage ratios must never be 0.
        // A zero liar_gate_threshold would silently disable geometric overrides.
        // Zero coverage ratios would produce a zero GFA fallback, suppressing all estimates.
        'liar_gate_threshold', 'urban_coverage_ratio', 'suburban_coverage_ratio', 'trust_threshold_pct',
        // Spec 81 §3 — los_decay_divisor = 0 causes division by zero in decayFactor computation.
        'los_decay_divisor',
      ]);
      // WF3 B3-H3 (2026-04-23): variables where a negative value is
      // always a config error. expired_threshold_days is EXCLUDED — the
      // script normalizes it via |value| (see compute-trade-forecasts L107),
      // so the DB stores the threshold as a signed number by convention.
      const NEGATIVE_IS_INVALID = new Set([
        'los_base_divisor', 'los_decay_divisor',
        'stall_penalty_precon', 'stall_penalty_active',
        'coa_stall_threshold', 'snowplow_buffer_days',
        'liar_gate_threshold',
        'urban_coverage_ratio', 'suburban_coverage_ratio',
        'trust_threshold_pct',
      ]);
      for (const { variable_key, variable_value, variable_value_json } of lvRows) {
        // JSON-type variables (e.g. income_premium_tiers) store their value in
        // variable_value_json; variable_value holds a sentinel 0. Read the JSON
        // object directly — never try to parse it as a float.
        if (variable_value_json !== null && typeof variable_value_json === 'object') {
          logicVars[variable_key] = variable_value_json;
          continue;
        }
        const parsed = parseFloat(variable_value);
        if (!Number.isFinite(parsed)) {
          pipeline.log.warn(`[${tag}]`, `logic_variables.${variable_key} is non-finite — keeping fallback`, { raw: variable_value });
          continue;
        }
        if (parsed === 0 && ZERO_IS_INVALID.has(variable_key)) {
          pipeline.log.warn(`[${tag}]`, `logic_variables.${variable_key} is 0 (invalid) — keeping fallback`);
          continue;
        }
        if (parsed < 0 && NEGATIVE_IS_INVALID.has(variable_key)) {
          pipeline.log.warn(
            `[${tag}]`,
            `logic_variables.${variable_key} is negative (${parsed}) — keeping fallback`,
          );
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
