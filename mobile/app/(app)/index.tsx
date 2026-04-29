// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3 Behavioral Contract
// Lead Feed screen — FlashList infinite scroll, FilterTriggerRow header,
// tab bar hide-on-scroll, scroll-to-top on active tab re-tap.
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { useLeadFeed } from '@/hooks/useLeadFeed';
import { useLocation } from '@/hooks/useLocation';
import { useSaveLead } from '@/hooks/useSaveLead';
import { useFilterStore } from '@/store/filterStore';
import { useAuthStore } from '@/store/authStore';
import { tabBarVisible, tabBarScrollY } from '@/store/tabBarStore';
import { LeadCard } from '@/components/feed/LeadCard';
import { LeadCardSkeleton } from '@/components/feed/LeadCardSkeleton';
import { EmptyFeedState } from '@/components/feed/EmptyFeedState';
import { FilterTriggerRow } from '@/components/feed/FilterTriggerRow';
import { LeadFilterSheet } from '@/components/feed/LeadFilterSheet';
import { mediumImpact } from '@/lib/haptics';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import type { PermitLeadFeedItem } from '@/lib/schemas';
import type { LeadFeedItem } from '@/lib/schemas';
import { useRouter, useNavigation } from 'expo-router';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

// Spec §4.4: render 6 skeletons on initial load to eliminate layout shift.
const SKELETONS = Array.from({ length: 6 });

export default function LeadFeedScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { coords, loading: locationLoading } = useLocation();
  // Per-field selectors — full-store subscription would re-render on every
  // filter change including fields this screen doesn't read (homeBaseLocation).
  const radiusKm = useFilterStore((s) => s.radiusKm);
  const tradeSlug = useFilterStore((s) => s.tradeSlug);
  const setRadiusKm = useFilterStore((s) => s.setRadiusKm);
  // Gate on idToken: prevents queries firing before Firebase Auth resolves on cold boot.
  const idToken = useAuthStore((s) => s.idToken);
  const { mutate: saveLead } = useSaveLead();
  const [filterOpen, setFilterOpen] = useState(false);
  const listRef = useRef<FlashListRef<LeadFeedItem>>(null);

  const feedParams =
    coords && tradeSlug && idToken
      ? { lat: coords.lat, lng: coords.lng, tradeSlug, radiusKm }
      : null;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
    isError,
  } = useLeadFeed(feedParams);

  // Memoize the flattened list so infinite-scroll pages don't recompute on every
  // render (handleSaveToggle/handleCardPress deps would churn otherwise).
  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const handleScroll = useAnimatedScrollHandler((event) => {
    const y = event.contentOffset.y;
    const delta = y - tabBarScrollY.value;
    tabBarScrollY.value = y;
    if (y <= 0) {
      tabBarVisible.value = 1;
    } else if (delta > 5) {
      tabBarVisible.value = -1;
    } else if (delta < -5) {
      tabBarVisible.value = 1;
    }
  });

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToTop({ animated: true });
    tabBarVisible.value = 1;
  }, []);

  // Spec §2: tapping the already-active Feed tab scrolls back to top (Apple HIG standard).
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress' as never, () => {
      scrollToTop();
    });
    return unsubscribe;
  }, [navigation, scrollToTop]);

  // Stable across mutations: renderLeadItem already guards lead_type==='permit',
  // so the leadType arg is known. Eliminates the allItems dep that was causing
  // every save mutation to invalidate all FlashList cell props.
  const handleSaveToggle = useCallback(
    (leadId: string, saved: boolean) => {
      saveLead({ leadId, leadType: 'permit', saved });
    },
    [saveLead],
  );

  const handleCardPress = useCallback(
    (item: PermitLeadFeedItem) => {
      router.push(`/(app)/[lead]?id=${item.lead_id}`);
    },
    [router],
  );

  // Spec 90 §5 anti-pattern: FlashList renderItem must be stable, not inline.
  const renderLeadItem = useCallback(
    ({ item, index }: { item: LeadFeedItem; index: number }) => {
      if (item.lead_type !== 'permit') return null;
      return (
        <LeadCard
          item={item as PermitLeadFeedItem}
          index={index}
          onPress={handleCardPress}
          onSaveToggle={handleSaveToggle}
        />
      );
    },
    [handleCardPress, handleSaveToggle],
  );

  const keyExtractor = useCallback((item: LeadFeedItem) => item.lead_id, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleWidenRadius = useCallback(() => {
    setRadiusKm(Math.min(radiusKm * 2, 50));
  }, [radiusKm, setRadiusKm]);

  const handleRefetch = useCallback(() => {
    mediumImpact();
    void refetch();
  }, [refetch]);

  const handleOpenFilter = useCallback(() => setFilterOpen(true), []);

  if (locationLoading) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950">
        <View className="px-4 pt-4 pb-2">
          <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
            Lead Feed
          </Text>
        </View>
        {SKELETONS.map((_, i) => (
          <LeadCardSkeleton key={i} />
        ))}
      </SafeAreaView>
    );
  }

  if (!coords) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950">
        <EmptyFeedState reason="no_results" onWidenRadius={() => setRadiusKm(Math.min(radiusKm * 2, 50))} />
      </SafeAreaView>
    );
  }

  const activeFilterCount = radiusKm !== 10 ? 1 : 0;

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
      {/* Screen header */}
      <View className="px-4 pt-4 pb-2 border-b border-zinc-800/50">
        <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
          Lead Feed
        </Text>
      </View>

      <OfflineBanner />

      <AnimatedFlashList
        ref={listRef as React.Ref<FlashListRef<LeadFeedItem>>}
        data={isLoading ? [] : allItems}
        keyExtractor={keyExtractor}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <FilterTriggerRow
            activeFilterCount={activeFilterCount}
            onOpen={handleOpenFilter}
          />
        }
        renderItem={renderLeadItem}
        ListEmptyComponent={
          isLoading ? (
            <View className="mt-2">
              {SKELETONS.map((_, i) => (
                <LeadCardSkeleton key={i} />
              ))}
            </View>
          ) : isError ? (
            <EmptyFeedState reason="unreachable" onRetry={handleRefetch} />
          ) : (
            <EmptyFeedState reason="no_results" onWidenRadius={handleWidenRadius} />
          )
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefetch}
            tintColor="#f59e0b"
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <LeadFilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} />
    </SafeAreaView>
  );
}
