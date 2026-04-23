// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Empty States
// Three distinct empty states: no_results, offline, unreachable.
// No_results → widen radius CTA. Offline → cached data message. Unreachable → retry.
//
// Ambient blueprint SVG (8 dashed lines + 2 hatch accents, ≤20% opacity) sits
// behind the text — thematic parity with EmptyBoardState's radar, providing a
// construction-site visual anchor without pulling focus from the CTA. Non-
// animated so it has zero battery impact (EmptyBoardState's radar is the only
// animated empty state in the app).
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

type EmptyReason = 'no_results' | 'offline' | 'unreachable';

interface Props {
  reason: EmptyReason;
  onWidenRadius?: () => void;
  onRetry?: () => void;
}

const COPY: Record<EmptyReason, { title: string; body: string; cta: string }> = {
  no_results: {
    title: 'No leads in range',
    body: 'No permits match your trade in this area.',
    cta: 'Widen Radius →',
  },
  offline: {
    title: 'Offline',
    body: "You're offline. Showing cached leads.",
    cta: '',
  },
  unreachable: {
    title: "Can't reach server",
    body: 'Check your connection and try again.',
    cta: 'Retry →',
  },
};

// 200×200 canvas: 8 horizontal + 4 vertical dashed "blueprint" lines at ≤20%
// opacity, plus a diagonal hatch accent in amber (≤15% opacity) suggesting
// construction survey marks. All stroke widths 1, all dasharray "4 6".
function BlueprintGrid() {
  return (
    <Svg width={200} height={200} viewBox="0 0 200 200">
      {/* Horizontal blueprint lines — slightly heavier at mid-band (eye focus zone) */}
      <Line x1={10} y1={25} x2={190} y2={25} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 6" opacity={0.15} />
      <Line x1={10} y1={55} x2={190} y2={55} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 6" opacity={0.18} />
      <Line x1={10} y1={85} x2={190} y2={85} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 6" opacity={0.2} />
      <Line x1={10} y1={115} x2={190} y2={115} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 6" opacity={0.2} />
      <Line x1={10} y1={145} x2={190} y2={145} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 6" opacity={0.18} />
      <Line x1={10} y1={175} x2={190} y2={175} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 6" opacity={0.15} />
      {/* Vertical blueprint lines */}
      <Line x1={50} y1={10} x2={50} y2={190} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 6" opacity={0.15} />
      <Line x1={100} y1={10} x2={100} y2={190} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 6" opacity={0.2} />
      <Line x1={150} y1={10} x2={150} y2={190} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 6" opacity={0.15} />
      {/* Amber survey-mark accent (a single corner bracket suggesting a permit boundary) */}
      <Path
        d="M 70 75 L 70 95 L 90 95"
        stroke="#f59e0b"
        strokeWidth={1.5}
        fill="none"
        opacity={0.15}
      />
      <Path
        d="M 130 105 L 130 125 L 110 125"
        stroke="#f59e0b"
        strokeWidth={1.5}
        fill="none"
        opacity={0.15}
      />
    </Svg>
  );
}

export function EmptyFeedState({ reason, onWidenRadius, onRetry }: Props) {
  const { title, body, cta } = COPY[reason];

  const handleCta = reason === 'no_results' ? onWidenRadius : onRetry;

  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      {/* Ambient blueprint — fixed 200×200 so positioning is predictable.
          Absolutely positioned behind the text so it becomes visual anchor,
          not a separate element competing for attention. Hidden from screen
          readers (decorative only — the empty-state copy is the a11y content). */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        <BlueprintGrid />
      </View>

      <Text className="font-mono text-zinc-400 text-xs uppercase tracking-widest mb-3">
        {title}
      </Text>
      <Text className="text-zinc-500 text-sm text-center mb-6">{body}</Text>
      {cta && handleCta ? (
        <Pressable
          onPress={handleCta}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={cta.replace(' →', '')}
        >
          <Text className="font-mono text-amber-400 text-sm">{cta}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
