// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.4 Sign-Out, §5 Step 2
//             docs/specs/03-mobile/90_mobile_engineering_protocol.md §11 (PostHog)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import type { Session } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import { useFilterStore } from '@/store/filterStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { usePaywallStore } from '@/store/paywallStore';
import { useFlightBoardSeenStore } from '@/store/flightBoardSeenStore';
import { queryClient } from '@/lib/queryClient';
import { mmkvPersister } from '@/lib/mmkvPersister';
import { cleanupLegacyUserProfileCache } from '@/lib/migrations/userProfileCacheCleanup';
import { identifyUser, resetIdentity, track } from '@/lib/analytics';
import { logQueryInvalidate } from '@/lib/queryTelemetry';

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
  // Holds the Supabase ACCESS token (`session.access_token`) — renamed from
  // `idToken` in the Spec 93 SDK swap (P2-D3 REVERSED): the value is an
  // access token, not an identity assertion; the old name invited forwarding
  // it as one (credential-type confusion).
  accessToken: string | null;
  isLoading: boolean;
  _hasHydrated: boolean;
  setAuth: (user: User, accessToken: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setHasHydrated: (v: boolean) => void;
  signOut: () => Promise<void>;
}

/**
 * Reset all in-memory + on-disk session state. Runs everything `signOut()`
 * does AFTER the Supabase `auth.signOut()` call, but is also invoked from
 * the listener's null branch when Supabase fires a forced sign-out
 * (admin disable, password change on another device, project token
 * revocation per Spec 93 §3.1).
 *
 * Pre-WF3 the listener's null branch called `clearAuth()` ONLY (auth
 * fields zeroed; peer stores + queryClient + persister blob unchanged).
 * On a shared device, the next user signing in saw the previous user's
 * filter/notification/profile state until server hydration completed —
 * the PROMOTED CRITICAL from §9.14 Phase D review, made more visible
 * in the WF3 PII-strip follow-up which added `mmkvPersister.removeClient()`
 * to `signOut()` (widening the asymmetry between the two paths).
 *
 * MUST be idempotent — every called step (reset, clear, removeClient) is
 * a no-op on already-cleared state, so the cold-boot first-fire path
 * (which guards on `lastKnownUid !== null` before invoking) is safe even
 * if the guard is ever weakened by a future refactor.
 */
