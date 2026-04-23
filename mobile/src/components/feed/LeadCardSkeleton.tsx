// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.4 LeadCardSkeleton
// Reanimated pulse skeleton — NOT NativeWind animate-pulse (CSS-only, doesn't
// work in RN). Opacity oscillates 0.4 → 1.0 with withRepeat so the shimmer
// is buttery smooth at 60fps.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

function Bone({ className }: { className: string }) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1.0, { duration: 750, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={style} className={`bg-zinc-800 ${className}`} />;
}

export function LeadCardSkeleton() {
  return (
    <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mx-4 mb-3">
      {/* Header row */}
      <View className="flex-row items-start justify-between mb-2">
        <Bone className="h-4 rounded w-2/3" />
        <Bone className="h-4 rounded w-1/5" />
      </View>
      {/* Sub row */}
      <Bone className="h-3 rounded w-1/2 mb-3" />
      {/* Divider */}
      <View className="border-b border-zinc-800 mb-3" />
      {/* Badge row */}
      <View className="flex-row items-center gap-2">
        <Bone className="h-5 rounded-full w-20" />
        <Bone className="h-5 rounded-full w-16" />
      </View>
    </View>
  );
}
