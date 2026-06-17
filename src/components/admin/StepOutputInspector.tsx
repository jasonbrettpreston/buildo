// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector)
//             docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (inspector pattern)
//
// Admin-only, read-only row browser for a pipeline step's main output table (table/step axis).
// Lean: rows with a lead identity deep-link to the per-record Lead Detail Inspector.
// Desktop-first (admin domain). Generalizes LeadDetailInspector's two-state shell.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStepOutput, StepOutputError } from '@/features/admin-flight-center/api/useStepOutput';
import { formatLeadIdForUrl } from '@/lib/leads/format-lead-id';

const PAGE_SIZE = 50;

export function StepOutputInspector({ initialSlug }: { initialSlug?: string | null }) {
  const slug = initialSlug ?? null;
  const [offset, setOffset] = useState(0);
  // pending (form) vs applied (query) filter — commit on Apply.
  const [pendingField, setPendingField] = useState('');
  const [pendingValue, setPendingValue] = useState('');
  const [appliedField, setAppliedField] = useState<string | null>(null);
  const [appliedValue, setAppliedValue] = useState<string | null>(null);

  const q = useStepOutput({ slug, limit: PAGE_SIZE, offset, filterField: appliedField, filterValue: appliedValue });

  if (!slug) {
    return (
      <div className="p-6 text-sm text-gray-600" data-testid="step-output-idle">
        Select a step’s <span className="font-medium">Inspect output</span> link from the Pipeline Dashboard to browse its rows.
      </div>
    );
  }

  const applyFilter = () => {
    setOffset(0);
    setAppliedField(pendingField || null);
    setAppliedValue(pendingField && pendingValue ? pendingValue : null);
  };
  const clearFilter = () => {
    setOffset(0);
    setPendingField('');
    setPendingValue('');
    setAppliedField(null);
    setAppliedValue(null);
  };

  return (
    <div className="p-4 md:p-6" data-testid="step-output-inspector">
      <header className="mb-4">
        <h1 className="text-base md:text-lg font-semibold text-gray-900">Step Output</h1>
        <p className="text-xs md:text-sm text-gray-500 font-mono">{slug}</p>
      </header>

      {q.isLoading && <div className="py-8 text-sm text-gray-500" data-testid="step-output-loading">Loading rows…</div>}

      {q.isError && <ErrorPanel error={q.error} />}

      {q.data && (
        <>
          {/* Filter row (filterable columns only) */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              aria-label="Filter column"
              className="min-h-[44px] rounded border border-gray-300 px-2 text-sm"
              value={pendingField}
              onChange={(e) => setPendingField(e.target.value)}
            >
              <option value="">— filter column —</option>
              {q.data.filterableColumns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              aria-label="Filter value (prefix)"
              className="min-h-[44px] rounded border border-gray-300 px-2 text-sm"
              placeholder="starts with…"
              value={pendingValue}
              disabled={!pendingField}
              onChange={(e) => setPendingValue(e.target.value)}
            />
            <button
              type="button"
              className="min-h-[44px] rounded bg-gray-800 px-3 text-sm text-white disabled:opacity-40"
              disabled={!pendingField || !pendingValue}
              onClick={applyFilter}
            >
              Apply
            </button>
            {appliedField && (
              <button type="button" className="min-h-[44px] rounded border border-gray-300 px-3 text-sm" onClick={clearFilter}>
                Clear
              </button>
            )}
          </div>

          {/* Row table */}
          <div className="overflow-x-auto rounded border border-gray-100">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-gray-500">↗</th>
                  {q.data.columns.map((c) => (
                    <th key={c} className="px-2 py-1 text-left font-medium text-gray-700 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.data.rows.length === 0 && (
                  <tr><td colSpan={q.data.columns.length + 1} className="px-2 py-6 text-center text-gray-400">No rows.</td></tr>
                )}
                {q.data.rows.map((row, i) => {
                  const leadId = formatLeadIdForUrl(row);
                  return (
                    <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-2 py-1">
                        {leadId ? (
                          <Link
                            href={`/admin/lead-feed/inspector?id=${encodeURIComponent(leadId)}`}
                            className="text-blue-600 hover:underline"
                            title="Inspect this record"
                          >
                            ↗
                          </Link>
                        ) : (
                          <span className="text-gray-300">·</span>
                        )}
                      </td>
                      {q.data.columns.map((c) => (
                        <td key={c} className="px-2 py-1 text-gray-800 whitespace-nowrap max-w-[28rem] truncate" title={fmt(row[c])}>
                          {fmt(row[c])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>
              rows {q.data.rows.length === 0 ? 0 : offset + 1}–{offset + q.data.rows.length}
              {' of '}{q.data.approxTotal ? `~${q.data.total.toLocaleString()} (approx)` : q.data.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="min-h-[44px] rounded border border-gray-300 px-3 disabled:opacity-40"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                ← Prev
              </button>
              <button
                type="button"
                className="min-h-[44px] rounded border border-gray-300 px-3 disabled:opacity-40"
                disabled={q.data.rows.length < PAGE_SIZE}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Render a cell value as a readable string (objects/arrays → JSON, null → ∅).
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function ErrorPanel({ error }: { error: Error }) {
  const code = error instanceof StepOutputError ? error.code : 'NETWORK';
  const msg =
    code === 'UNAUTHORIZED' ? 'Admin authentication required.'
    : code === 'NOT_FOUND' ? 'This step has no inspectable output table.'
    : code === 'VALIDATION' ? (error instanceof StepOutputError && error.serverMessage) || 'Invalid filter.'
    : 'Could not load step output.';
  return (
    <div className="py-8 text-sm text-red-600" data-testid="step-output-error">{msg}</div>
  );
}
