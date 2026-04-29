// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §3.2, §4.1, §4.2
//             docs/specs/03-mobile/93_mobile_auth.md §5 Step 6
//             docs/specs/03-mobile/94_mobile_onboarding.md §2, §10 Step 1
//             docs/specs/03-mobile/90_mobile_engineering_protocol.md §11
import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { queryClient } from '@/lib/queryClient';
import { mmkvPersister } from '@/lib/mmkvPersister';
import { useAuthStore, initFirebaseAuthListener } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useNotificationStore } from '@/store/notificationStore';
import { registerPushToken } from '@/lib/pushTokens';
import { successNotification } from '@/lib/haptics';
import { NotificationToast, type NotificationType } from '@/components/shared/NotificationToast';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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

function AuthGate() {
  // Per-field selectors so a token refresh (idToken change) doesn't re-run the
  // AuthGate effect (which only depends on user + segments + _hasHydrated).
  const user = useAuthStore((s) => s.user);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  // Local MMKV gate — stub until Spec 95 wires GET /api/user-profile.
  // TODO Spec 95: replace with server response (5 outcomes: 200+complete → app,
  //   200+incomplete → onboarding, 404 → onboarding, 403 → reactivation modal,
  //   network failure → full-screen error).
  const isOnboardingComplete = useOnboardingStore((s) => s.isComplete);
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const [isNavigationReady, setNavigationReady] = useState(false);

  // Step 1: latch ready flag the moment the navigation container key exists.
  useEffect(() => {
    if (rootNavigationState?.key) {
      setNavigationReady(true);
    }
  }, [rootNavigationState?.key]);

  // Step 2: 5-branch routing matrix (Spec 94 §2):
  //  1. !user && not in auth group → sign-in
  //  2. user && in auth group && !onboardingComplete → onboarding
  //  3. user && in auth group && onboardingComplete → app (register push token)
  //  4. user && in onboarding group && onboardingComplete → app (already done)
  //  5. user && not in auth/onboarding group && !onboardingComplete → onboarding (hard gate)
  // registerPushToken fires ONLY on branch 3 — Spec 92 §4.1 requires contextual
  // permission timing after first lead save, NOT on cold boot or during onboarding.
  useEffect(() => {
    if (!isNavigationReady) return;
    if (!_hasHydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (user && inAuthGroup && !isOnboardingComplete) {
      router.replace('/(onboarding)/profession');
    } else if (user && inAuthGroup && isOnboardingComplete) {
      router.replace('/(app)/');
      void registerPushToken().catch((err) => {
        console.warn('[AuthGate] registerPushToken failed', err instanceof Error ? err.message : err);
      });
    } else if (user && inOnboardingGroup && isOnboardingComplete) {
      // Completed-onboarding user deep-linked into the onboarding group.
      router.replace('/(app)/');
    } else if (user && !inAuthGroup && !inOnboardingGroup && !isOnboardingComplete) {
      // Hard gate: user reached an (app) screen before completing onboarding.
      router.replace('/(onboarding)/profession');
    }
  }, [isNavigationReady, user, segments, _hasHydrated, isOnboardingComplete, router]);

  return null;
}

// Mounts the Firebase onAuthStateChanged listener once at app boot. The store
// receives the user (or null on sign-out) and AuthGate routes accordingly.
// Lives in its own component so the listener subscribe/unsubscribe lifecycle
// is tied to RootLayout mount/unmount — not to AuthGate re-renders.
function FirebaseAuthListener() {
  useEffect(() => {
    const unsubscribe = initFirebaseAuthListener();
    return unsubscribe;
  }, []);
  return null;
}

function NotificationHandlers() {
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
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: mmkvPersister, maxAge: 1000 * 60 * 60 * 24 }}
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
