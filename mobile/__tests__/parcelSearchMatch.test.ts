/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6 (the response shape drives
//            the client state machine), §4 (ParcelSearchScreen)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (SEARCH archetype —
//            config.debounce_ms, config.min_query_len, states[] must include `empty`)
//            Surface S-002 `mobile_parcel_search`
//
// Exercises the exported pure helpers without a React renderer — the `useParcelLookup.test.ts` /
// `useLeadDetail` precedent. `@testing-library/react-native` is not installed in `mobile/`, and a
// render test would be a new dependency decision rather than a free step, so the branch logic
// lives in a pure module precisely so it can be locked here.
//
// THE LOCK THIS FILE EXISTS FOR: the screen branches on a match TYPE, never on a result COUNT
// (operator ruling 2026-09-16). All five ruled types are exercised below, including the two that
// today's contract cannot express — those are driven through the server-value-wins path, which is
// what will carry them the moment the API lands.

import {
  PARCEL_MATCH_TYPES,
  PARCEL_TABS,
  PARCEL_TAB_LABEL,
  PARCEL_TAB_ROUTE,
  activeParcelTab,
  deriveMatchType,
  diffCandidateAddress,
  isIntersectionQuery,
  isOutsideToronto,
  isOverCandidateCap,
  parcelSearchRoute,
  searchWall,
  type WallRead,
} from '@/lib/parcelSearchMatch';
import { ApiError, RateLimitError, ReportLimitError, SubscriptionRequiredError } from '@/lib/errors';
import { shouldHideAppTabBar } from '@/lib/appShell';
import {
  SEARCH_CANDIDATE_LIMIT,
} from '@/constants/parcelSearch';
import searchSlice from '@/generated/surfaces/mobile_parcel_search.json';
import type { ConsumerParcelLookupResult } from '@/lib/schemas';

// A response shaped exactly like the server's whitelist envelope. `parcel` is irrelevant to the
// branch decision (the SEARCH surface never reads it), so it stays null throughout.
function response(over: Partial<ConsumerParcelLookupResult> = {}): ConsumerParcelLookupResult {
  return {
    match: null,
    candidates: [],
    warnings: [],
    parcel: null,
    ...over,
  } as ConsumerParcelLookupResult;
}

const candidate = (parcelId: string, address: string) => ({ parcelId, address });

/** A payload that names its outcome, as the server sends it (MF-53). Dated 2026-11-24 (task-450 SEARCHFIX.2, Q19): the declared-matchType helper
 * withDeclaredType went with the deleted client derivation; a payload without `resolution` now reads as the server's no_match. */
function withResolution(resolution: NonNullable<ConsumerParcelLookupResult['resolution']>, extra: Partial<ConsumerParcelLookupResult> = {}): ConsumerParcelLookupResult {
  return { ...response(), resolution, map: null, ...extra } as ConsumerParcelLookupResult;
}

describe('the SEARCH archetype parameters match the descriptor', () => {
  it('debounce_ms, min_query_len and the candidate cap are the declared values', () => {
    // These three are `config.debounce_ms`, `config.min_query_len` and the contract cap in
    // scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json.
    expect(searchSlice.config.debounce_ms).toBe(400); // FIX.CONFIG-BOUNDS (task-395): the typed second copy is gone; the slice is the one home
    expect(searchSlice.config.min_query_len).toBe(3);
    expect(SEARCH_CANDIDATE_LIMIT).toBe(10);
  });

  it('the client minimum never rises above the server minimum', () => {
    // src/app/api/parcels/lookup/types.ts — `q: z.string().trim().min(3)`. A client gate ABOVE the
    // server's floor would silently make valid queries unreachable.
    // The 3 and the 120 are held to that line, and to the registered row, by src/tests/surfaces/surface-conformance.logic.test.ts (C-10, parity).
    const SERVER_MIN = 3;
    expect(searchSlice.config.min_query_len).toBeLessThanOrEqual(SERVER_MIN);
    expect(searchSlice.bounds.min_query_len).toMatchObject({ min: 3, max: 120 });
  });
});

describe('deriveMatchType — all five ruled types', () => {
  it('unique: a resolved match navigates straight to the lot', () => {
    const data = withResolution('unique', { match: { parcelId: 'PIN-777', matchType: 'exact', address: '26 Hurlingham Cres' } });
    expect(deriveMatchType('26 Hurlingham Cres', data)).toBe('unique');
    expect(parcelSearchRoute('unique', { parcelId: 'PIN-777', query: '26 Hurlingham Cres' })).toBe(
      '/(app)/parcel-tool/PIN-777',
    );
  });

  it('unique: a typeahead single hit is the same type — the branch is not on matchType flavour', () => {
    const data = withResolution('unique', { match: { parcelId: 'PIN-8', matchType: 'typeahead', address: '8 Elm St' } });
    expect(deriveMatchType('8 Elm', data)).toBe('unique');
  });

  it('text_candidates: several text matches render a list, not a map', () => {
    const data = withResolution('text_candidates', {
      candidates: [candidate('PIN-1', '10 Elm St'), candidate('PIN-2', '10 Elm Ave')],
    });
    expect(deriveMatchType('10 Elm', data)).toBe('text_candidates');
    // A list renders in place — it must NOT navigate.
    expect(parcelSearchRoute('text_candidates', { query: '10 Elm' })).toBeNull();
  });

  it('multi_parcel: the server resolution wins and routes to the map', () => {
    // Not derivable from the payload shape — one address point linked to 2+ parcels is
    // indistinguishable from N separate text matches. Driven by the server value.
    const data = withResolution('multi_parcel');
    expect(deriveMatchType('1 Test St', data)).toBe('multi_parcel');
    expect(parcelSearchRoute('multi_parcel', { query: '1 Test St' })).toBe(
      '/(app)/parcel-tool/disambiguate?q=1%20Test%20St&kind=multi_parcel',
    );
  });

  it('unlinked: the server resolution wins and routes to the map', () => {
    const data = withResolution('unlinked');
    expect(deriveMatchType('1 Test St', data)).toBe('unlinked');
    expect(parcelSearchRoute('unlinked', { query: '1 Test St' })).toBe(
      '/(app)/parcel-tool/disambiguate?q=1%20Test%20St&kind=unlinked',
    );
  });

  it('unlinked is NEVER guessed from an empty response — that would be the banned silent fallback', () => {
    // A zero-candidate miss is `no_match`, not `unlinked`. The payload cannot tell "address
    // resolved, no lot linked" from "address did not resolve", so the screen must not pretend.
    expect(deriveMatchType('99999 Nowhere St', response())).toBe('no_match');
  });

  it('intersection: derived from the query shape and routed to the map', () => {
    // `resolveAddress` has no intersection parsing, so the server always misses on these — without
    // this branch an intersection would render as a flat "not found".
    expect(deriveMatchType('Queen & Spadina', response())).toBe('intersection');
    expect(parcelSearchRoute('intersection', { query: 'Queen & Spadina' })).toBe(
      '/(app)/parcel-tool/disambiguate?q=Queen%20%26%20Spadina&kind=intersection',
    );
  });

  it('every one of the five ruled types is reachable from deriveMatchType', () => {
    const reached = new Set<string>([
      deriveMatchType('26 Hurlingham Cres', withResolution('unique', { match: { parcelId: 'P', matchType: 'exact', address: 'a' } })),
      deriveMatchType('10 Elm', withResolution('text_candidates', { candidates: [candidate('P', '10 Elm St')] })),
      deriveMatchType('x', withResolution('multi_parcel')),
      deriveMatchType('x', withResolution('unlinked')),
      deriveMatchType('Queen & Spadina', response()),
    ]);
    expect([...PARCEL_MATCH_TYPES].every((t) => reached.has(t))).toBe(true);
    expect(reached.size).toBe(PARCEL_MATCH_TYPES.length);
  });
});

describe('deriveMatchType — non-match states', () => {
  it('an empty or whitespace query is idle, not a miss', () => {
    expect(deriveMatchType('', response())).toBe('idle');
    expect(deriveMatchType('   ', response())).toBe('idle');
  });

  it('no data yet (first fetch in flight) is idle, not a miss', () => {
    expect(deriveMatchType('26 Hurlingham', undefined)).toBe('idle');
  });

  it('a miss is `no_match` — the `empty` state the SEARCH archetype requires', () => {
    expect(deriveMatchType('zzzzzz', response())).toBe('no_match');
  });

  it('nothing but `unique` ever routes to a parcel detail', () => {
    expect(parcelSearchRoute('no_match', { query: 'x' })).toBeNull();
    expect(parcelSearchRoute('idle', { query: '' })).toBeNull();
    // `unique` with no parcelId cannot build a route — it must not emit a broken one.
    expect(parcelSearchRoute('unique', { parcelId: null, query: 'x' })).toBeNull();
  });

  it('a parcelId with URL-hostile characters is encoded into the path segment', () => {
    expect(parcelSearchRoute('unique', { parcelId: 'A/B 1', query: 'x' })).toBe(
      '/(app)/parcel-tool/A%2FB%201',
    );
  });
});

describe('the Toronto-only rule (operator ruling 2026-09-16 (b))', () => {
  it('is its own outcome — an out-of-Toronto address is NOT overloaded onto no_match', () => {
    // "we do not cover that city" and "we could not find that address" are different things to be
    // told. The ruling is explicit that this must not reuse `no_match`.
    expect(deriveMatchType('123 Main St, Mississauga', response())).toBe('outside_toronto');
    expect(deriveMatchType('zzzzzz', response())).toBe('no_match');
  });

  it('decides BEFORE the network — no response is needed', () => {
    expect(deriveMatchType('123 Main St, Oakville', undefined)).toBe('outside_toronto');
  });

  it('refuses even when the server somehow returned a match', () => {
    const data = withResolution('unique', { match: { parcelId: 'P', matchType: 'exact', address: 'x' } });
    expect(deriveMatchType('1 King St, Hamilton', data)).toBe('outside_toronto');
  });

  it('never navigates', () => {
    expect(parcelSearchRoute('outside_toronto', { query: '1 King St, Hamilton' })).toBeNull();
  });

  it.each([
    ['123 Main St, Mississauga', true],
    ['1 Queen St, Brampton', true],
    ['5 Yonge St, Richmond Hill', true],
    ['9 Elm Ave, Vaughan', true],
    ['2 Bay St, Oakville', true],
    ['7 Main St, Whitchurch-Stouffville', true],
  ])('deny-list municipality in the city position: %s → outside = %s', (q, expected) => {
    expect(isOutsideToronto(q)).toBe(expected);
  });

  it.each([
    ['26 Hurlingham Cres, Toronto', false],
    ['1 Yonge St, North York', false],
    ['5 Kingston Rd, Scarborough', false],
    ['9 Bloor St, Etobicoke', false],
    ['3 Danforth Ave, East York', false],
    ['11 Eglinton Ave, York', false],
  ])('Toronto and its six pre-amalgamation municipalities stay in: %s → %s', (q, expected) => {
    expect(isOutsideToronto(q)).toBe(expected);
  });

  it('does NOT refuse a Toronto street that shares a municipality name', () => {
    // The trap this rule is shaped around: Markham Rd, Milton St and Hamilton Ave are all real
    // Toronto streets. The municipality list applies ONLY to the city position, after the comma.
    expect(isOutsideToronto('26 Markham St')).toBe(false);
    expect(isOutsideToronto('26 Markham St, Toronto')).toBe(false);
    expect(isOutsideToronto('4 Milton St')).toBe(false);
    expect(isOutsideToronto('10 Hamilton Ave')).toBe(false);
    // ...but the same name in the city position IS the city.
    expect(isOutsideToronto('26 Main St, Markham')).toBe(true);
  });

  it('uses the postal FSA anywhere in the query — Toronto is the only M', () => {
    expect(isOutsideToronto('26 Hurlingham Cres M4N 1A1')).toBe(false);
    expect(isOutsideToronto('123 Main St L5B 3C4')).toBe(true); // Mississauga
    expect(isOutsideToronto('1 Rideau St K1N 5X5')).toBe(true); // Ottawa
    // An FSA needs its digit — a bare two-letter token must not be read as one.
    expect(isOutsideToronto('St Clair Ave W')).toBe(false);
  });

  it('does not refuse an unknown or absent city — the server simply misses', () => {
    expect(isOutsideToronto('123 Main St, Springfield')).toBe(false);
    expect(isOutsideToronto('123 Main St, Ontario')).toBe(false);
    expect(isOutsideToronto('123 Main St, ON')).toBe(false);
    expect(isOutsideToronto('123 Main St')).toBe(false);
    expect(isOutsideToronto('')).toBe(false);
    expect(isOutsideToronto('   ')).toBe(false);
  });

  it('STATED LIMITATION: a deny-list city with no comma is not caught client-side', () => {
    // Widening this to match anywhere would refuse "26 Markham St", a real Toronto address.
    // Documented in parcelSearchMatch.ts and in the S-002 descriptor rather than silently fixed.
    expect(isOutsideToronto('123 Main St Mississauga')).toBe(false);
  });
});

describe('S-004 product shelf — three tabs, active derived from the route', () => {
  it('has exactly the three MaxBLD tabs', () => {
    expect([...PARCEL_TABS]).toEqual(['lookup', 'tracked', 'account']);
  });

  it.each([
    ['/parcel-tool', 'lookup'],
    ['/parcel-tool/', 'lookup'],
    ['/parcel-tool/tracked', 'tracked'],
    ['/parcel-tool/account', 'account'],
    // The detail and disambiguation screens are part of the Lookup FLOW — the highlight stays on
    // Lookup rather than going out entirely.
    ['/parcel-tool/PIN-777', 'lookup'],
    ['/parcel-tool/disambiguate', 'lookup'],
    // Tolerant of the group segment, which usePathname strips but a raw href keeps.
    ['/(app)/parcel-tool/tracked', 'tracked'],
    ['/(app)/parcel-tool', 'lookup'],
  ])('%s → %s tab', (pathname, expected) => {
    expect(activeParcelTab(pathname)).toBe(expected);
  });

  it('a lot whose id collides with a tab name still resolves as that tab is reached by route', () => {
    // Guard on the derivation being segment-positional, not a substring search.
    expect(activeParcelTab('/parcel-tool/account')).toBe('account');
    expect(activeParcelTab('/parcel-tool/PIN-account-1')).toBe('lookup');
  });

  it('ROUND TRIP: pushing a tab’s href lights that same tab', () => {
    // The lock that stops the shelf's links and the highlight drifting apart — the failure mode
    // where you tap Account, land on Account, and the shelf still shows Lookup.
    for (const tab of PARCEL_TABS) {
      expect(activeParcelTab(PARCEL_TAB_ROUTE[tab])).toBe(tab);
    }
  });

  it('every tab has a label and an href — the three the ruling names', () => {
    expect(PARCEL_TABS.map((t) => PARCEL_TAB_LABEL[t])).toEqual([
      'Lookup',
      'Tracked Lots',
      'Account',
    ]);
    for (const tab of PARCEL_TABS) {
      expect(PARCEL_TAB_ROUTE[tab]).toMatch(/^\/\(app\)\/parcel-tool/);
    }
  });
});

describe('the five-tab lead-gen bar is hidden inside the MaxBLD product (ruling (c))', () => {
  it('hides for parcel-tool and for nothing else', () => {
    expect(shouldHideAppTabBar('parcel-tool')).toBe(true);
    for (const r of ['index', 'flight-board', 'map', 'settings']) {
      expect(shouldHideAppTabBar(r)).toBe(false);
    }
  });

  it('an undefined focused route does not hide the bar', () => {
    expect(shouldHideAppTabBar(undefined)).toBe(false);
  });
});

describe('isIntersectionQuery', () => {
  it.each([
    ['Queen & Spadina', true],
    ['King and Bathurst', true],
    ['Dundas + Ossington', true],
    ['Bloor / Yonge', true],
    ['College at Grace', true],
  ])('%s → intersection = %s', (q, expected) => {
    expect(isIntersectionQuery(q)).toBe(expected);
  });

  it.each([
    // A leading house number means the user typed an address, whatever else is in the string.
    ['123 King and Queen Apartments', false],
    ['26 Hurlingham Cres', false],
    // A trailing conjunction is an unfinished query, not an intersection.
    ['Queen and', false],
    ['Queen &', false],
    ['', false],
    ['   ', false],
    ['Spadina', false],
  ])('%s → intersection = %s', (q, expected) => {
    expect(isIntersectionQuery(q)).toBe(expected);
  });
});

describe('isOverCandidateCap — beyond the cap, ask for a house number', () => {
  it('is true only once the contract cap is reached', () => {
    const at = Array.from({ length: SEARCH_CANDIDATE_LIMIT }, (_, i) => candidate(`P${i}`, `${i} Elm St`));
    expect(isOverCandidateCap(at, SEARCH_CANDIDATE_LIMIT)).toBe(true);
    expect(isOverCandidateCap(at.slice(0, -1), SEARCH_CANDIDATE_LIMIT)).toBe(false);
    expect(isOverCandidateCap([], SEARCH_CANDIDATE_LIMIT)).toBe(false);
  });
});

describe('diffCandidateAddress — the differing part is highlighted', () => {
  it('flags only the tokens the user did not type', () => {
    const segs = diffCandidateAddress('10 Elm', '10 Elm Avenue');
    const differing = segs.filter((s) => s.differs).map((s) => s.text);
    expect(differing).toEqual(['Avenue']);
  });

  it('reassembles losslessly, separators included', () => {
    const address = '26 Hurlingham Cres';
    expect(diffCandidateAddress('26 Hurlingham', address).map((s) => s.text).join('')).toBe(address);
  });

  it('is case-insensitive about what the user typed', () => {
    const segs = diffCandidateAddress('10 elm', '10 Elm Avenue');
    expect(segs.filter((s) => s.differs).map((s) => s.text)).toEqual(['Avenue']);
  });

  it('never flags whitespace or punctuation as the differing part', () => {
    const segs = diffCandidateAddress('', '10 Elm St.');
    expect(segs.filter((s) => s.differs).map((s) => s.text)).toEqual(['10', 'Elm', 'St']);
  });

  it('an empty address yields no segments rather than a bare highlight', () => {
    expect(diffCandidateAddress('10 Elm', '')).toEqual([]);
  });
});

// ── MF-35: the situation helpers (plan v2 §9 truth table, RG-2; must-survive rows 11-16) ─────────────────────────────────────────────────────
// The named situations of __tests__/fixtures/parcelSearch.situations.json are rebuilt here from hook values, so the file cannot drift from the helper.
describe('MF-35 situation helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const M = require('@/lib/parcelSearchMatch') as typeof import('@/lib/parcelSearchMatch');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ApiError, RateLimitError } = require('@/lib/errors') as typeof import('@/lib/errors');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const S = require('./fixtures/parcelSearch.situations.json') as Record<string, unknown>;
  const base = { input: '', debounced: '', data: undefined, error: null as unknown, isFetching: false, schemaDrift: false, recent: [] as string[], selectedParcelId: null, cap: 10, minQueryLen: 3 };
  const cands = (S.ambiguous as { candidates: { parcelId: string; address: string }[] }).candidates;
  // Dated 2026-11-24 (task-450 SEARCHFIX.2, Q19): the payloads carry the server's `resolution`, as the server always sends it (a payload without it reads as no_match).
  const lookup = (candidates: { parcelId: string; address: string }[], match: unknown = null) =>
    ({ match, candidates, warnings: [], parcel: null, resolution: match ? 'unique' : candidates.length > 0 ? 'text_candidates' : 'no_match' }) as never;

  it('searchQueryArg: "" outside Toronto, the query otherwise (row 11)', () => {
    expect(M.searchQueryArg('100 City Centre Dr, Mississauga')).toBe('');
    expect(M.searchQueryArg('26 Hurlingham Cres')).toBe('26 Hurlingham Cres');
  });
  it('classifyParcelSearchError on the real classes (row 12; MF35-DF1 closed, task-450 L3: a retry-after of 0 is one message, not two)', () => {
    expect(M.classifyParcelSearchError(new RateLimitError(7), false)).toEqual({ rateLimited: true, retryAfterSeconds: 7, entitlement: false, unexpected: false, schemaDrift: false });
    expect(M.classifyParcelSearchError(new RateLimitError(0), false)).toEqual({ rateLimited: true, retryAfterSeconds: 0, entitlement: false, unexpected: false, schemaDrift: false });
    expect(M.classifyParcelSearchError(new ApiError(403, 'x'), false).entitlement).toBe(true);
    expect(M.classifyParcelSearchError(new ApiError(400, 'x'), false)).toMatchObject({ entitlement: false, unexpected: true });
    expect(M.classifyParcelSearchError(new Error('drift'), true)).toMatchObject({ unexpected: true, schemaDrift: true });
    expect(M.classifyParcelSearchError(null, false)).toEqual({ rateLimited: false, retryAfterSeconds: null, entitlement: false, unexpected: false, schemaDrift: false });
  });
  it('rebuilds the named situations from hook values: static, ambiguous, empty, rate_limited_zero, miss, redirect', () => {
    const recent = ['Queen & Spadina', '26 Hurlingham Cres', 'Bathurst St'];
    expect(M.buildSearchSituation({ ...base, recent })).toEqual(S.static);
    expect(M.buildSearchSituation({ ...base, input: 'Bathurst St', debounced: 'Bathurst St', data: lookup([...cands, { parcelId: '100116', address: '116 Bathurst St' }, { parcelId: '100118', address: '118 Bathurst St' }]), selectedParcelId: '100102', recent: ['Queen & Spadina'] })).toEqual(S.ambiguous);
    expect(M.buildSearchSituation({ ...base, input: '100 City Centre Dr, Mississauga', debounced: '100 City Centre Dr, Mississauga', recent })).toEqual(S.empty);
    expect(M.buildSearchSituation({ ...base, input: '26 Hurlingham Cres', debounced: '26 Hurlingham Cres', error: new RateLimitError(0) })).toEqual(S.rate_limited_zero);
    expect(M.buildSearchSituation({ ...base, input: 'zzzz qqqq', debounced: 'zzzz qqqq', data: lookup([]) })).toEqual(S.miss);
    expect(M.buildSearchSituation({ ...base, input: '26 Hurlingham Cres', debounced: '26 Hurlingham Cres', data: lookup([], { parcelId: '100026', matchType: 'exact' }), recent: ['Bathurst St'] })).toEqual(S.redirect);
  });
  it('truth table: error + data lists no candidates; the cap after the slice with the refine line at >= the cap; a settled miss keeps its line on a re-fetch (task-450 V4) and needs no error', () => {
    const many = lookup(cands.slice(0, 9));
    expect(M.buildSearchSituation({ ...base, debounced: 'Bathurst St', data: many, error: new Error('x') }).candidates).toEqual([]);
    expect(M.buildSearchSituation({ ...base, debounced: '100 Bathurst St', data: many }).overCap).toBe(false);
    expect(M.buildSearchSituation({ ...base, debounced: 'Bathurst St', data: lookup(cands) }).overCap).toBe(true);
    expect(M.buildSearchSituation({ ...base, debounced: 'zzzz qqqq', data: lookup([]), isFetching: true }).showMiss).toBe(true);
    expect(M.buildSearchSituation({ ...base, debounced: 'zzzz qqqq', data: lookup([]), error: new Error('x') }).showMiss).toBe(false);
    expect(M.buildSearchSituation({ ...base, debounced: '26', error: new Error('x') }).showPrompt).toBe(false);
    expect(M.buildSearchSituation({ ...base, debounced: 'Bathurst St', data: lookup(cands), selectedParcelId: 'gone' }).selectedParcelId).toBeNull();
  });
  it('task-450 AC2 (V4): a settled miss fetched again keeps the no-match line (no flicker)', () => {
    const settled = M.buildSearchSituation({ ...base, input: 'zzzz qqqq', debounced: 'zzzz qqqq', data: lookup([]), isFetching: false });
    const refetching = M.buildSearchSituation({ ...base, input: 'zzzz qqqq', debounced: 'zzzz qqqq', data: lookup([]), isFetching: true });
    expect(settled.showMiss).toBe(true);
    expect(refetching.showMiss).toBe(true);
  });
});

