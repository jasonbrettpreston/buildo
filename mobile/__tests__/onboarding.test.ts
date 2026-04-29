/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Testing Gates
//
// Unit tests for:
//  - snapToGrid: grid alignment, post-snap re-validation
//  - isInsideToronto: bounds checking
//  - onboardingStore: step advancement, markComplete, reset, setTrade

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn(() => null),
    set: jest.fn(),
    remove: jest.fn(),
  }),
}));

// Reset module registry so each test group gets a fresh store.
beforeEach(() => {
  jest.resetModules();
});

// ---------------------------------------------------------------------------
// snapToGrid + isInsideToronto
// ---------------------------------------------------------------------------

describe('snapToGrid', () => {
  it('snaps downtown Toronto coord and result is still inside Toronto', () => {
    const { snapToGrid, isInsideToronto } = require('@/lib/onboarding/snapCoord');
    const { lat, lng } = snapToGrid(43.6532, -79.3832);
    expect(isInsideToronto(lat, lng)).toBe(true);
  });

  it('snapped coordinates are multiples of the grid increment', () => {
    const { snapToGrid } = require('@/lib/onboarding/snapCoord');
    const gridMeters = 500;
    const degPerMeter = 1 / 111_320;
    const snap = gridMeters * degPerMeter;
    const { lat, lng } = snapToGrid(43.6532, -79.3832);
    // Allow floating-point tolerance of 1e-9
    expect(Math.abs((lat / snap) - Math.round(lat / snap))).toBeLessThan(1e-9);
    expect(Math.abs((lng / snap) - Math.round(lng / snap))).toBeLessThan(1e-9);
  });

  it('post-snap re-validation: coord near boundary does not snap outside bounds', () => {
    const { snapToGrid, isInsideToronto } = require('@/lib/onboarding/snapCoord');
    // Toronto latMin is 43.58 — use a point very close to the edge
    const edgeLat = 43.5802;
    const edgeLng = -79.3;
    const { lat, lng } = snapToGrid(edgeLat, edgeLng);
    // Result must be inside Toronto (either snapped or the pre-snap fallback)
    expect(isInsideToronto(lat, lng)).toBe(true);
  });
});

describe('isInsideToronto', () => {
  it('returns true for downtown Toronto', () => {
    const { isInsideToronto } = require('@/lib/onboarding/snapCoord');
    expect(isInsideToronto(43.6532, -79.3832)).toBe(true);
  });

  it('returns false for Hamilton area (outside bounds)', () => {
    const { isInsideToronto } = require('@/lib/onboarding/snapCoord');
    expect(isInsideToronto(43.2, -79.3)).toBe(false);
  });

  it('returns false just above latMax (43.8601 > 43.86)', () => {
    const { isInsideToronto } = require('@/lib/onboarding/snapCoord');
    expect(isInsideToronto(43.8601, -79.3)).toBe(false);
  });

  it('returns true for the exact boundary corner (latMin, lngMin)', () => {
    const { isInsideToronto } = require('@/lib/onboarding/snapCoord');
    expect(isInsideToronto(43.58, -79.64)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// onboardingStore
// ---------------------------------------------------------------------------

describe('onboardingStore', () => {
  it('setStep stores the correct step', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setStep('supplier');
    expect(useOnboardingStore.getState().currentStep).toBe('supplier');
  });

  it('markComplete sets isComplete=true and currentStep=null', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setStep('terms');
    useOnboardingStore.getState().markComplete();
    expect(useOnboardingStore.getState().isComplete).toBe(true);
    expect(useOnboardingStore.getState().currentStep).toBeNull();
  });

  it('reset returns all fields to initial state', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    useOnboardingStore.getState().setTrade('plumbing', 'Plumbing');
    useOnboardingStore.getState().setPath('leads');
    useOnboardingStore.getState().markComplete();
    useOnboardingStore.getState().reset();
    const s = useOnboardingStore.getState();
    expect(s.selectedTrade).toBeNull();
    expect(s.selectedTradeName).toBeNull();
    expect(s.selectedPath).toBeNull();
    expect(s.locationMode).toBeNull();
    expect(s.isComplete).toBe(false);
    expect(s.currentStep).toBeNull();
  });

  it('setTrade stores both slug and display name', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setTrade('plumbing', 'Plumbing');
    expect(useOnboardingStore.getState().selectedTrade).toBe('plumbing');
    expect(useOnboardingStore.getState().selectedTradeName).toBe('Plumbing');
  });

  it('single-select: selecting trade A then trade B leaves only B selected', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setTrade('plumbing', 'Plumbing');
    useOnboardingStore.getState().setTrade('hvac', 'HVAC');
    expect(useOnboardingStore.getState().selectedTrade).toBe('hvac');
  });

  it('setLocation stores mode and coords correctly', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setLocation({
      mode: 'home_base_fixed',
      lat: 43.6532,
      lng: -79.3832,
    });
    const s = useOnboardingStore.getState();
    expect(s.locationMode).toBe('home_base_fixed');
    expect(s.homeBaseLat).toBeCloseTo(43.6532);
    expect(s.homeBaseLng).toBeCloseTo(-79.3832);
  });
});
