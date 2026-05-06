/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3.1
//             docs/specs/03-mobile/99_mobile_state_architecture.md §B1 + §B4
//
// Unit tests for `useLeadDetail` — canonical Spec 99 §B1 detail hook for the
// `[lead].tsx` screen. Tests exercise the exported pure helpers
// (`fetchLeadDetail`, `shouldRetryLeadDetail`) without spinning up a React
// renderer, mirroring the `useFlightJobDetail.test.ts` pattern.
//
// Includes a deploy-skew protection test (#3) — if Phase 1 (backend) and
// Phase 2 (mobile schema) ship out of sync and a server response omits
// `is_saved`, the hook MUST throw `LeadDetailSchemaError`, not silently
// return data with `is_saved: undefined` (added by Multi-Agent plan review).

jest.mock('@/lib/apiClient', () => ({
  fetchWithAuth: jest.fn(),
}));

jest.mock('@/store/authStore', () => ({
  useAuthStore: Object.assign(jest.fn(() => 'tok-1'), {
    getState: () => ({ idToken: 'tok-1' }),
    setState: jest.fn(),
  }),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

import { fetchWithAuth } from '@/lib/apiClient';
import { ApiError, AccountDeletedError, RateLimitError } from '@/lib/errors';
import * as Sentry from '@sentry/react-native';
import {
  fetchLeadDetail,
  shouldRetryLeadDetail,
  LeadDetailSchemaError,
} from '@/hooks/useLeadDetail';

const mockFetch = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;
const mockSentryCapture = Sentry.captureException as jest.MockedFunction<
  typeof Sentry.captureException
>;

const validDetail = {
  lead_id: '24-101234--01',
  lead_type: 'permit' as const,
  permit_num: '24-101234',
  revision_num: '01',
  address: '123 Main St',
  location: { lat: 43.65, lng: -79.38 },
  work_description: 'Two-storey rear addition',
  applicant: null,
  lifecycle_phase: 'P8',
  lifecycle_stalled: false,
  target_window: 'bid' as const,
  opportunity_score: 78,
  competition_count: 4,
  predicted_start: '2026-06-01',
  p25_days: 28,
  p75_days: 65,
  cost: {
    estimated: 450000,
    tier: 'large',
    range_low: 380000,
    range_high: 520000,
    modeled_gfa_sqm: 142.5,
  },
  neighbourhood: {
    name: 'Annex',
    avg_household_income: 145000,
    median_household_income: 120000,
    period_of_construction: '1981-1990',
  },
  updated_at: '2026-04-29T10:00:00.000Z',
  is_saved: false,
};

describe('fetchLeadDetail — Spec 91 §4.3.1', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSentryCapture.mockReset();
  });

  it('parses a well-formed LeadDetail response', async () => {
    mockFetch.mockResolvedValueOnce({ data: validDetail });
    const result = await fetchLeadDetail('24-101234--01');
    expect(result).toMatchObject({
      lead_id: '24-101234--01',
      lead_type: 'permit',
      address: '123 Main St',
      is_saved: false,
      cost: { estimated: 450000, tier: 'large' },
      neighbourhood: { name: 'Annex' },
    });
  });

  it('percent-encodes id segments containing reserved characters', async () => {
    // Permit IDs are typically `permit_num--revision_num` (hyphens only,
    // unreserved per RFC 3986 — pass through unchanged). CoA IDs use the
    // `COA-${application_number}` shape and may contain reserved chars.
    // Use a forward-slash fixture to actually exercise encodeURIComponent.
    mockFetch.mockResolvedValueOnce({ data: validDetail });
    await fetchLeadDetail('COA-2024/AB-001');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/leads/detail/COA-2024%2FAB-001',
    );
  });

  it('throws LeadDetailSchemaError when response is missing is_saved (deploy-skew protection)', async () => {
    // Phase 1 backend without Phase 2 mobile schema would silently strip via
    // Zod default .strip(). Phase 2 schema declares is_saved required, so a
    // backend that doesn't send it (e.g., rolled-back deploy) MUST surface
    // as a parse error — not silently propagate undefined into the UI layer.
    const { is_saved: _omit, ...withoutIsSaved } = validDetail;
    mockFetch.mockResolvedValueOnce({ data: withoutIsSaved });
    await expect(fetchLeadDetail('24-101234--01')).rejects.toBeInstanceOf(
      LeadDetailSchemaError,
    );
    expect(mockSentryCapture).toHaveBeenCalledTimes(1);
  });

  it('throws LeadDetailSchemaError on Zod parse failure (and reports to Sentry)', async () => {
    mockFetch.mockResolvedValueOnce({
      data: { ...validDetail, opportunity_score: 'high' /* wrong type */ },
    });
    await expect(fetchLeadDetail('24-101234--01')).rejects.toBeInstanceOf(
      LeadDetailSchemaError,
    );
    expect(mockSentryCapture).toHaveBeenCalledTimes(1);
    expect(mockSentryCapture.mock.calls[0]?.[1]).toMatchObject({
      extra: { context: 'useLeadDetail Zod parse', id: '24-101234--01' },
    });
  });

  it('propagates ApiError from fetchWithAuth without wrapping', async () => {
    const apiErr = new ApiError(404, 'not found');
    mockFetch.mockRejectedValueOnce(apiErr);
    await expect(fetchLeadDetail('00-000000--00')).rejects.toBe(apiErr);
    expect(mockSentryCapture).not.toHaveBeenCalled();
  });
});

describe('shouldRetryLeadDetail — retry guard', () => {
  it('skips retry on ApiError(400) — malformed id', () => {
    expect(shouldRetryLeadDetail(0, new ApiError(400, 'bad id'))).toBe(false);
  });

  it('skips retry on ApiError(404) — no permit row or CoA placeholder', () => {
    expect(shouldRetryLeadDetail(0, new ApiError(404, 'not found'))).toBe(false);
  });

  it('skips retry on AccountDeletedError', () => {
    expect(
      shouldRetryLeadDetail(0, new AccountDeletedError('2026-05-01', 30)),
    ).toBe(false);
  });

  it('skips retry on RateLimitError — burning retries compounds the throttle', () => {
    expect(shouldRetryLeadDetail(0, new RateLimitError(60))).toBe(false);
    expect(shouldRetryLeadDetail(2, new RateLimitError(30))).toBe(false);
  });

  it('skips retry on LeadDetailSchemaError', () => {
    expect(
      shouldRetryLeadDetail(0, new LeadDetailSchemaError('drift')),
    ).toBe(false);
  });

  it('retries network errors up to 3 attempts', () => {
    const netErr = new Error('network');
    expect(shouldRetryLeadDetail(0, netErr)).toBe(true);
    expect(shouldRetryLeadDetail(2, netErr)).toBe(true);
    expect(shouldRetryLeadDetail(3, netErr)).toBe(false);
  });

  it('retries unexpected ApiError statuses (e.g. 500) up to 3 attempts', () => {
    const apiErr = new ApiError(500, 'server error');
    expect(shouldRetryLeadDetail(0, apiErr)).toBe(true);
    expect(shouldRetryLeadDetail(3, apiErr)).toBe(false);
  });
});
