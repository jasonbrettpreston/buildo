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
    getState: () => ({ idToken: 'tok-1' }),
    setState: jest.fn(),
  }),
}));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

import { fetchWithAuth } from '@/lib/apiClient';
import { ApiError, AccountDeletedError, RateLimitError } from '@/lib/errors';
import { ConsumerParcelLookupResultSchema } from '@/lib/schemas';
import {
  fetchParcelLookup,
  shouldRetryParcelLookup,
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