// ── task-450 SEARCHFIX.2 AC1 (fold section 2 line 42, finding 2a phone side; RR-0443 c MD:2284; ruled B, QUESTIONS-RULED.md Q8.1) ─────────────────────
// A street typed with no house number shows the refine line ("Add a house number to narrow it down.") and keeps the close-address list. Rows are the
// typed-address seat's real data (seat-reality-check-1.md); "Elm" with one row is synthetic until task-449 (today the server answers unique for it).
describe('a street with no house number', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const M = require('@/lib/parcelSearchMatch') as typeof import('@/lib/parcelSearchMatch');
  const base = { data: undefined, error: null as unknown, isFetching: false, schemaDrift: false, recent: [] as string[], selectedParcelId: null, cap: 10, minQueryLen: 3 };
  const rows = (...r: [string, string][]) => r.map(([parcelId, address]) => ({ parcelId, address }));
  const tc = (cands: { parcelId: string; address: string }[]) => withResolution('text_candidates', { candidates: cands });
  const at = (q: string, data: ConsumerParcelLookupResult | undefined) => M.buildSearchSituation({ ...base, input: q, debounced: q, data });
  const gerrard = rows(['5440777', '1 Gerrard St W'], ['10640216', '1000 Gerrard St E'], ['5402856', '1001 Gerrard St E']);

  it.each([
    ['Gerrard St', gerrard],
    ['Elm', rows(['5379936', '1 Elm Ave'])],
    ['Gerrard St W', rows(['5440777', '1 Gerrard St W'])],
    ['Gerrard St, Toronto', gerrard],
  ])('%s: the refine line shows and the rows are kept (ruled B)', (q, cands) => {
    const s = at(q, tc(cands));
    expect(s.outcome).toBe('text_candidates');
    expect(s.overCap).toBe(true);
    expect(s.candidates).toEqual(cands);
    expect(s.route).toBeNull();
  });

  it('known state: "Highway 27" holds a digit, so it counts as numbered and shows no refine line (as today)', () => {
    expect(at('Highway 27', tc(rows(['P1', '1 Highway 27']))).overCap).toBe(false);
  });

  it.each([
    ['383 El', rows(['5106944', '383 Elm Ave']), 3],
    ['679 Que', rows(['5476455', '679 Queen St W'], ['5497535', '679 Queen St E']), 2],
    ['123 Yongee St', rows(['5179889', '123 Yonge St'], ['5464983', '123 Yonge Blvd']), 2],
    ['Unit 4, 123 Yonge St', rows(['5464983', '123 Yonge St']), 1],
  ])('%s: a numbered query keeps the list and shows no refine line', (q, cands) => {
    const s = at(q, tc(cands));
    expect(s.overCap).toBe(false);
    expect(s.candidates).toEqual(cands);
  });

  it('other states: an intersection, a miss, outside Toronto and a short query show no refine line', () => {
    const inter = at('King and Bay', withResolution('no_match'));
    expect(inter.outcome).toBe('intersection');
    expect(inter.overCap).toBe(false);
    const miss = at('zzzz qqqq', withResolution('no_match'));
    expect(miss.showMiss).toBe(true);
    expect(miss.overCap).toBe(false);
    expect(at('123 Main St, Mississauga', undefined).outcome).toBe('outside_toronto');
    const short = at('12', undefined);
    expect(short.showPrompt).toBe(true);
    expect(short.overCap).toBe(false);
  });

  it('hasHouseNumber reads the text before the first comma', () => {
    expect(M.hasHouseNumber('Gerrard St')).toBe(false);
    expect(M.hasHouseNumber('Gerrard St, M4M 1A1')).toBe(false);
    expect(M.hasHouseNumber('383 El')).toBe(true);
    expect(M.hasHouseNumber('Unit 4, 123 Yonge St')).toBe(true);
  });
});

