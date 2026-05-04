// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.4 Sign-Out, §5 Step 2
//             docs/specs/03-mobile/90_mobile_engineering_protocol.md §11 (PostHog)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import * as Sentry from '@sentry/react-native';
import { auth } from '@/lib/firebase';
import { useFilterStore } from '@/store/filterStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { usePaywallStore } from '@/store/paywallStore';
import { queryClient } from '@/lib/queryClient';
import { cleanupLegacyUserProfileCache } from '@/lib/migrations/userProfileCacheCleanup';
import { identifyUser, resetIdentity, track } from '@/lib/analytics';

// Spec 99 §9.1: one-time legacy cleanup at module load. Removes any stale
// data in the orphaned `user-profile-cache` MMKV blob from existing installs.
// Idempotent (module-scoped + MMKV clearAll on empty blob is a no-op).
cleanupLegacyUserProfileCache();

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
        // Telemetry first — emit while the user is still identified so the
        // event is attributed to the outgoing session, not the next user
        // who might sign in on this device.
        track('signout_initiated');
        // Spec 96 §9 "Sign-out reset (critical)": clear paywall flags BEFORE
        // firebaseSignOut. Otherwise a fast shared-device handoff (sign-out
        // → AuthGate redirect → next user signs in → _layout.tsx renders)
        // could process the next user's first render before this line
        // executes, putting them in inline-blur mode against their own
        // 'expired' status. paywallStore is in-memory only (not MMKV-
        // persisted), so this protects same-session handoffs — common with
        // family/team phones.
        usePaywallStore.getState().reset();
        // Firebase sign-out — onAuthStateChanged fires (null) which clears
        // auth. Then reset peer in-memory stores so a different user
        // signing in on the same device sees no stale data. MMKV is
        // preserved per §3.4 so the same user returning on the same device
        // gets fast hydration.
        //
        // WF2 P2 review #11 (DeepSeek): wrap the Firebase call in
        // try/finally so that a Firebase failure (network blip, expired
        // refresh token, Firebase unreachable) does NOT skip the
        // downstream PIPEDA-critical cleanup (queryClient.clear() + peer
        // store resets). Pre-fix, a thrown signOut() would leave the
        // user logged in locally with stale Zustand + TanStack caches —
        // exactly the leak the §9.12 storeReset coverage test is meant
        // to prevent at the static layer.
        try {
          await auth().signOut();
        } catch (err) {
          Sentry.captureException(err, {
            extra: { context: 'authStore.signOut: firebase signOut failed; running cleanup anyway' },
          });
        } finally {
          // Spec 99 §B5 + §9.10: purge ALL TanStack Query cache so the
          // next sign-in (potentially a different user on a shared
          // device) cannot read the previous user's data from cache.
          // `enabled: !!user` only stops NEW fetches; in-flight fetches
          // resolve and write to the cache, and the MMKV persister
          // rehydrates on next mount with the previous user's data —
          // a PIPEDA leak on shared devices.
          //
          // `clear()` (not `removeQueries({queryKey:['user-profile']})`)
          // per Gemini WF2-Phase-A review #5: lead-feed, leads,
          // flight-board, and any future user-scoped queries are ALSO
          // under PIPEDA — narrow purge would leak them. The mobile app
          // currently has no non-user-scoped queries, so the blast
          // radius is zero.
          queryClient.clear();
          useFilterStore.getState().reset();
          useNotificationStore.getState().reset();
          useOnboardingStore.getState().reset();
          useUserProfileStore.getState().reset();
          // Spec 99 §9.1: removed clearUserProfileCache() — the legacy
          // MMKV blob (`user-profile-cache`) is gone. queryClient.clear()
          // above already purges the TanStack persister blob (the only
          // remaining profile cache).
          set({ user: null, idToken: null, isLoading: false });
          // Reset PostHog identity AFTER the in-memory store reset so
          // the distinctId is cleared at a clean session boundary; any
          // subsequent event before the next sign-in will use an
          // anonymous distinctId.
          resetIdentity();
        }
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

