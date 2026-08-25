'use client';
/**
 * GlobalConfigCard — renders all numeric logic_variables grouped by domain
 * (~93 keys post migration 119), plus income_premium_tiers (JSONB type,
 * seeded via migration 097). Uses DeltaGuardInput for numeric fields and
 * JsonTiersEditor for the income_premium_tiers JSONB field.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 3
 * SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
 */

import React from 'react';
import type { LogicVariableRow } from '@/lib/admin/control-panel';
import { DeltaGuardInput } from './DeltaGuardInput';
import { JsonTiersEditor } from './JsonTiersEditor';
import { useAdminControlsStore } from '../store/useAdminControlsStore';

/**
 * Logical groups for display — covers all numeric keys + income_premium_tiers.
 * EXPORTED for the reconciliation test in src/tests/control-panel.logic.test.ts,
 * which asserts: all GROUPS numeric keys (excluding JSON_KEYS) ⊆ logic_variables.json.
 */
export const GROUPS: Array<{ label: string; keys: string[] }> = [
  {
    label: 'Lead Scoring',
    keys: [
      'los_multiplier_bid',
      'los_multiplier_work',
      'los_penalty_tracking',
      'los_penalty_saving',
      'los_base_cap',
      'los_base_divisor',
    ],
  },
  {
    label: 'Scoring Tiers',
    keys: [
      'score_tier_elite',
      'score_tier_strong',
      'score_tier_moderate',
    ],
  },
  {
    label: 'Timing & Staleness',
    keys: [
      'stall_penalty_precon',
      'stall_penalty_active',
      'expired_threshold_days',
      'coa_stall_threshold',
    ],
  },
  {
    label: 'Forecast & Urgency',
    keys: [
      'urgency_overdue_days',
      'urgency_upcoming_days',
      'calibration_default_median_days',
      'calibration_default_p25_days',
      'calibration_default_p75_days',
    ],
  },
  {
    label: 'Inspection & Closure',
    keys: [
      'inspection_stall_days',
      'stale_closure_abort_pct',
      'pending_closed_grace_days',
    ],
  },
  {
    label: 'Pre-Permits',
    keys: [
      'pre_permit_expiry_months',
      'pre_permit_stale_months',
    ],
  },
  {
    label: 'Coverage & Quality',
    keys: [
      'urban_coverage_ratio',
      'suburban_coverage_ratio',
      'trust_threshold_pct',
      'calibration_min_sample_size',
    ],
  },
  {
    label: 'Cost Tuning',
    keys: [
      'liar_gate_threshold',
      'commercial_shell_multiplier',
      'placeholder_cost_threshold',
      'income_premium_tiers',
    ],
  },
  {
    label: 'CoA Matching',
    keys: [
      'coa_match_conf_high',
      'coa_match_conf_medium',
      'snapshot_coa_conf_high',
      'coa_freshness_warn_days',
      // Phase F.2 — CRM CoA stall thresholds + imminent-alert window (mig 136 + mig 154).
      // coa_stall_threshold_p2_days: distinct from coa_stall_threshold (P1 intake stall).
      'coa_stall_threshold_p2_days',
      'coa_imminent_window_days',
    ],
  },
  {
    label: 'Spatial & Massing',
    keys: [
      'spatial_match_max_distance_m',
      'spatial_match_confidence',
      'massing_shed_threshold_sqm',
      'massing_garage_max_sqm',
      'massing_nearest_max_distance_m',
    ],
  },
  {
    label: 'WSIB Matching',
    keys: [
      'wsib_fuzzy_match_threshold',
    ],
  },
  {
    label: 'Data Quality Thresholds',
    keys: [
      'cost_outlier_ceiling_cad',
      'desc_null_rate_warn_pct',
      'builder_null_rate_warn_pct',
      'cost_est_null_rate_warn_pct',
      'cost_est_min_tiers',
      'calibration_freshness_warn_hours',
      'cost_model_coverage_warn_pct',
      // Spec 122 §1.2a P4 (Pilot 1) — assert_schema's three externalized knobs.
      // A seeded var absent from GROUPS is invisible to operators, which is the
      // same hidden-knob failure P4 exists to close; step-conformance.infra.test.ts
      // asserts every converted descriptor's declared config vars appear here.
      'assert_schema_type_sample_rows',
      'assert_schema_csv_header_bytes',
      'assert_schema_geojson_probe_bytes',
    ],
  },
  {
    label: 'Scraper & Network Health',
    keys: [
      'scrape_early_phase_threshold_pct',
      'scrape_stale_days',
      'scraper_error_rate_warn_pct',
      'scraper_latency_p50_warn_ms',
      'scraper_empty_streak_warn',
      'lifecycle_unclassified_max',
    ],
  },
  {
    // Spec 44 §4 (Staleness) + Spec 86 §1 — operator-tunable gate for the
    // deepscrapes chain step 7 (assert_staleness). Externalized in
    // migration 121 (WF3 2026-05-08) to unblock the chain when natural
    // scrape staleness drift exceeds the legacy hardcoded `> 0` halt.
    label: 'Pipeline Staleness Thresholds',
    keys: [
      'staleness_max_stale_over_30d',
      'staleness_min_coverage_pct',
      'staleness_max_days_stale',
    ],
  },
  {
    // Spec 86 §1 — lifecycle_status_history ledger retention policy.
    // Default 1825 (5 years) to support CoA cohort segmentation. Seeded by mig 136.
    label: 'Lifecycle Ledger',
    keys: [
      'lifecycle_status_history_retention_days',
    ],
  },
  {
    // Spec 84 §3.4 — distribution bands consumed by
    // scripts/quality/assert-lifecycle-phase-distribution.js via PHASE_TO_LOGIC_VAR_SUFFIX.
    // Tunable here so operators can widen/tighten bands without a code deploy
    // when fresh CKAN data shifts the snapshot.
    // NOTE: lifecycle_seq_band_<N>_min/_max (×220) are rendered dynamically below
    // these static groups — they are too numerous to hardcode here.
    label: 'Lifecycle Phase Distribution Bands',
    keys: [
      // Cross-status drift thresholds (Strangler Fig: enriched_status vs lifecycle_*)
      'lifecycle_cross_stalled_threshold',
      'lifecycle_cross_active_inspection_threshold',
      'lifecycle_cross_issued_threshold',
      // Pre-issuance
      'lifecycle_band_p3_min', 'lifecycle_band_p3_max',
      'lifecycle_band_p4_min', 'lifecycle_band_p4_max',
      'lifecycle_band_p5_min', 'lifecycle_band_p5_max',
      'lifecycle_band_p6_min', 'lifecycle_band_p6_max',
      // Issued time-bucketed
      'lifecycle_band_p7a_min', 'lifecycle_band_p7a_max',
      'lifecycle_band_p7b_min', 'lifecycle_band_p7b_max',
      'lifecycle_band_p7c_min', 'lifecycle_band_p7c_max',
      'lifecycle_band_p7d_min', 'lifecycle_band_p7d_max',
      // Active + revised
      'lifecycle_band_p8_min',  'lifecycle_band_p8_max',
      'lifecycle_band_p18_min', 'lifecycle_band_p18_max',
      'lifecycle_band_p19_min', 'lifecycle_band_p19_max',
      'lifecycle_band_p20_min', 'lifecycle_band_p20_max',
      // Active sub-stage aggregate (P9-P17 sum)
      'lifecycle_band_p9_p17_agg_min', 'lifecycle_band_p9_p17_agg_max',
      // Orphans
      'lifecycle_band_o1_min', 'lifecycle_band_o1_max',
      'lifecycle_band_o2_min', 'lifecycle_band_o2_max',
      'lifecycle_band_o3_min', 'lifecycle_band_o3_max',
      // CoA
      'lifecycle_band_coa_p1_min', 'lifecycle_band_coa_p1_max',
      'lifecycle_band_coa_p2_min', 'lifecycle_band_coa_p2_max',
    ],
  },
];

