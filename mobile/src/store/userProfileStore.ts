// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 6
//             docs/specs/03-mobile/99_mobile_state_architecture.md §9.14 (flatten)
// Account-level fields only — changes here must NOT trigger lead feed re-renders.
// Feed-scoped fields (tradeSlug, radiusKm, locationMode, defaultTab, supplierSelection)
// live in filterStore. This store owns display-only / notification fields.
//
// Spec 99 §9.14 (2026-05-04 flatten): the `notificationPrefs` JSONB blob was
// replaced with 5 atomic primitive fields (3 booleans + 2 enums). Eliminates
// the `fast-deep-equal` hot path that the §6.6 deep-equal mandate was written
// to mitigate — primitive fields compare via `Object.is` for free, and Zustand's
// per-field setter bails out automatically on equal values. The persist `migrate`
// at v0→v1 drops the orphan `notificationPrefs` key from existing MMKV state.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import type { UserProfileType } from '@/lib/userProfile.schema';

const storage = createMMKV({ id: 'user-profile' });

const mmkvStorage = {
  getItem: (key: string) => {
    try {
      return storage.getString(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      storage.set(key, value);
    } catch {
      /* best-effort */
    }
  },
  removeItem: (key: string) => {
    try {
      storage.remove(key);
    } catch {
      /* best-effort */
    }
  },
};

interface UserProfileState {
  fullName: string | null;
  companyName: string | null;
  phoneNumber: string | null;
  backupEmail: string | null;
  // Spec 99 §9.14 — 5 flat notification preference fields (was a JSONB
  // `notificationPrefs` object pre-flatten). Defaults match server defaults
  // from migration 117.
  newLeadMinCostTier: 'low' | 'medium' | 'high';
  phaseChanged: boolean;
  lifecycleStalled: boolean;
  startDateUrgent: boolean;
  notificationSchedule: 'morning' | 'anytime' | 'evening';

  hydrate: (profile: UserProfileType) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  fullName: null as string | null,
  companyName: null as string | null,
  phoneNumber: null as string | null,
  backupEmail: null as string | null,
  newLeadMinCostTier: 'medium' as const,
  phaseChanged: true,
  lifecycleStalled: true,
  startDateUrgent: true,
  notificationSchedule: 'anytime' as const,
};

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      hydrate: (profile: UserProfileType) =>
        // Spec 99 §6.6 + §9.8: per-field equality gate so a refetch with
        // identical content does NOT notify subscribers. Pre-§9.14 this
        // required `fast-deep-equal` on the JSONB notificationPrefs blob;
        // post-flatten every field is a primitive and `Object.is` is the
        // canonical equality (which Zustand's `set` already uses internally).
        set((prev) => {
          const changed: Partial<UserProfileState> = {};
          if (prev.fullName !== profile.full_name) changed.fullName = profile.full_name;
          if (prev.companyName !== profile.company_name) changed.companyName = profile.company_name;
          if (prev.phoneNumber !== profile.phone_number) changed.phoneNumber = profile.phone_number;
          if (prev.backupEmail !== profile.backup_email) changed.backupEmail = profile.backup_email;
          if (prev.newLeadMinCostTier !== profile.new_lead_min_cost_tier) changed.newLeadMinCostTier = profile.new_lead_min_cost_tier;
          if (prev.phaseChanged !== profile.phase_changed) changed.phaseChanged = profile.phase_changed;
          if (prev.lifecycleStalled !== profile.lifecycle_stalled_pref) changed.lifecycleStalled = profile.lifecycle_stalled_pref;
          if (prev.startDateUrgent !== profile.start_date_urgent) changed.startDateUrgent = profile.start_date_urgent;
          if (prev.notificationSchedule !== profile.notification_schedule) changed.notificationSchedule = profile.notification_schedule;
          // Returning prev causes Zustand's set() to bail out of notifying.
          return Object.keys(changed).length === 0 ? prev : changed;
        }),
      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'user-profile',
      storage: createJSONStorage(() => mmkvStorage),
      // Spec 99 §9.14: bump to v1 to drop the orphan `notificationPrefs`
      // JSONB blob from existing MMKV state. The persist middleware calls
      // `migrate(state, storedVersion)` ONCE with the stored version
      // (verified by Gemini WF2-C review #1 against zustand v5 source).
      // No chaining required.
      version: 1,
      migrate: (persistedState: unknown, _version: number) => {
        if (persistedState && typeof persistedState === 'object') {
          // Drop the v0 JSONB blob; the new flat fields will fall back to
          // INITIAL_STATE defaults via the spread merge that the persist
          // middleware applies after migrate() returns.
          const { notificationPrefs: _drop, ...rest } = persistedState as Record<string, unknown>;
          void _drop;
          return rest;
        }
        return persistedState;
      },
    },
  ),
);
