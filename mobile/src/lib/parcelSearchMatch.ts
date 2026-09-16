// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6 (the shape drives the client
//            state machine), §2.9 (Toronto scoping is UX, not security)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (SEARCH archetype)
//            Surface S-002 `mobile_parcel_search` · contract C-001 `contract_parcels_lookup`
//
// THE MATCH-TYPE RULING (operator, 2026-09-16).
// The search screen branches on a match TYPE, never on a result COUNT. This module is the only
// place in the app where a count is ever read, and it exists so that the screen cannot be written
// any other way.
//
//   unique          -> navigate straight to the lot; no intermediate screen, no saved-home step
//   text_candidates -> a capped candidate list with the differing part highlighted; beyond the
//                      cap, ask for a house number instead of listing
//   multi_parcel    -> map: every linked parcel polygon drawn and tappable, address pin, one line
//                      of lot facts per polygon
//   unlinked        -> map: pin + surrounding parcels faint and tappable + a VISIBLE "no lot is
//                      linked to this address" state. NEVER a silent nearest-polygon fallback
//   intersection    -> map: the corner lots highlighted, no list
//
// WHAT THE SERVER ACTUALLY SENDS TODAY, measured.
// `GET /api/parcels/lookup?q=` returns `{ match, candidates, warnings, parcel }`. `match.matchType`
// is the closed enum `'exact' | 'typeahead' | 'direct'` (src/app/api/parcels/lookup/types.ts, via
// src/app/api/admin/parcels/lookup/types.ts) — it does NOT carry the five ruled types, and
// `resolveAddress` (src/lib/admin/parcel-lookup.ts) collapses every ambiguity into `candidates[]`
// with no intersection parsing and no address-point fan-out signal.
//
// Three of the five are therefore derivable client-side today; TWO ARE NOT:
//   * multi_parcel — needs the API to distinguish "one address point -> N parcels" from
//                    "N separate text matches". Indistinguishable in the current payload.
//   * unlinked     — needs the API to distinguish "address resolved, no parcel linked" from
//                    "address did not resolve at all". Both arrive as zero candidates.
// Per the operator's ruling §3 the API is NOT changed in this pass (different domain, different
// committer). `deriveMatchType` is written SERVER-VALUE-FIRST so that the moment the contract
// carries a real resolution type, that value wins and the derivation below is dead code.
//
// Widening `ParcelMatchSchema.matchType` in mobile/src/lib/schemas.ts is the one further change
// needed for the server value to reach here: the client parse is a plain `z.object`, so an
// unrecognised `matchType` is rejected by the enum rather than passed through.

import type { ParcelCandidate, ConsumerParcelLookupResult } from '@/lib/schemas';

// ── The Toronto-only rule (operator ruling 2026-09-16 (b)) ──────────────────
//
// MaxBLD has NO home-base concept and the owner's location does not matter. The only geography
// rule is about the ADDRESS BEING SEARCHED: outside Toronto is a visible refusal, not a miss.
//
// WHY THE EXISTING CHECK CANNOT SERVE. `isInsideToronto` / `TORONTO_BOUNDS`
// (mobile/src/lib/onboarding/snapCoord.ts) take a lat/lng. A SEARCH surface has a STRING that has
// not been geocoded — there are no coordinates to test. It also lives in the lead-gen onboarding
// module, so importing it into the parcel product would be new scope-A leakage of exactly the kind
// ruling (a) forbids. The rule below is therefore string-shaped and lives in the parcel product.
//
// Toronto is the only Canadian city whose postal codes begin with `M`, which makes the forward
// sortation area a hard signal. The municipality list is applied ONLY to the city position (after
// the first comma) — deliberately, because Markham, Milton and Hamilton are all ALSO Toronto street
// names, and "26 Markham St" must not be refused. A bare "123 Main St Mississauga" with no comma
// is not caught here; it reaches the server and misses. That is a stated limitation, not an
// oversight — a broader match would refuse real Toronto addresses.

/** Toronto and its six pre-amalgamation municipalities — all genuinely in the corpus. */
export const TORONTO_MUNICIPALITIES = [
  'toronto',
  'north york',
  'east york',
  'scarborough',
  'etobicoke',
  'york',
] as const;

