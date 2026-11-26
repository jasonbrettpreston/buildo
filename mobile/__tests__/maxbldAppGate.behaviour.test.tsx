// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 (stable gate), §7.3 (route_decision, DEV only),
//            docs/specs/00-architecture/116_multi_product_architecture.md §3 (dated note 2026-11-26), docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4.
//
// task-313 McApp card 1, the front door (PLAN-313-v1 M4, M5, T5; RR-0499 "1a": the MaxBLD bar the only bar). Renders the (app) layout AppLayout with
// expo-router and useParcelEntitlement mocked: the five-tab bar is never drawn; with no answer yet the Opening shows its state; Try again refetches;
// the (app) root redirects to the Lookup; a parcel-tool route (nested ones included) draws the route (<Slot/>, where the parcel-tool Stack draws its
// one shelf). The lead layout's own modules are mocked to empty parts so the test proves only which branch is drawn.
require('react-native-css-interop/test');
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
let mockSegments: string[] = ['(app)', 'parcel-tool'];
const mockTabs = jest.fn();
const mockRedirect = jest.fn();
jest.mock('expo-router', () => {
  const R = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Tabs = (p: unknown) => { mockTabs(p); return R.createElement(View, { testID: 'lead-tabs' }); };
  Tabs.Screen = () => null;
  return {
    Tabs,
    Slot: () => R.createElement(View, { testID: 'slot' }),
    Redirect: (p: { href: string }) => { mockRedirect(p.href); return R.createElement(View, { testID: 'redirect' }); },
    useSegments: () => mockSegments,
    useRouter: () => ({ replace: jest.fn(), push: jest.fn(), navigate: jest.fn() }),
  };
});
type Ent = { data?: unknown; status: 'pending' | 'error' | 'success'; fetchStatus: 'fetching' | 'paused' | 'idle'; refetch: jest.Mock };
let mockEnt: Ent = { data: undefined, status: 'pending', fetchStatus: 'fetching', refetch: jest.fn() };
jest.mock('@/hooks/useParcelLookup', () => ({ REPORT_GIVE_UP_MS: 60_000, useParcelEntitlement: () => mockEnt }));
jest.mock('@/store/authStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { uid: 'u-1', email: null, displayName: null }, _hasHydrated: true, signOut: jest.fn() }),
}));
const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));
// The lead layout's modules: empty parts (LeadAppLayout is never mounted in this build; the test pins that).
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: 'View' }, useAnimatedStyle: () => ({}), useSharedValue: () => ({ value: 0 }), withTiming: (v: unknown) => v, useDerivedValue: () => ({ value: 0 }), Easing: { out: () => undefined, cubic: undefined }, runOnJS: (f: unknown) => f }));
jest.mock('@react-navigation/bottom-tabs', () => ({ BottomTabBar: () => null }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: unknown }) => children }));
jest.mock('@/store/notificationStore', () => ({ useNotificationStore: () => 0 }));
jest.mock('@/store/paywallStore', () => ({ usePaywallStore: () => false }));
jest.mock('@/components/onboarding/IncompleteBanner', () => ({ IncompleteBanner: () => null }));
jest.mock('@/store/tabBarStore', () => ({ tabBarVisible: { value: 1 } }));
jest.mock('@/lib/haptics', () => ({ lightImpact: jest.fn() }));
jest.mock('@/hooks/useUserProfile', () => ({ useUserProfile: () => ({ data: undefined, isLoading: true, isFetching: false }) }));
jest.mock('@/components/paywall/SubscriptionLoadingGuard', () => ({ SubscriptionLoadingGuard: () => null }));
jest.mock('@/components/paywall/PaywallScreen', () => ({ PaywallScreen: () => null }));
jest.mock('@/lib/debug/stateDebug', () => ({ trackRender: jest.fn(), useDepsTracker: jest.fn() }));
jest.mock('@/lib/queryTelemetry', () => ({ logQueryInvalidate: jest.fn() }));

const AppLayout = require('../app/(app)/_layout').default as React.ComponentType;