// MF-53 · T5 (Spec 100 §2.6 dated note 2026-11-11; PLAN panel regression MED-4/MED-6): the server's `resolution` wins; a server `no_match` still
// defers to the intersection shape; a server `text_candidates` now beats the intersection shape. Dated 2026-11-24 (task-450 SEARCHFIX.2, Q19;
// prior text kept): "a payload without it keeps the client derivation above (an older server)" is no longer true: the client derivation is deleted
// and a payload without `resolution` reads as the server's no_match (or the intersection shape). The server always sends it (lookup-flow.ts).
describe('deriveMatchType — the server resolution (MF-53)', () => {
  it.each(['unique', 'text_candidates', 'multi_parcel', 'unlinked'] as const)('server %s is the outcome', (r) => {
    const extra = r === 'unique' ? { match: { parcelId: 'P', matchType: 'exact' as const, address: '12 Main St' } } : {};
    expect(deriveMatchType('12 Main St', withResolution(r, extra))).toBe(r);
  });
  it('server no_match on an address is no_match, and on an intersection-shaped query is intersection', () => {
    expect(deriveMatchType('12 Main St', withResolution('no_match'))).toBe('no_match');
    expect(deriveMatchType('Queen and Spadina', withResolution('no_match'))).toBe('intersection');
  });
  it('server text_candidates beats the intersection shape (the new order, stated)', () => {
    expect(deriveMatchType('Queen and Spadina', withResolution('text_candidates', { candidates: [candidate('P', 'Queen St')] }))).toBe('text_candidates');
  });
  it('server unlinked is taken as sent even with zero candidates; without resolution a payload reads as no_match', () => {
    expect(deriveMatchType('12 Main St', withResolution('unlinked'))).toBe('unlinked');
    expect(deriveMatchType('12 Main St', response())).toBe('no_match');
  });
  it('a server unique without a match is not trusted (reads as no_match; OUTPUT panel RG-1)', () => {
    expect(deriveMatchType('12 Main St', withResolution('unique', { match: null }))).toBe('no_match');
  });
  it('task-450 Q19: a payload without resolution is no_match even with a match', () => {
    expect(deriveMatchType('26 Hurlingham Cres', response({ match: { parcelId: 'P', matchType: 'exact', address: '26 Hurlingham Cres' } }))).toBe('no_match');
    expect(deriveMatchType('10 Elm', response({ candidates: [candidate('P', '10 Elm St')] }))).toBe('no_match');
    expect(deriveMatchType('Queen & Spadina', response())).toBe('intersection');
  });
  it('RED (planted): a client that ignores resolution would guess no_match for a server unlinked', () => {
    const legacy = ({ resolution: _r, ...rest }: ConsumerParcelLookupResult) => rest as ConsumerParcelLookupResult;
    expect(deriveMatchType('12 Main St', legacy(withResolution('unlinked')))).toBe('no_match');
  });
});

