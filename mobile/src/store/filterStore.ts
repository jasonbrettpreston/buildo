// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §5 State
//             docs/specs/03-mobile/94_mobile_onboarding.md §5 Step 2, §6 Step 4
//             docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 5
// Zustand v5 filter store with MMKV persist. Owns all feed-scoped filter
// parameters: radiusKm, tradeSlug, homeBaseLocation, locationMode, defaultTab,
// supplierSelection. hydrate() populates from server profile on launch.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import equal from 'fast-deep-equal/es6';
import type { UserProfileType } from '@/lib/userProfile.schema';

const storage = createMMKV({ id: 'filter-store' });

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

interface HomeBaseLocation {
  lat: number;
  lng: number;
}

type LocationMode = 'home_base_fixed' | 'gps_live' | null;
type DefaultTab = 'feed' | 'flight_board' | null;

interface FilterState {
  radiusKm: number;
  tradeSlug: string;
  homeBaseLocation: HomeBaseLocation | null;
  locationMode: LocationMode;
  defaultTab: DefaultTab;
  supplierSelection: string | null;
  setRadiusKm: (km: number) => void;
  setTradeSlug: (slug: string) => void;
  setHomeBaseLocation: (loc: HomeBaseLocation | null) => void;
  setLocationMode: (mode: LocationMode) => void;
  setDefaultTab: (tab: DefaultTab) => void;
  setSupplierSelection: (s: string | null) => void;
  hydrate: (profile: UserProfileType) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      radiusKm: 10,
      tradeSlug: '',
      homeBaseLocation: null,
      locationMode: null,
      defaultTab: null,
      supplierSelection: null,
      setRadiusKm: (km) => set({ radiusKm: km }),
      setTradeSlug: (slug) => set({ tradeSlug: slug }),
      setHomeBaseLocation: (loc) => set({ homeBaseLocation: loc }),
      setLocationMode: (mode) => set({ locationMode: mode }),
      setDefaultTab: (tab) => set({ defaultTab: tab }),
      setSupplierSelection: (s) => set({ supplierSelection: s }),
      hydrate: (profile: UserProfileType) =>
        // Spec 99 §6.6 + §9.8: deep-equal-before-set so a refetch with
        // identical content does NOT notify subscribers (which would re-fire
        // any selector reading these fields and cascade re-renders). Per-field
        // primitive checks for the scalars; deep-equal for the homeBaseLocation
        // object (the only nested value here).
        set((prev) => {
          const nextTradeSlug = profile.trade_slug ?? '';
          const nextRadiusKm = profile.radius_km ?? 10;
          const nextLocationMode = profile.location_mode;
          const nextHomeBaseLocation =
            profile.home_base_lat !== null && profile.home_base_lng !== null
              ? { lat: profile.home_base_lat, lng: profile.home_base_lng }
              : null;
          const nextDefaultTab = profile.default_tab;
          const nextSupplierSelection = profile.supplier_selection;

          const changed: Partial<FilterState> = {};
          if (prev.tradeSlug !== nextTradeSlug) changed.tradeSlug = nextTradeSlug;
          if (prev.radiusKm !== nextRadiusKm) changed.radiusKm = nextRadiusKm;
          if (prev.locationMode !== nextLocationMode) changed.locationMode = nextLocationMode;
          if (!equal(prev.homeBaseLocation, nextHomeBaseLocation)) {
            changed.homeBaseLocation = nextHomeBaseLocation;
          }
          if (prev.defaultTab !== nextDefaultTab) changed.defaultTab = nextDefaultTab;
          if (prev.supplierSelection !== nextSupplierSelection) {
            changed.supplierSelection = nextSupplierSelection;
          }
          // Returning prev causes Zustand's set() to bail out of notifying.
          return Object.keys(changed).length === 0 ? prev : changed;
        }),
      reset: () =>
        set({
          radiusKm: 10,
          tradeSlug: '',
          homeBaseLocation: null,
          locationMode: null,
          defaultTab: null,
          supplierSelection: null,
        }),
    }),
    {
      name: 'filters',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
