// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §3.2, §4.1, §4.2
import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import { queryClient } from '@/lib/queryClient';
import { mmkvPersister } from '@/lib/mmkvPersister';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { registerPushToken } from '@/lib/pushTokens';
import { successNotification } from '@/lib/haptics';
import { NotificationToast, type NotificationType } from '@/components/shared/NotificationToast';

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
  const { user, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!_hasHydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/(app)/');
      void registerPushToken().catch(() => {});
    }
  }, [user, segments, _hasHydrated]);

  return null;
}

function NotificationHandlers() {
  const router = useRouter();
  const { incrementUnread } = useNotificationStore();
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

      if (routeDomain === 'flight_board') {
        router.push('/(app)/flight-board');
        if (entityId) {
          router.push(`/(app)/[flight-job]?id=${entityId}`);
        }
      } else {
        router.push('/(app)/');
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

      if (
        data?.route_domain === 'flight_board' &&
        (notificationType === 'LIFECYCLE_PHASE_CHANGED' || notificationType === 'LIFECYCLE_STALLED')
      ) {
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
        if (toast.routeDomain === 'flight_board') {
          router.push('/(app)/flight-board');
        } else {
          router.push('/(app)/');
        }
        if (toast.entityId) {
          router.push(`/(app)/[lead]?id=${toast.entityId}`);
        }
        setToast(null);
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: mmkvPersister, maxAge: 1000 * 60 * 60 * 24 }}
      >
        <AuthGate />
        <NotificationHandlers />
        <Stack screenOptions={{ headerShown: false }} />
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
