// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §4.2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §9 + §14
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.2 + §7.1
//
// Flight Center address search — REWRITTEN onto the Spec 36 admin routes
// [PF-HOOKS]: useWatchlistSearch (GET /api/admin/leads/watchlist/search,
// permits + coa arms) + useBulkSaveToWatchlist (POST bulk save). The old
// consumer-route hooks (useSearchPermits / useSavePermit) are retired.
//
// Search box (req 2): 300ms debounced input → useWatchlistSearch (enabled at
// 2+ chars). Results render per-row "Add" AND a bulk "Add all shown" action
// (req 3); already-watched rows come back as skipped_existing in the summary
// toast [PF5]. searchQuery is store-owned (Spec 35 §3.2).
//
// UI notes: fixed-position overlay (repo precedent — SearchPermitsModal v1 /
// ConfirmSyncModal); Esc closes; auto-focus on open. Read-only search emits
// captureEvent('admin_watchlist_searched') only — no mutation breadcrumb
// (Spec 89 §2.6 read-only precedent).

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useWatchlistSearch } from '@/features/admin-flight-center/api/useWatchlistSearch';
import { useBulkSaveToWatchlist } from '@/features/admin-flight-center/api/useBulkSaveToWatchlist';
import { useFlightCenterStore } from '@/features/admin-flight-center/store/useFlightCenterStore';
import { captureEvent } from '@/lib/observability/capture';
import type { WatchlistSearchItem, WatchlistSaveItem } from '@/lib/admin/watchlist-schemas';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;

/** Map a search hit to the bulk-save wire item (address → address_snapshot [PF8]). */
function toSaveItem(item: WatchlistSearchItem): WatchlistSaveItem {
  if (item.lead_type === 'permit') {
    return {
      lead_type: 'permit',
      // SAFETY: the permit search arm always returns non-null identifiers.
      permit_num: item.permit_num as string,
      revision_num: item.revision_num as string,
      address: item.address || undefined,
    };
  }
  return {
    lead_type: 'coa',
    // SAFETY: the coa search arm filters application_number IS NOT NULL.
    coa_application_number: item.coa_application_number as string,
    address: item.address || undefined,
  };
}

export function SearchPermitsModal({ isOpen, onClose }: Props) {
  const searchQuery = useFlightCenterStore((s) => s.searchQuery);
  const setSearchQuery = useFlightCenterStore((s) => s.setSearchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce store query → debouncedQuery → useWatchlistSearch.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isFetching, isError } = useWatchlistSearch(debouncedQuery);
  const bulkSave = useBulkSaveToWatchlist();

  const trimmed = debouncedQuery.trim();

  // Read-only telemetry: one captureEvent per executed (debounced) search.
  useEffect(() => {
    if (isOpen && trimmed.length >= 2) {
      captureEvent('admin_watchlist_searched', { q_length: trimmed.length });
    }
  }, [isOpen, trimmed]);

  // Reset the query + focus the input when the modal opens.
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setDebouncedQuery('');
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOpen, setSearchQuery]);

  // Escape closes the modal.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const results = data?.data ?? [];

  const addOne = (item: WatchlistSearchItem) => {
    if (bulkSave.isPending) return;
    bulkSave.mutate({ items: [toSaveItem(item)] });
  };

  const addAll = () => {
    if (bulkSave.isPending || results.length === 0) return;
    bulkSave.mutate({ items: results.map(toSaveItem) });
  };

  return (
    <div
      data-testid="search-permits-modal"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20"
      onClick={(e) => {
        // Backdrop click closes; clicks inside the modal panel do not.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Search projects"
        className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Find projects — permits &amp; CoAs
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
            aria-label="Close search"
          >
            Close
          </button>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Address, permit number, or CoA application number..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          aria-label="Search query"
          data-testid="search-permits-input"
        />

        <div className="mt-4 max-h-96 overflow-y-auto">
          {isFetching && trimmed.length >= 2 && (
            <p data-testid="search-permits-loading" className="text-xs text-gray-500">
              Searching…
            </p>
          )}
          {isError && (
            <p data-testid="search-permits-error" className="text-xs text-red-600">
              Couldn&apos;t load search results — try again.
            </p>
          )}
          {!isFetching && trimmed.length < 2 && (
            <p data-testid="search-permits-hint" className="text-xs text-gray-400">
              Type 2+ characters to search.
            </p>
          )}
          {!isFetching && trimmed.length >= 2 && results.length === 0 && !isError && (
            <p data-testid="search-permits-empty" className="text-xs text-gray-500">
              No matching projects found.
            </p>
          )}

          {results.length > 0 && (
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-gray-500">{results.length} result(s)</p>
              <button
                type="button"
                onClick={addAll}
                disabled={bulkSave.isPending}
                data-testid="search-permits-add-all"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkSave.isPending ? 'Adding…' : 'Add all shown →'}
              </button>
            </div>
          )}

          <ul data-testid="search-permits-results" className="divide-y divide-gray-100">
            {results.map((item) => {
              const id =
                item.lead_type === 'permit'
                  ? `${item.permit_num}--${item.revision_num}`
                  : `COA-${item.coa_application_number}`;
              return (
                <li key={id} className="flex items-start justify-between py-2 px-1">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {item.address || id}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          item.lead_type === 'coa'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.lead_type === 'coa' ? 'CoA' : 'Permit'}
                      </span>
                      <span className="font-mono">
                        {item.lead_type === 'permit'
                          ? item.permit_num
                          : item.coa_application_number}
                      </span>
                      {item.lifecycle_phase && <span>{item.lifecycle_phase}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addOne(item)}
                    disabled={bulkSave.isPending}
                    data-testid={`search-permits-claim-${item.lead_type === 'permit' ? item.permit_num : item.coa_application_number}`}
                    className="rounded-md border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkSave.isPending ? 'Adding…' : 'Add →'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
