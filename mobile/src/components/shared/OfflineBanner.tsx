// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §Phase7
// Animated top banner shown when the device has no network connectivity.
// Renders inline (pushes content down) and animates via Reanimated height+opacity
// so the layout transition is smooth rather than a jarring jump.
// Shows only on Feed and Flight Board screens per spec — do NOT use on Map or Settings.
import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useNetInfo } from '@react-native-community/netinfo';

const BANNER_HEIGHT = 36;
const TIMING = { duration: 250, easing: Easing.inOut(Easing.ease) };

export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const offline = isConnected === false;

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    height.value = withTiming(offline ? BANNER_HEIGHT : 0, TIMING);
    opacity.value = withTiming(offline ? 1 : 0, TIMING);
  }, [offline, height, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: 'hidden',
  }));

  return (
    <Animated.View style={animStyle}>
      <View
        style={{ height: BANNER_HEIGHT }}
        className="bg-zinc-800 border-b border-amber-500/30 flex-row items-center justify-center px-4"
      >
        <Text className="text-amber-400 text-xs font-mono tracking-wider">
          Offline mode · Showing cached data
        </Text>
      </View>
    </Animated.View>
  );
}
