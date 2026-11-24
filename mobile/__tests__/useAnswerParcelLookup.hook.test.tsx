// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §4 B1 (99:219 every server fetch through TanStack Query);
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-13, SEMI-B)
//
// FIX.SEMI (task-373): the grounder's one gap. useParcelLookup.test.ts pins buildAnswerParcelLookupOptions() as a value; this case renders the REAL hook under a REAL
// QueryClient and reads the options the mutation cache holds for the run, so replacing `useMutation(buildAnswerParcelLookupOptions())` with `useMutation({ mutationFn })`
// (dropping retry 0 or networkMode 'always') turns it red.
import * as React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/apiClient', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('@/store/authStore', () => ({
  useAuthStore: Object.assign(jest.fn(() => 'tok-1'), { getState: () => ({ accessToken: 'tok-1' }), setState: jest.fn() }),
}));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

import { fetchWithAuth } from '@/lib/apiClient';
import { RateLimitError } from '@/lib/errors';
import { answeredParcelLookup, useAnswerParcelLookup, useParcelSearch } from '@/hooks/useParcelLookup';

const mockFetch = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;

describe('useAnswerParcelLookup under a real QueryClient', () => {
  it('the mutation the cache runs carries retry 0, networkMode always and answeredParcelLookup as its function', async () => {
    mockFetch.mockResolvedValue({ data: { match: null, candidates: [], warnings: [], parcel: null, page: null } });
    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useAnswerParcelLookup(), { wrapper });
    await act(async () => { await result.current.mutateAsync('PIN-777'); });
    const runs = client.getMutationCache().getAll();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.options.retry).toBe(0);
    expect(runs[0]!.options.networkMode).toBe('always');
    expect(runs[0]!.options.mutationFn).toBe(answeredParcelLookup);
    expect(mockFetch.mock.calls).toEqual([['/api/parcels/lookup?parcelId=PIN-777&semi=answered']]);
  });
});

// task-457 AC2 (RR-0456 Q5, MORNING-DECISIONS.md:2362 "retry once auto at zero"): the REAL search hook under a REAL QueryClient; a zero-second rate limit
// is retried once (TanStack's first retry delay, 1000 ms), and only once; any other wait is not retried.
describe('task-457 useParcelSearch under a real QueryClient', () => {
  const empty = { data: { match: null, candidates: [], warnings: [], parcel: null, page: null } };
  const mount = () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return renderHook(() => useParcelSearch('26 Hurlingham Cres'), { wrapper });
  };
  beforeEach(() => { mockFetch.mockReset(); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('a zero-second rate limit is retried once; the retry succeeds and no error shows while it waits', async () => {
    mockFetch.mockRejectedValueOnce(new RateLimitError(0)).mockResolvedValueOnce(empty);
    const { result } = mount();
    await act(async () => { await jest.advanceTimersByTimeAsync(10); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.isFetching).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(empty.data);
  });
  it('a zero-second rate limit refused again ends in the rate-limit error after exactly two fetches', async () => {
    mockFetch.mockRejectedValue(new RateLimitError(0));
    const { result } = mount();
    await act(async () => { await jest.advanceTimersByTimeAsync(60000); });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeInstanceOf(RateLimitError);
    expect((result.current.error as RateLimitError).retryAfterSeconds).toBe(0);
  });
  it('a rate limit with a wait above zero is not retried', async () => {
    mockFetch.mockRejectedValue(new RateLimitError(7));
    const { result } = mount();
    await act(async () => { await jest.advanceTimersByTimeAsync(60000); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeInstanceOf(RateLimitError);
  });
});
