import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

// react-native-mmkv v4 uses createMMKV() factory (MMKV is now an interface, not a class)
const storage = createMMKV({ id: 'auth-store' });

// Storage adapter guards against corrupted JSON / read failures so the AuthGate
// can always proceed past hydration (previously a malformed MMKV value would
// throw through Zustand's internal JSON.parse and hang _hasHydrated forever).
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
      /* device out of space, read-only FS, etc. — auth flow still completes in memory */
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

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface AuthState {
  user: User | null;
  idToken: string | null;
  _hasHydrated: boolean;
  setAuth: (user: User, idToken: string) => void;
  clearAuth: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      idToken: null,
      _hasHydrated: false,
      setAuth: (user, idToken) => set({ user, idToken }),
      clearAuth: () => set({ user: null, idToken: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'auth',
      storage: createJSONStorage(() => mmkvStorage),
      // Persist only the Firebase uid. email + displayName are PII under PIPEDA
      // and are re-hydrated from the Firebase Auth listener on each cold boot
      // (setAuth is called with the full user object there). idToken is also
      // excluded — short-lived, refreshed on listener attach.
      partialize: (state) => ({
        user: state.user ? { uid: state.user.uid, email: null, displayName: null } : null,
      }),
      onRehydrateStorage: () => (state, error) => {
        // Even if MMKV rehydration errors, we must mark hydrated so AuthGate
        // can fall through to the login screen rather than hanging on a blank.
        if (error) {
          try {
            storage.remove('auth');
          } catch {
            /* ignore */
          }
        }
        state?.setHasHydrated(true);
      },
    },
  ),
);
