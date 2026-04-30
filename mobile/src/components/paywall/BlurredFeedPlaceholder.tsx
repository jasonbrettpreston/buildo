// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §9 Inline Blur State
//
// When the user has dismissed the full paywall and subscription_status is
// 'expired', the feed and flight-board tabs render this component instead of
// fetching real leads. We do NOT issue the /api/leads/feed request in this
// state — the user has no entitlement to the data, the cards would be
// illegible anyway, and skipping the request saves the round-trip.
//
// Spec §9 "Empty feel prevention": render at minimum 4 blurred card
// placeholders so the screen doesn't look broken. We use 6 for the feed
// shape and 4 for the flight-board to roughly match the populated layout.

import { View, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

interface Props {
  /** Number of skeleton cards to render. Defaults to 6 (feed shape). */
  count?: number;
}

const isLegacyAndroid = Platform.OS === 'android' && Platform.Version < 31;

export function BlurredFeedPlaceholder({ count = 6 }: Props) {
  return (
    <View className="px-4 pt-2">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="mb-3">
          <View
            className="bg-zinc-900 rounded-2xl"
            // NativeWind v4 may not JIT-compile arbitrary opacity-[0.15]; use
            // inline style for this value (spec §9 explicit).
            style={{ height: 112, width: '100%', opacity: 0.15 }}
          />
          {/* Absolute-positioned blur sibling over the placeholder. On Android
              API < 31, expo-blur silently no-ops, so we render a translucent
              dark overlay to achieve the "locked" feel without the blur. */}
          {isLegacyAndroid ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: 'rgba(9,9,11,0.85)', borderRadius: 16 },
              ]}
              pointerEvents="none"
            />
          ) : (
            <BlurView
              intensity={8}
              tint="dark"
              style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
              pointerEvents="none"
            />
          )}
        </View>
      ))}
    </View>
  );
}
