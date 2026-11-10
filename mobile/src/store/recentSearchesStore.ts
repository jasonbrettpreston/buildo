// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §3.4c (the recentSearchesStore row, dated note 2026-11-10), §B5 (sign-out reset),
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 dated note 2026-11-10
//
// MF-35 (P35-D16 a): the MaxBLD search page's recent searches, kept on the phone (Layer 4a, MMKV plaintext: a searched street address is none
// of the Layer 4b items). The screen calls add() only when a search opens a page (the lot report, SELECT on the address list, the map page).
// Newest first, de-duplicated ignoring case, at most SEARCH_RECENT_MAX. reset() is fanned out from clearLocalSessionState (authStore.ts).
// Storage is best-effort, as flightBoardSeenStore.ts.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import { SEARCH_RECENT_MAX } from '@/constants/parcelSearch';

const storage = createMMKV({ id: 'parcel-recent-searches' });

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
      /* device out of space, read-only FS, etc. — best-effort */
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

interface RecentSearchesState {
  recent: string[];
  add: (query: string) => void;
  reset: () => void;
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set, get) => ({
      recent: [],
      add: (query) => {
        const q = query.trim();
        if (!q) return;
        const now = get().recent;
        if (now[0] === q) return;
        const key = q.toLowerCase();
        set({ recent: [q, ...now.filter((r) => r.toLowerCase() !== key)].slice(0, SEARCH_RECENT_MAX) });
      },
      reset: () => {
        set({ recent: [] });
      },
    }),
    {
      name: 'parcel-recent-searches',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
    },
  ),
);
