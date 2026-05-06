/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3.1
//             docs/specs/03-mobile/99_mobile_state_architecture.md §B1 + §B4
//
// Unit tests for `useFlightJobDetail` — the cold-boot fallback hook for
// /(app)/[flight-job] when push deep-link opens the screen with an empty
// useFlightBoard cache. Tests exercise the exported pure helpers
// (`fetchFlightJobDetail`, `shouldRetryFlightJobDetail`) without spinning up
// a React renderer.

// Mocks BEFORE imports (jest hoists these). Mock the heavy modules that the
// hook transitively imports so jest-node can load it.
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
import { ApiError, AccountDeletedError } from '@/lib/errors';
import * as Sentry from '@sentry/react-native';
import {
  fetchFlightJobDetail,
  shouldRetryFlightJobDetail,
  FlightJobDetailSchemaError,
} from '@/hooks/useFlightJobDetail';

const mockFetch = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;
const mockSentryCapture = Sentry.captureException as jest.MockedFunction<
  typeof Sentry.captureException
>;

const validDetail = {
  permit_num: '23-145678',
  revision_num: '01',
  address: '100 Bay St',
  lifecycle_phase: 'P10',
  lifecycle_stalled: false,
  predicted_start: '2026-06-15',
  p25_days: -7,
  p75_days: 14,
  temporal_group: 'departing_soon' as const,
  updated_at: '2026-05-01T12:00:00Z',
};

describe('fetchFlightJobDetail — Spec 77 §3.3.1', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSentryCapture.mockReset();
  });

  it('parses a well-formed FlightBoardDetail response', async () => {
    mockFetch.mockResolvedValueOnce({ data: validDetail });
    const result = await fetchFlightJobDetail('23-145678--01');
    expect(result).toMatchObject({
      permit_num: '23-145678',
      address: '100 Bay St',
      updated_at: '2026-05-01T12:00:00Z',
      temporal_group: 'departing_soon',
    });
  });

  it('encodes the id segment when calling fetchWithAuth', async () => {
    mockFetch.mockResolvedValueOnce({ data: validDetail });
    await fetchFlightJobDetail('23-145678--01');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/leads/flight-board/detail/23-145678--01',
    );
  });

  it('throws FlightJobDetailSchemaError on Zod parse failure (and reports to Sentry)', async () => {
    mockFetch.mockResolvedValueOnce({
      data: { ...validDetail, predicted_start: 12345 /* wrong type */ },
    });
    await expect(fetchFlightJobDetail('23-145678--01')).rejects.toBeInstanceOf(
      FlightJobDetailSchemaError,
    );
    expect(mockSentryCapture).toHaveBeenCalledTimes(1);
    expect(mockSentryCapture.mock.calls[0]?.[1]).toMatchObject({
      extra: { context: 'useFlightJobDetail Zod parse', id: '23-145678--01' },
    });
  });

  it('propagates ApiError from fetchWithAuth without wrapping', async () => {
    const apiErr = new ApiError(404, 'not found');
    mockFetch.mockRejectedValueOnce(apiErr);
    await expect(fetchFlightJobDetail('23-000000--01')).rejects.toBe(apiErr);
    // Schema-error path not hit → no Sentry call.
    expect(mockSentryCapture).not.toHaveBeenCalled();
  });
});

describe('shouldRetryFlightJobDetail — retry guard', () => {
  it('skips retry on ApiError(400) — malformed id', () => {
    expect(shouldRetryFlightJobDetail(0, new ApiError(400, 'bad id'))).toBe(false);
  });

  it('skips retry on ApiError(404) — permit not on user board', () => {
    expect(shouldRetryFlightJobDetail(0, new ApiError(404, 'not found'))).toBe(false);
  });

  it('skips retry on AccountDeletedError', () => {
    expect(
      shouldRetryFlightJobDetail(0, new AccountDeletedError('2026-05-01', 30)),
    ).toBe(false);
  });

  it('skips retry on FlightJobDetailSchemaError', () => {
    expect(
      shouldRetryFlightJobDetail(0, new FlightJobDetailSchemaError('drift')),
    ).toBe(false);
  });

  it('retries network errors up to 3 attempts', () => {
    const netErr = new Error('network');
    expect(shouldRetryFlightJobDetail(0, netErr)).toBe(true);
    expect(shouldRetryFlightJobDetail(2, netErr)).toBe(true);
    expect(shouldRetryFlightJobDetail(3, netErr)).toBe(false);
  });

  it('retries unexpected ApiError statuses (e.g. 500) up to 3 attempts', () => {
    const apiErr = new ApiError(500, 'server error');
    expect(shouldRetryFlightJobDetail(0, apiErr)).toBe(true);
    expect(shouldRetryFlightJobDetail(3, apiErr)).toBe(false);
  });
});
