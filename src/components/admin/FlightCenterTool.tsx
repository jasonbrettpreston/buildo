// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §4
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3 + §9 + §14
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.2 + §6 + §7.1
//
// The standalone Flight Center (Spec 36) — REWRITTEN off the Spec 76 §3.4
// prototype onto the admin_watchlist model [PF-HOOKS]:
//   · Watchlist board grouped action_required → departing_soon →
//     on_the_horizon, server-paginated ([PF4]); checkbox multi-select with a
//     bulk-delete behind an in-page confirm dialog (never confirm()/alert();
//     Spec 33 §14 confirm-on-destructive) + Sonner toast.
//   · Search box (req 2) via <SearchPermitsModal> → admin search route.
//   · Detail drill-down (req 4): drawer reusing the inspect endpoint (the
//     ~70-field all-info surface; ≥0.85 identity floor untouched) with a
//     PROMINENT flight-semantics header — DELAYED badge + EXPECTED START +
//     temporal chip — rendered from the cached watchlist row as initialData,
//     then RECONCILED from the useLeadInspect forecast/lifecycle panels once
//     they resolve ([PF14]).
//   · NO auto-archive: completed projects persist until manually deleted
//     ([PF10] — the deliberate retirement of the flight-board eviction;
//     manual bulk-delete is the replacement hygiene).
//
// UI primitives note: shadcn/ui is not initialized in this repo
// (src/components/ui/ carries no primitives); per the live repo convention
// (ConfirmSyncModal, SearchPermitsModal) the confirm dialog / checkboxes /
// skeletons are composed from Tailwind + native elements, and Sonner (already
// a dependency; control-panel precedent) provides toasts.

'use client';

import React, { useState } from 'react';
import { Toaster } from 'sonner';
import { useShallow } from 'zustand/shallow';
import { useWatchlist } from '@/features/admin-flight-center/api/useWatchlist';
import { useBulkDeleteFromWatchlist } from '@/features/admin-flight-center/api/useBulkDeleteFromWatchlist';
import { useLeadInspect } from '@/features/admin-flight-center/api/useLeadInspect';
import { useFlightCenterStore } from '@/features/admin-flight-center/store/useFlightCenterStore';
import { SearchPermitsModal } from '@/components/admin/SearchPermitsModal';
import { LeadDetailInspector } from '@/components/admin/LeadDetailInspector';
import { captureEvent } from '@/lib/observability/capture';
import {
  isDelayed,
  aggregateForecastRows,
  computeWatchlistTemporalGroup,
} from '@/lib/admin/watchlist-temporal';
import { WATCHLIST_PAGE_SIZE, type WatchlistItem } from '@/lib/admin/watchlist-schemas';

type TemporalGroup = WatchlistItem['temporal_group'];

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

const GROUP_CHIP_CLASSES: Record<TemporalGroup, string> = {
  action_required: 'bg-red-100 text-red-800',
  departing_soon: 'bg-amber-100 text-amber-800',
  on_the_horizon: 'bg-gray-100 text-gray-600',
};

function formatExpectedStart(
  predicted_start: string | null,
  p25_days: number | null,
  p75_days: number | null,
): string {
  if (!predicted_start) return 'No prediction yet';
  if (p25_days == null || p75_days == null) return `Expected ${predicted_start}`;
  return `Expected ${predicted_start} (p25 ${p25_days}d / p75 ${p75_days}d)`;
}

/** Inspect URL-segment id: `NUM--REV` (permit) / `COA-APP` (coa). */
function toInspectSegment(item: WatchlistItem): string {
  return item.lead_type === 'permit'
    ? `${item.permit_num}--${item.revision_num}`
    : `COA-${item.coa_application_number}`;
}

// ── Skeleton (Spec 33 §9 — explicit placeholder matching resolved dimensions) ──

