// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.1 LeadCard
// Full Industrial Utilitarian permit lead card. Displays all scoring pillars,
// lifecycle phase, cost tier, competition count, and target_window badge.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { OpportunityRing } from './OpportunityRing';
import { SaveButton } from '@/components/shared/SaveButton';
import type { PermitLeadFeedItem } from '@/lib/schemas';

const COST_TIER_LABEL: Record<string, string> = {
  small: '$',
  medium: '$$',
  large: '$$$',
  major: '$$$$',
  mega: '$$$$$',
};

interface Props {
  item: PermitLeadFeedItem;
  index: number;
  onPress: (item: PermitLeadFeedItem) => void;
  onSaveToggle: (leadId: string, saved: boolean) => void;
}

// React.memo bailout so unchanged card props (stable handlers + same item
// identity from TanStack Query cache) skip the reconcile pass. Critical for
// 60fps FlashList scrolling with 50+ rendered cells.
function LeadCardInner({ item, index, onPress, onSaveToggle }: Props) {
  const address = [item.street_num, item.street_name].filter(Boolean).join(' ');
  const distanceLabel =
    item.distance_m < 1000
      ? `${Math.round(item.distance_m)}m`
      : `${(item.distance_m / 1000).toFixed(1)}km`;

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        testID={`lead-card-${index}`}
        onPress={() => onPress(item)}
        onPressIn={() => { scale.value = withSpring(0.97, { stiffness: 400, damping: 20, mass: 1 }); }}
        onPressOut={() => { scale.value = withSpring(1.0, { stiffness: 400, damping: 20, mass: 1 }); }}
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mx-4 mb-3 min-h-[44px] active:bg-zinc-800/70"
      >
        {/* Top row: address + ring */}
        <View className="flex-row items-start gap-3">
          <View className="flex-1">
            {address ? (
              <Text className="text-zinc-100 font-semibold text-base" numberOfLines={1}>
                {address}
              </Text>
            ) : null}
            <Text className="font-mono text-zinc-400 text-xs tracking-wider mt-0.5">
              {item.permit_num}
            </Text>
          </View>
          <OpportunityRing score={item.opportunity_score} />
        </View>

        {/* Divider */}
        <View className="border-b border-zinc-800 my-3" />

        {/* Score pills row */}
        <View className="flex-row flex-wrap gap-2 mb-3">
          {/* Timing badge — spec 91 §4.1 rounded-md for status/category pills */}
          <View className="bg-zinc-800 rounded-md px-3 py-1">
            <Text className="text-xs text-zinc-300">
              {item.timing_display}
            </Text>
          </View>

          {/* Target window badge */}
          {item.target_window === 'work' ? (
            <View className="bg-red-500/20 border border-red-500/40 rounded-md px-3 py-1">
              <Text className="text-xs text-red-400">🚨 Rescue Mission</Text>
            </View>
          ) : (
            <View className="bg-amber-500/20 border border-amber-500/40 rounded-md px-3 py-1">
              <Text className="text-xs text-amber-400">💎 Early Bid</Text>
            </View>
          )}

          {/* Cost tier — font-mono appropriate here (currency data value) */}
          {item.cost_tier ? (
            <View className="bg-zinc-800 rounded-md px-3 py-1">
              <Text className="font-mono text-xs text-zinc-300">
                {COST_TIER_LABEL[item.cost_tier] ?? item.cost_tier}
              </Text>
            </View>
          ) : null}

          {/* Competition count pill */}
          {item.competition_count > 0 ? (
            <View className="bg-zinc-800 rounded-md px-3 py-1">
              <Text className="text-xs text-zinc-400">{item.competition_count} watching</Text>
            </View>
          ) : null}
        </View>

        {/* Bottom row: neighbourhood + distance + save */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2 flex-1">
            {item.neighbourhood_name ? (
              <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                {item.neighbourhood_name}
              </Text>
            ) : null}
            <Text className="text-zinc-600 text-xs font-mono">{distanceLabel}</Text>
          </View>
          <SaveButton
            leadId={item.lead_id}
            isSaved={item.is_saved}
            onToggle={onSaveToggle}
            testID={`save-button-${index}`}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const LeadCard = React.memo(LeadCardInner);
