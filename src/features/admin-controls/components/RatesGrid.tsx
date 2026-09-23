'use client';
/**
 * RatesGrid — inline-editable table of the 12 archetype_cost_rates rows.
 * 5 editable columns (cost_per_sqm, cost_adjustment_factor,
 * escalation_index_base, source, as_of_date) plus the archetype PK.
 *
 * Every mutation goes through the store (updateDraftRate) so the SINGLE
 * apply flow (draftConfig → hasUnsavedChanges → StickyActionBar →
 * ConfirmSyncModal → PUT) is the only surface that writes. No local state
 * beyond the controlled inputs.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 4
 *            docs/specs/01-pipeline/88_parcel_cost_model.md §2.3
 *            docs/specs/01-pipeline/124_step_standard_policy.md (R-AU)
 */

import React from 'react';
import type { PricingRateRow } from '@/lib/admin/control-panel';
import { useAdminControlsStore } from '../store/useAdminControlsStore';

type RateColumnKey = Exclude<keyof PricingRateRow, 'archetype'>;

const COLUMNS: Array<{
  key: RateColumnKey;
  label: string;
  step: number;
  min?: number;
  max?: number;
}> = [
  { key: 'costPerSqm',           label: '$/m²',      step: 1,     min: 0 },
  { key: 'costAdjustmentFactor', label: 'Adj ×',     step: 0.001, min: 0 },
  { key: 'escalationIndexBase',  label: 'Escal. base', step: 0.001, min: 0 },
  { key: 'source',               label: 'Source',    step: 1 },
];

interface RatesGridProps {
  rates: PricingRateRow[];
}

export function RatesGrid({ rates }: RatesGridProps) {
  const updateDraftRate = useAdminControlsStore((s) => s.updateDraftRate);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="sticky left-0 bg-gray-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              Archetype
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              As of
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rates.map((rate) => (
            <tr key={rate.archetype} className="hover:bg-gray-50">
              <td className="sticky left-0 bg-white px-4 py-2 font-mono text-xs text-gray-800 whitespace-nowrap">
                {rate.archetype}
              </td>
              {COLUMNS.map((col) => {
                const rawVal = rate[col.key];
                const isText = col.key === 'source';

                return (
                  <td key={col.key} className="px-2 py-1.5">
                    {isText ? (
                      <input
                        type="text"
                        value={String(rawVal ?? '')}
                        onChange={(e) =>
                          updateDraftRate(rate.archetype, { source: e.target.value })
                        }
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-xs
                                   focus:outline-none focus:ring-1 focus:ring-blue-500"
                        aria-label={`${rate.archetype} ${col.label}`}
                      />
                    ) : (
                      <input
                        type="number"
                        value={Number(rawVal ?? 0)}
                        step={col.step}
                        min={col.min}
                        max={col.max}
                        onChange={(e) => {
                          const parsed = parseFloat(e.target.value);
                          if (Number.isFinite(parsed)) {
                            updateDraftRate(rate.archetype, { [col.key]: parsed });
                          }
                        }}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-xs
                                   focus:outline-none focus:ring-1 focus:ring-blue-500"
                        aria-label={`${rate.archetype} ${col.label}`}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1.5">
                <input
                  type="date"
                  value={rate.asOfDate}
                  onChange={(e) =>
                    updateDraftRate(rate.archetype, { asOfDate: e.target.value })
                  }
                  className="rounded border border-gray-300 px-2 py-1 text-xs
                             focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label={`${rate.archetype} As of`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rates.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">No pricing rates loaded.</p>
      )}
    </div>
  );
}
