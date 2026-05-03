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

  // Spec 99 §9.2c: markComplete + isComplete REMOVED. Server
  // profile.onboarding_complete is now the sole source of truth.
  // Terminal-step behavior (atomic isComplete=true + currentStep=null)
  // is replaced by: PATCH onboarding_complete=true server-side; AuthGate
  // refetch reads server truth; routes to (app)/. No local mirror.
  // currentStep stays at its last value (e.g., 'terms') after completion;
  // it's only used by getResumePath when onboarding_complete=false.

  it('reset returns all fields to initial state', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    useOnboardingStore.getState().setTrade('plumbing', 'Plumbing');
    useOnboardingStore.getState().setPath('leads');
    useOnboardingStore.getState().setStep('terms');
    useOnboardingStore.getState().reset();
    const s = useOnboardingStore.getState();
    expect(s.selectedTrade).toBeNull();
    expect(s.selectedTradeName).toBeNull();
    expect(s.selectedPath).toBeNull();
    expect(s.locationMode).toBeNull();
    expect(s.currentStep).toBeNull();
    // isComplete no longer exists on the state shape (Spec 99 §3.5)
    expect((s as Record<string, unknown>).isComplete).toBeUndefined();
  });

  it('persist migrate strips legacy isComplete key from v0 state', () => {
    // Spec 99 §9.2c: existing users have `isComplete: true|false` persisted
    // in MMKV. The migrate function (version 0→1) drops it on rehydrate.
    const { useOnboardingStore } = require('@/store/onboardingStore');
    // Simulate a v0 persisted state by reading the migrate function.
    // The actual test of migrate runs inside Zustand's persist middleware
    // on next hydrate; we assert the function is configured correctly via
    // the persist options shape (introspection is per Zustand v5 API).
    const persistApi = useOnboardingStore.persist;
    const options = persistApi?.getOptions?.();
    expect(options?.version).toBe(1);
    // Run the migrate function directly on a synthetic v0 state shape:
    const v0State = {
      currentStep: 'terms',
      selectedTrade: 'plumbing',
      selectedTradeName: 'Plumbing',
      selectedPath: 'leads',
      locationMode: null,
      homeBaseLat: null,
      homeBaseLng: null,
      supplierSelection: null,
      isComplete: true, // legacy field
    };
    const migrated = options?.migrate?.(v0State, 0);
    expect(migrated).toBeDefined();
    expect((migrated as Record<string, unknown>).isComplete).toBeUndefined();
    expect((migrated as Record<string, unknown>).currentStep).toBe('terms');
    expect((migrated as Record<string, unknown>).selectedTrade).toBe('plumbing');
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
