/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 5
// Tests filterStore hydrate(), reset(), and new fields added in Spec 95.

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    remove: jest.fn(),
  }),
}));

jest.mock('zustand/middleware', () => {
  const actual = jest.requireActual('zustand/middleware');
  return {
    ...actual,
    persist: (fn: Parameters<typeof actual.persist>[0]) => fn,
    createJSONStorage: jest.fn(),
  };
});

import type { UserProfileType } from '@/lib/userProfile.schema';

const BASE_PROFILE: UserProfileType = {
  user_id: 'uid-abc',
  trade_slug: 'plumbing',
  display_name: 'Alice',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  full_name: null,
  phone_number: null,
  company_name: null,
  email: null,
  backup_email: null,
  default_tab: 'feed',
  location_mode: 'home_base_fixed',
  home_base_lat: 43.6532,
  home_base_lng: -79.3832,
  radius_km: 15,
  supplier_selection: 'Ferguson',
  lead_views_count: 0,
  subscription_status: 'trial',
  trial_started_at: null,
  onboarding_complete: true,
  tos_accepted_at: '2026-01-01T00:00:00Z',
  account_deleted_at: null,
  account_preset: null,
  // Spec 99 §9.14 — flat notification fields (post-flatten).
  new_lead_min_cost_tier: 'medium',
  phase_changed: true,
  lifecycle_stalled_pref: true,
  start_date_urgent: true,
  notification_schedule: 'anytime',
};

describe('filterStore', () => {
  let store: ReturnType<typeof import('@/store/filterStore').useFilterStore.getState>;

  beforeEach(() => {
    jest.resetModules();
    const { useFilterStore } = require('@/store/filterStore') as typeof import('@/store/filterStore');
    store = useFilterStore.getState();
    store.reset();
  });

  it('initializes with default values', () => {
    expect(store.tradeSlug).toBe('');
    expect(store.radiusKm).toBe(10);
    expect(store.locationMode).toBeNull();
    expect(store.homeBaseLocation).toBeNull();
    expect(store.defaultTab).toBeNull();
    expect(store.supplierSelection).toBeNull();
  });

  it('hydrate() overwrites all feed-scoped fields from profile', () => {
    store.hydrate(BASE_PROFILE);
    const s = require('@/store/filterStore').useFilterStore.getState() as typeof store;
    expect(s.tradeSlug).toBe('plumbing');
    expect(s.radiusKm).toBe(15);
    expect(s.locationMode).toBe('home_base_fixed');
    expect(s.homeBaseLocation).toEqual({ lat: 43.6532, lng: -79.3832 });
    expect(s.defaultTab).toBe('feed');
    expect(s.supplierSelection).toBe('Ferguson');
  });

  it('hydrate() sets homeBaseLocation to null when coords are null', () => {
    store.hydrate({ ...BASE_PROFILE, home_base_lat: null, home_base_lng: null });
    const s = require('@/store/filterStore').useFilterStore.getState() as typeof store;
    expect(s.homeBaseLocation).toBeNull();
  });

  it('hydrate() falls back radiusKm to 10 when profile has null', () => {
    store.hydrate({ ...BASE_PROFILE, radius_km: null });
    const s = require('@/store/filterStore').useFilterStore.getState() as typeof store;
    expect(s.radiusKm).toBe(10);
  });

  it('reset() returns all values to defaults including new Spec 95 fields', () => {
    store.hydrate(BASE_PROFILE);
    store.reset();
    const s = require('@/store/filterStore').useFilterStore.getState() as typeof store;
    expect(s.tradeSlug).toBe('');
    expect(s.radiusKm).toBe(10);
    expect(s.locationMode).toBeNull();
    expect(s.homeBaseLocation).toBeNull();
    expect(s.defaultTab).toBeNull();
    expect(s.supplierSelection).toBeNull();
  });

  it('setDefaultTab updates defaultTab independently', () => {
    store.setDefaultTab('flight_board');
    const s = require('@/store/filterStore').useFilterStore.getState() as typeof store;
    expect(s.defaultTab).toBe('flight_board');
  });

  it('setSupplierSelection updates supplierSelection independently', () => {
    store.setSupplierSelection('Wolseley');
    const s = require('@/store/filterStore').useFilterStore.getState() as typeof store;
    expect(s.supplierSelection).toBe('Wolseley');
  });
});
