// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3 + §5
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §B3
//
// Web port of mobile SearchPermitsSheet. Search permits by permit_num
// or address (full-text, app-wide, no geo filter), claim via
// POST /api/leads/save → permit appears on the admin's Flight Center.
//
// UI notes:
//   - Fixed-position overlay (not <dialog>) — <dialog> requires
//     `dialog.showModal()` imperative API + has focus-trap quirks
//     across browsers; a fixed overlay with backdrop + Esc handler is
//     more predictable for the Cycle 4 scope.
//   - 300ms debounce on the search input — matches mobile cadence
//     and keeps PostgreSQL ILIKE load proportional to typing speed.
//   - Auto-focus on open; Esc closes.

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchPermits } from '@/features/admin-flight-center/api/useSearchPermits';
import { useSavePermit } from '@/features/admin-flight-center/api/useSavePermit';
import type { SearchResultItem } from '@/lib/admin/lead-schemas';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;

export function SearchPermitsModal({ isOpen, onClose }: Props) {
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce raw input → debouncedQuery → useSearchPermits.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(rawQuery);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const { data, isFetching, isError } = useSearchPermits(debouncedQuery);
  const savePermit = useSavePermit();

  // Reset query + focus the input when the modal opens.
  useEffect(() => {
    if (isOpen) {
      setRawQuery('');
      setDebouncedQuery('');
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOpen]);

  // Escape closes the modal.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleClaim = useCallback(
    (item: SearchResultItem) => {
      // Guard double-tap during pending mutation.
      if (savePermit.isPending) return;
      savePermit.mutate(
        {
          permit_num: item.permit_num,
          revision_num: item.revision_num,
          // Synthesize an optimistic FlightBoardItem from the search
          // hit. Fields the search response doesn't carry are filled
          // with neutral placeholders; the real values are hydrated
          // by the onSuccess invalidation that refetches the board.
          optimisticItem: {
            permit_num: item.permit_num,
            revision_num: item.revision_num,
            address: item.address,
            lifecycle_phase: item.lifecycle_phase,
            lifecycle_stalled: false,
            predicted_start: null,
            p25_days: null,
            p75_days: null,
            temporal_group: 'on_the_horizon',
            updated_at: new Date().toISOString(),
          },
        },
        {
          onSuccess: () => {
            onClose();
          },
        },
      );
    },
    [savePermit, onClose],
  );

  if (!isOpen) return null;

  const results = data?.data ?? [];
  const trimmed = debouncedQuery.trim();

  return (
    <div
      data-testid="search-permits-modal"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20"
      onClick={(e) => {
        // Backdrop click closes; clicks inside the modal panel don't.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Search permits"
        className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Search permits</h2>
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
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="Address or permit number..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          aria-label="Search query"
          data-testid="search-permits-input"
        />

        {savePermit.isError && (
          <div
            data-testid="search-permits-save-error"
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            Failed to save permit. Please try again.
          </div>
        )}

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
              No permits found.
            </p>
          )}
          <ul data-testid="search-permits-results" className="divide-y divide-gray-100">
            {results.map((item) => (
              <li
                key={`${item.permit_num}-${item.revision_num}`}
                className="flex items-start justify-between py-3"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {item.address || item.permit_num}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="font-mono">{item.permit_num}</span>
                    {item.lifecycle_phase && <span>{item.lifecycle_phase}</span>}
                    {item.status && <span>{item.status}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleClaim(item)}
                  disabled={savePermit.isPending}
                  data-testid={`search-permits-claim-${item.permit_num}`}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savePermit.isPending ? 'Saving…' : 'Save →'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
