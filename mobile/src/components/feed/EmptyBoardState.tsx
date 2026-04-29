// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §4.2 Empty Board (Radar State)
// Ambient radar SVG: 3 concentric circles, crosshair, animated sweep arm.
// All elements ≤30% opacity — texture, not illustration.
import React, { useEffect } from 'react';
import { View, Text, Pressable, AppState } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

interface Props {
  onNavigateFeed: () => void;
}

function startSweep(rotation: SharedValue<number>, reset: boolean) {
  // Only reset on initial mount — on AppState resume, continue from the
  // current angle to avoid a visible jump back to 12 o'clock.
  if (reset) rotation.value = 0;
  rotation.value = withRepeat(
    withTiming(360, { duration: 4000, easing: Easing.linear }),
    -1,
    false,
  );
}

export function EmptyBoardState({ onNavigateFeed }: Props) {
  const rotation = useSharedValue(0);

  // Radar sweep runs while the app is foregrounded; pause on background to save battery
  // (was running in perpetuity previously, draining power while the device was asleep).
  useEffect(() => {
    startSweep(rotation, true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        startSweep(rotation, false);
      } else {
        cancelAnimation(rotation);
      }
    });
    return () => {
      cancelAnimation(rotation);
      sub.remove();
    };
  }, [rotation]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View className="flex-1 items-center justify-center px-8">
      {/* Radar canvas */}
      <View style={{ width: 200, height: 200 }}>
        <Svg width={200} height={200} viewBox="0 0 200 200">
          {/* Outer ring */}
          <Circle cx={100} cy={100} r={100} stroke="#3f3f46" strokeWidth={1} fill="none" opacity={0.15} />
          {/* Mid ring */}
          <Circle cx={100} cy={100} r={65} stroke="#3f3f46" strokeWidth={1} fill="none" opacity={0.25} />
          {/* Inner ring */}
          <Circle cx={100} cy={100} r={30} stroke="#3f3f46" strokeWidth={1} fill="none" opacity={0.4} />
          {/* Crosshair horizontal */}
          <Line x1={0} y1={100} x2={200} y2={100} stroke="#3f3f46" strokeWidth={1} opacity={0.2} strokeDasharray="4 4" />
          {/* Crosshair vertical */}
          <Line x1={100} y1={0} x2={100} y2={200} stroke="#3f3f46" strokeWidth={1} opacity={0.2} strokeDasharray="4 4" />
          {/* Centre dot — ambient texture per spec 77 §4.2 ≤30% opacity cap. */}
          <Circle cx={100} cy={100} r={4} fill="#71717a" opacity={0.3} />
        </Svg>
        {/* Sweep arm — animated separately via Reanimated */}
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, width: 200, height: 200 },
            sweepStyle,
          ]}
        >
          <Svg width={200} height={200} viewBox="0 0 200 200">
            <Line
              x1={100} y1={100}
              x2={100} y2={0}
              stroke="#f59e0b"
              strokeWidth={2}
              opacity={0.5}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
      </View>

      <Text className="text-zinc-500 text-sm text-center mt-6">
        No jobs tracked yet.
      </Text>
      <Pressable onPress={onNavigateFeed} className="mt-3 active:opacity-70" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text className="font-mono text-amber-400 text-sm">
          Find Jobs on the Lead Feed →
        </Text>
      </Pressable>
    </View>
  );
}
