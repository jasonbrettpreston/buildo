/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Testing Gates
//
// Unit tests for:
//  - snapToGrid: grid alignment, post-snap re-validation
//  - isInsideToronto: bounds checking
//  - onboardingStore: step advancement, path selection, reset, persist migrate
//    (Spec 99 §9.2c removed markComplete + isComplete; §9.3 removed
//    selectedTrade/Name + locationMode/homeBaseLat/Lng + supplierSelection
//    duplicates — they live in filterStore which is B2-hydrated from server.)

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

  it('setPath stores the selected onboarding path', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setPath('leads');
    expect(useOnboardingStore.getState().selectedPath).toBe('leads');
  });

  it('reset returns all fields to initial state (currentStep + selectedPath only)', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    useOnboardingStore.getState().setStep('terms');
    useOnboardingStore.getState().setPath('leads');
    useOnboardingStore.getState().reset();
    const s = useOnboardingStore.getState();
    expect(s.currentStep).toBeNull();
    expect(s.selectedPath).toBeNull();
    // Spec 99 §9.2c + §9.3 — these fields are GONE; should be undefined on
    // the state shape (filterStore holds canonical values now).
    const sx = s as Record<string, unknown>;
    expect(sx.isComplete).toBeUndefined();
    expect(sx.selectedTrade).toBeUndefined();
    expect(sx.selectedTradeName).toBeUndefined();
    expect(sx.locationMode).toBeUndefined();
    expect(sx.homeBaseLat).toBeUndefined();
    expect(sx.homeBaseLng).toBeUndefined();
    expect(sx.supplierSelection).toBeUndefined();
  });

  it('persist migrate (current version is 2)', () => {
    const { useOnboardingStore } = require('@/store/onboardingStore');
    const persistApi = useOnboardingStore.persist;
    const options = persistApi?.getOptions?.();
    expect(options?.version).toBe(2);
  });

  it('persist migrate v0 → v2: strips isComplete + 6 §9.3 mirror fields', () => {
    // A v0 user (pre-§9.2c, pre-§9.3) has all 7 legacy fields in MMKV.
    // The whitelist migrate must keep only currentStep + selectedPath.
    const { useOnboardingStore } = require('@/store/onboardingStore');
    const options = useOnboardingStore.persist?.getOptions?.();
    const v0State = {
      currentStep: 'terms',
      selectedTrade: 'plumbing',
      selectedTradeName: 'Plumbing',
      selectedPath: 'leads',
      locationMode: 'home_base_fixed',
      homeBaseLat: 43.6532,
      homeBaseLng: -79.3832,
      supplierSelection: 'Acme Supply',
      isComplete: true,
    };
    const migrated = options?.migrate?.(v0State, 0) as Record<string, unknown>;
    expect(migrated.currentStep).toBe('terms');
    expect(migrated.selectedPath).toBe('leads');
    // All 7 legacy mirror keys MUST be stripped (Gemini WF2-C #4 — homeBaseLat/Lng
    // were missing from the explicit assertions; added here).
    expect(migrated.isComplete).toBeUndefined();
    expect(migrated.selectedTrade).toBeUndefined();
    expect(migrated.selectedTradeName).toBeUndefined();
    expect(migrated.locationMode).toBeUndefined();
    expect(migrated.homeBaseLat).toBeUndefined();
    expect(migrated.homeBaseLng).toBeUndefined();
    expect(migrated.supplierSelection).toBeUndefined();
  });

  it('persist migrate v2 → v2: self-healing strip of unexpected legacy keys', () => {
    // DeepSeek WF2-C #4: the migrate is applied UNCONDITIONALLY so a future
    // regression that writes a removed field to a v2 MMKV blob (dev tool,
    // debugger, hand-edit) gets self-healed on next boot. Test asserts the
    // unconditional whitelist strips an unexpected legacy key from a v2 input.
    const { useOnboardingStore } = require('@/store/onboardingStore');
    const options = useOnboardingStore.persist?.getOptions?.();
    const v2DirtyState = {
      currentStep: 'profession',
      selectedPath: null,
      // Should NOT be here on a v2 store, but a buggy refactor could write it:
      selectedTrade: 'rogue-leak',
      isComplete: true,
    };
    const migrated = options?.migrate?.(v2DirtyState, 2) as Record<string, unknown>;
    expect(migrated.currentStep).toBe('profession');
    expect(migrated.selectedPath).toBeNull();
    expect(migrated.selectedTrade).toBeUndefined();
    expect(migrated.isComplete).toBeUndefined();
  });

  it('persist migrate v1 → v2: strips the 6 §9.3 mirror fields', () => {
    // A v1 user (post-§9.2c, pre-§9.3) has the 6 §9.3 fields only.
    const { useOnboardingStore } = require('@/store/onboardingStore');
    const options = useOnboardingStore.persist?.getOptions?.();
    const v1State = {
      currentStep: 'supplier',
      selectedTrade: 'hvac',
      selectedTradeName: 'HVAC',
      selectedPath: 'tracking',
      locationMode: 'gps_live',
      homeBaseLat: null,
      homeBaseLng: null,
      supplierSelection: null,
    };
    const migrated = options?.migrate?.(v1State, 1) as Record<string, unknown>;
    expect(migrated.currentStep).toBe('supplier');
    expect(migrated.selectedPath).toBe('tracking');
    expect(migrated.selectedTrade).toBeUndefined();
    expect(migrated.selectedTradeName).toBeUndefined();
    expect(migrated.locationMode).toBeUndefined();
    expect(migrated.supplierSelection).toBeUndefined();
  });

  // Spec 99 §9.3: setTrade / setLocation / setSupplier removed. The values
  // they used to write are now canonical in filterStore (B2-hydrated from
  // server); idempotency tests live in storeIdempotency.test.ts.
});

