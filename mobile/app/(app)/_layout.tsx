// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §2 Tab Bar
// Tab bar hides on downward scroll, reveals on upward scroll (Reanimated translateY).
// Tapping the already-active Feed or Flight Board tab scrolls back to top.
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useDerivedValue,
} from 'react-native-reanimated';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useNotificationStore } from '@/store/notificationStore';
import { tabBarVisible } from '@/store/tabBarStore';
import { lightImpact } from '@/lib/haptics';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 83 : 60;

export default function AppLayout() {
  const unread = useNotificationStore((s) => s.unreadFlightBoard);

  const tabBarOffset = useDerivedValue(() =>
    withTiming(tabBarVisible.value === 1 ? 0 : TAB_BAR_HEIGHT, { duration: 200 }),
  );

  const tabBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabBarOffset.value }],
  }));

  return (
    <ErrorBoundary>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#18181b',
            borderTopColor: '#3f3f46',
            height: TAB_BAR_HEIGHT,
          },
          tabBarActiveTintColor: '#f59e0b',
          tabBarInactiveTintColor: '#71717a',
        }}
        screenListeners={({ route }) => ({
          tabPress: () => {
            lightImpact();
          },
          // Spec 92 §4.4: unread dot clears when Flight Board tab becomes focused.
          // 'focus' fires on any navigation to the screen (tab tap OR deep-link from push).
          focus: () => {
            if (route.name === 'flight-board') {
              useNotificationStore.getState().clearUnread();
            }
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Lead Feed' }} />
        <Tabs.Screen
          name="flight-board"
          options={{
            title: 'Flight Board',
            tabBarBadge: unread > 0 ? unread : undefined,
            tabBarBadgeStyle: { backgroundColor: '#ef4444' },
          }}
        />
        <Tabs.Screen name="map" options={{ title: 'Map' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    </ErrorBoundary>
  );
}
