// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §3.2, §4.1, §4.2
//             docs/specs/03-mobile/93_mobile_auth.md §3.6, §5 Step 6
//             docs/specs/03-mobile/94_mobile_onboarding.md §2, §10 Step 1
//             docs/specs/03-mobile/95_mobile_user_profiles.md §4
//             docs/specs/03-mobile/90_mobile_engineering_protocol.md §11
import '../global.css';
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, LogBox } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { queryClient } from '@/lib/queryClient';
import { mmkvPersister } from '@/lib/mmkvPersister';
import { shouldDehydrateQueryFn } from '@/lib/persistFilter';
import { useAuthStore, initFirebaseAuthListener } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useOnboardingStore } from '@/store/onboardingStore';
import { AccountDeletedError, ApiError, fetchWithAuth } from '@/lib/apiClient';
import { registerPushToken } from '@/lib/pushTokens';
import { successNotification } from '@/lib/haptics';
import { NotificationToast, type NotificationType } from '@/components/shared/NotificationToast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { trackRender, useDepsTracker, wireStoreLogging } from '@/lib/debug/stateDebug';
import { track } from '@/lib/analytics';
import { decideAuthGateRoute } from '@/lib/auth/decideAuthGateRoute';

// Spec 99 §7.1 + §9.5: wire Zustand subscribers once at module load. The
// stateDebug hub is a permanent dev-only observability tool; the function
// no-ops in production via __DEV__ guard inside stateDebug.ts.
wireStoreLogging();

// LogBox renders dev-only on-screen warning toasts that overlap absolute-positioned
// footer elements (e.g., the sign-up footer link), causing Maestro E2E flows to
// fail with "Element not found" when LogBox steals the tap event. Suppressing the
// on-screen UI does NOT silence warnings — they still print to the Metro terminal
// (where they're more actionable during development). LogBox is auto-disabled in
// production builds by React Native, so this has zero effect on shipped code.
LogBox.ignoreAllLogs(true);

// Spec 90 §11: Sentry must be initialized before any captureException call.
// The @sentry/react-native/app-plugin in app.json wires NATIVE crash capture
// at build time, but JS exceptions require this runtime init. Without it,
// every Sentry.captureException() in the auth flow is a silent no-op.
// `enabled` is gated on the DSN presence so local dev (no DSN) doesn't
// generate noise — production EAS builds set EXPO_PUBLIC_SENTRY_DSN via Secrets.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

interface ToastState {
  title: string;
  body: string;
  notificationType: NotificationType;
  entityId?: string;
  routeDomain?: string;
}

interface ReactivationState {
  account_deleted_at: string;
  days_remaining: number;
}

