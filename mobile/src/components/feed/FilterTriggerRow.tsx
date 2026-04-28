// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.2 Filter Sheet
// Always-visible sticky header row rendered as ListHeaderComponent of FlashList.
// Shows active filter count badge so the user can see what's applied at a glance.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { lightImpact } from '@/lib/haptics';

interface Props {
  activeFilterCount: number;
  onOpen: () => void;
}

export function FilterTriggerRow({ activeFilterCount, onOpen }: Props) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-zinc-800/50">
      <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
        Filters
      </Text>
      <Pressable
        onPress={() => {
          lightImpact();
          onOpen();
        }}
        className="flex-row items-center gap-1.5 bg-zinc-800 rounded-lg px-3 py-1.5 active:bg-zinc-700"
        accessibilityLabel="Open filters"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text className="text-zinc-400 text-xs">⚙</Text>
        {activeFilterCount > 0 ? (
          <View className="bg-amber-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
            <Text className="font-mono text-zinc-950 text-xs font-bold">
              {activeFilterCount}
            </Text>
          </View>
        ) : (
          <Text className="font-mono text-xs text-zinc-400">All</Text>
        )}
      </Pressable>
    </View>
  );
}
