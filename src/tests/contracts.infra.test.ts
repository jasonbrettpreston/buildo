// 🔗 SPEC LINK: docs/specs/00-architecture/00_engineering_standards.md §11 (Plan Compliance)
//
// Spec-extracted contracts: this test is the enforcement layer for
// docs/specs/_contracts.json. Every numeric threshold that crosses the
// spec ↔ SQL ↔ Zod ↔ migration boundary lives in the JSON, and this test
// grep-asserts each value still appears in its declared consumer file.
//
// Why: prior holistic reviews caught ~5 bugs that were "spec said X, code
// did Y" drift (pillar bands 0-20 vs 0-30, fit_score max 23 vs 100,
// VARCHAR(100) vs (128), etc.). Mocked tests can't catch these because
// the mock returns whatever the test author told it to return. Locking
// the consumer files to the JSON via grep makes drift a CI failure.
//
// How to add a contract:
//   1. Add the value to docs/specs/_contracts.json under the right group.
//   2. Add a CONSUMER_RULES row below mapping JSON path → file:pattern.
//   3. Run `npx vitest run src/tests/contracts.infra.test.ts`.
//
// How to update a contract:
//   1. Bump the value in _contracts.json.
//   2. Update every consumer file referenced in CONSUMER_RULES.
//   3. Re-run the test. It will tell you exactly which file is out of sync.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

