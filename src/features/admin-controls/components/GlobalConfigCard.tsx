'use client';
/**
 * GlobalConfigCard — renders all 18 logic_variables grouped by domain.
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

/** Logical groups for display — keeps the 18-key list scannable. */
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
    label: 'Timing & Staleness',
    keys: [
      'stall_penalty_precon',
      'stall_penalty_active',
      'expired_threshold_days',
      'lead_expiry_days',
      'coa_stall_threshold',
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
];

const JSON_KEYS = new Set(['income_premium_tiers']);

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
                    step={key.includes('divisor') || key.includes('threshold') ? 100 : 0.01}
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
