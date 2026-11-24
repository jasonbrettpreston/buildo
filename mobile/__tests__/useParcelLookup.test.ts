/** @jest-environment node */
// Jest tests — useParcelLookup / useParcelSearch (Spec 100 §4 + §6).
// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §6
//
// Exercises the exported pure helpers (fetchParcelLookup, shouldRetryParcelLookup) without a
// React renderer (the useLeadDetail precedent). Includes the CROSS-CONTRACT LOCK: a server-emitted
// parcelId taken from a SEARCH response is piped into the LOOKUP path — both validated against the
// same ConsumerParcelLookupResultSchema (the Spec 91 seam class).

jest.mock('@/lib/apiClient', () => ({
  fetchWithAuth: jest.fn(),
}));
jest.mock('@/store/authStore', () => ({
  useAuthStore: Object.assign(jest.fn(() => 'tok-1'), {
    getState: () => ({ accessToken: 'tok-1' }),
    setState: jest.fn(),
  }),
}));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

import { fetchWithAuth } from '@/lib/apiClient';
import { ApiError, AccountDeletedError, RateLimitError } from '@/lib/errors';
import { ConsumerParcelLookupResultSchema } from '@/lib/schemas';
import { SEMI_CONTINUE_WAIT_MS } from '@/lib/semiQuestion';
import {
  answeredParcelLookup,
  buildAnswerParcelLookupOptions,
  fetchParcelLookup,
  parcelLookupParams,
  shouldRetryParcelLookup,
  shouldRetryParcelSearch,
  ParcelLookupSchemaError,
} from '@/hooks/useParcelLookup';

const mockFetch = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;

// A server-shaped whitelist payload (mirrors src/app/api/parcels/lookup/types.ts).
const parcelPayload = {
  costMenu: {
    menu: {
      _schema_version: 3,
      kitchen: { total: 1000, per_sqm: 100, area: 10, area_confidence: 'high', norm_basis: 'n/a', trades: null, products: null },
      garden_suite: { total: 5000, per_sqm: 100, area: 50, area_confidence: 'high', norm_basis: 'n/a', trades: null, products: null, fits: false },
    },
    scalars: { cost_fb_total: 900000, cost_kitchen_per_sqm: 100 },
  },
  areas: { lot_size_sqm: 400, opt_aor_gfa_sqm: null, max_buildable_gfa_sqm: 500, max_build_fsi: 1.25 },
  neighbourhood: {
    summary: { headline: 'Mostly detached', basis: 'comp' },
    compStats: { compCount: 12, compDominantBuild: 'detached', compBuildRatioP50: 0.8, compFsiP50: 0.85, neighbourhoodId: 42, neighbourhoodCostPremium: 1.1 },
    coaProjects: [{
      applicationNumber: 'A123', address: '10 Elm', status: 'Deferred', decision: null,
      decisionDate: null, hearingDate: '2026-05-01', description: 'Rear addition', projectType: 'Addition',
      modeledGfaSqm: 150, estimatedCost: 300000,
    }],
    comparableBuilds: [{
      address: '5 Elm', lot_sqm: 410, frontage_m: 12, distance_m: 60, work_type: 'new_build',
      permit_gfa_sqm: 380, permit_fsi: 0.95, storeys: 2, coa_decision: 'Approved', build_ratio: 0.9, structure_family: 'detached',
    }],
  },
};

const hitResponse = {
  match: { parcelId: 'PIN-777', matchType: 'exact', address: '26 Hurlingham Cres' },
  candidates: [],
  warnings: [],
  parcel: parcelPayload,
};

const searchCandidatesResponse = {
  match: null,
  candidates: [
    { parcelId: 'PIN-777', address: '26 Hurlingham Cres' },
    { parcelId: 'PIN-778', address: '26 Hurlingham Cres (rear)' },
  ],
  warnings: [],
  parcel: null,
};

