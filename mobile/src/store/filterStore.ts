// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §5 State
// Zustand v5 filter store with MMKV persist. Owns the three feed filter
// parameters: radiusKm, tradeSlug, and homeBaseLocation.
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

interface FilterState {
  radiusKm: number;
  tradeSlug: string;
  homeBaseLocation: HomeBaseLocation | null;
  setRadiusKm: (km: number) => void;
  setTradeSlug: (slug: string) => void;
  setHomeBaseLocation: (loc: HomeBaseLocation | null) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      radiusKm: 10,
      tradeSlug: '',
      homeBaseLocation: null,
      setRadiusKm: (km) => set({ radiusKm: km }),
      setTradeSlug: (slug) => set({ tradeSlug: slug }),
      setHomeBaseLocation: (loc) => set({ homeBaseLocation: loc }),
      reset: () => set({ radiusKm: 10, tradeSlug: '', homeBaseLocation: null }),
    }),
    {
      name: 'filters',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