function clearLocalSessionState(): void {
  // Spec 96 §9: reset paywall flags first so a fast shared-device handoff
  // doesn't put the next user in inline-blur mode against their own status.
  usePaywallStore.getState().reset();
  // Spec 99 §B5 + §9.10 + WF3 follow-up: purge ALL TanStack Query cache
  // (in-memory + persister blob on disk).
  queryClient.clear();
  mmkvPersister.removeClient();
  // Spec 99 §B5 storeReset coverage: reset every peer store so a different
  // user signing in sees no stale data. Persisted stores trigger MMKV
  // writes via the Zustand persist middleware on every reset — including
  // when state is already at INITIAL_STATE (writes serialized defaults
  // back). Each store's `reset()` action is responsible for its own MMKV
  // semantics; same-user re-sign-in still works via the persisted
  // INITIAL_STATE rehydrate (Spec 93 §3.4 fast-path).
  useFilterStore.getState().reset();
  useNotificationStore.getState().reset();
  useOnboardingStore.getState().reset();
  useUserProfileStore.getState().reset();
  // Spec 99 §B5 PIPEDA: clear the per-user "last seen" map so a different
  // user signing in on the same device doesn't inherit the prior user's
  // view history. (Spec 93 §3.4's older "MMKV preserved" rule was
  // superseded by §B5 in commits 381a0c9 + f2f7147.) Spec 77 §3.2's
  // first-sight-no-flash gate handles the post-reset UX cleanly.
  useFlightBoardSeenStore.getState().reset();
  // Inline auth zero (matches `clearAuth()` semantics — kept inline to
  // make the full session-clear visible in one place).
  useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
  // PostHog identity reset AFTER stores so the distinctId is cleared at
  // a clean session boundary; subsequent events use anonymous distinctId.
  resetIdentity();
  // Spec 99 §7.5 + §B5 PIPEDA: clear Sentry user attribution alongside the
  // PostHog reset so subsequent crash reports are not attributed to the
  // signed-out user. MUST live in clearLocalSessionState (not in signOut())
  // so the listener-driven forced-signout path also clears — same lesson as
  // paywallStore.reset() (commits 381a0c9 + f2f7147).
  Sentry.setUser(null);
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isLoading: true,
      _hasHydrated: false,
      setAuth: (user, accessToken) => set({ user, accessToken, isLoading: false }),
      clearAuth: () => set({ user: null, accessToken: null, isLoading: false }),
      setLoading: (loading) => set({ isLoading: loading }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      signOut: async () => {
        // Telemetry first — emit while the user is still identified so the
        // event is attributed to the outgoing session, not the next user
        // who might sign in on this device.
        track('signout_initiated');
        // WF2 P2 review #11 (DeepSeek): wrap the SDK call in try/finally so
        // that a Supabase failure (network blip, expired refresh token,
        // GoTrue unreachable) does NOT skip the downstream PIPEDA-critical
        // cleanup. Pre-fix, a thrown signOut() would leave the user logged
        // in locally with stale Zustand + TanStack caches — exactly the
        // leak the §9.12 storeReset coverage test is meant to prevent at
        // the static layer.
        //
        // The full local cleanup runs via `clearLocalSessionState()` —
        // shared with the listener's null branch (forced sign-out path)
        // so both flows produce identical disk + memory state.
        try {
          await supabase.auth.signOut();
        } catch (err) {
          // Token-never-in-logs: the AuthError carries code/message/status
          // only — never pass the session/token object into Sentry extras.
          Sentry.captureException(err, {
            extra: { context: 'authStore.signOut: supabase signOut failed; running cleanup anyway' },
          });
        } finally {
          clearLocalSessionState();
        }
      },
    }),
    {
      name: 'auth',
      storage: createJSONStorage(() => mmkvStorage),
      // Persist only the Supabase uid (auth.users.id uuid, D6). email +
      // displayName are PII under PIPEDA and are re-hydrated from the
      // Supabase auth listener on each cold boot (setAuth is called with the
      // full user object there). accessToken is also excluded — short-lived,
      // re-delivered by the listener's INITIAL_SESSION fire on boot.
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

// Wires the Supabase onAuthStateChange listener into the store. Call once
// from RootLayout in mobile/app/_layout.tsx — returns the unsubscribe function
// so React's useEffect cleanup detaches the listener on unmount.
//
// UID-change cache invalidation: the PersistQueryClientProvider rehydrates the
// `['user-profile']` query from MMKV on cold boot. If the cached profile was
// written by a previous user (e.g., DEV_MODE 'dev-user' from a prior session,
// or a different account on a shared device), the AuthGate would route on
// stale `onboarding_complete` until the network refetch completes — which
// previously caused a render loop with the (onboarding) layout's independent
// router (since fixed). The check below is module-scoped so it also catches
// the cold-boot first-fire (lastKnownUid === null) and clears any persisted
// query data before AuthGate ever reads it.
//
// `lastKnownUid` is intentionally NOT reset on sign-out: Spec 93 §3.4 mandates
// that MMKV is preserved across sign-out so the same user re-signing in on the
// same device gets fast hydration. Resetting on sign-out would force a redundant
// invalidation on same-user re-sign-in.
let lastKnownUid: string | null = null;

// Test-only escape hatch. The module-scoped `lastKnownUid` persists across
// tests in the same Jest worker (modules are cached). Without a reset, a
// test that fires the listener with a user leaves a non-null `lastKnownUid`
// behind — the next test firing `null` would take the forced-signout
// cleanup branch instead of the cold-boot `clearAuth()` branch (silent
// behavior shift across tests). Tests MUST call this in `beforeEach` to
// restore module state. Production code MUST NOT call this.
export function __resetLastKnownUidForTests(): void {
  lastKnownUid = null;
}

// REGRESSION-GUARDIAN NOTE (P2-F2.2, [panel-fold: Gemini MED + Ground
// truth(c)]): the Firebase-era `expectedUid` capture-at-fire-time /
// stale-`getIdToken()`-resolution race guard is REMOVED here, not ported.
// The fence it defended: RNFirebase's `onAuthStateChanged` delivered the
// user synchronously but the token via a SEPARATE async `getIdToken()`
// step — a second fire's token promise could resolve after a later fire's
// and clobber the wrong user's identity in `setAuth()`. Supabase's
// `onAuthStateChange` delivers `session.access_token` SYNCHRONOUSLY in the
// same callback — there is no second async step for a later fire to race
// against, so the race is structurally impossible, not merely unlikely.
// The same applies to the old `getIdToken().catch(clearAuth)` fallback
// (token fetch cannot fail separately from session delivery). The
// `lastKnownUid` staleness bookkeeping (telemetry gating + UID-change cache
// invalidation) is preserved as-is, re-keyed off `session.user.id`.
export function initSupabaseAuthListener(): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
    if (session?.user) {
      const uid = session.user.id;
      const isUidChange = lastKnownUid !== uid;
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
            data: { from: lastKnownUid, to: uid },
          });
          track('auth_user_switch');
        }
        lastKnownUid = uid;
      }
      // `session.access_token` arrives synchronously — setAuth runs BEFORE
      // the cache invalidation below so the next refetch uses the just-set
      // new bearer (Spec 99 §B4 + Gemini WF3-§9.1 F7 ordering fence,
      // preserved from the Firebase implementation).
      useAuthStore.getState().setAuth(
        {
          uid,
          email: session.user.email ?? null,
          // GoTrue populates user_metadata from the OIDC token's profile
          // claims on first Google/Apple sign-in; email/phone sign-ups have
          // no full_name at this stage (Spec 93 §5 Step 2 — display name
          // was always null until Onboarding in that path, same as before).
          displayName:
            (session.user.user_metadata?.full_name as string | undefined) ?? null,
        },
        session.access_token,
      );
      // Identify the user in PostHog using the opaque Supabase uuid as
      // distinctId — no email/displayName/phone is sent (Spec 90 §11).
      identifyUser(uid);
      // Spec 99 §7.5 — Sentry crash attribution. Same opaque uuid; no
      // email/displayName/phone (PIPEDA). Without this, individual user
      // reports of crashes cannot be correlated with Sentry events.
      Sentry.setUser({ id: uid });
      // Cache invalidation AFTER setAuth: the next refetch uses the
      // just-set new bearer (Spec 99 §B4 + Gemini WF3-§9.1 F7).
      if (isUidChange) {
        // Spec 99 §7.2 — non-trivial invalidate (auth listener, not mutation onSettled)
        logQueryInvalidate('user-profile');
        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      }
    } else {
      // Note: do NOT reset lastKnownUid here (Spec 93 §3.4 fast-path).
      //
      // WF3 M1+M2+M3 #5 (Gemini): cleanup is now UNCONDITIONAL on null
      // fires. Pre-fix the `lastKnownUid !== null` guard skipped cleanup
      // on cold-boot first-fire to avoid thrashing the persisted TanStack
      // cache for unauthenticated users — but that left a crash-recovery
      // gap: if the JS process hard-crashed mid-session, the next cold
      // boot's null fire would skip the cleanup AND leave stale persisted
      // blob from the crashed session on disk. The next user signing in
      // (or the same user re-auth) would see leaked state.
      //
      // Cost analysis of unconditional cleanup: clearLocalSessionState is
      // idempotent — every reset produces the same end-state on
      // already-cleared input. Per-cold-boot I/O for an unauthenticated
      // user is bounded but NOT zero (code-reviewer DEFER-corrected
      // 2026-05-05): mmkvPersister.removeClient() = 2 MMKV remove() calls;
      // each persisted Zustand peer-store reset (filterStore,
      // notificationStore, onboardingStore, userProfileStore) triggers
      // the persist middleware's setItem callback writing INITIAL_STATE
      // back to MMKV — even on already-reset state. authStore.setState
      // also triggers a 5th persist write. Total: ~4 MMKV set() calls +
      // 2 MMKV remove() calls per unauthenticated cold boot, all
      // sub-millisecond. Acceptable trade-off for crash-recovery — the
      // alternative was leaving stale persisted blob on disk after a
      // hard JS crash (data leak class).
      //
      // Telemetry remains gated on `lastKnownUid !== null` so PostHog
      // doesn't see a `forced_signout` event on every cold boot for an
      // unauthenticated user (only real forced sign-outs — admin disable,
      // password change on another device, project token revocation per
      // Spec 93 §3.1 — emit the event). Sentry breadcrumb is similarly
      // gated for the same reason.
      if (lastKnownUid !== null) {
        Sentry.addBreadcrumb({
          category: 'auth',
          message: 'forced_signout_cleanup',
          level: 'info',
          data: { from: lastKnownUid },
        });
        track('forced_signout');
      }
      // WF3 follow-up (PROMOTED CRITICAL from §9.14 Phase D review): full
      // session cleanup runs unconditionally now to close the crash-
      // recovery gap above. Pre-§9.14 this branch called clearAuth() alone,
      // leaving every peer store + queryClient + persister blob intact —
      // the next user signing in on a shared device would see the previous
      // user's filter/notification/profile state until server hydration
      // completed (PIPEDA shared-device leak).
      clearLocalSessionState();
    }
  });
  return () => subscription.unsubscribe();
}