// task-452 SEARCHFIX.4 (AC2, AC3; RR-0444 2b; RR-0455 item 2): which wall a refused lookup shows, from the error class and the entitlement read. The count and
// the date are the read's (RR-0310), never the 403's; a failed read keeps today's notice; reactivate only for an expired subscription; status null (no plan)
// keeps today's notice until task-357 adds its no_plan branch.
describe('searchWall', () => {
  const limitErr = () => new ReportLimitError(10, '2026-12-09T05:00:00.000Z');
  const subErr = () => new SubscriptionRequiredError();
  const read = (data: WallRead['data'], over: { isFetching?: boolean; isError?: boolean } = {}) => ({ data, isFetching: over.isFetching ?? false, isError: over.isError ?? false });
  const active = { status: 'active', reportsLimit: 10, resetsOnDisplay: '9 Dec 2026' };

  it('limit: wait while the read is pending (fetching, no data, not failed); limit once it answered a count and a date', () => {
    expect(searchWall(limitErr(), read(undefined, { isFetching: true }))).toBe('wait');
    expect(searchWall(limitErr(), read(active))).toBe('limit');
    expect(searchWall(limitErr(), read(active, { isFetching: true }))).toBe('limit');
  });
  it('limit: a failed read, a disabled read (no token: not fetching, no data) or an incomplete read keeps the notice (null)', () => {
    expect(searchWall(limitErr(), read(undefined, { isError: true }))).toBeNull();
    expect(searchWall(limitErr(), read(active, { isError: true }))).toBeNull();
    expect(searchWall(limitErr(), read(undefined))).toBeNull();
    expect(searchWall(limitErr(), read({ ...active, reportsLimit: null }))).toBeNull();
    expect(searchWall(limitErr(), read({ ...active, resetsOnDisplay: null }))).toBeNull();
  });
  it('subscription required: wait while pending; reactivate only for expired; null, active and a failed read keep the notice', () => {
    expect(searchWall(subErr(), read(undefined, { isFetching: true }))).toBe('wait');
    expect(searchWall(subErr(), read({ status: 'expired', reportsLimit: null, resetsOnDisplay: null }))).toBe('reactivate');
    // A lock until task-357 (no-plan page, RR-0455 item 2): its card says to flip this line to 'no_plan'.
    expect(searchWall(subErr(), read({ status: null, reportsLimit: null, resetsOnDisplay: null }))).toBeNull();
    expect(searchWall(subErr(), read(active))).toBeNull();
    expect(searchWall(subErr(), read(undefined, { isError: true }))).toBeNull();
  });
  it('anything else is no wall: a plain 403, a 500, a 429 and no error', () => {
    for (const e of [new ApiError(403, 'Forbidden'), new ApiError(500, 'boom'), new RateLimitError(30), null, undefined]) {
      expect(searchWall(e, read(active))).toBeNull();
      expect(searchWall(e, read(undefined, { isFetching: true }))).toBeNull();
    }
  });
});
