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
import { answeredParcelLookup, useAnswerParcelLookup } from '@/hooks/useParcelLookup';

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