beforeEach(() => {
  mockSegments = ['(app)', 'parcel-tool'];
  mockTabs.mockClear(); mockRedirect.mockClear(); mockTrack.mockClear();
  mockEnt = { data: undefined, status: 'pending', fetchStatus: 'fetching', refetch: jest.fn(async () => undefined) };
});

const ANSWER = { status: 'active', reportsUsed: 0, reportsLimit: 10, reportsLeft: 10, reportsLimitReached: false, resetsOn: null, resetsOnDisplay: null };

describe('the MaxBLD front door (AppLayout in the MaxBLD build)', () => {
  it('pending: the Opening with the wordmark, the tagline and Connecting…; no Tabs', () => {
    render(<AppLayout />);
    expect(screen.getByText('MaxBLD')).toBeTruthy();
    expect(screen.getByText('Lot Intelligence')).toBeTruthy();
    expect(screen.getByText('Connecting…')).toBeTruthy();
    expect(mockTabs).not.toHaveBeenCalled();
    expect(screen.queryByTestId('slot')).toBeNull();
  });
  it('paused with no data: "Can\'t reach MaxBLD"; Try again calls refetch', () => {
    mockEnt = { ...mockEnt, fetchStatus: 'paused' };
    render(<AppLayout />);
    expect(screen.getByText("Can't reach MaxBLD")).toBeTruthy();
    fireEvent.press(screen.getByTestId('parcel-opening-retry_offline'));
    expect(mockEnt.refetch).toHaveBeenCalledTimes(1);
  });
  it('error with no data: "Something went wrong"; Try again calls refetch', () => {
    mockEnt = { ...mockEnt, status: 'error', fetchStatus: 'idle' };
    render(<AppLayout />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByText("Can't reach MaxBLD")).toBeNull();
    fireEvent.press(screen.getByTestId('parcel-opening-retry_error'));
    expect(mockEnt.refetch).toHaveBeenCalledTimes(1);
  });
  it('still pending at REPORT_GIVE_UP_MS: the error state; Try again restarts the clock (Connecting… again)', () => {
    jest.useFakeTimers();
    try {
      render(<AppLayout />);
      expect(screen.getByText('Connecting…')).toBeTruthy();
      act(() => { jest.advanceTimersByTime(60_000); });
      expect(screen.getByText('Something went wrong')).toBeTruthy();
      fireEvent.press(screen.getByTestId('parcel-opening-retry_error'));
      expect(screen.getByText('Connecting…')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
  it("segments ['(app)'] with an answer: Redirect to the Lookup, and route_decision in a DEV build", () => {
    mockSegments = ['(app)'];
    mockEnt = { ...mockEnt, data: ANSWER, status: 'success', fetchStatus: 'idle' };
    render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(app)/parcel-tool');
    expect(mockTrack).toHaveBeenCalledWith('route_decision', expect.objectContaining({ authority: 'MaxbldAppGate', branch: 'redirect', to: '/(app)/parcel-tool' }));
    expect(mockTabs).not.toHaveBeenCalled();
  });
  it("['(app)','parcel-tool'] with an answer: the route (Slot); the Tabs mock is never rendered, so the parcel-tool shelf is the only bar", () => {
    mockEnt = { ...mockEnt, data: ANSWER, status: 'success', fetchStatus: 'idle' };
    render(<AppLayout />);
    expect(screen.getByTestId('slot')).toBeTruthy();
    expect(screen.queryByTestId('lead-tabs')).toBeNull();
    expect(mockTabs).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
  it("['(app)','parcel-tool','[parcelId]'] with an answer: Slot, not Redirect", () => {
    mockSegments = ['(app)', 'parcel-tool', '[parcelId]'];
    mockEnt = { ...mockEnt, data: ANSWER, status: 'success', fetchStatus: 'idle' };
    render(<AppLayout />);
    expect(screen.getByTestId('slot')).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
  it('a failed refetch after an answer keeps the route drawn (Spec 99 §6.5)', () => {
    mockEnt = { ...mockEnt, data: ANSWER, status: 'error', fetchStatus: 'idle' };
    render(<AppLayout />);
    expect(screen.getByTestId('slot')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