/** Neighbouring municipalities that are NOT in the corpus. Checked in the city position only. */
export const NON_TORONTO_MUNICIPALITIES = [
  'mississauga', 'brampton', 'caledon', 'vaughan', 'woodbridge', 'concord', 'maple',
  'thornhill', 'markham', 'unionville', 'richmond hill', 'aurora', 'newmarket',
  'king city', 'stouffville', 'whitchurch-stouffville', 'uxbridge', 'georgina',
  'east gwillimbury', 'pickering', 'ajax', 'whitby', 'oshawa', 'clarington',
  'bowmanville', 'oakville', 'burlington', 'milton', 'halton hills', 'georgetown',
  'hamilton', 'barrie', 'guelph', 'kitchener', 'waterloo', 'cambridge', 'london',
  'ottawa', 'kingston', 'windsor', 'niagara falls', 'st catharines',
] as const;

function containsMunicipality(city: string, name: string): boolean {
  return new RegExp(`(^|[^a-z])${name.replace(/[-]/g, '[- ]')}($|[^a-z])`, 'i').test(city);
}

/**
 * Is the searched ADDRESS outside Toronto? Two independent signals, either sufficient:
 *   1. a Canadian forward sortation area whose first letter is not `M`
 *   2. a known non-Toronto municipality in the city position (after the first comma)
 * A Toronto municipality in the city position always wins — "Scarborough" is Toronto.
 */
export function isOutsideToronto(query: string): boolean {
  const q = query.trim();
  if (!q) return false;

  // 1. Postal FSA. Toronto is the only M. Requires a digit so "St A" cannot match.
  const fsa = q.toUpperCase().match(/(^|[^A-Z0-9])([A-Z])\d[A-Z]($|[^A-Z0-9])/);
  if (fsa && fsa[2] !== 'M') return true;

  // 2. City position only — never the street position (see the note above).
  const comma = q.indexOf(',');
  if (comma === -1) return false;
  const city = q.slice(comma + 1).toLowerCase();
  if (!city.trim()) return false;
  if (TORONTO_MUNICIPALITIES.some((n) => containsMunicipality(city, n))) return false;
  return NON_TORONTO_MUNICIPALITIES.some((n) => containsMunicipality(city, n));
}

/** The five types the operator ruled on. Order is the ruling's order. */
export const PARCEL_MATCH_TYPES = [
  'unique',
  'text_candidates',
  'multi_parcel',
  'unlinked',
  'intersection',
] as const;

export type ParcelMatchType = (typeof PARCEL_MATCH_TYPES)[number];

/**
 * What the screen renders. The five ruled types, plus the two non-match states that are not
 * match types at all: nothing typed yet, and a query that resolved to nothing (the `miss` state
 * the descriptor already declares, rendered as `parcel-search-empty`).
 */
export type ParcelSearchOutcome = ParcelMatchType | 'idle' | 'no_match' | 'outside_toronto';

/**
 * The one type guard for the ruled vocabulary. Exported so the map surface narrows its `kind` route
 * param with the SAME guard the search surface derives with — two copies would have to be kept in
 * step by hand every time the enum changes.
 */
export function isParcelMatchType(v: unknown): v is ParcelMatchType {
  return typeof v === 'string' && (PARCEL_MATCH_TYPES as readonly string[]).includes(v);
}

/**
 * Is this query an intersection ("Queen & Spadina", "King and Bathurst") rather than an address?
 *
 * Deliberately conservative: a leading house number means the user typed an address, so
 * "123 King and Queen Apartments" is NOT an intersection. Both sides must be non-trivial, which
 * rejects a trailing conjunction ("Queen and").
 *
 * This is the one branch derived from the QUERY rather than the response, and it is sound because
 * `parseFreeTextAddress` has no intersection handling at all — an intersection query always
 * resolves to nothing server-side, so without this branch it would render as a flat "not found".
 */
export function isIntersectionQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  // A leading house number means this is an address, not an intersection.
  if (/^\d/.test(q)) return false;
  const m = q.match(/^(.+?)\s+(?:&|and|\+|\/|at)\s+(.+)$/i);
  if (!m) return false;
  const left = m[1]!.trim();
  const right = m[2]!.trim();
  return left.length >= 2 && right.length >= 2;
}

/**
 * The single branch point of the SEARCH surface.
 *
 * SERVER VALUE WINS. If the response already names one of the five ruled types, that is the
 * answer and nothing below runs. Everything after that line is the TODO(contract) shim.
 */