/** EXPORTED for reconciliation test — keys rendered via JsonTiersEditor, not DeltaGuardInput. */
export const JSON_KEYS = new Set(['income_premium_tiers']);

/**
 * Returns an appropriate input step for a given logic_variable key.
 * Large-magnitude keys (costs, durations in ms) get coarser steps; ratios/
 * confidence scores get fine steps.
 */
function stepFor(key: string): number {
  if (key === 'cost_outlier_ceiling_cad') return 1_000_000;
  if (key === 'los_base_divisor' || key === 'scraper_latency_p50_warn_ms') return 100;
  if (key === 'placeholder_cost_threshold') return 100;
  // These keys contain "threshold" but are integer day/sqm/percentage values — NOT ratios.
  if (
    key === 'expired_threshold_days' ||
    key === 'coa_stall_threshold' ||
    key === 'massing_shed_threshold_sqm' ||
    key === 'scrape_early_phase_threshold_pct'
  ) return 1;
  // Lifecycle band/threshold keys are integer row counts, not ratios.
  // Must short-circuit BEFORE the "_threshold" includes() check below
  // (which would otherwise return 0.01 — wrong step for counts in the thousands).
  if (key.startsWith('lifecycle_band_') || key.startsWith('lifecycle_cross_') || key.startsWith('lifecycle_seq_band_')) return 1;
  if (
    key.endsWith('_conf') ||
    key.endsWith('_conf_high') ||
    key.endsWith('_conf_medium') ||
    key.includes('confidence') ||
    key.includes('coverage_ratio') ||
    key.includes('threshold_pct') ||
    key.includes('_threshold') ||
    key.includes('fuzzy_match_threshold') ||
    key.includes('multiplier')
  ) return 0.01;
  return 1;
}

