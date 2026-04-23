// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §6.4
// Reanimated pulse skeleton matching FlightCard dimensions.
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

export function FlightCardSkeleton() {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1.0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={animStyle}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mx-4 mb-3"
    >
      {/* Address + date row */}
      <View className="flex-row items-start justify-between">
        <View className="bg-zinc-800 rounded h-4 flex-1 mr-16" />
        <View className="bg-zinc-800 rounded h-4 w-14" />
      </View>
      {/* Permit row */}
      <View className="flex-row items-center justify-between mt-2">
        <View className="bg-zinc-800 rounded h-3 w-32" />
        <View className="bg-zinc-800 rounded h-3 w-20" />
      </View>
      {/* Badge row */}
      <View className="flex-row gap-2 mt-3">
        <View className="bg-zinc-800 rounded-md h-5 w-20" />
        <View className="bg-zinc-800 rounded-md h-5 w-16" />
      </View>
    </Animated.View>
  );
}