describe('fetchParcelLookup — Zod boundary', () => {
  beforeEach(() => mockFetch.mockReset());

  it('parses a well-formed hit response and unwraps raw.data', async () => {
    mockFetch.mockResolvedValueOnce({ data: hitResponse });
    const res = await fetchParcelLookup({ parcelId: 'PIN-777' });
    expect(res.match?.parcelId).toBe('PIN-777');
    expect(res.parcel?.neighbourhood.comparableBuilds?.[0]?.permit_fsi).toBe(0.95);
  });

  it('a miss (200 + match:null, parcel:null) is a valid parsed result, not an error', async () => {
    mockFetch.mockResolvedValueOnce({ data: { match: null, candidates: [], warnings: [], parcel: null } });
    const res = await fetchParcelLookup({ q: 'nowhere ave' });
    expect(res.match).toBeNull();
    expect(res.parcel).toBeNull();
  });

  it('throws ParcelLookupSchemaError on a drifted server shape', async () => {
    mockFetch.mockResolvedValueOnce({ data: { match: 'not-an-object' } });
    await expect(fetchParcelLookup({ parcelId: 'X' })).rejects.toBeInstanceOf(ParcelLookupSchemaError);
  });

  it('builds the q vs parcelId query string correctly', async () => {
    mockFetch.mockResolvedValue({ data: hitResponse });
    await fetchParcelLookup({ q: '26 Hurlingham' });
    expect(mockFetch).toHaveBeenLastCalledWith('/api/parcels/lookup?q=26%20Hurlingham');
    await fetchParcelLookup({ parcelId: 'PIN-777' });
    expect(mockFetch).toHaveBeenLastCalledWith('/api/parcels/lookup?parcelId=PIN-777');
  });

  it('SRCH.SEMI (task-319): the optional semi flag is appended to the parcelId form only', async () => {
    mockFetch.mockResolvedValue({ data: hitResponse });
    await fetchParcelLookup({ parcelId: 'PIN-777', semi: 'answered' });
    expect(mockFetch).toHaveBeenLastCalledWith('/api/parcels/lookup?parcelId=PIN-777&semi=answered');
  });

  // SRCH.METER-2 (task-360, RR-0278; SE-1, SE-2): the report screen's own query forwards the route param, so an answered lot refetches WITH the flag (the server
  // holds an unsure lot's page without it). Only the exact sentinel counts as answered; a stray param, an empty one or none sends nothing (a stray param asks, never skips).
  it('parcelLookupParams sends semi=answered only when the route param is exactly "answered"', () => {
    expect(parcelLookupParams('PIN-777', 'answered')).toEqual({ parcelId: 'PIN-777', semi: 'answered' });
    for (const stray of [undefined, '', 'Answered', 'yes', 'answered ', 'true']) {
      expect(parcelLookupParams('PIN-777', stray)).toEqual({ parcelId: 'PIN-777' });
    }
  });
});

// MF-48 Stage B · T-B4 (Spec 100 §3.2 dated note 2026-11-12): the boundary takes the report page view the server built (MF-57 pageViewOf), page null
// and no page key (an older server); a malformed page is schema drift (ParcelLookupSchemaError, never retried), so the binding never sees it.
describe('MF-48 Stage B the page key at the Zod boundary', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsx = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const px = require('node:path') as typeof import('node:path');
  const VIEW = JSON.parse(fsx.readFileSync(px.join(__dirname, '..', '..', 'src/tests/fixtures/report-page/props/page_v21.mobile.json'), 'utf8')).view;
  it('a page view, page null and no page key all parse; the view keeps its sections and parts', async () => {
    mockFetch.mockResolvedValueOnce({ data: { ...hitResponse, page: VIEW } });
    const r = await fetchParcelLookup({ parcelId: 'X' });
    expect(r.page?.sections.map((s) => s.id)).toEqual(VIEW.sections.map((s: { id: string }) => s.id));
    expect(r.page?.sections[0]?.parts[0]).toEqual({ role: VIEW.sections[0].parts[0].role, brief: VIEW.sections[0].parts[0].brief, kind: VIEW.sections[0].parts[0].kind, text: VIEW.sections[0].parts[0].text });
    mockFetch.mockResolvedValueOnce({ data: { ...hitResponse, page: null } });
    expect((await fetchParcelLookup({ parcelId: 'X' })).page).toBeNull();
    mockFetch.mockResolvedValueOnce({ data: hitResponse });
    expect((await fetchParcelLookup({ parcelId: 'X' })).page).toBeUndefined();
  });
  it('RED (planted): a part without text, an unknown part kind and sections that are not a list are schema drift', async () => {
    const bad = [
      { ...VIEW, sections: [{ ...VIEW.sections[0], parts: [{ role: 'title', brief: 'A1', kind: 'value' }] }] },
      { ...VIEW, sections: [{ ...VIEW.sections[0], parts: [{ ...VIEW.sections[0].parts[0], kind: 'raw' }] }] },
      { ...VIEW, sections: {} },
    ];
    for (const page of bad) {
      mockFetch.mockResolvedValueOnce({ data: { ...hitResponse, page } });
      await expect(fetchParcelLookup({ parcelId: 'X' })).rejects.toBeInstanceOf(ParcelLookupSchemaError);
    }
  });
});

describe('CROSS-CONTRACT LOCK — search-emitted parcelId pipes into lookup (Spec 91 seam)', () => {
  beforeEach(() => mockFetch.mockReset());

  it('a parcelId from the SEARCH response resolves through the LOOKUP path, same schema', async () => {
    // 1. Server SEARCH response validates against the shared schema.
    mockFetch.mockResolvedValueOnce({ data: searchCandidatesResponse });
    const search = await fetchParcelLookup({ q: '26 Hurlingham' });
    expect(ConsumerParcelLookupResultSchema.safeParse(searchCandidatesResponse).success).toBe(true);
    const emittedId = search.candidates[0]!.parcelId; // the exact id the UI clicks through with

    // 2. That server-emitted id drives the LOOKUP path — no id transformation between the two.
    mockFetch.mockResolvedValueOnce({ data: { ...hitResponse, match: { ...hitResponse.match, parcelId: emittedId } } });
    const detail = await fetchParcelLookup({ parcelId: emittedId });
    expect(mockFetch).toHaveBeenLastCalledWith(`/api/parcels/lookup?parcelId=${encodeURIComponent(emittedId)}`);
    expect(detail.match?.parcelId).toBe(emittedId);
    expect(detail.parcel).not.toBeNull();
  });
});

