'use client';
/**
 * LinesGrid — inline-editable table of the 13 parcel_cost_lines rows.
 *
 * The STRUCTURAL half of the catalogue (areaField / scalar / scalarKind /
 * fitField / isCoaLine) is NOT admin-editable and is deliberately NOT loaded
 * here: it is code shape, not data (PricingLineUpdateSchema is `.strict()` and
 * refuses it). The only structural read we take is the human label, imported
 * read-only from ParcelCostTool's LINE_LABELS — a display map, nothing more.
 *
 * Editable cells (all routed through updateDraftLine):
 *   - archetype:        <select> over the loaded rate keys (the FK domain — an
 *                       admin cannot type a key that doesn't exist)
 *   - baseConfidence:   <select> high | medium | low
 *   - fitPermittedValues: comma-separated text, rendered ONLY when the row is a
 *                       fit line (fitPermittedValues !== null). A non-fit line
 *                       shows a read-only "—" and can never acquire a
 *                       vocabulary from the UI.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 4
 *            docs/specs/01-pipeline/88_parcel_cost_model.md §2.3
 *            docs/specs/01-pipeline/124_step_standard_policy.md (R-AU)
 */

import React from 'react';
import type { PricingLineRow } from '@/lib/admin/control-panel';
import { useAdminControlsStore } from '../store/useAdminControlsStore';
import { LINE_LABELS } from '@/components/admin/ParcelCostTool';

const CONFIDENCE_OPTIONS: PricingLineRow['baseConfidence'][] = ['high', 'medium', 'low'];

/** "a, b , ,c" → ['a','b','c'] (trimmed, empty tokens dropped). */
function parseVocabulary(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

interface LinesGridProps {
  lines: PricingLineRow[];
  /** The FK domain for a line's archetype select — the loaded rate keys. */
  rateArchetypes: string[];
}

export function LinesGrid({ lines, rateArchetypes }: LinesGridProps) {
  const updateDraftLine = useAdminControlsStore((s) => s.updateDraftLine);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              Line
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              Archetype
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              Confidence
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              Fit values
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {lines.map((line) => (
            <tr key={line.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-xs text-gray-800 whitespace-nowrap">
                <span className="font-mono">{line.id}</span>
                <span className="ml-2 text-gray-400">{LINE_LABELS[line.id] ?? ''}</span>
              </td>
              <td className="px-2 py-1.5">
                <select
                  value={line.archetype}
                  onChange={(e) =>
                    updateDraftLine(line.id, { archetype: e.target.value })
                  }
                  className="rounded border border-gray-300 px-2 py-1 text-xs
                             focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label={`${line.id} Archetype`}
                >
                  {/* If the current value isn't in the loaded domain (FK gap), keep
                      it selectable so the select isn't silently rewritten to a
                      different key on first render. */}
                  {(rateArchetypes.includes(line.archetype)
                    ? rateArchetypes
                    : [line.archetype, ...rateArchetypes]
                  ).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1.5">
                <select
                  value={line.baseConfidence}
                  onChange={(e) =>
                    updateDraftLine(line.id, {
                      baseConfidence: e.target.value as PricingLineRow['baseConfidence'],
                    })
                  }
                  className="rounded border border-gray-300 px-2 py-1 text-xs
                             focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label={`${line.id} Confidence`}
                >
                  {CONFIDENCE_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1.5">
                {line.fitPermittedValues === null ? (
                  <span className="text-xs text-gray-400" aria-label={`${line.id} Fit values`}>
                    —
                  </span>
                ) : (
                  <input
                    type="text"
                    value={line.fitPermittedValues.join(', ')}
                    onChange={(e) =>
                      updateDraftLine(line.id, {
                        fitPermittedValues: parseVocabulary(e.target.value),
                      })
                    }
                    className="w-40 rounded border border-gray-300 px-2 py-1 text-xs
                               focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label={`${line.id} Fit values`}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lines.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">No pricing lines loaded.</p>
      )}
    </div>
  );
}
