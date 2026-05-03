// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 6
// Account-level fields only — changes here must NOT trigger lead feed re-renders.
// Feed-scoped fields (tradeSlug, radiusKm, locationMode, defaultTab, supplierSelection)
// live in filterStore. This store owns display-only / notification fields.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import equal from 'fast-deep-equal/es6';
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
  notificationPrefs: Record<string, unknown> | null;

  hydrate: (profile: UserProfileType) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  fullName: null as string | null,
  companyName: null as string | null,
  phoneNumber: null as string | null,
  backupEmail: null as string | null,
  notificationPrefs: null as Record<string, unknown> | null,
};

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      hydrate: (profile: UserProfileType) =>
        // Spec 99 §6.6 + §9.8: deep-equal-before-set so a refetch with
        // identical content does NOT notify subscribers. notificationPrefs is
        // the high-frequency offender — a 5-key object recreated on every
        // hydrate; without this gate, every cold boot + refetch fires
        // [store:userProfile] notify even though content is identical.
        set((prev) => {
          const nextNotificationPrefs = profile.notification_prefs as Record<string, unknown> | null;
          const changed: Partial<UserProfileState> = {};
          if (prev.fullName !== profile.full_name) changed.fullName = profile.full_name;
          if (prev.companyName !== profile.company_name) changed.companyName = profile.company_name;
          if (prev.phoneNumber !== profile.phone_number) changed.phoneNumber = profile.phone_number;
          if (prev.backupEmail !== profile.backup_email) changed.backupEmail = profile.backup_email;
          if (!equal(prev.notificationPrefs, nextNotificationPrefs)) {
            changed.notificationPrefs = nextNotificationPrefs;
          }
          // Returning prev causes Zustand's set() to bail out of notifying.
          return Object.keys(changed).length === 0 ? prev : changed;
        }),
      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'user-profile',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
