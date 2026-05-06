// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 (canonical contract — MMKV key, `!==` comparison, first-sight-no-flash)
//             docs/specs/03-mobile/99_mobile_state_architecture.md §3.4 (engagement store row),
//             §B5 (sign-out reset), §6.1 (atomic selectors), §6.6 (deep-equal-before-set), §8.1 (idempotency)
//             docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.4 (amber update flash trigger)
//
// Per-user `{ [permitId]: lastSeenUpdatedAt }` map for the Flight Board amber
// update flash. Spec 77 §3.2 prescribes:
//   hasUpdate = item.updated_at !== mmkvSeen[permitId]
//   first-sight rows (no MMKV entry) DO NOT flash
//   on detail open, parent writes the current updated_at back to MMKV
//
// Layer 4a (MMKV, plaintext) — no PII. Just permit IDs + ISO timestamps.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

// Spec 77 §3.2 prescribes MMKV key `flight-board-last-seen` (canonical).
const storage = createMMKV({ id: 'flight-board-last-seen' });

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

interface FlightBoardSeenState {
  /** permitId → ISO 8601 updated_at last observed by the user. */
  seenMap: Record<string, string>;
  /** Record the current `updated_at` for a permit. Idempotent per Spec 99 §6.6. */
  markSeen: (permitId: string, updatedAt: string) => void;
  /** Spec 99 §B5 — fan-out from `clearLocalSessionState`. */
  reset: () => void;
}

export const useFlightBoardSeenStore = create<FlightBoardSeenState>()(
  persist(
    (set, get) => ({
      seenMap: {},
      markSeen: (permitId, updatedAt) => {
        // Spec 99 §6.6 — short-circuit when the value would not change so
        // subscribed React renderers don't see a new `seenMap` reference on
        // repeat opens at the same timestamp (most common case).
        if (get().seenMap[permitId] === updatedAt) return;
        set((s) => ({ seenMap: { ...s.seenMap, [permitId]: updatedAt } }));
      },
      reset: () => {
        // Idempotent — already-empty map → still emits an INITIAL_STATE write
        // through the persist middleware. Acceptable per Spec 99 §B5 fan-out
        // semantics (other stores behave the same).
        set({ seenMap: {} });
      },
    }),
    {
      name: 'flight-board-seen',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
    },
  ),
);