function BoardSkeleton() {
  return (
    <div data-testid="flight-center-loading" className="grid gap-6 md:grid-cols-3">
      {SECTION_ORDER.map((group) => (
        <div key={group} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3 h-4 w-32 animate-pulse rounded bg-gray-200" />
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-md bg-gray-100" />
            <div className="h-20 animate-pulse rounded-md bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Confirm-on-destructive dialog (Spec 33 §14; no confirm()/alert()) ─────────

function ConfirmDeleteDialog({
  count,
  isPending,
  onConfirm,
  onCancel,
}: {
  count: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      data-testid="flight-center-delete-confirm"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-label="Confirm watchlist delete"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
      >
        <h3 className="text-lg font-semibold text-gray-900">
          Remove {count} project{count === 1 ? '' : 's'} from the watchlist?
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          This is a hard delete — the watchlist is the only place these saves
          live. You can re-add any project via search.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            data-testid="flight-center-delete-confirm-button"
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Removing…' : `Delete ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Flight-semantics drawer header ([PF14] initialData → reconcile) ──────────

function FlightSemanticsHeader({
  row,
  inspectId,
}: {
  /** The cached watchlist row — instant initialData render. */
  row: WatchlistItem | null;
  inspectId: string;
}) {
  // Shares the ['admin','lead-inspect',id] cache entry with the
  // LeadDetailInspector below — one fetch, two readers.
  const { data: inspect } = useLeadInspect(inspectId);

  // Reconcile once the inspect payload resolves ([PF14]): stalled from the
  // lifecycle panel; expected-start re-aggregated from the forecast panel via
  // the SAME aggregation the list SQL uses — header and panels converge.
  const now = new Date();
  const agg = inspect ? aggregateForecastRows(inspect.forecast) : null;
  const stalled = inspect ? inspect.lifecycle.stalled : (row?.lifecycle_stalled ?? false);
  const predicted_start = agg ? agg.predicted_start : (row?.predicted_start ?? null);
  const p25 = agg ? agg.p25_days : (row?.p25_days ?? null);
  const p75 = agg ? agg.p75_days : (row?.p75_days ?? null);
  const score = agg ? agg.opportunity_score : (row?.opportunity_score ?? null);

  const delayed = isDelayed({ lifecycle_stalled: stalled, predicted_start }, now);
  const group = computeWatchlistTemporalGroup(
    { lifecycle_stalled: stalled, predicted_start, opportunity_score: score },
    now,
  );

  return (
    <div
      data-testid="flight-center-drawer-header"
      className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        {delayed ? (
          <span
            data-testid="flight-center-delayed-badge"
            className="rounded bg-red-600 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white"
          >
            Delayed
          </span>
        ) : (
          <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
            On track
          </span>
        )}
        <span
          data-testid="flight-center-temporal-chip"
          className={`rounded px-2 py-1 text-xs font-semibold ${GROUP_CHIP_CLASSES[group]}`}
        >
          {SECTION_LABELS[group]}
        </span>
        {stalled && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
            STALLED
          </span>
        )}
      </div>
      <p
        data-testid="flight-center-expected-start"
        className="mt-3 text-xl font-bold text-gray-900"
      >
        {formatExpectedStart(predicted_start, p25, p75)}
      </p>
      {row && (
        <p className="mt-1 text-sm text-gray-500">
          {row.address || row.lead_key}
          <span className="ml-2 font-mono text-xs text-gray-400">{row.lead_key}</span>
        </p>
      )}
    </div>
  );
}

// ── The tool ──────────────────────────────────────────────────────────────────

export function FlightCenterTool() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [offset, setOffset] = useState(0);

  const { selectedIds, inspectorOpen, selectedLeadId } = useFlightCenterStore(
    useShallow((s) => ({
      selectedIds: s.selectedIds,
      inspectorOpen: s.inspectorOpen,
      selectedLeadId: s.selectedLeadId,
    })),
  );
  const toggleSelected = useFlightCenterStore((s) => s.toggleSelected);
  const selectAll = useFlightCenterStore((s) => s.selectAll);
  const clearSelected = useFlightCenterStore((s) => s.clearSelected);
  const openInspector = useFlightCenterStore((s) => s.openInspector);
  const closeInspector = useFlightCenterStore((s) => s.closeInspector);

  const { data, isLoading, isError, refetch } = useWatchlist(offset);
  const bulkDelete = useBulkDeleteFromWatchlist();

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  // [PF14] initialData lookup: the drawer's header row comes from the cached
  // page — NOT a store mirror (Spec 35 §3.2: the store is UI-state only).
  const inspectedRow =
    inspectorOpen && selectedLeadId
      ? (items.find((i) => toInspectSegment(i) === selectedLeadId) ?? null)
      : null;

  const allOnPageSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  const handleOpenInspector = (item: WatchlistItem) => {
    // Read-only interaction — captureEvent only, no mutation breadcrumb
    // (Spec 89 §2.6 precedent).
    captureEvent('admin_watchlist_inspect_opened', { lead_type: item.lead_type });
    openInspector(toInspectSegment(item));
  };

  const handleBulkDelete = () => {
    bulkDelete.mutate(
      { ids: Array.from(selectedIds) },
      {
        onSuccess: () => {
          clearSelected();
          setConfirmOpen(false);
        },
        onError: () => {
          setConfirmOpen(false);
        },
      },
    );
  };

  return (
    <div data-testid="flight-center-tool">
      {/* Header bar: search trigger + bulk actions. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Watchlist</h2>
          <p className="mt-1 text-sm text-gray-500">
            Projects you watch — permits and CoAs — grouped by temporal proximity.
            Nothing leaves this list until you delete it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => (allOnPageSelected ? clearSelected() : selectAll(items.map((i) => i.id)))}
              data-testid="flight-center-select-all"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {allOnPageSelected ? 'Clear selection' : 'Select page'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={selectedIds.size === 0 || bulkDelete.isPending}
            data-testid="flight-center-bulk-delete"
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete selected ({selectedIds.size})
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            data-testid="flight-center-search-trigger"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Find projects
          </button>
        </div>
      </div>

      {isLoading && <BoardSkeleton />}

      {isError && (
        <div
          data-testid="flight-center-error"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>Failed to load the watchlist.</p>
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
          Nothing on the watchlist yet. Use <strong>Find projects</strong> above to
          search an address and save the projects at it.
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
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
                        const segment = toInspectSegment(item);
                        return (
                          <li
                            key={item.id}
                            data-testid={`flight-center-card-${segment}`}
                            className="rounded-md border border-gray-100 p-3 hover:border-blue-200"
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(item.id)}
                                onChange={() => toggleSelected(item.id)}
                                aria-label={`Select ${item.address || segment}`}
                                data-testid={`flight-center-check-${item.id}`}
                                className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
                              />
                              <button
                                type="button"
                                onClick={() => handleOpenInspector(item)}
                                className="block min-w-0 flex-1 text-left"
                                aria-label={`Inspect ${item.address || segment}`}
                              >
                                <p className="truncate text-sm font-semibold text-gray-900">
                                  {item.address || segment}
                                </p>
                                <p className="mt-0.5 truncate font-mono text-xs text-gray-500">
                                  {item.lead_type === 'coa' ? (
                                    <span className="mr-1 rounded bg-purple-100 px-1 text-[10px] font-semibold text-purple-800">
                                      CoA
                                    </span>
                                  ) : null}
                                  {item.lead_key}
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
                                  {formatExpectedStart(item.predicted_start, item.p25_days, item.p75_days)}
                                </p>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          {/* Pagination ([PF4]): LIMIT 50 + offset, total from meta. */}
          {total > WATCHLIST_PAGE_SIZE && (
            <div
              data-testid="flight-center-pagination"
              className="mt-6 flex items-center justify-between text-sm text-gray-600"
            >
              <span>
                {offset + 1}–{Math.min(offset + items.length, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOffset(Math.max(0, offset - WATCHLIST_PAGE_SIZE))}
                  disabled={offset === 0}
                  className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={() => setOffset(offset + WATCHLIST_PAGE_SIZE)}
                  disabled={offset + WATCHLIST_PAGE_SIZE >= total}
                  className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <SearchPermitsModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {confirmOpen && selectedIds.size > 0 && (
        <ConfirmDeleteDialog
          count={selectedIds.size}
          isPending={bulkDelete.isPending}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {/* Detail drawer (req 4): flight-semantics header PROMINENT above the
          8 diagnostic panels (LeadDetailInspector — the inspect endpoint,
          ≥0.85 identity floor preserved). No route navigation. */}
      {inspectorOpen && selectedLeadId && (
        <div
          data-testid="flight-center-inspector-drawer"
          className="fixed inset-0 z-40 flex items-start justify-end bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeInspector();
          }}
        >
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Project detail</h3>
              <button
                type="button"
                onClick={closeInspector}
                className="text-sm text-gray-500 hover:text-gray-700"
                aria-label="Close inspector"
              >
                Close
              </button>
            </div>
            <FlightSemanticsHeader row={inspectedRow} inspectId={selectedLeadId} />
            <LeadDetailInspector initialId={selectedLeadId} />
          </div>
        </div>
      )}

      {/* Sonner mount (control-panel precedent) — mutation toasts [PF5]. */}
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
