// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §9 Loading Guard
//
// Full-screen loading state shown while subscription_status is null/undefined
// (initial fetch in progress or refetch after AppState resume). Critical that
// the paywall NEVER flashes during this window — see spec §9 "Loading Guard"
// for the rule. Matches the boot-spinner pattern from Spec 93 so the
// transition into the gate feels part of the same loading sequence.

import { View, ActivityIndicator } from 'react-native';

export function SubscriptionLoadingGuard() {
  return (
    <View className="flex-1 items-center justify-center bg-zinc-950">
      <ActivityIndicator size="large" color="#f59e0b" />
    </View>
  );
}
