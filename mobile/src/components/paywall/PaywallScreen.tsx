// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §9 PaywallScreen Layout
//             docs/specs/03-mobile/96_mobile_subscription.md §10 Step 1
//
// The full-screen paywall shown when subscription_status = 'expired'.
// Stagger animation (5 sequential withDelay/withTiming) creates the
// anticipatory rhythm called for in spec §9. The 60-second Refresh
// link is the user's self-recovery path for webhook delays (§9
// Webhook Delay Refresh).

import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Lock } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { usePaywallStore } from '@/store/paywallStore';
import { useSubscribeCheckout } from '@/hooks/useSubscribeCheckout';
import { successNotification } from '@/lib/haptics';

interface Props {
  /** lead_views_count from user_profiles. Zero is rendered as a different copy block (spec §Step 1). */
  leadViewsCount: number;
}

const REVEAL_REFRESH_AFTER_MS = 60_000;

// Apple App Store Guideline 3.1.1 risk on the explicit "buildo.com" CTA copy
// is documented in spec §5 — the env flag is the future-build escape hatch
// without requiring a code change.
const CTA_NEUTRAL = process.env.EXPO_PUBLIC_PAYWALL_CTA_NEUTRAL === '1';

export function PaywallScreen({ leadViewsCount }: Props) {
  const dismiss = usePaywallStore((s) => s.dismiss);
  const queryClient = useQueryClient();
  const { openCheckout, isLoading: isCheckoutLoading } = useSubscribeCheckout();

  const [showRefresh, setShowRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNoChange, setRefreshNoChange] = useState(false);

  const iconOpacity = useSharedValue(0);
  const headlineOpacity = useSharedValue(0);
  const countOpacity = useSharedValue(0);
  const ctaOpacity = useSharedValue(0);
  const secondaryOpacity = useSharedValue(0);
  const refreshOpacity = useSharedValue(0);

  useEffect(() => {
    const config = { duration: 300, easing: Easing.out(Easing.ease) };
    iconOpacity.value = withDelay(0, withTiming(1, config));
    headlineOpacity.value = withDelay(80, withTiming(1, config));
    countOpacity.value = withDelay(160, withTiming(1, config));
    ctaOpacity.value = withDelay(240, withTiming(1, config));
    secondaryOpacity.value = withDelay(320, withTiming(1, config));
  }, [iconOpacity, headlineOpacity, countOpacity, ctaOpacity, secondaryOpacity]);

  // Reveal the "Refresh status" link after 60s without a status change.
  // The cleanup is required so a setState doesn't fire on an unmounted
  // component if the user pays and the paywall closes before the timer.
  useEffect(() => {
    const t = setTimeout(() => setShowRefresh(true), REVEAL_REFRESH_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (showRefresh) {
      refreshOpacity.value = withTiming(1, { duration: 400 });
    }
  }, [showRefresh, refreshOpacity]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ translateY: interpolate(iconOpacity.value, [0, 1], [12, 0]) }],
  }));
  const headlineStyle = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ translateY: interpolate(headlineOpacity.value, [0, 1], [12, 0]) }],
  }));
  const countStyle = useAnimatedStyle(() => ({
    opacity: countOpacity.value,
    transform: [{ translateY: interpolate(countOpacity.value, [0, 1], [12, 0]) }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: interpolate(ctaOpacity.value, [0, 1], [8, 0]) }],
  }));
  // Secondary is opacity-only per spec §9 table.
  const secondaryStyle = useAnimatedStyle(() => ({ opacity: secondaryOpacity.value }));
  const refreshStyle = useAnimatedStyle(() => ({ opacity: refreshOpacity.value }));

  const handlePrimary = async () => {
    successNotification();
    await openCheckout();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshNoChange(false);
    await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    // The gate listens to the query result — if status flipped to 'active',
    // <PaywallScreen> unmounts before this state update lands. Otherwise we
    // show the "still expired" hint to guide the user back to buildo.com.
    setIsRefreshing(false);
    setRefreshNoChange(true);
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <View className="flex-1 items-center justify-center px-8">
        <Animated.View style={iconStyle} className="mb-8 items-center">
          <Lock size={32} color="#f59e0b" strokeWidth={2.5} />
        </Animated.View>

        <Animated.Text
          accessibilityRole="header"
          style={headlineStyle}
          className="mb-2 text-center text-2xl font-bold text-zinc-100"
        >
          Your free trial has ended.
        </Animated.Text>

        {leadViewsCount > 0 ? (
          <Animated.View style={countStyle}>
            <Text className="text-center font-mono text-4xl font-bold text-amber-400">
              {leadViewsCount} leads
            </Text>
            <Text className="mb-10 mt-2 text-center text-sm text-zinc-500">
              viewed in your 14-day trial
            </Text>
          </Animated.View>
        ) : (
          <Animated.Text style={countStyle} className="mb-8 text-center text-sm text-zinc-400">
            Explore real leads in your area.
          </Animated.Text>
        )}

        <Animated.View style={ctaStyle} className="w-full">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue subscription at buildo.com"
            disabled={isCheckoutLoading}
            onPress={handlePrimary}
            className="mb-3 w-full items-center justify-center rounded-2xl bg-amber-500 py-4 px-8 active:bg-amber-600"
            style={{ minHeight: 44 }}
          >
            {isCheckoutLoading ? (
              <ActivityIndicator size="small" color="#18181b" />
            ) : (
              <Text className="text-base font-bold text-zinc-950">
                {CTA_NEUTRAL ? 'Learn more →' : 'Continue at buildo.com →'}
              </Text>
            )}
          </Pressable>
        </Animated.View>

        <Animated.View style={secondaryStyle}>
          <Pressable
            onPress={dismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss paywall and browse with locked content"
          >
            <Text className="mt-4 text-center text-sm text-zinc-500">Maybe later</Text>
          </Pressable>
        </Animated.View>

        {showRefresh && (
          <Animated.View style={refreshStyle} className="mt-2">
            <Pressable
              onPress={handleRefresh}
              disabled={isRefreshing}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Refresh subscription status"
              className="flex-row items-center justify-center"
            >
              <Text className="text-center text-xs text-zinc-600">
                Already paid? Refresh status
              </Text>
              {isRefreshing && (
                <ActivityIndicator size="small" color="#71717a" style={{ marginLeft: 8 }} />
              )}
            </Pressable>
            {refreshNoChange && !isRefreshing && (
              <Text className="mt-2 text-center text-xs text-zinc-500">
                Still showing trial ended — please check buildo.com.
              </Text>
            )}
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}
