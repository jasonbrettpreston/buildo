// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 ("Gate conditions MUST be stable signals": the redirect waits on isFetching being false and fires once)
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (the parcel-tool pages) and its dated note 2026-11-10 (the search debounce)
//            scripts/surfaces/_schema/bindings.json (mount_internal lists "@/hooks/")
//
// STD.HOOKS (task-381): the three shared hooks that replaced the code copied into the parcel-tool mounts. The REAL hooks run here (only expo-router
// is mocked).
import { act, renderHook } from '@testing-library/react-native';

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

import { useDebouncedValue, useGoBack, useSettledRedirect } from '@/hooks/useParcelPageHooks';
import { PARCEL_TAB_ROUTE } from '@/lib/parcelSearchMatch';

beforeEach(() => {
  jest.useFakeTimers();
  mockRouter.replace.mockClear();
  mockRouter.back.mockClear();
  mockRouter.canGoBack.mockReset();
  mockRouter.canGoBack.mockReturnValue(true);
});
afterEach(() => { jest.useRealTimers(); });

describe('useSettledRedirect', () => {
  it('replaces once on settled data and a background refetch cannot fire it again', () => {
    const { rerender } = renderHook((p: { target: string | null; isFetching: boolean }) => useSettledRedirect(p.target, p.isFetching), {
      initialProps: { target: '/x', isFetching: false },
    });
    expect(mockRouter.replace.mock.calls).toEqual([['/x']]);
    rerender({ target: '/x', isFetching: true });
    rerender({ target: '/x', isFetching: false });
    rerender({ target: '/y', isFetching: true });
    rerender({ target: '/y', isFetching: false });
    expect(mockRouter.replace.mock.calls).toEqual([['/x']]);
  });

  it('does not fire while fetching or with no target, then fires once when the data settles', () => {
    const { rerender } = renderHook((p: { target: string | null; isFetching: boolean }) => useSettledRedirect(p.target, p.isFetching), {
      initialProps: { target: '/x' as string | null, isFetching: true },
    });
    rerender({ target: null, isFetching: false });
    expect(mockRouter.replace).not.toHaveBeenCalled();
    rerender({ target: '/x', isFetching: false });
    expect(mockRouter.replace.mock.calls).toEqual([['/x']]);
  });

  it('markRedirected stops a later redirect (the semi page marks it before its own replace)', () => {
    const { result, rerender } = renderHook((p: { target: string | null; isFetching: boolean }) => useSettledRedirect(p.target, p.isFetching), {
      initialProps: { target: null as string | null, isFetching: false },
    });
    act(() => { result.current(); });
    rerender({ target: '/x', isFetching: false });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('useGoBack', () => {
  it('goes back when there is history', () => {
    const { result } = renderHook(() => useGoBack());
    result.current();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('replaces with the Lookup route on a cold open (nothing to go back to)', () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const { result } = renderHook(() => useGoBack());
    result.current();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace.mock.calls).toEqual([[PARCEL_TAB_ROUTE.lookup]]);
  });
});

describe('useDebouncedValue', () => {
  it('holds the old value until the delay passes, restarts on a new value, and starts from the first value', () => {
    const { result, rerender } = renderHook((p: { v: string }) => useDebouncedValue(p.v, 400), { initialProps: { v: '' } });
    expect(result.current).toBe('');
    rerender({ v: 'ab' });
    act(() => { jest.advanceTimersByTime(399); });
    expect(result.current).toBe('');
    rerender({ v: 'abc' });
    act(() => { jest.advanceTimersByTime(399); });
    expect(result.current).toBe('');
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current).toBe('abc');
  });
});
