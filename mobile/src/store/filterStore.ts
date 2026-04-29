// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §5 State
//             docs/specs/03-mobile/94_mobile_onboarding.md §5 Step 2, §6 Step 4
// Zustand v5 filter store with MMKV persist. Owns the three feed filter
// parameters: radiusKm, tradeSlug, homeBaseLocation, and locationMode.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

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

interface FilterState {
  radiusKm: number;
  tradeSlug: string;
  homeBaseLocation: HomeBaseLocation | null;
  locationMode: LocationMode;
  setRadiusKm: (km: number) => void;
  setTradeSlug: (slug: string) => void;
  setHomeBaseLocation: (loc: HomeBaseLocation | null) => void;
  setLocationMode: (mode: LocationMode) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      radiusKm: 10,
      tradeSlug: '',
      homeBaseLocation: null,
      locationMode: null,
      setRadiusKm: (km) => set({ radiusKm: km }),
      setTradeSlug: (slug) => set({ tradeSlug: slug }),
      setHomeBaseLocation: (loc) => set({ homeBaseLocation: loc }),
      setLocationMode: (mode) => set({ locationMode: mode }),
      reset: () => set({ radiusKm: 10, tradeSlug: '', homeBaseLocation: null, locationMode: null }),
    }),
    {
      name: 'filters',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
