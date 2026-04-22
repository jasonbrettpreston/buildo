import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

// react-native-mmkv v4 uses createMMKV() factory (MMKV is now an interface, not a class)
const storage = createMMKV({ id: 'auth-store' });

const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.remove(key),
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
      // idToken is excluded from persistence — refreshed on each cold boot
      // via onIdTokenChanged listener. Storing long-lived tokens in MMKV
      // would require secure enclave; short-lived tokens are acceptable.
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