function AuthGate() {
  trackRender('AuthGate');
  // Per-field selectors so a token refresh (idToken change) doesn't re-run the
  // AuthGate effect (which only depends on user + segments + _hasHydrated).
  const user = useAuthStore((s) => s.user);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const signOut = useAuthStore((s) => s.signOut);

  // Server-driven routing — Spec 95 §4 / Spec 93 §3.6.
  // Only enabled once Firebase auth has resolved and a user is present.
  const { data: profile, error: profileError, isLoading: profileLoading } = useUserProfile({
    enabled: !!user,
  });

  const [reactivationState, setReactivationState] = useState<ReactivationState | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [reactivationError, setReactivationError] = useState<string | null>(null);

  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const [isNavigationReady, setNavigationReady] = useState(false);

  // NOTE: we do NOT subscribe to onboardingStore.currentStep via a selector
  // here. AuthGate's effect only needs the latest currentStep when it's
  // ALREADY firing (segments changed, profile loaded/changed, etc.) — we
  // don't want to RE-FIRE the effect every time setStep updates the store
  // during normal onboarding flow. Subscribing + including in deps caused a
  // render loop ("Maximum update depth exceeded") on /(onboarding)/complete
  // post-WF2 3727ceb (this commit fixes that regression). Read lazily via
  // getState() inside the effect closure when needed.

  // Step 1: latch ready flag the moment the navigation container key exists.
  useEffect(() => {
    if (rootNavigationState?.key) {
      setNavigationReady(true);
    }
  }, [rootNavigationState?.key]);

  // Step 2: 5-branch routing matrix per Spec 95 §4 + Spec 93 §3.6:
  //  1. !user → sign-in
  //  2. user + 403 AccountDeletedError → reactivation modal (do not navigate)
  //  3. user + 404 → new user, no profile → onboarding
  //  4. user + other error → retry UI (do not navigate away)
  //  5. user + profile → route on onboarding_complete (true → app, false → onboarding)
  // registerPushToken fires ONLY when routing to (app)/ from (auth)/ — Spec 92 §4.1
  // requires contextual permission timing after first lead save, NOT on cold boot.
  useEffect(() => {
    // Spec 99 §9.6: routing decision lifted to a pure function so the 9-arm
    // matrix can be unit-tested directly (mobile/__tests__/authGate.test.ts).
    // This useEffect is now a thin dispatcher — it captures inputs, evaluates
    // the pure function, and performs the side effect implied by the
    // discriminated-union return.
    //
    // Defensive Sentry log on a malformed profile (empty user_id) stays HERE
    // because it's a side effect, not a routing decision. The pure function
    // treats falsy user_id as "wait" via its stale-profile guard.
    if (profile && !profile.user_id) {
      Sentry.captureMessage('stale_profile_missing_user_id', {
        extra: { firebaseUid: user?.uid, profileKeys: Object.keys(profile) },
      });
    }

    const decision = decideAuthGateRoute({
      isNavigationReady,
      hasHydrated: _hasHydrated,
      user,
      profile,
      profileError,
      profileLoading,
      segments,
      // Lazy read per Spec 99 §6.4 — currentStep is NOT in this effect's
      // deps array; subscribing to it would re-run the effect on every
      // setStep call (incident #1, fixed in 6c5d085).
      currentStep: useOnboardingStore.getState().currentStep,
    });

    switch (decision.kind) {
      case 'wait':
        return;
      case 'navigate':
        // Spec 99 §7.3 router decision telemetry — DEV-only event for every
        // router.replace from AuthGate. Hermes/Metro constant-folds the
        // `if (__DEV__)` guard at build time so production bundles carry zero
        // overhead. Production builds rely on the 4 enumerated events
        // (signout_initiated, reactivation_modal_shown, etc.) instead.
        if (__DEV__) {
          track('route_decision', {
            authority: 'AuthGate',
            branch: 'navigate',
            from: segments.join('/') || '(root)',
            to: decision.to,
            reason: 'auth_gate_routing_effect',
          });
        }
        router.replace(decision.to);
        if (decision.sideEffect === 'registerPushToken') {
          void registerPushToken().catch((err) => {
            Sentry.captureException(err, {
              extra: { context: 'registerPushToken on auth→app' },
            });
          });
        }
        return;
      case 'reactivation-modal':
        setReactivationState({
          account_deleted_at: decision.account_deleted_at,
          days_remaining: decision.days_remaining,
        });
        // Spec 99 §7.3 production event #2 — compliance-critical signal
        // proving the user saw the 30-day reactivation prompt (PIPEDA /
        // account-deletion audit trail). NOT __DEV__-guarded.
        track('reactivation_modal_shown', {
          days_remaining: decision.days_remaining,
        });
        return;
      default: {
        // Spec 99 §9.6 amendment (code-reviewer H2 + DeepSeek #5): exhaustive-
        // ness guard. If a future kind is added to AuthGateDecision without
        // updating this switch, TypeScript narrows `decision` to that new
        // kind here — assigning it to `never` produces a compile error.
        const _exhaustive: never = decision;
        void _exhaustive;
        return;
      }
    }
    // currentStep is intentionally NOT in this dep array — see the comment
    // above the lazy useOnboardingStore.getState().currentStep reads. Adding
    // it caused a render loop in commit 3727ceb (fixed in this commit).
  }, [isNavigationReady, user, segments, _hasHydrated, profile, profileError, profileLoading, router, signOut]);

  // DIAGNOSTIC: mirror the routing-effect deps to log which dep changes between fires.
  useDepsTracker('AuthGate.routing', [isNavigationReady, user, segments, _hasHydrated, profile, profileError, profileLoading, router, signOut]);

  // Reactivation modal — Spec 93 §3.6 Step 4
  if (reactivationState && user) {
    const deletionDate = new Date(reactivationState.account_deleted_at);
    deletionDate.setDate(deletionDate.getDate() + 30);
    const formattedDate = deletionDate.toLocaleDateString('en-CA', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const bodyText =
      reactivationState.days_remaining === 0
        ? 'Your account is scheduled for deletion today.'
        : `Your account is scheduled for deletion on ${formattedDate}.`;

    const handleReactivate = async () => {
      setReactivating(true);
      setReactivationError(null);
      try {
        await fetchWithAuth('/api/user-profile/reactivate', { method: 'POST' });
        setReactivationState(null);
        queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      } catch (err) {
        Sentry.captureException(err, { extra: { context: 'reactivation POST' } });
        // 400 = recovery window has passed (days_remaining=0 race); surface to user
        setReactivationError('Unable to reactivate. Please contact support.');
      } finally {
        setReactivating(false);
      }
    };

    return (
      <Modal transparent animationType="fade" visible>
        <View className="flex-1 items-center justify-center bg-black/70 px-6">
          <View className="w-full rounded-2xl bg-zinc-900 p-6 border border-zinc-800">
            <Text className="text-zinc-100 text-lg font-semibold mb-2">
              Welcome back.
            </Text>
            <Text className="text-zinc-400 text-sm mb-6 leading-relaxed">
              {bodyText} Reactivate to keep your account?
            </Text>
            <TouchableOpacity
              onPress={() => { void handleReactivate(); }}
              disabled={reactivating}
              className="bg-amber-500 rounded-xl py-4 items-center mb-3 min-h-[52px] justify-center"
            >
              {reactivating
                ? <ActivityIndicator color="#000" />
                : <Text className="text-black font-semibold text-base">Reactivate</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { void signOut(); }}
              className="rounded-xl py-4 items-center min-h-[52px] justify-center border border-zinc-700"
            >
              <Text className="text-zinc-400 text-base">Sign Out</Text>
            </TouchableOpacity>
            {reactivationError ? (
              <Text className="text-red-400 text-xs text-center mt-3">
                {reactivationError}
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  }

  // Network / server error retry prompt — Spec 95 §4 fetch failure behavior
  if (user && profileError && !(profileError instanceof AccountDeletedError) &&
      !(profileError instanceof ApiError && profileError.status === 404)) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950 px-6">
        <Text className="text-zinc-100 text-base font-semibold mb-2 text-center">
          Could not load your profile.
        </Text>
        <Text className="text-zinc-500 text-sm mb-8 text-center">
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={() => queryClient.refetchQueries({ queryKey: ['user-profile'] })}
          className="bg-amber-500 rounded-xl px-8 py-4 min-h-[52px] items-center justify-center"
        >
          <Text className="text-black font-semibold text-base">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

// Mounts the Firebase onAuthStateChanged listener once at app boot. The store
// receives the user (or null on sign-out) and AuthGate routes accordingly.
// Lives in its own component so the listener subscribe/unsubscribe lifecycle
// is tied to RootLayout mount/unmount — not to AuthGate re-renders.
function FirebaseAuthListener() {
  trackRender('FirebaseAuthListener');
  useEffect(() => {
    const unsubscribe = initFirebaseAuthListener();
    return unsubscribe;
  }, []);
  return null;
}

function NotificationHandlers() {
  trackRender('NotificationHandlers');
  const router = useRouter();
  const incrementUnread = useNotificationStore((s) => s.incrementUnread);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    // Background tap: route to the correct screen
    const tapSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        notification_type?: string;
        route_domain?: string;
        entity_id?: string;
      };
      if (!data) return;

      const routeDomain = data.route_domain;
      const entityId = data.entity_id;

      // navigate() switches tab without pushing a stack frame; push() stacks the detail on top.
      if (routeDomain === 'flight_board') {
        router.navigate('/(app)/flight-board');
        if (entityId) {
          router.push(`/(app)/[flight-job]?id=${entityId}`);
        }
      } else {
        router.navigate('/(app)/');
        if (entityId) {
          router.push(`/(app)/[lead]?id=${entityId}`);
        }
      }
    });

    // Foreground: show in-app toast instead of system notification
    const foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as {
        notification_type?: string;
        route_domain?: string;
        entity_id?: string;
        urgency?: string;
      };
      const title = notification.request.content.title ?? '';
      const body = notification.request.content.body ?? '';
      const notificationType = (data?.notification_type ?? 'NEW_HIGH_VALUE_LEAD') as NotificationType;

      successNotification();

      // Badge increments for any flight_board-domain notification; the route_domain is
      // the correct discriminator (START_DATE_URGENT also targets the flight board).
      if (data?.route_domain === 'flight_board') {
        incrementUnread();
      }

      setToast({
        title,
        body,
        notificationType,
        entityId: data?.entity_id,
        routeDomain: data?.route_domain,
      });
    });

    return () => {
      tapSubscription.remove();
      foregroundSubscription.remove();
    };
  }, [router, incrementUnread]);

  if (!toast) return null;

  return (
    <NotificationToast
      title={toast.title}
      body={toast.body}
      notificationType={toast.notificationType}
      onDismiss={() => setToast(null)}
      onTap={() => {
        // Mirror the background-tap routing: navigate() for tab switch, push() for detail;
        // entity route MUST branch on routeDomain so flight_board items reach [flight-job].
        if (toast.routeDomain === 'flight_board') {
          router.navigate('/(app)/flight-board');
          if (toast.entityId) {
            router.push(`/(app)/[flight-job]?id=${toast.entityId}`);
          }
        } else {
          router.navigate('/(app)/');
          if (toast.entityId) {
            router.push(`/(app)/[lead]?id=${toast.entityId}`);
          }
        }
        setToast(null);
      }}
    />
  );
}