interface Contracts {
  scoring: {
    permit_proximity_max: number;
    permit_timing_max: number;
    permit_value_max: number;
    permit_opportunity_max: number;
    permit_total_max: number;
    builder_proximity_max: number;
    builder_value_max: number;
    builder_opportunity_max: number;
    builder_total_max: number;
  };
  rate_limits: { feed_per_min: number; view_per_min: number; window_sec: number };
  geo: { max_radius_km: number; default_radius_km: number };
  feed: {
    max_limit: number;
    default_limit: number;
    forced_refetch_threshold_m: number;
    coord_precision: number;
  };
  schema: {
    firebase_uid_max: number;
    trade_slug_max: number;
    permit_num_max: number;
    revision_num_max: number;
  };
  retention: { lead_views_days: number; grace_purge_days: number };
  zoning: {
    ambiguous_dominant_share_max: number;
    permits_zoning_class_coverage_fail: number;
    coa_zoning_class_coverage_fail: number;
  };
  build_norms: {
    window_years: number;
    min_sample_default: number;
    over_capture_clamp: number;
    build_ratio_null_rate_warn: number;
    fsi_plausibility_max: number;
    storeys_plausibility_max: number;
  };
  optimal_config: {
    garden_footprint_rear_frac: number;
    garden_footprint_max_sqm: number;
    ancillary_coverage_max_frac: number;
    soft_landscape_wide_frac: number;
    soft_landscape_narrow_frac: number;
    garden_sep_low_m: number;
    garden_sep_high_m: number;
    laneway_footprint_max_sqm: number;
    laneway_abuts_min_m: number;
    garage_car_footprint_sqm: number;
  };
  parcel_cost_model: {
    rate_fb_sqm: number;
    rate_solar_sqm: number;
    rate_garden_suite_sqm: number;
    rate_laneway_suite_sqm: number;
    rate_kitchen_sqm: number;
    rate_bath_sqm: number;
    rate_garage_sqm: number;
    rate_basement_underpin_sqm: number;
    rate_basement_sqm: number;
    rate_gut_sqm: number;
    rate_addition_sqm: number;
    solar_adj_factor: number;
  };
  p16_gate: {
    recall_floor: number;
    prec_floor: number;
    mean_lo: number;
    mean_hi: number;
    mean_warn: number;
    mean_fail: number;
  };
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONTRACTS_PATH = path.join(REPO_ROOT, 'docs', 'specs', '_contracts.json');

const contracts: Contracts = JSON.parse(fs.readFileSync(CONTRACTS_PATH, 'utf8'));

// Each rule asserts a regex (built from the contract value) appears in the
// listed file. Multiple consumers per value are listed as multiple rows.
interface Rule {
  name: string;
  value: number;
  file: string;
  pattern: RegExp;
}

const rules: Rule[] = [
  // ---- distance / radius ----
  {
    name: 'geo.max_radius_km → MAX_RADIUS_KM constant',
    value: contracts.geo.max_radius_km,
    file: 'src/features/leads/lib/distance.ts',
    pattern: new RegExp(`MAX_RADIUS_KM\\s*=\\s*${contracts.geo.max_radius_km}\\b`),
  },
  // ---- feed limits ----
  {
    name: 'feed.max_limit → MAX_FEED_LIMIT constant',
    value: contracts.feed.max_limit,
    file: 'src/features/leads/lib/get-lead-feed.ts',
    pattern: new RegExp(`MAX_FEED_LIMIT\\s*=\\s*${contracts.feed.max_limit}\\b`),
  },
  {
    name: 'feed.default_limit → DEFAULT_FEED_LIMIT constant',
    value: contracts.feed.default_limit,
    file: 'src/features/leads/lib/get-lead-feed.ts',
    pattern: new RegExp(`DEFAULT_FEED_LIMIT\\s*=\\s*${contracts.feed.default_limit}\\b`),
  },
  // feed.forced_refetch_threshold_m and feed.coord_precision were enforced
  // against src/features/leads/api/useLeadFeed.ts (deleted in Two-Client
  // Architecture purge 2026-04-22). These constants now belong to the Expo
  // mobile client. The contracts values are retained in _contracts.json for
  // when the mobile client enforces them.
  // ---- rate limits ----
  {
    name: 'rate_limits.feed_per_min → feed route RATE_LIMIT_PER_MIN',
    value: contracts.rate_limits.feed_per_min,
    file: 'src/app/api/leads/feed/route.ts',
    pattern: new RegExp(`RATE_LIMIT_PER_MIN\\s*=\\s*${contracts.rate_limits.feed_per_min}\\b`),
  },
  {
    name: 'rate_limits.view_per_min → view route RATE_LIMIT_PER_MIN',
    value: contracts.rate_limits.view_per_min,
    file: 'src/app/api/leads/view/route.ts',
    pattern: new RegExp(`RATE_LIMIT_PER_MIN\\s*=\\s*${contracts.rate_limits.view_per_min}\\b`),
  },
  {
    name: 'rate_limits.window_sec → feed route RATE_LIMIT_WINDOW_SEC',
    value: contracts.rate_limits.window_sec,
    file: 'src/app/api/leads/feed/route.ts',
    pattern: new RegExp(`RATE_LIMIT_WINDOW_SEC\\s*=\\s*${contracts.rate_limits.window_sec}\\b`),
  },
  {
    name: 'rate_limits.window_sec → view route RATE_LIMIT_WINDOW_SEC',
    value: contracts.rate_limits.window_sec,
    file: 'src/app/api/leads/view/route.ts',
    pattern: new RegExp(`RATE_LIMIT_WINDOW_SEC\\s*=\\s*${contracts.rate_limits.window_sec}\\b`),
  },
  // ---- scoring pillar maxes (permit, in get-lead-feed.ts header comment) ----
  {
    name: 'scoring.permit_value_max → permit value CASE max bucket',
    value: contracts.scoring.permit_value_max,
    file: 'src/features/leads/lib/get-lead-feed.ts',
    pattern: new RegExp(`WHEN 'mega'\\s+THEN ${contracts.scoring.permit_value_max}\\b`),
  },
  {
    name: 'scoring.permit_opportunity_max → permit opportunity CASE max bucket',
    value: contracts.scoring.permit_opportunity_max,
    file: 'src/features/leads/lib/get-lead-feed.ts',
    pattern: new RegExp(`WHEN 'Permit Issued' THEN ${contracts.scoring.permit_opportunity_max}\\b`),
  },
  // NOTE: scoring.builder_fit_max was removed 2026-04-09 when the
  // standalone builder-query.ts was deleted as dead code. The unified
  // feed in get-lead-feed.ts uses proximity/value/opportunity pillars
  // only — no separate "fit" cap. If a future standalone builder page
  // reintroduces a fit score, add the constant back and re-point this
  // check at the new consumer file.
  // ---- schema widths ----
  {
    name: 'schema.firebase_uid_max → user_profiles VARCHAR',
    value: contracts.schema.firebase_uid_max,
    file: 'migrations/075_user_profiles.sql',
    pattern: new RegExp(`user_id\\s+VARCHAR\\(${contracts.schema.firebase_uid_max}\\)`),
  },
  {
    name: 'schema.firebase_uid_max → lead_views widen migration',
    value: contracts.schema.firebase_uid_max,
    file: 'migrations/076_lead_views_user_id_widen.sql',
    pattern: new RegExp(`TYPE\\s+VARCHAR\\(${contracts.schema.firebase_uid_max}\\)`),
  },
  {
    name: 'schema.trade_slug_max → user_profiles trade_slug VARCHAR',
    value: contracts.schema.trade_slug_max,
    file: 'migrations/075_user_profiles.sql',
    pattern: new RegExp(`trade_slug\\s+VARCHAR\\(${contracts.schema.trade_slug_max}\\)`),
  },
  {
    name: 'schema.trade_slug_max → lead_views trade_slug VARCHAR',
    value: contracts.schema.trade_slug_max,
    file: 'migrations/070_lead_views_corrected.sql',
    pattern: new RegExp(`trade_slug\\s+VARCHAR\\(${contracts.schema.trade_slug_max}\\)`),
  },
  {
    name: 'schema.permit_num_max → lead_views permit_num VARCHAR',
    value: contracts.schema.permit_num_max,
    file: 'migrations/070_lead_views_corrected.sql',
    pattern: new RegExp(`permit_num\\s+VARCHAR\\(${contracts.schema.permit_num_max}\\)`),
  },
  {
    name: 'schema.revision_num_max → lead_views revision_num VARCHAR',
    value: contracts.schema.revision_num_max,
    file: 'migrations/070_lead_views_corrected.sql',
    pattern: new RegExp(`revision_num\\s+VARCHAR\\(${contracts.schema.revision_num_max}\\)`),
  },
  // ---- trade forecast grace-purge window (Spec 85) ----
  {
    name: 'retention.grace_purge_days → GRACE_PURGE_DAYS constant in compute-trade-forecasts',
    value: contracts.retention.grace_purge_days,
    file: 'scripts/compute-trade-forecasts.js',
    pattern: new RegExp(`GRACE_PURGE_DAYS\\s*=\\s*${contracts.retention.grace_purge_days}\\b`),
  },
  {
    name: 'retention.grace_purge_days → grace-purge SQL INTERVAL interpolation',
    value: contracts.retention.grace_purge_days,
    file: 'scripts/compute-trade-forecasts.js',
    pattern: /INTERVAL\s*'\$\{GRACE_PURGE_DAYS\} days'/,
  },
  // ---- control panel Zod constraints (Spec 86) ----
  {
    name: 'schema.trade_slug_max → TradeConfigUpdateSchema .max() constraint',
    value: contracts.schema.trade_slug_max,
    file: 'src/lib/admin/control-panel.ts',
    pattern: new RegExp(`tradeSlug.*max\\(${contracts.schema.trade_slug_max}\\)`),
  },
  // ---- zoning ambiguity threshold (Spec 65 enrich-parcels) ----
  {
    name: 'zoning.ambiguous_dominant_share_max → AMBIGUOUS_DOMINANT_SHARE_MAX constant',
    value: contracts.zoning.ambiguous_dominant_share_max,
    file: 'scripts/lib/zoning-precedence.js',
    pattern: new RegExp(
      `AMBIGUOUS_DOMINANT_SHARE_MAX\\s*=\\s*${contracts.zoning.ambiguous_dominant_share_max}\\b`,
    ),
  },
  // ---- F-H12 zoning coverage gates (Spec 66 enrich-permits) ----
  {
    name: 'zoning.permits_zoning_class_coverage_fail → PERMITS_COVERAGE_FAIL constant',
    value: contracts.zoning.permits_zoning_class_coverage_fail,
    file: 'scripts/enrich-permits.js',
    pattern: new RegExp(`PERMITS_COVERAGE_FAIL\\s*=\\s*${contracts.zoning.permits_zoning_class_coverage_fail}\\b`),
  },
  {
    name: 'zoning.coa_zoning_class_coverage_fail → COA_COVERAGE_FAIL constant',
    value: contracts.zoning.coa_zoning_class_coverage_fail,
    file: 'scripts/enrich-permits.js',
    pattern: new RegExp(`COA_COVERAGE_FAIL\\s*=\\s*${contracts.zoning.coa_zoning_class_coverage_fail}\\b`),
  },
  // ---- neighbourhood build-norms constants (Spec 78 Phase 1) ----
  {
    name: 'build_norms.window_years → BUILD_NORM_WINDOW_YEARS constant',
    value: contracts.build_norms.window_years,
    file: 'scripts/lib/build-norms.js',
    pattern: new RegExp(`BUILD_NORM_WINDOW_YEARS\\s*=\\s*${contracts.build_norms.window_years}\\b`),
  },
  {
    name: 'build_norms.min_sample_default → BUILD_NORM_MIN_SAMPLE_DEFAULT constant',
    value: contracts.build_norms.min_sample_default,
    file: 'scripts/lib/build-norms.js',
    pattern: new RegExp(`BUILD_NORM_MIN_SAMPLE_DEFAULT\\s*=\\s*${contracts.build_norms.min_sample_default}\\b`),
  },
  {
    name: 'build_norms.over_capture_clamp → OVER_CAPTURE_CLAMP constant',
    value: contracts.build_norms.over_capture_clamp,
    file: 'scripts/lib/build-norms.js',
    pattern: new RegExp(`OVER_CAPTURE_CLAMP\\s*=\\s*${contracts.build_norms.over_capture_clamp}\\b`),
  },
  {
    name: 'build_norms.build_ratio_null_rate_warn → BUILD_RATIO_NULL_RATE_WARN constant',
    value: contracts.build_norms.build_ratio_null_rate_warn,
    file: 'scripts/lib/build-norms.js',
    pattern: new RegExp(`BUILD_RATIO_NULL_RATE_WARN\\s*=\\s*${contracts.build_norms.build_ratio_null_rate_warn}\\b`),
  },
  {
    name: 'build_norms.fsi_plausibility_max → FSI_PLAUSIBILITY_MAX constant',
    value: contracts.build_norms.fsi_plausibility_max,
    file: 'scripts/lib/build-norms.js',
    pattern: new RegExp(`FSI_PLAUSIBILITY_MAX\\s*=\\s*${contracts.build_norms.fsi_plausibility_max}\\b`),
  },
  {
    name: 'build_norms.storeys_plausibility_max → STOREYS_PLAUSIBILITY_MAX constant',
    value: contracts.build_norms.storeys_plausibility_max,
    file: 'scripts/lib/build-norms.js',
    pattern: new RegExp(`STOREYS_PLAUSIBILITY_MAX\\s*=\\s*${contracts.build_norms.storeys_plausibility_max}\\b`),
  },
  // ---- optimal-config by-law constants (Spec 78 Phase 2; 569-2013 Ch.150.7) ----
  {
    name: 'optimal_config.garden_footprint_rear_frac → GARDEN_FOOTPRINT_REAR_FRAC',
    value: contracts.optimal_config.garden_footprint_rear_frac,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`GARDEN_FOOTPRINT_REAR_FRAC:\\s*${contracts.optimal_config.garden_footprint_rear_frac}\\b`),
  },
  {
    name: 'optimal_config.garden_footprint_max_sqm → GARDEN_FOOTPRINT_MAX_SQM',
    value: contracts.optimal_config.garden_footprint_max_sqm,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`GARDEN_FOOTPRINT_MAX_SQM:\\s*${contracts.optimal_config.garden_footprint_max_sqm}\\b`),
  },
  {
    name: 'optimal_config.ancillary_coverage_max_frac → ANCILLARY_COVERAGE_MAX_FRAC',
    value: contracts.optimal_config.ancillary_coverage_max_frac,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`ANCILLARY_COVERAGE_MAX_FRAC:\\s*${contracts.optimal_config.ancillary_coverage_max_frac}\\b`),
  },
  {
    name: 'optimal_config.soft_landscape_wide_frac → SOFT_LANDSCAPE_WIDE_FRAC',
    value: contracts.optimal_config.soft_landscape_wide_frac,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`SOFT_LANDSCAPE_WIDE_FRAC:\\s*${contracts.optimal_config.soft_landscape_wide_frac}\\b`),
  },
  {
    name: 'optimal_config.soft_landscape_narrow_frac → SOFT_LANDSCAPE_NARROW_FRAC',
    value: contracts.optimal_config.soft_landscape_narrow_frac,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`SOFT_LANDSCAPE_NARROW_FRAC:\\s*${contracts.optimal_config.soft_landscape_narrow_frac}\\b`),
  },
  {
    name: 'optimal_config.garden_sep_low_m → GARDEN_SEP_LOW_M',
    value: contracts.optimal_config.garden_sep_low_m,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`GARDEN_SEP_LOW_M:\\s*${contracts.optimal_config.garden_sep_low_m}\\b`),
  },
  {
    name: 'optimal_config.garden_sep_high_m → GARDEN_SEP_HIGH_M',
    value: contracts.optimal_config.garden_sep_high_m,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`GARDEN_SEP_HIGH_M:\\s*${contracts.optimal_config.garden_sep_high_m}\\b`),
  },
  {
    name: 'optimal_config.laneway_footprint_max_sqm → LANEWAY_FOOTPRINT_MAX_SQM',
    value: contracts.optimal_config.laneway_footprint_max_sqm,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`LANEWAY_FOOTPRINT_MAX_SQM:\\s*${contracts.optimal_config.laneway_footprint_max_sqm}\\b`),
  },
  {
    name: 'optimal_config.laneway_abuts_min_m → LANEWAY_ABUTS_MIN_M',
    value: contracts.optimal_config.laneway_abuts_min_m,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`LANEWAY_ABUTS_MIN_M:\\s*${contracts.optimal_config.laneway_abuts_min_m}\\b`),
  },
  {
    name: 'optimal_config.garage_car_footprint_sqm → GARAGE_CAR_FOOTPRINT_SQM',
    value: contracts.optimal_config.garage_car_footprint_sqm,
    file: 'scripts/lib/optimal-config.js',
    pattern: new RegExp(`GARAGE_CAR_FOOTPRINT_SQM:\\s*${contracts.optimal_config.garage_car_footprint_sqm}\\b`),
  },
  // ---- parcel_cost_model (Spec 88): seed-migration literal lock. Each rate's
  // canonical $/m² must appear as the seed literal for its archetype key in
  // migration 205. Anchored by the quoted archetype key so 4306 (BTH vs ADD)
  // and 4844 (FB vs CoA) and 'BAS' vs 'BAS_UNDERPIN' don't cross-match. ----
  {
    name: 'parcel_cost_model.rate_fb_sqm → migration 205 FB seed',
    value: contracts.parcel_cost_model.rate_fb_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'FB',\\s*${contracts.parcel_cost_model.rate_fb_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_solar_sqm → migration 205 SOLAR seed',
    value: contracts.parcel_cost_model.rate_solar_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'SOLAR',\\s*${contracts.parcel_cost_model.rate_solar_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_garden_suite_sqm → migration 205 LANE_GARDEN seed',
    value: contracts.parcel_cost_model.rate_garden_suite_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'LANE_GARDEN',\\s*${contracts.parcel_cost_model.rate_garden_suite_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_laneway_suite_sqm → migration 205 LANE_LANEWAY seed',
    value: contracts.parcel_cost_model.rate_laneway_suite_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'LANE_LANEWAY',\\s*${contracts.parcel_cost_model.rate_laneway_suite_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_kitchen_sqm → migration 205 KIT seed',
    value: contracts.parcel_cost_model.rate_kitchen_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'KIT',\\s*${contracts.parcel_cost_model.rate_kitchen_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_bath_sqm → migration 205 BTH seed',
    value: contracts.parcel_cost_model.rate_bath_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'BTH',\\s*${contracts.parcel_cost_model.rate_bath_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_garage_sqm → migration 205 GAR seed',
    value: contracts.parcel_cost_model.rate_garage_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'GAR',\\s*${contracts.parcel_cost_model.rate_garage_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_basement_underpin_sqm → migration 205 BAS_UNDERPIN seed',
    value: contracts.parcel_cost_model.rate_basement_underpin_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'BAS_UNDERPIN',\\s*${contracts.parcel_cost_model.rate_basement_underpin_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_basement_sqm → migration 205 BAS seed',
    value: contracts.parcel_cost_model.rate_basement_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'BAS',\\s*${contracts.parcel_cost_model.rate_basement_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_gut_sqm → migration 205 INT seed',
    value: contracts.parcel_cost_model.rate_gut_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'INT',\\s*${contracts.parcel_cost_model.rate_gut_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.rate_addition_sqm → migration 205 ADD seed',
    value: contracts.parcel_cost_model.rate_addition_sqm,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(`'ADD',\\s*${contracts.parcel_cost_model.rate_addition_sqm}\\b`),
  },
  {
    name: 'parcel_cost_model.solar_adj_factor → migration 205 SOLAR cost_adjustment_factor seed',
    value: contracts.parcel_cost_model.solar_adj_factor,
    file: 'migrations/205_archetype_cost_rates.sql',
    pattern: new RegExp(
      `'SOLAR',\\s*${contracts.parcel_cost_model.rate_solar_sqm},\\s*${contracts.parcel_cost_model.solar_adj_factor.toFixed(3)}\\b`,
    ),
  },
  // ---- P16 lean-complement GO/NO-GO gate (Spec 80 §5.C) ----
  {
    name: 'p16_gate.recall_floor → eval harness gateThresholds.recallFloor',
    value: contracts.p16_gate.recall_floor,
    file: 'scripts/analysis/p14-trade-attachment-evaluation.js',
    pattern: new RegExp(`recallFloor:\\s*${contracts.p16_gate.recall_floor}\\b`),
  },
  {
    name: 'p16_gate.prec_floor → eval harness gateThresholds.precFloor',
    value: contracts.p16_gate.prec_floor,
    file: 'scripts/analysis/p14-trade-attachment-evaluation.js',
    pattern: new RegExp(`precFloor:\\s*${contracts.p16_gate.prec_floor}\\b`),
  },
  {
    name: 'p16_gate.mean_lo → eval harness gateThresholds.meanLo',
    value: contracts.p16_gate.mean_lo,
    file: 'scripts/analysis/p14-trade-attachment-evaluation.js',
    pattern: new RegExp(`meanLo:\\s*${contracts.p16_gate.mean_lo}\\b`),
  },
  {
    name: 'p16_gate.mean_hi → eval harness gateThresholds.meanHi',
    value: contracts.p16_gate.mean_hi,
    file: 'scripts/analysis/p14-trade-attachment-evaluation.js',
    pattern: new RegExp(`meanHi:\\s*${contracts.p16_gate.mean_hi}\\b`),
  },
  // ---- P16 16F D7 global band (classify-permits §R10 rows) ----
  {
    name: 'p16_gate.mean_warn → classify-permits INFERENCE_MEAN_WARN',
    value: contracts.p16_gate.mean_warn,
    file: 'scripts/classify-permits.js',
    pattern: new RegExp(`INFERENCE_MEAN_WARN\\s*=\\s*${contracts.p16_gate.mean_warn}\\b`),
  },
  {
    name: 'p16_gate.mean_fail → classify-permits INFERENCE_MEAN_FAIL',
    value: contracts.p16_gate.mean_fail,
    file: 'scripts/classify-permits.js',
    pattern: new RegExp(`INFERENCE_MEAN_FAIL\\s*=\\s*${contracts.p16_gate.mean_fail}\\b`),
  },
];

describe('contracts.json — drift enforcement across spec/SQL/Zod/migration', () => {
  it('contracts JSON parses + has all required groups', () => {
    expect(contracts.scoring).toBeDefined();
    expect(contracts.rate_limits).toBeDefined();
    expect(contracts.geo).toBeDefined();
    expect(contracts.feed).toBeDefined();
    expect(contracts.schema).toBeDefined();
    expect(contracts.retention).toBeDefined();
    expect(contracts.zoning).toBeDefined();
    expect(contracts.build_norms).toBeDefined();
    expect(contracts.optimal_config).toBeDefined();
    expect(contracts.parcel_cost_model).toBeDefined();
  });

  it('permit pillar maxes sum to permit_total_max (spec 70 §4 invariant)', () => {
    const sum =
      contracts.scoring.permit_proximity_max +
      contracts.scoring.permit_timing_max +
      contracts.scoring.permit_value_max +
      contracts.scoring.permit_opportunity_max;
    expect(sum).toBe(contracts.scoring.permit_total_max);
  });

  it('builder pillar maxes sum to builder_total_max (spec 70 §4 invariant)', () => {
    // Builder timing pillar in the feed CTE is currently a fixed mid-band
    // proxy (15) — see get-lead-feed.ts builder_candidates comment. The
    // spec 70 §4 builder formula uses Activity (0-30) for pillar 2.
    // We assert the spec total here, not the proxy total.
    const sum =
      contracts.scoring.builder_proximity_max +
      contracts.scoring.permit_timing_max + // activity_max == permit timing max per spec 70 §4
      contracts.scoring.builder_value_max +
      contracts.scoring.builder_opportunity_max;
    // Note: spec uses Contact + Fit (0-20 each); the contract uses
    // builder_value/builder_opportunity as the CTE's actual pillar names.
    // Total still equals 100.
    expect(sum).toBe(contracts.scoring.builder_total_max);
  });

  for (const rule of rules) {
    it(`${rule.name} — value ${rule.value} present in ${rule.file}`, () => {
      const filePath = path.join(REPO_ROOT, rule.file);
      const contents = fs.readFileSync(filePath, 'utf8');
      if (!rule.pattern.test(contents)) {
        throw new Error(
          `Drift detected: ${rule.file} does not contain pattern ${rule.pattern} ` +
            `for contract value ${rule.value}. Either update the consumer file ` +
            `or update docs/specs/_contracts.json (and every other consumer of ` +
            `this contract).`,
        );
      }
      expect(rule.pattern.test(contents)).toBe(true);
    });
  }

  // ADR existence check: every accepted ADR in the docs/adr/ index must
  // exist as a non-empty file. Prevents accidental deletion that would
  // strand the source-file `// ADR:` header references.
  const adrs = [
    '001-dual-code-path.md',
    '002-polymorphic-lead-views.md',
    '003-on-delete-cascade-on-permits-fk.md',
    '004-manual-create-index-concurrently.md',
    '005-hardcoded-retry-after-60.md',
    '006-firebase-uid-not-fk.md',
  ];
  for (const adr of adrs) {
    it(`ADR exists and is non-empty: docs/adr/${adr}`, () => {
      const p = path.join(REPO_ROOT, 'docs', 'adr', adr);
      const stats = fs.statSync(p);
      expect(stats.size).toBeGreaterThan(500);
    });
  }

  // Canary: prove the test would actually catch drift. Mutate a known
  // value in a copy of the contracts and confirm the rule fails.
  it('canary — fails when a contract value drifts (proves the assertion is real)', () => {
    const fakeValue = 999_999;
    const fakePattern = new RegExp(`MAX_RADIUS_KM\\s*=\\s*${fakeValue}\\b`);
    const filePath = path.join(REPO_ROOT, 'src/features/leads/lib/distance.ts');
    const contents = fs.readFileSync(filePath, 'utf8');
    expect(fakePattern.test(contents)).toBe(false);
  });
});