describe('shouldRetryParcelLookup — deterministic states are not retried', () => {
  it('no retry on 400 / 403 / rate-limit / deleted / schema-drift', () => {
    expect(shouldRetryParcelLookup(0, new ApiError(400, 'bad'))).toBe(false);
    expect(shouldRetryParcelLookup(0, new ApiError(403, 'no sub'))).toBe(false);
    expect(shouldRetryParcelLookup(0, new RateLimitError(30))).toBe(false);
    expect(shouldRetryParcelLookup(0, new AccountDeletedError('2026-01-01', 30))).toBe(false);
    expect(shouldRetryParcelLookup(0, new ParcelLookupSchemaError('drift'))).toBe(false);
  });
  it('retries a transient error up to 3 attempts', () => {
    expect(shouldRetryParcelLookup(0, new ApiError(500, 'boom'))).toBe(true);
    expect(shouldRetryParcelLookup(2, new ApiError(500, 'boom'))).toBe(true);
    expect(shouldRetryParcelLookup(3, new ApiError(500, 'boom'))).toBe(false);
  });
});

// task-457 AC2 (RR-0456 Q5, MORNING-DECISIONS.md:2362 "retry once auto at zero"): the search retries a zero-second rate limit once, on the first failure only.
describe('task-457 AC2: shouldRetryParcelSearch', () => {
  it('retries a zero-second rate limit once and only once; every other error follows shouldRetryParcelLookup', () => {
    expect(shouldRetryParcelSearch(0, new RateLimitError(0))).toBe(true);
    expect(shouldRetryParcelSearch(1, new RateLimitError(0))).toBe(false);
    expect(shouldRetryParcelSearch(0, new RateLimitError(30))).toBe(false);
    expect(shouldRetryParcelSearch(0, new ApiError(500, 'boom'))).toBe(true);
    expect(shouldRetryParcelSearch(3, new ApiError(500, 'boom'))).toBe(false);
  });
  it('the lookup and the entitlement read keep no retry on a zero-second rate limit', () => {
    expect(shouldRetryParcelLookup(0, new RateLimitError(0))).toBe(false);
  });
});

// FIX.SEMI (task-373, grounder D5; Spec 99 section 4 B1 99:219 "Every server fetch MUST go through TanStack Query"): the semi page's Continue lookup is the
// mutation of useAnswerParcelLookup. The two pins below keep what task-361 built: a failed or offline lookup ends in the error state at once (networkMode
// 'always': TanStack's default would pause a mutation offline, so the bounded wait would never start and the page would stay busy), and no retry re-sends it.
describe('FIX.SEMI answeredParcelLookup and the options of useAnswerParcelLookup', () => {
  beforeEach(() => mockFetch.mockReset());

  it('sends the answered lookup (semi=answered) and returns the parsed result', async () => {
    mockFetch.mockResolvedValueOnce({ data: hitResponse });
    const out = await answeredParcelLookup('PIN-777');
    expect(mockFetch.mock.calls).toEqual([['/api/parcels/lookup?parcelId=PIN-777&semi=answered']]);
    expect(out).toEqual(ConsumerParcelLookupResultSchema.parse(hitResponse));
  });

  it('a lookup that never settles rejects once the bounded wait (SEMI_CONTINUE_WAIT_MS) has run, not before', async () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockReturnValueOnce(new Promise(() => undefined));
      let outcome = 'pending';
      void answeredParcelLookup('PIN-777').then(() => { outcome = 'resolved'; }, (e: Error) => { outcome = e.name; });
      await jest.advanceTimersByTimeAsync(SEMI_CONTINUE_WAIT_MS - 1);
      expect(outcome).toBe('pending');
      await jest.advanceTimersByTimeAsync(1);
      expect(outcome).toBe('SemiContinueTimeoutError');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a failed lookup rejects with the failure itself (the page shows its built error state)', async () => {
    mockFetch.mockRejectedValueOnce(new ApiError(500, 'boom'));
    await expect(answeredParcelLookup('PIN-777')).rejects.toBeInstanceOf(ApiError);
  });

  it('a drifted answer is schema drift, never stored', async () => {
    mockFetch.mockResolvedValueOnce({ data: { not: 'a lookup' } });
    await expect(answeredParcelLookup('PIN-777')).rejects.toBeInstanceOf(ParcelLookupSchemaError);
  });

  it('the mutation options: this function, no retry, runs offline (networkMode always)', () => {
    const o = buildAnswerParcelLookupOptions();
    expect(o.mutationFn).toBe(answeredParcelLookup);
    expect(o.retry).toBe(0);
    expect(o.networkMode).toBe('always');
  });
});