interface GlobalConfigCardProps {
  variables: LogicVariableRow[];
}

// Regex that matches lifecycle_seq_band_<N>_min / lifecycle_seq_band_<N>_max keys.
// These are seeded via mig 148 (one pair per Universal Stream catalog seq) — too
// numerous to hardcode in GROUPS; rendered dynamically from the DB-loaded variables prop.
const SEQ_BAND_PATTERN = /^lifecycle_seq_band_(\d+)_(min|max)$/;

export function GlobalConfigCard({ variables }: GlobalConfigCardProps) {
  const updateDraftLogicVar = useAdminControlsStore((s) => s.updateDraftLogicVar);

  const byKey = new Map(variables.map((v) => [v.key, v]));

  // Build sorted seq-number list for dynamic rendering (empty if no seq-band keys present).
  const seqBandSeqs: number[] = React.useMemo(() => {
    const seqs = new Set<number>();
    for (const v of variables) {
      const m = SEQ_BAND_PATTERN.exec(v.key);
      if (m) seqs.add(Number(m[1]));
    }
    return Array.from(seqs).sort((a, b) => a - b);
  }, [variables]);

  return (
    <div className="space-y-6">
      {GROUPS.map((group) => (
        <section key={group.label}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100 pb-1">
            {group.label}
          </h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.keys.map((key) => {
              const row = byKey.get(key);
              if (!row) return null;

              if (JSON_KEYS.has(key)) {
                return (
                  <div key={key} className="sm:col-span-2 lg:col-span-3">
                    <JsonTiersEditor
                      value={row.jsonValue}
                      onChange={(val) => updateDraftLogicVar(key, null, val)}
                    />
                  </div>
                );
              }

              return (
                <div key={key} className="pt-5">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    {key}
                    {row.description && (
                      <span className="ml-1 text-gray-400 normal-case font-normal">
                        — {row.description}
                      </span>
                    )}
                  </label>
                  <DeltaGuardInput
                    varKey={key}
                    value={row.value ?? 0}
                    onChange={(val) => updateDraftLogicVar(key, val)}
                    step={stepFor(key)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Dynamic seq-band section — lifecycle_seq_band_<N>_min/_max (×220 max).
          Rendered only when the DB-loaded variables contain seq-band keys (mig 148). */}
      {seqBandSeqs.length > 0 && (
        <section aria-label="Lifecycle Seq Bands">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100 pb-1">
            Lifecycle Seq Bands
            <span className="ml-2 normal-case font-normal text-gray-400">
              ({seqBandSeqs.length} seqs — consumed by assert-lifecycle-phase-distribution.js)
            </span>
          </h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {seqBandSeqs.map((seq) => {
              const minKey = `lifecycle_seq_band_${seq}_min`;
              const maxKey = `lifecycle_seq_band_${seq}_max`;
              const minRow = byKey.get(minKey);
              const maxRow = byKey.get(maxKey);
              return (
                <React.Fragment key={seq}>
                  {minRow && (
                    <div className="pt-5">
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        {minKey}
                      </label>
                      <DeltaGuardInput
                        varKey={minKey}
                        value={minRow.value ?? 0}
                        onChange={(val) => updateDraftLogicVar(minKey, val)}
                        step={1}
                      />
                    </div>
                  )}
                  {maxRow && (
                    <div className="pt-5">
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        {maxKey}
                      </label>
                      <DeltaGuardInput
                        varKey={maxKey}
                        value={maxRow.value ?? 0}
                        onChange={(val) => updateDraftLogicVar(maxKey, val)}
                        step={1}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
