// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §2 Tab Bar
//             docs/specs/03-mobile/94_mobile_onboarding.md §2 Incomplete profile banner
//             docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 7
//             docs/specs/03-mobile/96_mobile_subscription.md §10 Step 2 Subscription gate
//
// Subscription gate sits AFTER AuthGate (Spec 93) and BEFORE the onboarding
// gate (Spec 94). Six subscription_status values are handled per Spec 96 §10:
//   trial / active / past_due / admin_managed → render <Tabs>
//   expired                                   → <PaywallScreen> (or inline-blur if dismissed)
//   cancelled_pending_deletion                → sign-out + redirect to /(auth)/sign-in
//   null/undefined                            → <SubscriptionLoadingGuard>
import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useDerivedValue,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { usePaywallStore } from '@/store/paywallStore';
import { IncompleteBanner } from '@/components/onboarding/IncompleteBanner';
import { tabBarVisible } from '@/store/tabBarStore';
import { lightImpact } from '@/lib/haptics';
import { useUserProfile } from '@/hooks/useUserProfile';
import { SubscriptionLoadingGuard } from '@/components/paywall/SubscriptionLoadingGuard';
import { PaywallScreen } from '@/components/paywall/PaywallScreen';

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
  // visual appearance only — hide/show is handled by AnimatedTabBar via translateY
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
  const animatedTabBarStyle = useAnimatedStyle(() => ({
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
        animatedTabBarStyle,
      ]}
      pointerEvents="box-none"
    >
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

// PaywallScreen mount-fade wrapper — Spec 96 §9 explicit: 200ms opacity fade
// in (no stagger — the loading guard already provided the anticipatory pause).
// pointerEvents="none" during the fade so a fast-tapping user can't fire the
// CTA before the screen is fully visible. We drive `interactive` from a
// `withTiming` completion callback (via runOnJS) rather than reading
// `opacity.value` on the JS thread — that read is not reactive to UI-thread
// animation progress and would leave pointerEvents stuck at 'none'.
function PaywallMount({ leadViewsCount }: { leadViewsCount: number }) {
  const opacity = useSharedValue(0);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    opacity.value = withTiming(
      1,
      { duration: 200, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(setInteractive)(true);
      },
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  return (
    <Animated.View style={[{ flex: 1 }, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <PaywallScreen leadViewsCount={leadViewsCount} />
    </Animated.View>
  );
}

export default function AppLayout() {
  // Hydrates filterStore + userProfileStore from server profile on every authenticated launch.
  // Must live here so it runs for all authenticated app screens (feed, map, settings, etc.)
  const { data: profile, isLoading } = useUserProfile();

  const unread = useNotificationStore((s) => s.unreadFlightBoard);
  const paywallDismissed = usePaywallStore((s) => s.dismissed);
  const clearPaywall = usePaywallStore((s) => s.clear);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Track previous status so we can fire the post-payment "expired → active"
  // cleanup exactly once per transition (clear paywall + invalidate ['leads']).
  const prevStatusRef = useRef<string | null | undefined>(undefined);

  // Foreground re-fetch: when the app comes back from the background, the
  // Stripe webhook may have already flipped the user's status. Invalidating
  // here is the primary access-restoration path (Spec 96 §6).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  // Sign-out fast path for cancelled_pending_deletion: the account is in the
  // 30-day deletion window and must NOT be shown any app content. Spec 96 §10
  // Step 2 explicit: signOut + redirect.
  useEffect(() => {
    if (profile?.subscription_status === 'cancelled_pending_deletion') {
      void useAuthStore.getState().signOut().then(() => {
        router.replace('/(auth)/sign-in');
      });
    }
  }, [profile?.subscription_status, router]);

  // Post-payment transition: webhook flipped 'expired' → 'active'. Clear the
  // paywall flags and invalidate the leads cache so the feed shows fresh data
  // on the next render. Guarded on prev !== current so it doesn't fire on
  // initial mount when prev is undefined and current is 'active'.
  useEffect(() => {
    const prev = prevStatusRef.current;
    const next = profile?.subscription_status;
    if (prev === 'expired' && next === 'active') {
      clearPaywall();
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
    prevStatusRef.current = next;
  }, [profile?.subscription_status, clearPaywall, queryClient]);

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

  // Loading guard: never flash the paywall while subscription_status is
  // unresolved. Covers initial fetch AND post-AppState invalidate refetch
  // (`isLoading` stays true during the second fetch only on error retries).
  if (isLoading || profile == null || profile.subscription_status == null) {
    return <SubscriptionLoadingGuard />;
  }

  // Deletion-confirmed accounts must not see app content while the sign-out
  // effect runs. Render the loading guard until the redirect lands.
  if (profile.subscription_status === 'cancelled_pending_deletion') {
    return <SubscriptionLoadingGuard />;
  }

  // Expired AND not dismissed → full paywall. Expired AND dismissed → fall
  // through to <Tabs>; the feed/flight-board screens render <InlineBlurBanner>
  // and blur their cards in that branch.
  if (profile.subscription_status === 'expired' && !paywallDismissed) {
    return <PaywallMount leadViewsCount={profile.lead_views_count ?? 0} />;
  }

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
