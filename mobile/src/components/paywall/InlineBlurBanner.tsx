// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §9 Inline Blur State
//
// Pinned-top banner shown at the top of the feed and flight-board tabs when
// `paywallStore.dismissed = true && subscription_status = 'expired'`. Tapping
// anywhere on the row reopens the full paywall. Shared between feed and
// flight-board so the dismiss/reopen UX is identical on both tabs.

import { View, Text, Pressable } from 'react-native';
import { usePaywallStore } from '@/store/paywallStore';

export function InlineBlurBanner() {
  const show = usePaywallStore((s) => s.show);
  return (
    <Pressable
      onPress={show}
      accessibilityRole="button"
      accessibilityLabel="Trial ended — tap to subscribe"
      className="flex-row items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-4 py-3"
      style={{ minHeight: 44 }}
    >
      <Text className="flex-1 text-sm text-zinc-300">
        Trial ended — subscribe to see new leads.
      </Text>
      <View className="rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1">
        <Text className="text-xs font-semibold text-amber-400">Subscribe →</Text>
      </View>
    </Pressable>
  );
}
