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
  type ParcelMatchType,
} from '@/lib/parcelSearchMatch';
import { shouldHideAppTabBar } from '@/lib/appShell';
import {
  SEARCH_CANDIDATE_LIMIT,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_QUERY_LEN,
} from '@/constants/parcelSearch';
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

/** Force a match type the current `matchType` enum cannot express — the future contract's value. */
function withDeclaredType(type: ParcelMatchType): ConsumerParcelLookupResult {
  return response({
    // Deliberate cast: `ParcelMatchSchema.matchType` is the narrow 'exact'|'typeahead'|'direct'
    // enum today. This is the shape the widened contract will send.
    match: { parcelId: 'PIN-1', matchType: type, address: '1 Test St' },
  } as unknown as Partial<ConsumerParcelLookupResult>);
}

describe('the SEARCH archetype parameters match the descriptor', () => {
  it('debounce_ms, min_query_len and the candidate cap are the declared values', () => {
    // These three are `config.debounce_ms`, `config.min_query_len` and the contract cap in
    // scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json.
    expect(SEARCH_DEBOUNCE_MS).toBe(400);
    expect(SEARCH_MIN_QUERY_LEN).toBe(3);
    expect(SEARCH_CANDIDATE_LIMIT).toBe(10);
  });

  it('the client minimum never rises above the server minimum', () => {
    // src/app/api/parcels/lookup/types.ts — `q: z.string().trim().min(3)`. A client gate ABOVE the
    // server's floor would silently make valid queries unreachable.
    const SERVER_MIN = 3;
    expect(SEARCH_MIN_QUERY_LEN).toBeLessThanOrEqual(SERVER_MIN);
  });
});

describe('deriveMatchType — all five ruled types', () => {
  it('unique: a resolved match navigates straight to the lot', () => {
    const data = response({ match: { parcelId: 'PIN-777', matchType: 'exact', address: '26 Hurlingham Cres' } });
    expect(deriveMatchType('26 Hurlingham Cres', data)).toBe('unique');
    expect(parcelSearchRoute('unique', { parcelId: 'PIN-777', query: '26 Hurlingham Cres' })).toBe(
      '/(app)/parcel-tool/PIN-777',
    );
  });

  it('unique: a typeahead single hit is the same type — the branch is not on matchType flavour', () => {
    const data = response({ match: { parcelId: 'PIN-8', matchType: 'typeahead', address: '8 Elm St' } });
    expect(deriveMatchType('8 Elm', data)).toBe('unique');
  });

  it('text_candidates: several text matches render a list, not a map', () => {
    const data = response({
      candidates: [candidate('PIN-1', '10 Elm St'), candidate('PIN-2', '10 Elm Ave')],
    });
    expect(deriveMatchType('10 Elm', data)).toBe('text_candidates');
    // A list renders in place — it must NOT navigate.
    expect(parcelSearchRoute('text_candidates', { query: '10 Elm' })).toBeNull();
  });

  it('multi_parcel: the contract-declared type wins and routes to the map', () => {
    // Not derivable from today's payload — one address point linked to 2+ parcels is
    // indistinguishable from N separate text matches. Driven by the server value.
    const data = withDeclaredType('multi_parcel');
    expect(deriveMatchType('1 Test St', data)).toBe('multi_parcel');
    expect(parcelSearchRoute('multi_parcel', { query: '1 Test St' })).toBe(
      '/(app)/parcel-tool/disambiguate?q=1%20Test%20St&kind=multi_parcel',
    );
  });

  it('unlinked: the contract-declared type wins and routes to the map', () => {
    const data = withDeclaredType('unlinked');
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
      deriveMatchType('26 Hurlingham Cres', response({ match: { parcelId: 'P', matchType: 'exact', address: 'a' } })),
      deriveMatchType('10 Elm', response({ candidates: [candidate('P', '10 Elm St')] })),
      deriveMatchType('x', withDeclaredType('multi_parcel')),
      deriveMatchType('x', withDeclaredType('unlinked')),
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
    const data = response({ match: { parcelId: 'P', matchType: 'exact', address: 'x' } });
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
