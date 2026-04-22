'use client';
/**
 * IntensityMatrix — 2D grid editor for scope_intensity_matrix.
 * Rows = permit_type, Columns = structure_type.
 * Each cell is a decimal input (0.0001 → 1.0).
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 5
 */

import React, { useMemo } from 'react';
import type { ScopeMatrixRow } from '@/lib/admin/control-panel';
import { useAdminControlsStore } from '../store/useAdminControlsStore';

interface IntensityMatrixProps {
  cells: ScopeMatrixRow[];
}

export function IntensityMatrix({ cells }: IntensityMatrixProps) {
  const updateDraftScopeCell = useAdminControlsStore((s) => s.updateDraftScopeCell);

  // Derive unique permit_types (rows) and structure_types (cols) from data
  const permitTypes = useMemo(() => {
    const set = new Set(cells.map((c) => c.permitType));
    return Array.from(set).sort();
  }, [cells]);

  const structureTypes = useMemo(() => {
    const set = new Set(cells.map((c) => c.structureType));
    return Array.from(set).sort();
  }, [cells]);

  // Build lookup map: "permit:structure" → gfaAllocationPercentage
  const lookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) {
      m.set(`${c.permitType}:${c.structureType}`, c.gfaAllocationPercentage);
    }
    return m;
  }, [cells]);

  if (cells.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No scope matrix data available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Values represent GFA allocation percentage (0.0001 – 1.0) per permit × structure combination.
      </p>

      {/* Horizontally scrollable on mobile */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 bg-gray-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                Permit Type
              </th>
              {structureTypes.map((st) => (
                <th
                  key={st}
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
                >
                  {st}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {permitTypes.map((pt) => (
              <tr key={pt} className="hover:bg-gray-50">
                <td className="sticky left-0 bg-white px-4 py-2 font-mono text-xs text-gray-800 whitespace-nowrap">
                  {pt}
                </td>
                {structureTypes.map((st) => {
                  const cellKey = `${pt}:${st}`;
                  const val = lookup.get(cellKey);
                  if (val === undefined) {
                    return (
                      <td key={st} className="px-2 py-1.5 text-center text-xs text-gray-300">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={st} className="px-2 py-1.5">
                      <input
                        type="number"
                        value={val}
                        step={0.0001}
                        min={0.0001}
                        max={1}
                        onChange={(e) => {
                          const parsed = parseFloat(e.target.value);
                          if (Number.isFinite(parsed) && parsed >= 0.0001 && parsed <= 1) {
                            updateDraftScopeCell(pt, st, parsed);
                          }
                        }}
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-xs
                                   focus:outline-none focus:ring-1 focus:ring-blue-500"
                        aria-label={`${pt} × ${st} GFA allocation`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        {permitTypes.length} permit types × {structureTypes.length} structure types = {cells.length} cells
      </p>
    </div>
  );
}
