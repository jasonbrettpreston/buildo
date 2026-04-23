// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.1 OpportunityRing
// SVG circular progress ring rendering the opportunity_score pillar (0-100).
// Stroke color derives from score threshold per spec: >=80 amber, >=50 green, <50 zinc.
// Animates from 0 to filled on mount via Reanimated shared value.
// Score text rendered in the center so the ring is readable by users who can't
// discriminate the stroke color (colorblind / low-vision); also powers the
// accessibilityLabel for VoiceOver / TalkBack.
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
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
  if (score >= 80) return '#f59e0b'; // amber-500 — Hot
  if (score >= 50) return '#22c55e'; // green-500 — Warm
  return '#71717a';                   // zinc-500 — Cold (spec §4.1)
}

export function OpportunityRing({ score }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    // 350ms fill per spec §4.1 — the "gauge powering up" feel depends on this timing.
    progress.value = withTiming(Math.min(score / 100, 1), {
      duration: 350,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(progress);
  }, [score, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const color = ringColor(score);
  const displayScore = Math.round(Math.max(0, Math.min(100, score)));

  return (
    <View
      style={{ width: SIZE, height: SIZE }}
      accessibilityRole="image"
      accessibilityLabel={`Opportunity score ${displayScore} out of 100`}
    >
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
      {/* Centered score label — absolutely positioned so it overlays the SVG.
          Redundant visual channel alongside the stroke color (WCAG 1.4.1). */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: SIZE,
          height: SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Spec §4.1: text-xs text-zinc-200. Neutral high-contrast color so the
            number stays readable across all three ring colors (incl. cold zinc). */}
        <Text className="font-mono text-xs text-zinc-200">
          {displayScore}
        </Text>
      </View>
    </View>
  );
}
