// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §2 Tab Bar
//             docs/specs/03-mobile/94_mobile_onboarding.md §2 Incomplete profile banner
// Tab bar hides on downward scroll, reveals on upward scroll (Reanimated translateY).
// Tapping the already-active Feed or Flight Board tab scrolls back to top.
import { useCallback } from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useDerivedValue,
} from 'react-native-reanimated';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useNotificationStore } from '@/store/notificationStore';
import { IncompleteBanner } from '@/components/onboarding/IncompleteBanner';
import { tabBarVisible } from '@/store/tabBarStore';
import { lightImpact } from '@/lib/haptics';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 83 : 60;

// Hoisted constants — these do not depend on render state. Passing a static
// reference to <Tabs screenOptions> prevents the navigator from re-diffing
// options on every unread-badge increment.
const TAB_BAR_STYLE = {
  backgroundColor: '#18181b',
  borderTopColor: '#3f3f46',
  height: TAB_BAR_HEIGHT,
} as const;

const TABS_SCREEN_OPTIONS = {
  headerShown: false,
  tabBarStyle: TAB_BAR_STYLE,
  tabBarActiveTintColor: '#f59e0b',
  tabBarInactiveTintColor: '#71717a',
} as const;

// Animated tab bar wrapper — consumes tabBarVisible shared value to slide the
// native <BottomTabBar> off-screen on downward scroll, then back in on upward.
function AnimatedTabBar(props: BottomTabBarProps) {
  const tabBarOffset = useDerivedValue(() =>
    withTiming(tabBarVisible.value === 1 ? 0 : TAB_BAR_HEIGHT, { duration: 200 }),
  );
  const tabBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabBarOffset.value }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
        },
        tabBarStyle,
      ]}
      pointerEvents="box-none"
    >
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

export default function AppLayout() {
  const unread = useNotificationStore((s) => s.unreadFlightBoard);

  const screenListeners = useCallback(
    ({ route }: { route: { name: string } }) => ({
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
    }),
    [],
  );

  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <AnimatedTabBar {...props} />,
    [],
  );

  return (
    <ErrorBoundary>
      <IncompleteBanner />
      <Tabs
        tabBar={renderTabBar}
        screenOptions={TABS_SCREEN_OPTIONS}
        screenListeners={screenListeners}
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