export default function RootLayout() {
  trackRender('RootLayout');
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: mmkvPersister,
            maxAge: 1000 * 60 * 60 * 24,
            // WF3 PII layer-boundary fix (Spec 99 §2.1, follow-up to the
            // Phase 7 adversarial review): exclude the user-profile
            // query from MMKV persistence. The query carries 5 PII
            // identity fields (full_name / phone_number / company_name
            // / email / backup_email); MMKV is Layer 4a (UNENCRYPTED on
            // disk per `mmkvPersister.ts:11` — no encryptionKey passed
            // to createMMKV). Spec 99 §2.1 mandates Layer 4b SecureStore
            // for PII. The query stays in-memory normally; cold-boot
            // mobile re-fetches from server (the canonical source).
            // Other queries (`['lead-feed']`, `['flight-board']`,
            // `['notification-prefs']`) carry only public permit data
            // or non-PII toggles and continue to persist normally.
            dehydrateOptions: {
              shouldDehydrateQuery: shouldDehydrateQueryFn,
            },
            // WF3 follow-up amendment (code-reviewer CRITICAL 1):
            // `shouldDehydrateQuery` only filters WRITES to MMKV. On
            // cold boot, `mmkvPersister.restoreClient()` returns the
            // full pre-WF3 blob (which includes the user-profile PII
            // query), and TanStack hydrates it into memory before the
            // dehydrate filter ever runs. Bumping `buster` from the
            // default '' to 'wf3-pii-strip-1' forces a one-time full
            // cache flush on every existing client at the deploy
            // moment — TanStack compares the persisted `buster` field
            // against this value and calls `removeClient()` on
            // mismatch. The `isPersistedClient` shape guard at
            // `mmkvPersister.ts:29` already validates the field exists.
            buster: 'wf3-pii-strip-1',
          }}
        >
          <FirebaseAuthListener />
          <AuthGate />
          <NotificationHandlers />
          <Stack screenOptions={{ headerShown: false }} />
        </PersistQueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