export function deriveMatchType(
  query: string,
  data: ConsumerParcelLookupResult | undefined,
): ParcelSearchOutcome {
  const trimmed = query.trim();
  if (!trimmed) return 'idle';

  // The Toronto-only rule decides BEFORE the network does, and gets its own outcome rather than
  // being folded into `no_match` — "we do not cover that city" and "we could not find that address"
  // are different things to be told, and the caller must not send the query at all.
  if (isOutsideToronto(trimmed)) return 'outside_toronto';

  if (!data) return 'idle';

  // 1. Forward-compatible path: the contract declares the type, we obey it.
  //    `matchType` is currently typed as the narrow 'exact' | 'typeahead' | 'direct' enum, so this
  //    never fires today — it fires the day the contract and mobile/src/lib/schemas.ts widen.
  const declared: unknown = data.match?.matchType;
  if (isParcelMatchType(declared)) return declared;

  // 2. TODO(contract): derive the type from the shape of a response that does not declare one.
  //    This is the ONLY place a count is read anywhere in the SEARCH surface. Delete this block
  //    when `/api/parcels/lookup` returns a resolution type.
  if (data.match) return 'unique';
  if (isIntersectionQuery(trimmed)) return 'intersection';
  if (data.candidates.length > 0) return 'text_candidates';
  // NOTE: a zero-candidate response is reported as `no_match`, never as `unlinked`. `unlinked`
  // means "the address resolved but no parcel is linked to it", which this payload cannot express.
  // Guessing would be exactly the silent fallback the ruling forbids.
  return 'no_match';
}

/** True when the candidate list hit the contract cap and the user should be asked to narrow. */
export function isOverCandidateCap(candidates: readonly ParcelCandidate[], cap: number): boolean {
  return candidates.length >= cap;
}

/**
 * Where each outcome navigates. Returning `null` means "render in place, do not navigate".
 *
 * `unique` pushes the detail route by path segment — `[parcelId].tsx` reads a PATH param via
 * `useLocalSearchParams`, so this must stay a path segment and must not be harmonised onto the
 * query-param style the `[lead]` / `[flight-job]` root routes use.
 */
export function parcelSearchRoute(
  outcome: ParcelSearchOutcome,
  args: { parcelId?: string | null; query: string },
): string | null {
  switch (outcome) {
    case 'unique':
      return args.parcelId ? `/(app)/parcel-tool/${encodeURIComponent(args.parcelId)}` : null;
    case 'multi_parcel':
    case 'unlinked':
    case 'intersection':
      return `/(app)/parcel-tool/disambiguate?q=${encodeURIComponent(args.query.trim())}&kind=${outcome}`;
    case 'text_candidates':
    case 'no_match':
    case 'outside_toronto':
    case 'idle':
      return null;
  }
}

/**
 * Which tab of the S-004 shelf the current route belongs to.
 *
 * Derived from the ROUTE, never from local state (operator ruling 2026-09-16 (c)), so a deep link
 * straight into a lot lights the right tab. The detail and disambiguation screens are part of the
 * Lookup flow and keep Lookup lit rather than dropping the highlight.
 *
 * Tolerant of the group segment: expo-router's `usePathname` strips `(app)`, but a raw href that
 * still carries it resolves the same way.
 */
export const PARCEL_TABS = ['lookup', 'tracked', 'account'] as const;
export type ParcelTab = (typeof PARCEL_TABS)[number];

/** The shelf's visible labels. */
export const PARCEL_TAB_LABEL: Record<ParcelTab, string> = {
  lookup: 'Lookup',
  tracked: 'Tracked Lots',
  account: 'Account',
};

/**
 * Where each tab navigates. Kept beside `activeParcelTab` on purpose: the two are a round trip —
 * pushing a tab's href must light that same tab — and a test pins exactly that, so the shelf's
 * links and the highlight cannot drift apart.
 */
export const PARCEL_TAB_ROUTE: Record<ParcelTab, string> = {
  lookup: '/(app)/parcel-tool',
  tracked: '/(app)/parcel-tool/tracked',
  account: '/(app)/parcel-tool/account',
};

export function activeParcelTab(pathname: string): ParcelTab {
  const segments = pathname.split('/').filter((s) => s && !s.startsWith('('));
  const i = segments.indexOf('parcel-tool');
  const child = i === -1 ? segments[0] : segments[i + 1];
  if (child === 'tracked') return 'tracked';
  if (child === 'account') return 'account';
  // index, [parcelId] and disambiguate are all the Lookup flow.
  return 'lookup';
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
