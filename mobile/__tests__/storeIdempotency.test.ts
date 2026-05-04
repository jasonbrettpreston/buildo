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
  // Spec 99 §9.14 — flat notification fields (post-117 flatten).
  new_lead_min_cost_tier: 'medium',
  phase_changed: true,
  lifecycle_stalled_pref: true,
  start_date_urgent: true,
  notification_schedule: 'morning',
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

  // Spec 99 §9.14: was "second hydrate with new notificationPrefs object
  // reference but same content does NOT notify" (the deep-equal hot path).
  // Post-flatten the test is replaced with per-field idempotency cases —
  // each of the 5 atomic fields independently bails out on equal value
  // via `Object.is` (Zustand's own equality check). The null-transition
  // tests are gone because flat primitive defaults can never be null.
  it('hydrate with all 5 notification fields equal does NOT notify (post-§9.14 flatten)', () => {
    useUserProfileStore.getState().hydrate(sampleProfile);
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    // Same primitive values → per-field equality gate bails out.
    useUserProfileStore.getState().hydrate({ ...sampleProfile });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('hydrate with notification_schedule changed DOES notify', () => {
    useUserProfileStore.getState().hydrate(sampleProfile);
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    useUserProfileStore.getState().hydrate({
      ...sampleProfile,
      notification_schedule: 'evening', // changed from 'morning'
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useUserProfileStore.getState().notificationSchedule).toBe('evening');
    unsubscribe();
  });

  it('hydrate with phase_changed flipped DOES notify', () => {
    useUserProfileStore.getState().hydrate(sampleProfile);
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    useUserProfileStore.getState().hydrate({
      ...sampleProfile,
      phase_changed: false, // flipped
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useUserProfileStore.getState().phaseChanged).toBe(false);
    unsubscribe();
  });

  it('hydrate with lifecycle_stalled_pref flipped DOES notify', () => {
    useUserProfileStore.getState().hydrate(sampleProfile);
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    useUserProfileStore.getState().hydrate({
      ...sampleProfile,
      lifecycle_stalled_pref: false,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useUserProfileStore.getState().lifecycleStalled).toBe(false);
    unsubscribe();
  });

  it('hydrate with new_lead_min_cost_tier changed DOES notify', () => {
    useUserProfileStore.getState().hydrate(sampleProfile);
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    useUserProfileStore.getState().hydrate({
      ...sampleProfile,
      new_lead_min_cost_tier: 'high', // changed from 'medium'
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useUserProfileStore.getState().newLeadMinCostTier).toBe('high');
    unsubscribe();
  });

  it('hydrate with start_date_urgent flipped DOES notify (post-§9.14 review #4)', () => {
    // Adversarial review (Gemini + DeepSeek + code-reviewer §9.14 Phase D)
    // flagged that 4 of the 5 notification fields had an explicit
    // change-DOES-notify case but `start_date_urgent` did not. Adding the
    // 5th case for parity.
    useUserProfileStore.getState().hydrate(sampleProfile);
    const listener = jest.fn();
    const unsubscribe = useUserProfileStore.subscribe(listener);
    useUserProfileStore.getState().hydrate({
      ...sampleProfile,
      start_date_urgent: false,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useUserProfileStore.getState().startDateUrgent).toBe(false);
    unsubscribe();
  });

  // Per-field coverage for the 4 string identity fields. Adversarial review
  // (Gemini WF2 §9.14 #4 + code-reviewer HIGH-1) flagged the test suite as
  // covering only 4 of the 9 hydrated fields. Closing the gap — null-to-null
  // bail-out is the original incident-#3 regression class (refetch firing
  // notify on identical content), and a regression in the per-field strict-
  // equality gate of any of these 4 would bring it back.
  describe.each([
    ['fullName',     'full_name',     'Alice',     'Alice Updated'],
    ['companyName',  'company_name',  'Co Inc.',   'Co Updated Inc.'],
    ['phoneNumber',  'phone_number',  '+15551234', '+15559999'],
    ['backupEmail',  'backup_email',  'a@b.com',   'b@c.com'],
  ] as const)('identity field %s', (storeKey, profileKey, oldVal, newVal) => {
    it('hydrate with same value does NOT notify', () => {
      useUserProfileStore.getState().hydrate({ ...sampleProfile, [profileKey]: oldVal });
      const listener = jest.fn();
      const unsubscribe = useUserProfileStore.subscribe(listener);
      useUserProfileStore.getState().hydrate({ ...sampleProfile, [profileKey]: oldVal });
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('hydrate with null → null does NOT notify (cold-boot idempotency)', () => {
      useUserProfileStore.getState().hydrate({ ...sampleProfile, [profileKey]: null });
      const listener = jest.fn();
      const unsubscribe = useUserProfileStore.subscribe(listener);
      useUserProfileStore.getState().hydrate({ ...sampleProfile, [profileKey]: null });
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('hydrate with changed value DOES notify', () => {
      useUserProfileStore.getState().hydrate({ ...sampleProfile, [profileKey]: oldVal });
      const listener = jest.fn();
      const unsubscribe = useUserProfileStore.subscribe(listener);
      useUserProfileStore.getState().hydrate({ ...sampleProfile, [profileKey]: newVal });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(useUserProfileStore.getState()[storeKey]).toBe(newVal);
      unsubscribe();
    });
  });
});
