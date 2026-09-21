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
import { GROUPS, JSON_KEYS } from '@/features/admin-controls/components/GlobalConfigCard';

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
  // batch-2 Phase 0.9 I5 (2026-09-16) — geocode_permits' three. THREE and not one: the
  // coverage bound is the step's only pre-conversion literal (Rule 3), and the other two are
  // REQUIRED on the ENRICHER profile by d7668b8a's x-profile amendment. Declaring the literal
  // "none" for either would have been legal and would have re-created the ER-D1 silence 0.10
  // had just paid to remove, so both name real, seeded, admin-visible variables.
  'geocode_permits_coverage_warn_pct', // I5 (2026-09-16) — the ONLY literal threshold the pre-conversion file contained (95, twice); shipped RED on purpose, ledgered GP-D1
  'geocode_permits_heartbeat_minutes', // I5 (2026-09-16) — execution.heartbeat_minutes_from_config; a non-finite resolution THROWS rather than silently disabling the ticker
  'geocode_permits_lock_timeout_ms', // I5 (2026-09-16) — execution.lock_timeout_ms_from_config; the shared txn holds a full re-join plus a destructive retraction on a table five steps read
  'enrich_parcels_defer_threshold_rows', // Spec 43/47 §8.7 — B2 per-pass scope-defer threshold (R3-B8)
  'enrich_parcels_heartbeat_minutes', // WF3 cloud-parity FIX 3.2b (2026-09-03) — optimal-config stream progress heartbeat interval
  'enrich_parcels_pass_statement_timeout_minutes', // WF3 enrich_parcels stall commit 1 (2026-09-03) — bounded, LOUD SET LOCAL statement_timeout for passes 1-4
  'enrich_parcels_lock_timeout_ms', // WF3 enrich_parcels stall commit 1 (2026-09-03) — bounded, LOUD SET LOCAL lock_timeout for passes 1-4
  'enrich_parcels_scope_recovery_batch_size', // WF3 EP-D14 (2026-09-10) — pass-5 D4' recovery batch size (incremental mode; --full stamps set-based)
  'enrich_parcels_pending_scope_warn_max', // WF3 EP-D14 (2026-09-10) — pre_write WARN bound on pending pass-3 scope parcels before pass 5
  'enrich_parcels_scope_retire_after_hours', // WF3 EP-PASS3-BACKLOG (2026-09-15) — retention window for a PRIOR run's unconsumed pass-3 scope rows, retired at step start
  // Batch-2 row 2.1 `enrich_ravines` (2026-09-18, commit 1) — 7 vars, seeded at commit 1 ahead of
  // the compute/shell landing at commit 2b (Rule 3 externalization; RV-L3 removed an 8th proposed
  // var — the invalid-geometry ratio stays a pinned literal, no contract_read hook can read config).
  'enrich_ravines_distance_coverage_pass_pct',
  'enrich_ravines_distance_coverage_warn_pct',
  'enrich_ravines_heartbeat_minutes',
  'enrich_ravines_lock_timeout_ms',
  'enrich_ravines_phase_timeout_minutes',
  'enrich_ravines_distance_plausible_min_magnitude_m',
  'enrich_ravines_distance_plausible_max_m',
  'enrich_ravines_distance_collapse_floor_m', // output-panel O4 (2026-09-18) — degrees-not-metres collapse floor
  // Batch-2 row 2.2 `enrich_heritage` (2026-09-20, commit 2) — 10 vars, Rule 3 externalization.
  'enrich_heritage_address_levenshtein_threshold',
  'enrich_heritage_unlinked_point_warn_pct',
  'enrich_heritage_unlinked_point_fail_pct',
  'enrich_heritage_designated_min_count',
  'enrich_heritage_part_iv_min_count',
  'enrich_heritage_heartbeat_minutes',
  'enrich_heritage_lock_timeout_ms',
  'enrich_heritage_phase_timeout_minutes',
  'enrich_heritage_designated_share_plausible_max_pct', // Reality-Check §7 — designated-share ceiling
  'enrich_heritage_designated_count_collapse_floor', // Reality-Check O4-class §7 — designated-count collapse floor
  'step_post_check_statement_timeout_minutes', // WF3 EP-D17 (2026-09-10) — default ceiling for an every_run invariants[]/plausibility[] entry with no declared statement_timeout
  'parcels_dead_tuple_ratio_warn_max', // WF3 EP-D17 (2026-09-10) — WARN bound + execution.maintenance trigger threshold for parcels' pg_stat_user_tables dead_ratio
  'step_post_check_concurrency', // WF3 EP-D17 output-panel fix F7 (2026-09-10) — batch width cap for concurrent invariants[]/plausibility[] entries
  'parcels_maintenance_timeout_minutes', // WF3 EP-D17 output-panel fix F5 (2026-09-10) — declared ceiling for the execution.maintenance VACUUM statement
  'refresh_snapshot_read_statement_timeout_minutes', // WF3 wf3_deep_scrapes_failures (2026-09-18, cause B) — per-statement SET statement_timeout for runRecorderPhase's main + optional reads
  'refresh_snapshot_phase_deadline_minutes', // WF3 wf3_deep_scrapes_failures (2026-09-18, cause B) — wall-clock phase deadline over runRecorderPhase's main and optional read loops
  // Pilot 9 commit 7b (2026-09-04, Ask 5 externalization, Spec 78 §P3C.1/§P3C.2) — the 7 pass-4 comp literals.
  'enrich_parcels_comp_lot_tol',
  'enrich_parcels_comp_knn_overfetch',
  'enrich_parcels_comp_top_n',
  'enrich_parcels_comp_over_capture_clamp',
  'enrich_parcels_comp_fsi_min_plausible',
  'enrich_parcels_comp_fsi_max_plausible',
  'enrich_parcels_comps_window_years',
  // Pilot 9 commit 7b — OPTCFG_BATCH, pass-5 stream batchSize, the bbox degree divisor.
  'enrich_parcels_optcfg_batch_size',
  'enrich_parcels_pass5_stream_batch_size',
  'enrich_parcels_bbox_degree_divisor',
  // Pilot 9 commit 7b (Spec 65 §3a DEC-4) — the zoning_class-coverage PASS/WARN floors (95/90).
  'enrich_parcels_zone_class_pct_pass_floor',
  'enrich_parcels_zone_class_pct_warn_floor',
  // Pilot 9 commit 7b — NEW: the pass-5 timeout bound (Ask 7). `enrich_parcels_comps_as_of_date`
  // (the comps clock-anchor override, Fold G3) was declared here too but REMOVED at commit
  // 7e/2 (2026-09-07): resolveConfig's invalidReason (scripts/lib/step/config.js:76-81) is
  // unconditionally numeric-only, so a nullable/string override throws on_invalid:"fail" on
  // every real invocation — found running this pilot's own G2' golden capture. The MANDATORY
  // seam (ctx.clock.asOfDate(), no bare now()::date literal) is unaffected; only the OPTIONAL
  // operator-override capability was dropped. See docs/reports/review_followups.md (MED).
  'enrich_parcels_pass5_timeout_minutes',
  'centreline_propagation_coverage_min', // Spec 62 §8e L24c — enrich-permits propagation coverage gate
  'road_overlay_distance_m', // Spec 58 — seeded for WF2 enrich-parcels (F-C2)
  'reno_coa_uplift_pct', // Spec 65 §6 SC-3 — new-build CoA uplift over max-build GFA
  'reno_kitchen_gfa_pct', // Spec 65 §6 SC-3 — kitchen reno as %-of-footprint
  'reno_bath_gfa_pct', // Spec 65 §6 SC-3 — bath reno as %-of-footprint
  'mislink_footprint_lot_tol', // Spec 65 §5 (WF3-A) — mislink guard tolerance (footprint > lot)
  'max_build_min_dimension_m', // Spec 65 §4 MB-3 (WF3 Phase 1 D-C) — viability floor for build dims
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
  'link_parcels_confidence_address_points_exact', // T1, pilot 7
  'link_parcels_confidence_exact_address',        // T2, pilot 7
  'link_parcels_confidence_spatial_polygon',      // T3, pilot 7
  'link_parcels_confidence_name_only',            // T4, pilot 7
  'link_parcels_link_rate_warn_pct',              // T5, pilot 7
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
  // ── Spec 122 §1.2a P4, LINK pilot (link_massing conversion, 2026-08-27) ────
  // The step declared three tunables and registered all three; its ONE verdict-bound
  // threshold and its two WRITTEN confidences were bare literals with zero registered
  // variables — the link-rate floor at two sites (the comparison and a duplicated
  // '>= 50%' render string), each confidence at two sites across two code paths that
  // had to agree by hand. Seeded (mig-099 seed contract, no migration), rendered under
  // GROUPS "Spatial & Massing". The link-rate floor is the verdict bound, reached
  // through `checks[].limit_from_config`.
  'link_massing_link_rate_fail_pct',
  'link_massing_centroid_confidence',
  'link_massing_nearest_confidence',
  // batch-2 I4 (link_neighbourhoods, LINK 3/3, 2026-09-16) — the same P4-externalization
  // class again: pre-conversion the WARN floor (95) and the FAIL floor (50) were bare
  // literals at scripts/link-neighbourhoods.js:346, each spelled TWICE (the comparison and
  // a duplicated render string), and the no-match population had no bound at all. All three
  // are seeded and rendered under a new GROUPS entry, "Neighbourhood Linking". The two rate
  // floors are verdict bounds reached through `checks[].limit_from_config` (declared
  // `pct >= N`, the direct floor form — NOT link_massing's/link_parcels' complement
  // encoding, which those rows use only because their own bounds predate `pct >=`).
  // The no-match ceiling bounds a WARN-only observational row and carries on_invalid
  // "clamp"; its default is 0 because 0 is what it MEASURES (every coordinate-bearing
  // permit is linked), never because zero was assumed.
  'link_neighbourhoods_link_rate_warn_pct',
  'link_neighbourhoods_link_rate_fail_pct',
  'link_neighbourhoods_no_match_warn_count',
  'wsib_fuzzy_match_threshold',       // E20
  // C1 pilot 4 (link_wsib, MATCHER, 2026-08-28) — T2-T8. Same P4-externalization class
  // as link_massing's trio above: T2 is the verdict-bound link-rate floor (LW-D1, reached
  // through checks[].limit_from_config, pct >= form); T3-T5 are the three written
  // confidences (one per tier); T6 is the entity fan-in WARN; T7 bounds A-7's tier-3-full
  // convergence loop; T8 (WF3-F, LW-D14) is the tier3_token_overlap FAIL floor. Seeded via
  // scripts/seeds/logic_variables.json, rendered under GROUPS "WSIB Matching".
  'link_wsib_link_rate_warn_pct',
  'link_wsib_tier1_confidence',
  'link_wsib_tier2_confidence',
  'link_wsib_tier3_confidence',
  'link_wsib_entity_fanin_warn',
  'link_wsib_tier3_full_max_iterations',
  'link_wsib_tier3_token_overlap_fail_pct',
  // C1 pilot 5 (link_parcel_addresses, MATERIALIZER, 2026-08-29) — T1-T5. T1 is the
  // batch-size pacing knob (not verdict-affecting); T2/T3 are the coverage-gap WARN
  // ceilings (pct <=, limit_from_config); T4/T5 are the non-CONDO/CONDO fan-out WARN
  // ceilings (Fold B's honest aggregate). Seeded via scripts/seeds/logic_variables.json,
  // rendered under GROUPS "Parcel-Address Bridge".
  'link_parcel_addresses_batch_size',
  'link_parcel_addresses_no_address_warn_pct',
  'link_parcel_addresses_no_parcel_warn_pct',
  'link_parcel_addresses_fanout_warn_noncondo',
  'link_parcel_addresses_fanout_warn_condo',
  'link_parcel_addresses_structure_link_rate_warn_pct', // LPA-D5 (WF3-B)
  'link_parcel_addresses_fanout_warn_rd_rs',            // LPA-D5 (WF3-B)
  'compute_centroids_failed_geometries_warn',           // C1 pilot 6 (BACKFILL), T1
  'compute_centroids_compute_rate_warn_pct',            // C1 pilot 6 (BACKFILL), T2
  'compute_centroids_full_recompute_batch_size',        // CC-D3 WF3 (2026-08-30), T3
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
  // P16 §5.C [BUG-6] — hard gate for the lean scope-mapped inference layer (seeded OFF).
  'p16_inference_layer_enabled',
  // P16 16E — provenance weight for inference-basis forecast inputs (0.5× default).
  'inference_weight',
  // Spec 86 §1 — lifecycle_status_history ledger retention (mig 136, default 1825 = 5 years).
  // Added to seeds JSON in P20 GROUPS reconciliation (v3 CRIT-4 gap discovery).
  'lifecycle_status_history_retention_days',
  // Spec 122 §1.2a P4 (Pilot 1 P4 remediation, 2026-08-25) — assert_schema's three
  // externalized knobs: the CKAN cost-type sample size and the two ranged-read
  // windows. Seeded (mig-099 seed contract, no migration), declared in the step's
  // descriptor `config`, rendered under GROUPS "Data Quality Thresholds".
  'assert_schema_type_sample_rows',
  'assert_schema_csv_header_bytes',
  'assert_schema_geojson_probe_bytes',
  // Spec 122 §1.2a P4 (Pilot 2 INGESTOR conversion, 2026-08-25) — load_ravines' six
  // knobs, every one of which was a Zod `.default()` wearing a variable's name: the
  // ConfigSchema declared them and NOTHING registered them, so `loadMarketplaceConfigs`
  // always fell through to the literal. Four are verdict bounds bound to a declared
  // check via `checks[].limit_from_config`. Seeded (mig-099 seed contract, no
  // migration), rendered under GROUPS "Source Ingestion". Closes followup #421.
  'load_ravines_dataset_age_warn_years',
  'load_ravines_count_drift_fail_pct',
  'load_ravines_geometry_update_warn_pct',
  'load_ravines_invalid_geometry_fail_pct',
  'load_ravines_mass_delete_fail_pct',
  'load_ravines_download_timeout_ms',
  // WF2 "Step Validator, Data-First" (Spec 124 §2 Rule 13 addendum, VAL-WF2, commit 1) —
  // the every_run/validate_only frequency-default budget for invariants[]/plausibility[]
  // candidates, rendered under GROUPS "Step Validator".
  'invariants_every_run_budget_ms',
  // C4 batch 1 I1 (2026-09-11, `assert_global_coverage` commit 7) — 7 pairs, the
  // per-field calibrated-coverage thresholds promoted off bare JS literals (report
  // §2.4 adjudication: IL-3/DEC-1, IL-8, IL-9, IL-10, IL-11 ×2, IL-12).
  'zoning_class_coverage_pass_pct', 'zoning_class_coverage_warn_pct',
  'coa_neighbourhood_coverage_pass_pct', 'coa_neighbourhood_coverage_warn_pct',
  'coa_structure_type_coverage_pass_pct', 'coa_structure_type_coverage_warn_pct',
  'sources_zoning_class_coverage_pass_pct', 'sources_zoning_class_coverage_warn_pct',
  'sources_maxbuild_coverage_pass_pct', 'sources_maxbuild_coverage_warn_pct',
  'parcel_cost_menu_coverage_pass_pct', 'parcel_cost_menu_coverage_warn_pct',
  'external_coverage_pass_pct', 'external_coverage_warn_pct',
  // C4 batch 1 I2 (2026-09-12, `assert_data_bounds` commit 7) — 18 new tunables
  // (report §2.4 adjudication: IL-2, IL-8, IL-9, IL-10 ×4, IL-11 ×5, + 8 more
  // promoted-in-full thresholds — scripts/lib/assert-data-bounds-fields.js
  // LOGIC_VAR_DEFS). calibration_freshness_warn_hours is NOT added here — it
  // already exists in this list from an earlier pilot and stays (a genuine
  // second consumer, scripts/compute-phase-calibration.js, was found this
  // session — not deleted).
  'cost_outlier_count_warn_max',
  'sources_address_points_floor', 'sources_parcels_floor', 'sources_building_footprints_floor',
  'sources_neighbourhoods_floor', 'sources_ravines_floor', 'sources_heritage_properties_floor',
  'sources_heritage_districts_floor', 'sources_centreline_floor',
  'coa_null_address_count_warn_max', 'coa_ancient_hearing_count_warn_max',
  'coa_future_hearing_window_years', 'coa_cost_gt_threshold_cad', 'coa_cost_gt_threshold_warn_max',
  'coa_fsi_gt_threshold', 'coa_gfa_over_lot_multiple', 'coa_gfa_over_lot_warn_max',
  'inspection_ancient_dates_count_warn_max',
  // C4 batch 1 I3 (2026-09-14, `assert_engine_health` commit 7) — 6 new tunables
  // (report §4.4 adjudication: 4 top-level thresholds + 2 per-audit-table AEH-IL-5
  // variables; the 6th check, coa_dead_tuple_pct, reuses engine_health_insp_dead_tuple_fail_pct
  // per AEH-IL-6 rather than declaring a 7th). Plus a 7th, added at commit 8's peel (R1,
  // report §9.6): the `live >= 1000` dead-tuple-check floor, previously a bare literal.
  'engine_health_dead_tuple_ratio_warn_max', 'engine_health_seq_scan_ratio_warn_max',
  'engine_health_seq_scan_min_rows', 'engine_health_ping_pong_ratio_warn_max',
  'engine_health_insp_dead_tuple_fail_pct', 'engine_health_insp_update_insert_fail_ratio',
  'engine_health_dead_tuple_min_rows',

  // batch2 P1.1 (2026-09-18, assert_parcel_sanity) — 35 new parcel_sanity_* variables
  // (34 magnitude bounds/coherence tolerances + 3 distribution-scan constants), all
  // ported verbatim from the pre-conversion literal named in each var's own
  // logic_variables.json description (scripts/lib/assert-parcel-sanity-fields.js
  // LOGIC_VAR_DEFS). The 2 already-registered reused vars (max_build_min_dimension_m,
  // mislink_footprint_lot_tol) are NOT re-listed here — they are already present
  // above from enrich_parcels' own conversion, one copy of the policy (Ask A6(a)).
  'parcel_sanity_lot_size_min_sqm', 'parcel_sanity_lot_size_max_sqm', 'parcel_sanity_max_build_width_max_m', 'parcel_sanity_max_build_length_max_m',
  'parcel_sanity_lowrise_opt_aor_gfa_max_sqm', 'parcel_sanity_nonlowrise_opt_aor_gfa_max_sqm', 'parcel_sanity_comp_fsi_p50_max', 'parcel_sanity_comp_fsi_p50_min',
  'parcel_sanity_priced_newbuild_min_gfa_sqm', 'parcel_sanity_lowrise_bylaw_fsi_max', 'parcel_sanity_bylaw_fsi_max', 'parcel_sanity_lowrise_coverage_max_pct',
  'parcel_sanity_lowrise_bylaw_height_max_m', 'parcel_sanity_footprint_coverage_max_ratio', 'parcel_sanity_max_build_fsi_max', 'parcel_sanity_coa_fsi_max',
  'parcel_sanity_lowrise_maxbuild_height_max_m', 'parcel_sanity_lowrise_maxbuild_stories_max', 'parcel_sanity_rd_maxbuild_stories_max', 'parcel_sanity_height_per_storey_min_m',
  'parcel_sanity_height_per_storey_max_m', 'parcel_sanity_opt_storeys_max', 'parcel_sanity_newbuild_cost_per_sqm_min', 'parcel_sanity_newbuild_cost_per_sqm_max',
  'parcel_sanity_lowrise_cost_fb_max_cad', 'parcel_sanity_cost_addition_max_cad', 'parcel_sanity_dim_lot_tolerance_m', 'parcel_sanity_gfa_coherence_tolerance_sqm',
  'parcel_sanity_cost_coherence_tolerance_cad', 'parcel_sanity_greenspace_tolerance_sqm', 'parcel_sanity_realized_fsi_p90_min', 'parcel_sanity_realized_fsi_p90_max',
  'parcel_sanity_distribution_percentile', 'parcel_sanity_distribution_median_multiplier', 'parcel_sanity_distribution_median_floor',
  // Batch-2 row 2.4 (2026-09-21, compute_parcel_cost_estimates) — 19 new vars: the 3 EXISTING
  // migration-205-seeded keys added to this seed file for the first time (§0.6 refutation —
  // they existed live but a fresh cloud seed apply would have left them unset) + 16 new
  // compute_parcel_cost_* keys (3 runner-profile, 4 shell/execution, 6 engine tunables threaded
  // through parcel-cost.js's REQUIRED opts.config, 3 plausibility, one dropped per FOLD-V1 —
  // see scripts/compute-parcel-cost-estimates.descriptor.json config.logic_variables[]).
  'cost_escalation_index', 'cost_rates_stale_months', 'cost_index_stale_months',
  'compute_parcel_cost_heartbeat_minutes', 'compute_parcel_cost_lock_timeout_ms', 'compute_parcel_cost_phase_timeout_minutes',
  'compute_parcel_cost_batch_size', 'compute_parcel_cost_stream_batch_size', 'compute_parcel_cost_min_population', 'compute_parcel_cost_engine_error_max',
  'compute_parcel_cost_fsi_max_plausible', 'compute_parcel_cost_escalation_min_multiplier', 'compute_parcel_cost_escalation_fallback_multiplier',
  'compute_parcel_cost_premium_default', 'compute_parcel_cost_adjustment_factor_default', 'compute_parcel_cost_min_priceable_area_sqm',
  'compute_parcel_cost_menu_coverage_min_pct', 'compute_parcel_cost_empty_menu_max_pct', 'compute_parcel_cost_line_total_max_cad',
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
// GROUPS reconciliation — GROUPS (numeric) ⊆ logic_variables.json
//
// Guards against the drift where a key is added to GlobalConfigCard's GROUPS
// but its default is never registered in seeds JSON (the SSoT for LOGIC_VAR_DEFAULTS).
// A missing seed default means the control-panel PUT would silently accept a
// draft value that has no registered baseline — the Delta Guard and fallback
// config-loader would both see an undefined default and produce incorrect guards.
// ─────────────────────────────────────────────────────────────────────────────

describe('GROUPS reconciliation — GlobalConfigCard GROUPS ⊆ logic_variables.json keys', () => {
  const jsonPath = path.join(REPO_ROOT, 'scripts', 'seeds', 'logic_variables.json');

  type LogicVarMeta = { default: number; type: string };
  let jsonData: Record<string, LogicVarMeta> = {};
  try {
    jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Record<string, LogicVarMeta>;
  } catch { /* handled by the readable test below */ }

  const allGroupNumericKeys = GROUPS.flatMap((g) => g.keys).filter((k) => !JSON_KEYS.has(k));

  it('all numeric GROUPS keys exist in logic_variables.json', () => {
    for (const key of allGroupNumericKeys) {
      expect(jsonData, `GROUPS key "${key}" missing from logic_variables.json`).toHaveProperty(key);
    }
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
