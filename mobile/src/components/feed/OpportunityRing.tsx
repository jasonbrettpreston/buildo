// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.1 OpportunityRing
// SVG circular progress ring rendering the opportunity_score pillar (0-100).
// Stroke color derives from score threshold per spec: >=80 amber, >=50 green, <50 zinc.
// Animates from 0 to filled on mount via Reanimated shared value.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Ring geometry from spec §4.1: 56×56 canvas, strokeWidth 4, radius 24
const SIZE = 56;
const STROKE_WIDTH = 4;
const RADIUS = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ≈ 150.8

interface Props {
  score: number; // 0–100
}

function ringColor(score: number): string {
  if (score >= 80) return '#f59e0b'; // amber-500
  if (score >= 50) return '#22c55e'; // green-500
  return '#52525b'; // zinc-600
}

export function OpportunityRing({ score }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = withTiming(Math.min(score / 100, 1), {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(progress);
  }, [score, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const color = ringColor(score);

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE}>
        {/* Track */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="#3f3f46"
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        {/* Progress arc — rotated -90° so it starts from the top */}
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation={-90}
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
    </View>
  );
}
