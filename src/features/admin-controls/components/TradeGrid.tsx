'use client';
/**
 * TradeGrid — inline-editable table of all 32 trade configurations.
 * 7 editable numeric columns; search filter by trade slug.
 *
 * SPEC LINK: docs/specs/product/future/86_control_panel.md §5 Phase 4
 */

import React, { useState } from 'react';
import type { TradeConfigRow } from '@/lib/admin/control-panel';
import { useAdminControlsStore } from '../store/useAdminControlsStore';

const COLUMNS: Array<{
  key: keyof Omit<TradeConfigRow, 'tradeSlug'>;
  label: string;
  step: number;
  min?: number;
  max?: number;
}> = [
  { key: 'bidPhaseCutoff',           label: 'Bid Phase',   step: 1 },
  { key: 'workPhaseTarget',          label: 'Work Phase',  step: 1 },
  { key: 'imminentWindowDays',       label: 'Window (d)',  step: 1, min: 0, max: 365 },
  { key: 'allocationPct',            label: 'Alloc %',     step: 0.001, min: 0, max: 1 },
  { key: 'multiplierBid',            label: 'Bid ×',       step: 0.1, min: 0, max: 10 },
  { key: 'multiplierWork',           label: 'Work ×',      step: 0.1, min: 0, max: 10 },
  { key: 'baseRateSqft',             label: 'Base $/sqft', step: 1, min: 0 },
  { key: 'structureComplexityFactor', label: 'Complexity',  step: 0.05, min: 0.5, max: 3 },
];

/** Phase fields (bidPhaseCutoff, workPhaseTarget) are text, not numbers. */
const TEXT_COLUMNS = new Set<string>(['bidPhaseCutoff', 'workPhaseTarget']);

interface TradeGridProps {
  trades: TradeConfigRow[];
}

export function TradeGrid({ trades }: TradeGridProps) {
  const [search, setSearch] = useState('');
  const updateDraftTradeConfig = useAdminControlsStore((s) => s.updateDraftTradeConfig);

  const filtered = search
    ? trades.filter((t) => t.tradeSlug.toLowerCase().includes(search.toLowerCase()))
    : trades;

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        type="search"
        placeholder="Filter by trade slug…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Filter trades"
      />

      {/* Table — horizontally scrollable on mobile */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 bg-gray-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                Trade
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filtered.map((trade) => (
              <tr key={trade.tradeSlug} className="hover:bg-gray-50">
                <td className="sticky left-0 bg-white px-4 py-2 font-mono text-xs text-gray-800 whitespace-nowrap">
                  {trade.tradeSlug}
                </td>
                {COLUMNS.map((col) => {
                  const rawVal = trade[col.key];
                  const isText = TEXT_COLUMNS.has(col.key);

                  return (
                    <td key={col.key} className="px-2 py-1.5">
                      {isText ? (
                        <input
                          type="text"
                          value={String(rawVal ?? '')}
                          onChange={(e) =>
                            updateDraftTradeConfig(trade.tradeSlug, {
                              [col.key]: e.target.value,
                            })
                          }
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-xs
                                     focus:outline-none focus:ring-1 focus:ring-blue-500"
                          aria-label={`${trade.tradeSlug} ${col.label}`}
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
                              updateDraftTradeConfig(trade.tradeSlug, {
                                [col.key]: parsed,
                              });
                            }
                          }}
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-xs
                                     focus:outline-none focus:ring-1 focus:ring-blue-500"
                          aria-label={`${trade.tradeSlug} ${col.label}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">
            No trades match &ldquo;{search}&rdquo;
          </p>
        )}
      </div>
      <p className="text-xs text-gray-400">
        {filtered.length} / {trades.length} trades
      </p>
    </div>
  );
}
