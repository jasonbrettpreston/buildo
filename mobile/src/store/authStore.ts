// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.4 Sign-Out, §5 Step 2
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import { onAuthStateChanged, signOut as firebaseSignOut, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useFilterStore } from '@/store/filterStore';
import { useNotificationStore } from '@/store/notificationStore';

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
  isLoading: boolean;
  _hasHydrated: boolean;
  setAuth: (user: User, idToken: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setHasHydrated: (v: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      idToken: null,
      isLoading: true,
      _hasHydrated: false,
      setAuth: (user, idToken) => set({ user, idToken, isLoading: false }),
      clearAuth: () => set({ user: null, idToken: null, isLoading: false }),
      setLoading: (loading) => set({ isLoading: loading }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      signOut: async () => {
        // Firebase sign-out first — onAuthStateChanged fires (null) which clears auth.
        // Then reset peer in-memory stores so a different user signing in on the same
        // device sees no stale data. MMKV is preserved per §3.4 so the same user
        // returning on the same device gets fast hydration.
        await firebaseSignOut(auth);
        useFilterStore.getState().reset();
        useNotificationStore.getState().reset();
        // TODO Spec 95: useUserProfileStore.getState().reset() — once the store exists.
        // TODO Spec 96: usePaywallStore.getState().clear() — without it, a user who
        //   dismissed the paywall and signed out on a shared device leaves
        //   `dismissed: true` in memory, putting the next user in inline blur mode.
        set({ user: null, idToken: null, isLoading: false });
      },
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

// Wires the Firebase onAuthStateChanged listener into the store. Call once from
// RootLayout in mobile/app/_layout.tsx — returns the unsubscribe function so
// React's useEffect cleanup detaches the listener on unmount.
export function initFirebaseAuthListener(): () => void {
  return onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      void firebaseUser
        .getIdToken()
        .then((idToken) => {
          useAuthStore.getState().setAuth(
            {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
            },
            idToken,
          );
        })
        .catch(() => {
          // Token fetch failure is rare but can happen if Firebase is unreachable
          // immediately after auth state change. Treat as signed-out so the
          // AuthGate redirects to sign-in rather than leaving the user in limbo.
          useAuthStore.getState().clearAuth();
        });
    } else {
      useAuthStore.getState().clearAuth();
    }
  });
}
