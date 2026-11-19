// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6, docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 dated note
//            2026-11-11 (MF-44: the web target of mobile_parcel_search; one shared pure match module, operator "01-a 0-2 b as long as they are
//            complaint", record ~/Buildo-scratch/mcfrontend/MF-44/DECISIONS.md).
//
// MF-44 · the shared pure core of the parcel search match helpers. NO imports: the mobile app (through parcelSearchMatch.ts, which re-exports and
// wraps these unchanged) and the web SEARCH binding (src/components/surfaces/web/SearchBinding.tsx, by relative path) read the same code, so the
// address highlighting and the route shape cannot drift between the two targets. Moved verbatim from parcelSearchMatch.ts (MF-35); the route
// function takes its base path so each platform passes its own (`/(app)/parcel-tool` in the app, `/parcel-tool` on the web).

/** The outcomes of one search render (parcelSearchMatch.ts ParcelSearchOutcome, the same closed union). */
export type SearchOutcome = 'unique' | 'text_candidates' | 'multi_parcel' | 'unlinked' | 'intersection' | 'idle' | 'no_match' | 'outside_toronto';

/**
 * Where each outcome navigates under `base`. Returning `null` means "render in place, do not navigate".
 *
 * `unique` pushes the detail route by path segment — `[parcelId].tsx` reads a PATH param via
 * `useLocalSearchParams`, so this must stay a path segment and must not be harmonised onto the
 * query-param style the `[lead]` / `[flight-job]` root routes use.
 */
export function parcelSearchPath(
  outcome: SearchOutcome,
  args: { parcelId?: string | null; query: string },
  base: string,
): string | null {
  switch (outcome) {
    case 'unique':
      return args.parcelId ? `${base}/${encodeURIComponent(args.parcelId)}` : null;
    case 'multi_parcel':
    case 'unlinked':
    case 'intersection':
      return `${base}/disambiguate?q=${encodeURIComponent(args.query.trim())}&kind=${outcome}`;
    case 'text_candidates':
    case 'no_match':
    case 'outside_toronto':
    case 'idle':
      return null;
  }
}

/** One run of address text, flagged for highlighting. */
export type AddressSegment = { text: string; differs: boolean };

/**
 * Split a candidate address into runs, flagging the part that DIFFERS from what the user typed —
 * the ruling's "differing part highlighted". A token the user already typed is not highlighted;
 * everything else is, which is what makes a list of near-identical addresses scannable.
 *
 * Whitespace is preserved as its own non-differing run so the rendered line reads normally.
 */
export function diffCandidateAddress(query: string, address: string): AddressSegment[] {
  const typed = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean),
  );
  if (!address) return [];
  // Split into alternating word / separator runs so nothing is lost.
  const runs = address.match(/[a-zA-Z0-9]+|[^a-zA-Z0-9]+/g) ?? [];
  return runs.map((run) => {
    const isWord = /[a-zA-Z0-9]/.test(run);
    return { text: run, differs: isWord && !typed.has(run.toLowerCase()) };
  });
}

// ── The reports-left line (SRCH.A6, task-320; operator RR-0307, MORNING-DECISIONS.md:1182) ─────────────────────────────────────────
//
// GET /api/parcels/entitlement serves the count (src/app/api/parcels/entitlement/types.ts): the server computes reportsLeft, reportsLimit and the
// reset date already written in Toronto time as `resetsOnDisplay` (FE-05, RR-0310); the page only prints them, no date is derived on the device.
// `EntitlementLine` is the three served fields the line binds, nothing else.

/** The served fields the reports-left line binds (every one null when the user has no plan or the read could not count). */
export type EntitlementLine = { reportsLeft: number | null; reportsLimit: number | null; resetsOnDisplay: string | null };
/** The same fields once the line is known to be drawn: all present. */
export type ShownEntitlement = { reportsLeft: number; reportsLimit: number; resetsOnDisplay: string };

/** True only when all three served fields are present (a served 0 counts as present; the label is a non-empty string); else no line is drawn. */
export function reportsLeftShown(e: EntitlementLine | null | undefined): e is ShownEntitlement {
  return !!e && e.reportsLeft !== null && e.reportsLeft !== undefined && e.reportsLimit !== null && e.reportsLimit !== undefined && typeof e.resetsOnDisplay === 'string' && e.resetsOnDisplay.length > 0;
}