// Wires the RNFirebase onAuthStateChanged listener into the store. Call once
// from RootLayout in mobile/app/_layout.tsx — returns the unsubscribe function
// so React's useEffect cleanup detaches the listener on unmount.
//
// UID-change cache invalidation: the PersistQueryClientProvider rehydrates the
// `['user-profile']` query from MMKV on cold boot. If the cached profile was
// written by a previous user (e.g., DEV_MODE 'dev-user' from a prior session,
// or a different Firebase account on a shared device), the AuthGate would
// route on stale `onboarding_complete` until the network refetch completes —
// which previously caused a render loop with the (onboarding) layout's
// independent router (since fixed). The check below is module-scoped so it
// also catches the cold-boot first-fire (lastKnownUid === null) and clears
// any persisted query data before AuthGate ever reads it.
//
// `lastKnownUid` is intentionally NOT reset on sign-out: Spec 93 §3.4 mandates
// that MMKV is preserved across sign-out so the same user re-signing in on the
// same device gets fast hydration. Resetting on sign-out would force a redundant
// invalidation on same-user re-sign-in.
let lastKnownUid: string | null = null;

export function initFirebaseAuthListener(): () => void {
  return auth().onAuthStateChanged((firebaseUser: FirebaseAuthTypes.User | null) => {
    if (firebaseUser) {
      // Capture the uid at fire-time so a late-resolving getIdToken from a
      // PRIOR fire cannot clobber the current user's identity in setAuth().
      // RNFirebase can fire onAuthStateChanged multiple times in quick
      // succession on init / token refresh; without this guard, A's
      // getIdToken().then() could win the race and overwrite B's setAuth.
      const expectedUid = firebaseUser.uid;
      const isUidChange = lastKnownUid !== expectedUid;
      if (isUidChange) {
        // First-fire OR genuine UID change. Telemetry on real transitions
        // only (not the cold-boot first-fire where lastKnownUid was null) so
        // shared-device handoff events surface in Sentry without noise from
        // every app launch.
        if (lastKnownUid !== null) {
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'uid_change_cache_invalidated',
            level: 'info',
            data: { from: lastKnownUid, to: expectedUid },
          });
          track('auth_user_switch');
        }
        // Update lastKnownUid synchronously so concurrent listener fires
        // observe the new value. Cache invalidation MUST happen AFTER setAuth
        // (see .then() below) — invalidating before would trigger a refetch
        // using the OLD bearer token (Gemini WF3-§9.1 review F7).
        lastKnownUid = expectedUid;
      }
      void firebaseUser
        .getIdToken()
        .then((idToken) => {
          // Stale-resolution guard: if a newer listener fire has already
          // advanced lastKnownUid past us, drop this token write — it would
          // otherwise overwrite the current user's identity with the
          // previous user's. Compare against the captured expectedUid.
          if (lastKnownUid !== expectedUid) return;
          useAuthStore.getState().setAuth(
            {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
            },
            idToken,
          );
          // Identify the user in PostHog using the opaque Firebase uid as
          // distinctId — no email/displayName/phone is sent (Spec 90 §11).
          identifyUser(firebaseUser.uid);
          // Cache invalidation AFTER setAuth: the next refetch uses the
          // just-set new bearer (Spec 99 §B4 + Gemini WF3-§9.1 F7).
          // Pre-fix, invalidate fired synchronously above and the refetch
          // raced setAuth — sending the OLD token to the server.
          if (isUidChange) {
            void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
          }
        })
        .catch(() => {
          // Token fetch failure is rare but can happen if Firebase is unreachable
          // immediately after auth state change. Treat as signed-out so the
          // AuthGate redirects to sign-in rather than leaving the user in limbo.
          // Same stale-fire guard: don't clear if a newer fire moved on.
          if (lastKnownUid !== expectedUid) return;
          useAuthStore.getState().clearAuth();
        });
    } else {
      // Note: do NOT reset lastKnownUid here (Spec 93 §3.4 fast-path).
      useAuthStore.getState().clearAuth();
    }
  });
}
