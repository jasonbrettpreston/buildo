// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (screens)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST archetype)
//            docs/specs/00-architecture/116_multi_product_architecture.md (OD5 — MaxBLD is its own
//            product; no lead-gen concepts, and no reuse of the lead-gen save machinery)
//            Surface S-072 `mobile_tracked_lots` · contract C-039 `contract_parcels_tracked`
//
// Everything the Tracked Lots screen decides, as pure functions — so the pluralisation, the
// manage-mode toggle, the delete-then-undo state machine and the navigation target are all
// testable without a renderer (the `useParcelLookup.test.ts` / `errors.ts` precedent: no
// side-effect imports, so a node-env test can load this file).
//
// THE THREE DISPLAY FIELDS, AND WHERE THEY REALLY COME FROM (measured 2026-09-16):
//   Max Build      -> parcels.max_buildable_gfa_sqm      EXISTS
//   Max CoA Build  -> parcels.max_newbuild_coa_gfa_sqm   EXISTS
//   New Nearby CoA Ruling -> NO COLUMN EXISTS. It is DERIVABLE but not derived anywhere today:
//       `coa_applications` carries `decision`, `decision_date` and `neighbourhood_id`, so "a CoA
//       ruling landed near this lot recently" is a decided application in the parcel's
//       neighbourhood inside a window. Nothing computes it yet, so the contract declares it as a
//       derived field and the type is `boolean | null` — `null` renders as "—", NEVER as "NO".
//       Saying "NO" when we have not looked would be inventing a fact about someone's lot.

/** One tracked lot as the contract will project it. */
export type TrackedLot = {
  parcelId: string;
  address: string;
  /** parcels.max_buildable_gfa_sqm */
  maxBuildGfaSqm: number | null;
  /** parcels.max_newbuild_coa_gfa_sqm */
  maxCoaBuildGfaSqm: number | null;
  /** DERIVED — no backing column. `null` means "not computed", not "no". TODO(contract). */
  newNearbyCoaRuling: boolean | null;
  /** user_tracked_lots.jurisdiction — 'TORONTO, ON' while Toronto is the only corpus. */
  jurisdiction: string;
  /** user_tracked_lots.created_at, ISO-8601. */
  trackedAt: string;
};

// ── Formatting ──────────────────────────────────────────────────────────────

/** "No Tracked Lots" / "1 Tracked Lot" / "12 Tracked Lots". */
export function trackedCountLabel(count: number): string {
  if (count <= 0) return 'No Tracked Lots';
  return `${count} Tracked Lot${count === 1 ? '' : 's'}`;
}

/**
 * "1,240 m² GFA", or "—" when the value is absent.
 * A missing envelope figure is a real state for a lot the pipeline could not resolve; it renders
 * as an em dash rather than a zero, because 0 m² is a claim and "—" is not.
 */
export function formatGfa(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString('en-CA')} m² GFA`;
}

/** YES / NO / "—". `null` is the honest answer while nothing computes this field. */
export function coaRulingLabel(value: boolean | null | undefined): string {
  if (value == null) return '—';
  return value ? 'YES' : 'NO';
}

/** Only a definite `true` earns the tertiary-green highlight. */
export function coaRulingIsPositive(value: boolean | null | undefined): boolean {
  return value === true;
}

/**
 * Where a row taps through to: the lot report in this same Stack.
 * The detail screen reads a PATH param (`[parcelId].tsx` -> useLocalSearchParams), so this must
 * stay a path segment and must not be harmonised onto the query-param style the root `[lead]` /
 * `[flight-job]` routes use.
 */
export function trackedLotRoute(parcelId: string): string {
  return `/(app)/parcel-tool/${encodeURIComponent(parcelId)}`;
}

// ── Manage mode + delete/undo ───────────────────────────────────────────────

/** A removal that has happened on screen but has not been committed to the server yet. */
export type PendingRemoval = { lot: TrackedLot; index: number };

export type TrackedLotsView = {
  lots: TrackedLot[];
  /** At most one at a time: a second removal commits the first (the toast is singular). */
  pending: PendingRemoval | null;
};

export function initialView(lots: TrackedLot[]): TrackedLotsView {
  return { lots, pending: null };
}

/**
 * Remove a row optimistically. The lot leaves the list immediately — so the header count updates
 * at once — and is parked with its ORIGINAL INDEX so undo can put it back where it was rather
 * than at the end.
 *
 * A second removal while one is pending COMMITS the first: there is one toast, so there can only
 * be one undoable action, and silently dropping the older one would lose a deletion the user was
 * still entitled to undo.
 */
export function removeLot(view: TrackedLotsView, parcelId: string): TrackedLotsView {
  const index = view.lots.findIndex((l) => l.parcelId === parcelId);
  if (index === -1) return view;
  const lot = view.lots[index]!;
  return {
    lots: view.lots.filter((l) => l.parcelId !== parcelId),
    pending: { lot, index },
  };
}

/** Put the pending lot back at the index it came from. */
export function undoRemoval(view: TrackedLotsView): TrackedLotsView {
  if (!view.pending) return view;
  const { lot, index } = view.pending;
  const lots = [...view.lots];
  lots.splice(Math.min(index, lots.length), 0, lot);
  return { lots, pending: null };
}

/** Drop the undo affordance — the removal is now final and the DELETE may fire. */
export function commitRemoval(view: TrackedLotsView): TrackedLotsView {
  return view.pending ? { lots: view.lots, pending: null } : view;
}

/** The toast copy. */
export function removalToastLabel(lot: TrackedLot): string {
  return `Removed ${lot.address}`;
}

/**
 * Leaving manage mode commits anything still pending: "Done" means done. Entering manage mode
 * cannot have anything pending, so it is a no-op on the data.
 */
export function setManageMode(
  view: TrackedLotsView,
  next: boolean,
): { view: TrackedLotsView; manageMode: boolean } {
  return { view: next ? view : commitRemoval(view), manageMode: next };
}
