/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §6.6 + §8.1 + §9.8
//
// Idempotency guarantee for the two B2 hydrate functions (TanStack → Zustand
// bridges). Per §6.6, hydrate MUST use deep-equal-before-set so a second call
// with identical data does NOT notify subscribers. Without this, every cold
// boot + every refetch + every Strict Mode double-fire cascades through every
// subscriber that selects a field of the hydrated store — observed as the
// `[store:userProfile] notificationPrefs: SAME → SAME` log noise in the
// 2026-05-02 emulator session.
//
// These tests are §8.1 mandates: every B2 bridge MUST have an idempotency test.
// Adding a new bridge in `useUserProfile.hydrate` requires extending this file.

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn(() => null),
    set: jest.fn(),
    remove: jest.fn(),
  }),
}));

import { useFilterStore } from '@/store/filterStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import type { UserProfileType } from '@/lib/userProfile.schema';

// Minimal valid profile for hydrate input. Each field maps to a hydrated
// store key per Spec 99 §3.1.
const sampleProfile: UserProfileType = {
  user_id: 'cOHDPP04Lxhl1j6ULQju5IVkp3L2',
  trade_slug: 'structural-steel',
  display_name: 'Test User',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-02T00:00:00Z',
  full_name: 'Test User',
  phone_number: '+14165551234',
  company_name: 'Test Co',
  email: 'test@example.com',
  backup_email: null,
  default_tab: 'feed',
  location_mode: 'gps_live',
  home_base_lat: null,
  home_base_lng: null,
  radius_km: 10,
  supplier_selection: null,
  lead_views_count: 0,
  subscription_status: 'trial',
  trial_started_at: '2026-05-02T00:00:00Z',
  stripe_customer_id: null,
  onboarding_complete: true,
  tos_accepted_at: '2026-05-01T00:00:00Z',
  account_deleted_at: null,
  account_preset: 'tradesperson',
  trade_slugs_override: null,
  radius_cap_km: null,
  notification_prefs: {
    new_lead_min_cost_tier: 'medium',
    phase_changed: true,
    lifecycle_stalled: true,
    start_date_urgent: true,
    notification_schedule: 'morning',
  },
};

describe('filterStore.hydrate — Spec 99 §6.6 idempotency', () => {
  beforeEach(() => {
    useFilterStore.getState().reset();
  });

  it('first hydrate notifies once (init → profile state transition)', () => {
    const listener = jest.fn();
    const unsubscribe = useFilterStore.subscribe(listener);
    useFilterStore.getState().hydrate(sampleProfile);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('second hydrate with identical data does NOT notify (idempotent)', () => {
    // Prime the store with the first hydrate
    useFilterStore.getState().hydrate(sampleProfile);
    // Now subscribe and hydrate again with structurally-equal data
    const listener = jest.fn();
    const unsubscribe = useFilterStore.subscribe(listener);
    useFilterStore.getState().hydrate(sampleProfile);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('second hydrate with new homeBaseLocation object reference but same content does NOT notify', () => {
    const profileA: UserProfileType = {
      ...sampleProfile,
      home_base_lat: 43.6532,
      home_base_lng: -79.3832,
    };
    const profileB: UserProfileType = {
      ...sampleProfile,
      home_base_lat: 43.6532, // same content
      home_base_lng: -79.3832, // same content
    };
    useFilterStore.getState().hydrate(profileA);
    const listener = jest.fn();
    const unsubscribe = useFilterStore.subscribe(listener);
    useFilterStore.getState().hydrate(profileB);
    // homeBaseLocation is a NEW object reference but identical content —
    // deep-equal MUST bail out per Spec 99 §6.6.
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('hydrate with one changed field DOES notify', () => {
    useFilterStore.getState().hydrate(sampleProfile);
    const listener = jest.fn();
    const unsubscribe = useFilterStore.subscribe(listener);
    useFilterStore.getState().hydrate({ ...sampleProfile, radius_km: 25 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useFilterStore.getState().radiusKm).toBe(25);
    unsubscribe();
  });
});

describe('userProfileStore.hydrate — Spec 99 §6.6 idempotency', () => {
  beforeEach(() => {
    useUserProfileStore.getState().reset();
  });

  it('first hydrate notifies once', () => {
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    useUserProfileStore.getState().hydrate(sampleProfile);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('second hydrate with identical data does NOT notify (idempotent)', () => {
    useUserProfileStore.getState().hydrate(sampleProfile);
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    useUserProfileStore.getState().hydrate(sampleProfile);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('second hydrate with new notificationPrefs object reference but same content does NOT notify', () => {
    // The exact regression this test guards: prior to §9.8, every hydrate
    // recreated notificationPrefs as a new object → Zustand notify on every
    // refetch → cascade through subscribers. Now deep-equal MUST bail out.
    useUserProfileStore.getState().hydrate(sampleProfile);
    const profileWithFreshPrefs: UserProfileType = {
      ...sampleProfile,
      notification_prefs: { ...sampleProfile.notification_prefs! },
    };
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    useUserProfileStore.getState().hydrate(profileWithFreshPrefs);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('hydrate with notificationPrefs change DOES notify', () => {
    useUserProfileStore.getState().hydrate(sampleProfile);
    const profileWithChangedPrefs: UserProfileType = {
      ...sampleProfile,
      notification_prefs: {
        ...sampleProfile.notification_prefs!,
        notification_schedule: 'evening', // changed from 'morning'
      },
    };
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    useUserProfileStore.getState().hydrate(profileWithChangedPrefs);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useUserProfileStore.getState().notificationPrefs).toMatchObject({
      notification_schedule: 'evening',
    });
    unsubscribe();
  });
});