// ---------------------------------------------------------------------------
// getTradeLabel — Spec 99 §9.3 trade-name lookup helper
// (replaces the removed onboardingStore.selectedTradeName mirror)
// ---------------------------------------------------------------------------

describe('getTradeLabel', () => {
  it('returns the canonical label for a known trade slug', () => {
    const { getTradeLabel } = require('@/lib/onboarding/tradeData');
    expect(getTradeLabel('framing')).toBe('Framing');
    expect(getTradeLabel('structural-steel')).toBe('Structural Steel');
    expect(getTradeLabel('hvac')).toBe('HVAC');
  });

  it('returns "Real Estate Agent" for the realtor slug', () => {
    // Realtor is the special non-trade entry in the catalog (per Spec 94 §3.1).
    // Verifies the realtor branch in profession.tsx + complete.tsx renders
    // a human-readable label, not "realtor".
    const { getTradeLabel } = require('@/lib/onboarding/tradeData');
    expect(getTradeLabel('realtor')).toBe('Real Estate Agent');
  });

  it('returns null for empty/null/undefined input (caller falls back)', () => {
    const { getTradeLabel } = require('@/lib/onboarding/tradeData');
    expect(getTradeLabel('')).toBeNull();
    expect(getTradeLabel(null)).toBeNull();
    expect(getTradeLabel(undefined)).toBeNull();
  });

  it('returns null for unknown slug (catalog drift) — caller fallback handles UX', () => {
    // Per WF2-C consensus (Gemini #3 + DeepSeek #2 + code-reviewer MED c):
    // unknown slugs return null (NOT the slug literal) so the caller's
    // `?? 'Tradesperson'` chain produces a human-readable label even when
    // the static catalog drifts from the server's canonical trade list.
    const { getTradeLabel } = require('@/lib/onboarding/tradeData');
    expect(getTradeLabel('not-in-catalog')).toBeNull();
    expect(getTradeLabel('future-trade-slug')).toBeNull();
  });
});
