// SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  deltaExceeds50pct,
  LOGIC_VAR_DEFAULTS,
  ConfigUpdatePayloadSchema,
  LogicVariableUpdateSchema,
  TradeConfigUpdateSchema,
  ScopeMatrixUpdateSchema,
} from '@/lib/admin/control-panel';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// Delta Guard — pure function tests
// ─────────────────────────────────────────────────────────────────────────────

describe('deltaExceeds50pct — Delta Guard utility', () => {
  it('returns false when draft equals default', () => {
    expect(deltaExceeds50pct('los_base_divisor', 10000)).toBe(false);
  });

  it('returns false when draft deviates exactly 50% (boundary: not strictly greater)', () => {
    // Default = 10000; 50% of 10000 = 5000. 10000 - 5000 = 5000 → deviation = 0.5, not > 0.5
    expect(deltaExceeds50pct('los_base_divisor', 5000)).toBe(false);
  });

  it('returns true when draft deviates more than 50% below default', () => {
    // 4999 → deviation = 5001/10000 = 0.5001 > 0.5
    expect(deltaExceeds50pct('los_base_divisor', 4999)).toBe(true);
  });

  it('returns true when draft deviates more than 50% above default', () => {
    // Default = 10000; 15001 → deviation = 5001/10000 > 0.5
    expect(deltaExceeds50pct('los_base_divisor', 15001)).toBe(true);
  });

  it('returns false for unknown key (no default to compare against)', () => {
    expect(deltaExceeds50pct('nonexistent_key', 999)).toBe(false);
  });

  it('returns false when default is 0 (cannot compute ratio)', () => {
    const overrides = { some_key: 0 };
    expect(deltaExceeds50pct('some_key', 1000, overrides)).toBe(false);
  });

  it('handles negative defaults (expired_threshold_days = -90)', () => {
    // Default = -90; -135 → deviation = 45/90 = 0.5 → false
    expect(deltaExceeds50pct('expired_threshold_days', -135)).toBe(false);
    // -136 → deviation > 0.5 → true
    expect(deltaExceeds50pct('expired_threshold_days', -136)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIC_VAR_DEFAULTS — verify all expected keys are present
// ─────────────────────────────────────────────────────────────────────────────

const EXPECTED_LOGIC_VAR_KEYS = [
  'centreline_propagation_coverage_min', // Spec 62 §8e L24c — enrich-permits propagation coverage gate
  'road_overlay_distance_m', // Spec 58 — seeded for WF2 enrich-parcels (F-C2)
  'reno_coa_uplift_pct', // Spec 65 §6 SC-3 — new-build CoA uplift over max-build GFA
  'reno_kitchen_gfa_pct', // Spec 65 §6 SC-3 — kitchen reno as %-of-footprint
  'reno_bath_gfa_pct', // Spec 65 §6 SC-3 — bath reno as %-of-footprint
  'mislink_footprint_lot_tol', // Spec 65 §5 (WF3-A) — mislink guard tolerance (footprint > lot)
  'storey_height_m', // Spec 65 §6 SC-4 — residential storey-height (max-build derivation)
  // Spec 65 §7 (Phase 3) — accessory garage + laneway/garden rear-suite by-law constants.
  'garage_min_lot_sqm', 'garage_max_gfa_sqm', 'garage_min_footprint_sqm', 'accessory_max_coverage_pct',
  'car_footprint_sqm', 'laneway_suite_max_gfa_sqm', 'laneway_suite_min_lot_sqm', 'laneway_suite_min_rear_yard_m',
  'min_soft_landscaping_pct', 'laneway_suite_storeys', 'garden_suite_storeys',
  'garden_suite_min_lot_sqm', 'garden_suite_min_rear_yard_m', 'garden_suite_max_gfa_sqm',
  'los_multiplier_bid',
  'los_multiplier_work',
  'los_penalty_tracking',
  'los_penalty_saving',
  'los_base_cap',
  'los_base_divisor',
  'stall_penalty_precon',
  'stall_penalty_active',
  'expired_threshold_days',
  'liar_gate_threshold',
  'coa_stall_threshold',
  'inspection_stall_days',        // WF3-E1
  'stale_closure_abort_pct',      // WF3-E2
  'pending_closed_grace_days',    // WF3-E3
  'pre_permit_expiry_months',     // WF3-E4
  'pre_permit_stale_months',      // WF3-E4
  'coa_freshness_warn_days',          // WF3-E5
  'scrape_early_phase_threshold_pct', // WF3-E6
  'scrape_stale_days',                // WF3-E6
  'calibration_min_sample_size',
  'urban_coverage_ratio',
  'suburban_coverage_ratio',
  'trust_threshold_pct',
  'commercial_shell_multiplier',
  'placeholder_cost_threshold',
  'cost_outlier_ceiling_cad',
  'desc_null_rate_warn_pct',
  'builder_null_rate_warn_pct',
  'cost_est_null_rate_warn_pct',
  'cost_est_min_tiers',
  'cost_est_legacy_cost_ceiling_cad', // WF2 P13-1/P13-2 — legacy cost magnitude ceiling
  'cost_est_legacy_gfa_ceiling_sqm',  // WF2 P13-1/P13-2 — legacy modeled-GFA magnitude ceiling
  'permit_declared_cost_ceiling',     // WF2 P13-2 — Liar's-Gate upper sentinel
  'calibration_freshness_warn_hours',
  'coa_forward_link_sub085_warn_pct', // WF2 P12-B2 — CoA forward-link sub-0.85 identity-floor share watch
  'lifecycle_unclassified_max',
  'lifecycle_live_status_null_warn_count', // WF2 P3 — WARN threshold for live_status_null_count + never_classified_count drain-lag breakouts
  'scraper_error_rate_warn_pct',
  'scraper_latency_p50_warn_ms',
  'scraper_empty_streak_warn',
  'urgency_overdue_days',
  'urgency_upcoming_days',
  'score_tier_elite',
  'score_tier_strong',
  'score_tier_moderate',
  'los_decay_divisor',              // WF1 spec 81 — asymptotic decay curve steepness
  'cost_model_coverage_warn_pct',
  // WF1 §3.A re-key tail (Task #89, mig 163) — cost-coverage gate FAIL pcts +
  // matrix-miss/PTC-skip telemetry thresholds for compute-cost-estimates +
  // compute-coa-cost-estimates audit gates.
  'cost_model_coverage_fail_pct',
  'cost_matrix_miss_warn_pct',
  'cost_matrix_miss_fail_pct',
  'cost_ptc_skipped_warn_pct',
  // WF2 §3-ARCHETYPE (2026-07-06) — the archetype cost ladder's tunable guards +
  // T4-scoped matrix-miss thresholds (compute-cost-estimates + compute-coa-cost-
  // estimates audit gates). Seeded in logic_variables.json Phase 0.
  'cost_t4_matrix_miss_warn_pct',
  'cost_t4_matrix_miss_fail_pct',
  'archetype_nofit_residential_warn_pct',
  'archetype_t1_fsi_min',
  'archetype_t1_fsi_max',
  'archetype_t1_total_cap',
  'archetype_t2_reno_line_cap',
  'archetype_t2_build_line_cap',
  'archetype_t2_build_line_min',
  'archetype_t3_total_cap',           // WF3 F2 — T3 per-unit absolute cap
  'coa_cost_coverage_fail_pct',
  'coa_match_conf_high',
  'coa_match_conf_medium',
  'snapshot_coa_conf_high',
  'spatial_match_max_distance_m',  // E18
  'spatial_match_confidence',      // E18
  'coa_unmatched_threshold_pct',   // WF2 R5.2 — day-1 unmatched threshold for link-coa-to-parcels
  'coa_parcel_conf_tier1a',        // WF2 R5.2 — Tier 1a parcel match confidence
  'coa_parcel_conf_tier1b',        // WF2 R5.2 — Tier 1b parcel match confidence
  'coa_scope_unmapped_threshold_pct',  // WF1 R5.3 — day-1 unmapped threshold for classify-coa-scope
  'coa_trades_unmapped_threshold_pct', // WF1 R5.4 — day-1 unmapped threshold for classify-coa-trades (R8 fold #1)
  'coa_cost_coverage_threshold_pct',   // WF1 R5.5 — day-1 coverage threshold for compute-coa-cost-estimates (review fold #13)
  'coa_inherit_from_permit_min_confidence', // WF1 R5.6 — fuzzy-match confidence floor for link-coa.js permit→CoA enrichment (Spec 42 §6.X)
  'massing_shed_threshold_sqm',    // E19
  'massing_garage_max_sqm',        // E19
  'massing_nearest_max_distance_m', // E19
  'wsib_fuzzy_match_threshold',       // E20
  'calibration_default_median_days',  // E21
  'calibration_default_p25_days',     // E21
  'calibration_default_p75_days',     // E21
  'profiling_coverage_pass_pct',      // spec 49
  'profiling_coverage_warn_pct',      // spec 49
  'cost_coverage_pass_pct',           // WF3 F4 — archetype-era cost-coverage floor (Step-14 rows)
  'cost_coverage_warn_pct',           // WF3 F4
  'vocab_coverage_pass_pct',          // spec 49 §3 — vocabulary coverage
  'vocab_coverage_warn_pct',          // spec 49 §3 — vocabulary coverage
  'snowplow_buffer_days',             // WF3 spec 85 §3 — Historic Snowplow buffer (spec 47 §4.1)
  'lifecycle_issued_stall_days',      // WF2 — days since Permit Issued before stall flag (§4.1)
  'lifecycle_inspection_stall_days',  // WF2 — days since last inspection before stall flag (§4.1)
  'lifecycle_p7a_max_days',           // WF2 — max days for P7a bucket (§4.1)
  'lifecycle_p7b_max_days',           // WF2 — max days for P7b bucket (§4.1)
  'lifecycle_orphan_stall_days',      // WF3 B1-C2 — days for orphan O2→O3 degradation (§4.1)
  'lead_view_retention_days',         // D3: PIPEDA/GDPR retention window for lead_views purge

  // ── Lifecycle phase distribution bands (WF2 2026-05-07, migration 119) ──
  // Spec 47 §R4 + Spec 84 §3.4 + Spec 86 §1. Externalized from
  // scripts/quality/assert-lifecycle-phase-distribution.js EXPECTED_BANDS.
  'lifecycle_cross_stalled_threshold',
  'lifecycle_cross_active_inspection_threshold',
  'lifecycle_cross_issued_threshold',
  'lifecycle_band_p3_min', 'lifecycle_band_p3_max',
  'lifecycle_band_p4_min', 'lifecycle_band_p4_max',
  'lifecycle_band_p5_min', 'lifecycle_band_p5_max',
  'lifecycle_band_p6_min', 'lifecycle_band_p6_max',
  'lifecycle_band_p7a_min', 'lifecycle_band_p7a_max',
  'lifecycle_band_p7b_min', 'lifecycle_band_p7b_max',
  'lifecycle_band_p7c_min', 'lifecycle_band_p7c_max',
  'lifecycle_band_p7d_min', 'lifecycle_band_p7d_max',
  'lifecycle_band_p8_min',  'lifecycle_band_p8_max',
  'lifecycle_band_p18_min', 'lifecycle_band_p18_max',
  'lifecycle_band_p19_min', 'lifecycle_band_p19_max',
  'lifecycle_band_p20_min', 'lifecycle_band_p20_max',
  'lifecycle_band_p9_p17_agg_min', 'lifecycle_band_p9_p17_agg_max',
  'lifecycle_band_o1_min', 'lifecycle_band_o1_max',
  'lifecycle_band_o2_min', 'lifecycle_band_o2_max',
  'lifecycle_band_o3_min', 'lifecycle_band_o3_max',
  'lifecycle_band_coa_p1_min', 'lifecycle_band_coa_p1_max',
  'lifecycle_band_coa_p2_min', 'lifecycle_band_coa_p2_max',

  // ── Pipeline staleness thresholds (WF3 2026-05-08, migration 121) ──
  // Spec 47 §R4 + Spec 44 §4 + Spec 86 §1. Externalized from the
  // hardcoded `if (stale30d > 0)` gate in assert-staleness.js.
  'staleness_max_stale_over_30d',
  'staleness_min_coverage_pct',
  'staleness_max_days_stale',

  // ── Phase E.4 per-seq distribution bands (WF1 2026-05-16, migration 148) ──
  // Spec 47 §R4 + Spec 84 §3.4 + Spec 48 §3.2.
  // 220 keys: lifecycle_seq_band_<N>_min/_max for N in [1, 110] (Universal
  // Stream catalog seq range; mig 128/129 seed). Plus lifecycle_seq_unclassified_max.
  // Generated programmatically rather than 220 literals — the catalog seq range
  // is structural (per Spec 84 §2.5.h) and a single-line range matches the
  // catalog's contract.
  ...Array.from({ length: 110 }, (_, i) => i + 1).flatMap((n) => [
    `lifecycle_seq_band_${n}_min`,
    `lifecycle_seq_band_${n}_max`,
  ]),
  'lifecycle_seq_unclassified_max',

  // ── Phase E.5 per-kind posture flags (WF1 2026-05-XX, migration 150) ──
  // Spec 47 §R4 + Spec 84 §3.4 + Spec 48 §3.1.
  // 3 keys: lifecycle_seq_band_promote_to_fail_<kind> for each violation kind.
  // Operator-driven WARN→FAIL routing gate; default 0; values 0 or 1.
  'lifecycle_seq_band_promote_to_fail_band_violation',
  'lifecycle_seq_band_promote_to_fail_no_band_configured',
  'lifecycle_seq_band_promote_to_fail_expected_data_missing',
  // Phase F.1 (mig 152) — CoA forecast snowplow staleness gate + gate freshness window
  'coa_lifecycle_transition_stale_days',
  'coa_gate_calibration_window_days',
  // Spec 79 §7a WF3 #2 (mig 159) — operator force-active override for CoA audit-verdict gate
  'coa_gate_force_active',
  // Phase F.2 — CoA CRM assistant stall thresholds + imminent window (mig 136 + mig 154).
  // Note: coa_stall_threshold_p2_days + coa_imminent_window_days were seeded in DB by mig 136
  // but absent from seeds JSON until F.2 (v3 CRIT-4 gap discovery).
  'coa_stall_threshold_p2_days',
  'coa_imminent_window_days',
  'coa_stall_threshold_postponed_days',
  // WF2 Spec 80 P4 / D2a (mig 211 seed) — externalized compute-trade-forecasts.js
  // default_calibration_pct verdict thresholds (were hardcoded 50/20).
  'forecast_default_calibration_warn_pct',
  'forecast_default_calibration_fail_pct',
  // WF2 P6.5 — chain-honesty WARN/FAIL floors.
  'coa_freshness_fail_days',                 // assert-coa-freshness 3-tier FAIL
  'coa_active_trades_warn_max',              // classify-coa-trades active fan-out WARN
  'permits_bylaw_max_fsi_null_warn_pct',     // enrich-permits bylaw NULL-rate floors
  'permits_bylaw_max_coverage_null_warn_pct',
  'coa_bylaw_max_fsi_null_warn_pct',
  'coa_bylaw_max_coverage_null_warn_pct',
];

describe('LOGIC_VAR_DEFAULTS — complete key set', () => {
  it('contains all expected logic variable keys', () => {
    for (const key of EXPECTED_LOGIC_VAR_KEYS) {
      expect(LOGIC_VAR_DEFAULTS).toHaveProperty(key);
    }
  });

  it('has no extra keys beyond the expected set', () => {
    const extra = Object.keys(LOGIC_VAR_DEFAULTS).filter(
      (k) => !EXPECTED_LOGIC_VAR_KEYS.includes(k),
    );
    expect(extra).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema parity test — LOGIC_VAR_DEFAULTS ↔ logic_variables.json ↔ config-loader
//
// After WF3-0 (seed refactor), both LOGIC_VAR_DEFAULTS (TS) and
// FALLBACK_LOGIC_VARS (JS) are derived from scripts/seeds/logic_variables.json.
// This test verifies:
//   1. The JSON exists and contains all expected keys.
//   2. LOGIC_VAR_DEFAULTS keys + values match the JSON (both directions).
//   3. config-loader.js derives FALLBACK_LOGIC_VARS from the JSON
//      (text check for the require statement — prevents manual drift).
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema parity — LOGIC_VAR_DEFAULTS ↔ logic_variables.json ↔ config-loader', () => {
  const jsonPath = path.join(REPO_ROOT, 'scripts', 'seeds', 'logic_variables.json');
  const configLoaderPath = path.join(REPO_ROOT, 'scripts', 'lib', 'config-loader.js');

  type LogicVarMeta = { default: number; type: string; description?: string };
  let jsonData: Record<string, LogicVarMeta> = {};
  let configLoaderSource = '';

  try {
    jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Record<string, LogicVarMeta>;
  } catch { /* handled by the readable test below */ }

  try {
    configLoaderSource = fs.readFileSync(configLoaderPath, 'utf-8');
  } catch { /* handled by the readable test below */ }

  const jsonKeys = Object.keys(jsonData);

  it('logic_variables.json is readable and non-empty', () => {
    expect(jsonKeys.length).toBeGreaterThan(0);
  });

  it('logic_variables.json contains all expected keys', () => {
    for (const key of EXPECTED_LOGIC_VAR_KEYS) {
      expect(jsonData, `JSON missing key: ${key}`).toHaveProperty(key);
    }
  });

  it('logic_variables.json has no extra keys beyond the expected set', () => {
    const extra = jsonKeys.filter((k) => !EXPECTED_LOGIC_VAR_KEYS.includes(k));
    expect(extra).toHaveLength(0);
  });

  it('LOGIC_VAR_DEFAULTS keys match logic_variables.json keys (both directions)', () => {
    for (const key of jsonKeys) {
      expect(LOGIC_VAR_DEFAULTS, `LOGIC_VAR_DEFAULTS missing JSON key: ${key}`).toHaveProperty(key);
    }
    for (const key of Object.keys(LOGIC_VAR_DEFAULTS)) {
      expect(jsonData, `JSON missing LOGIC_VAR_DEFAULTS key: ${key}`).toHaveProperty(key);
    }
  });

  it('LOGIC_VAR_DEFAULTS values match logic_variables.json defaults', () => {
    for (const [key, meta] of Object.entries(jsonData)) {
      expect(LOGIC_VAR_DEFAULTS[key]).toBe(meta.default);
    }
  });

  it('config-loader.js derives FALLBACK_LOGIC_VARS from logic_variables.json', () => {
    expect(configLoaderSource.length).toBeGreaterThan(100);
    // After WF3-0, config-loader requires the seed JSON — no inline key list.
    expect(configLoaderSource).toMatch(/require.*seeds\/logic_variables/);
    // The derived assignment must still exist.
    expect(configLoaderSource).toMatch(/FALLBACK_LOGIC_VARS\s*=/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas — unit validation
// ─────────────────────────────────────────────────────────────────────────────

describe('LogicVariableUpdateSchema', () => {
  it('accepts a valid numeric update', () => {
    const result = LogicVariableUpdateSchema.safeParse({ key: 'los_base_divisor', value: 5000 });
    expect(result.success).toBe(true);
  });

  it('accepts a JSON-type update (no numeric value)', () => {
    const result = LogicVariableUpdateSchema.safeParse({
      key: 'income_premium_tiers',
      value: null,
      jsonValue: { 100000: 1.2, 150000: 1.5 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty key', () => {
    const result = LogicVariableUpdateSchema.safeParse({ key: '', value: 5 });
    expect(result.success).toBe(false);
  });

  it('rejects a payload with both numeric value and jsonValue populated (XOR invariant)', () => {
    const result = LogicVariableUpdateSchema.safeParse({
      key: 'income_premium_tiers',
      value: 5,
      jsonValue: { 100000: 1.2 },
    });
    expect(result.success).toBe(false);
  });
});

describe('TradeConfigUpdateSchema', () => {
  it('accepts a valid partial trade config update', () => {
    const result = TradeConfigUpdateSchema.safeParse({
      tradeSlug: 'plumbing',
      multiplierBid: 3.0,
      imminentWindowDays: 21,
    });
    expect(result.success).toBe(true);
  });

  it('rejects allocationPct > 1', () => {
    const result = TradeConfigUpdateSchema.safeParse({
      tradeSlug: 'plumbing',
      allocationPct: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects structureComplexityFactor below 0.5', () => {
    const result = TradeConfigUpdateSchema.safeParse({
      tradeSlug: 'framing',
      structureComplexityFactor: 0.4,
    });
    expect(result.success).toBe(false);
  });
});

describe('ScopeMatrixUpdateSchema', () => {
  it('accepts a valid cell update', () => {
    const result = ScopeMatrixUpdateSchema.safeParse({
      permitType: 'new building',
      structureType: 'sfd',
      gfaAllocationPercentage: 1.0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects gfaAllocationPercentage of 0 (must be > 0)', () => {
    const result = ScopeMatrixUpdateSchema.safeParse({
      permitType: 'addition',
      structureType: 'sfd',
      gfaAllocationPercentage: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('ConfigUpdatePayloadSchema', () => {
  it('accepts an empty payload (no-op diff)', () => {
    const result = ConfigUpdatePayloadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a full multi-section payload', () => {
    const result = ConfigUpdatePayloadSchema.safeParse({
      logicVariables: [{ key: 'los_base_divisor', value: 8000 }],
      tradeConfigs: [{ tradeSlug: 'plumbing', multiplierBid: 3.0 }],
      scopeMatrix: [{ permitType: 'addition', structureType: 'sfd', gfaAllocationPercentage: 0.3 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed tradeSlug in tradeConfigs array', () => {
    const result = ConfigUpdatePayloadSchema.safeParse({
      tradeConfigs: [{ tradeSlug: '', multiplierBid: 3.0 }],
    });
    expect(result.success).toBe(false);
  });
});
