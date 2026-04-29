// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §5 State
//             docs/specs/03-mobile/94_mobile_onboarding.md §5 Step 2, §6 Step 4
//             docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 5
// Zustand v5 filter store with MMKV persist. Owns all feed-scoped filter
// parameters: radiusKm, tradeSlug, homeBaseLocation, locationMode, defaultTab,
// supplierSelection. hydrate() populates from server profile on launch.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import type { UserProfileType } from '@/lib/userProfile.schema';

const storage = createMMKV({ id: 'filter-store' });

const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.remove(key),
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
        set({
          tradeSlug: profile.trade_slug ?? '',
          radiusKm: profile.radius_km ?? 10,
          locationMode: profile.location_mode,
          homeBaseLocation:
            profile.home_base_lat !== null && profile.home_base_lng !== null
              ? { lat: profile.home_base_lat, lng: profile.home_base_lng }
              : null,
          defaultTab: profile.default_tab,
          supplierSelection: profile.supplier_selection,
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
