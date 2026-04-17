'use client';
/**
 * GlobalConfigCard — renders all 54 logic_variables grouped by domain,
 * plus income_premium_tiers (JSONB type, seeded via migration 097).
 * Uses DeltaGuardInput for numeric fields and JsonTiersEditor for the
 * income_premium_tiers JSONB field.
 *
 * SPEC LINK: docs/specs/product/future/86_control_panel.md §5 Phase 3
 */

import React from 'react';
import type { LogicVariableRow } from '@/lib/admin/control-panel';
import { DeltaGuardInput } from './DeltaGuardInput';
import { JsonTiersEditor } from './JsonTiersEditor';
import { useAdminControlsStore } from '../store/useAdminControlsStore';

/** Logical groups for display — covers all 54 numeric keys + income_premium_tiers. */
const GROUPS: Array<{ label: string; keys: string[] }> = [
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
];

const JSON_KEYS = new Set(['income_premium_tiers']);

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

export function GlobalConfigCard({ variables }: GlobalConfigCardProps) {
  const updateDraftLogicVar = useAdminControlsStore((s) => s.updateDraftLogicVar);

  const byKey = new Map(variables.map((v) => [v.key, v]));

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
    </div>
  );
}
