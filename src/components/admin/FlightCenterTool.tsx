// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4 + §3.6
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3 + §5
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §B3
//
// Admin Flight Center — saved-permit board grouped into 3 temporal
// sections (action_required / departing_soon / on_the_horizon) per
// Spec 77 §3.2. Cards show address + lifecycle + expected completion
// (predicted_start ± p25/p75) per Spec 77 §3.3.1 + per-card Unsave
// button. Tap a card → inline drawer with the full FlightBoardDetail
// (Spec 76 §3.4 mandate: NOT a route navigation).
//
// Save flow: header "Search permits" button opens <SearchPermitsModal>
// (Spec 77 §3.1 parity). Mobile uses a FAB; web uses a top-bar button
// since admin layouts are desktop-first per Spec 33 §3.

'use client';

import React, { useState } from 'react';
import { useAdminFlightBoard } from '@/features/admin-flight-center/api/useAdminFlightBoard';
import { useUnsavePermit } from '@/features/admin-flight-center/api/useUnsavePermit';
import { SearchPermitsModal } from '@/components/admin/SearchPermitsModal';
import { FlightJobDetailInspector } from '@/components/admin/FlightJobDetailInspector';
import type { FlightBoardItem } from '@/lib/admin/lead-schemas';

type TemporalGroup = FlightBoardItem['temporal_group'];

const SECTION_ORDER: TemporalGroup[] = [
  'action_required',
  'departing_soon',
  'on_the_horizon',
];

const SECTION_LABELS: Record<TemporalGroup, string> = {
  action_required: 'Action Required',
  departing_soon: 'Departing Soon',
  on_the_horizon: 'On the Horizon',
};

function formatExpectedCompletion(item: FlightBoardItem): string {
  if (!item.predicted_start) return 'No prediction yet';
  if (item.p25_days == null || item.p75_days == null) {
    return `Predicted ${item.predicted_start}`;
  }
  // Spec 77 §3.3.1 — predicted_start with p25/p75 widens to a window.
  return `Predicted ${item.predicted_start} (p25 ${item.p25_days}d / p75 ${item.p75_days}d)`;
}

export function FlightCenterTool() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [inspectorId, setInspectorId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useAdminFlightBoard();
  const unsave = useUnsavePermit();

  const items = data?.data ?? [];

  return (
    <div data-testid="flight-center-tool">
      {/* Header bar with the search trigger — mobile FAB equivalent. */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Flight Center</h2>
          <p className="mt-1 text-sm text-gray-500">
            Permits saved to your admin Flight Board, grouped by temporal proximity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          data-testid="flight-center-search-trigger"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search permits
        </button>
      </div>

      {isLoading && (
        <p data-testid="flight-center-loading" className="text-sm text-gray-500">
          Loading flight board…
        </p>
      )}

      {isError && (
        <div
          data-testid="flight-center-error"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>Failed to load Flight Board.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-blue-600 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div
          data-testid="flight-center-empty"
          className="rounded-md border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600"
        >
          No permits saved yet. Use <strong>Search permits</strong> above to find and claim a permit.
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="grid gap-6 md:grid-cols-3">
          {SECTION_ORDER.map((group) => {
            const groupItems = items.filter((i) => i.temporal_group === group);
            return (
              <section
                key={group}
                data-testid={`flight-center-section-${group}`}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <h3 className="mb-3 flex items-center justify-between text-sm font-semibold text-gray-700">
                  {SECTION_LABELS[group]}
                  <span className="text-xs text-gray-400">{groupItems.length}</span>
                </h3>
                {groupItems.length === 0 ? (
                  <p className="text-xs text-gray-400">—</p>
                ) : (
                  <ul className="space-y-3">
                    {groupItems.map((item) => {
                      const id = `${item.permit_num}--${item.revision_num}`;
                      return (
                        <li
                          key={id}
                          data-testid={`flight-center-card-${id}`}
                          className="rounded-md border border-gray-100 p-3 hover:border-blue-200"
                        >
                          <button
                            type="button"
                            onClick={() => setInspectorId(id)}
                            className="block w-full text-left"
                            aria-label={`Inspect ${item.address || item.permit_num}`}
                          >
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {item.address || item.permit_num}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-gray-500">
                              {item.permit_num} · rev {item.revision_num}
                            </p>
                            {item.lifecycle_phase && (
                              <p className="mt-1 text-xs text-gray-600">
                                {item.lifecycle_phase}
                                {item.lifecycle_stalled && (
                                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                    STALLED
                                  </span>
                                )}
                              </p>
                            )}
                            <p className="mt-2 text-xs font-medium text-blue-700">
                              {formatExpectedCompletion(item)}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              unsave.mutate({
                                permit_num: item.permit_num,
                                revision_num: item.revision_num,
                              })
                            }
                            disabled={unsave.isPending}
                            data-testid={`flight-center-unsave-${id}`}
                            className="mt-2 text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
                          >
                            {unsave.isPending ? 'Removing…' : 'Unsave'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <SearchPermitsModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* Inline drawer for the FlightJobDetailInspector — opens with
          the tapped card's id pre-filled. Closing returns to the board
          without a route navigation (Spec 76 §3.4 mandate). */}
      {inspectorId && (
        <div
          data-testid="flight-center-inspector-drawer"
          className="fixed inset-0 z-50 flex items-start justify-end bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectorId(null);
          }}
        >
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Flight Job Detail</h3>
              <button
                type="button"
                onClick={() => setInspectorId(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
                aria-label="Close inspector"
              >
                Close
              </button>
            </div>
            <FlightJobDetailInspector initialId={inspectorId} />
          </div>
        </div>
      )}
    </div>
  );
}
