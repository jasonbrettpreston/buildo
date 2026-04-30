// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Main Flight Board View
// FlashList with temporal section headers (action_required → departing_soon → on_the_horizon).
// FAB launches SearchPermitsSheet. Swipe-to-remove with 3-second undo snackbar.
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, Pressable, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useNavigation } from 'expo-router';
import { useFlightBoard, FLIGHT_BOARD_QUERY_KEY } from '@/hooks/useFlightBoard';
import { useRemoveFromBoard } from '@/hooks/useRemoveFromBoard';
import { FlightCard } from '@/components/feed/FlightCard';
import { FlightCardSkeleton } from '@/components/feed/FlightCardSkeleton';
import { TemporalSectionHeader } from '@/components/feed/TemporalSectionHeader';
import { EmptyBoardState } from '@/components/feed/EmptyBoardState';
import { SearchPermitsSheet } from '@/components/feed/SearchPermitsSheet';
import { tabBarVisible, tabBarScrollY } from '@/store/tabBarStore';
import { mediumImpact } from '@/lib/haptics';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { InlineBlurBanner } from '@/components/paywall/InlineBlurBanner';
import { BlurredFeedPlaceholder } from '@/components/paywall/BlurredFeedPlaceholder';
import { usePaywallStore } from '@/store/paywallStore';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Search } from 'lucide-react-native';
import type { FlightBoardItem, FlightBoardResult } from '@/lib/schemas';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

type TemporalGroup = 'action_required' | 'departing_soon' | 'on_the_horizon';

type ListItem =
  | { type: 'header'; group: TemporalGroup; count: number }
  | { type: 'card'; item: FlightBoardItem; index: number };

const SKELETONS = Array.from({ length: 4 });

// Undo snackbar timeout in ms (spec 77 §4.1)
const UNDO_TIMEOUT_MS = 3000;

function buildListItems(data: FlightBoardItem[]): ListItem[] {
  const groups: TemporalGroup[] = ['action_required', 'departing_soon', 'on_the_horizon'];
  const result: ListItem[] = [];
  let cardIndex = 0;

  for (const group of groups) {
    const items = data.filter((d) => d.temporal_group === group);
    if (items.length === 0) continue;
    result.push({ type: 'header', group, count: items.length });
    for (const item of items) {
      result.push({ type: 'card', item, index: cardIndex++ });
    }
  }
  return result;
}

export default function FlightBoardScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const listRef = useRef<FlashListRef<ListItem>>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Undo snackbar state
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarText, setSnackbarText] = useState('');
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoSnapshotRef = useRef<FlightBoardResult | null>(null);
  const pendingRemoveRef = useRef<{ permitNum: string; revisionNum: string } | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useFlightBoard();
  const removeFromBoard = useRemoveFromBoard();

  // FAB press animation
  const fabScale = useSharedValue(1);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

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

  // Allow parent tab to call scrollToTop when re-tapping the active tab
  React.useEffect(() => {
    // SAFETY: 'tabPress' exists on tab navigators; this cast is required because
    // expo-router doesn't expose tab-specific event types on the base NavigationProp.
    const unsubscribe = navigation.addListener('tabPress' as never, () => {
      scrollToTop();
    });
    return unsubscribe;
  }, [navigation, scrollToTop]);

  // Extracted commit so unmount cleanup + double-swipe collision can both reuse it.
  // If called with the current pending ref, it fires the mutation immediately and
  // clears both refs — this prevents the data-loss scenario where cleanup clears
  // the timer and the delete is silently abandoned.
  const commitPendingRemove = useCallback(() => {
    const pending = pendingRemoveRef.current;
    const snapshot = undoSnapshotRef.current;
    pendingRemoveRef.current = null;
    undoSnapshotRef.current = null;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setSnackbarVisible(false);
    if (pending) {
      removeFromBoard.mutate(
        { permitNum: pending.permitNum, revisionNum: pending.revisionNum },
        {
          onError: () => {
            if (snapshot) {
              queryClient.setQueryData(FLIGHT_BOARD_QUERY_KEY, snapshot);
            }
          },
        },
      );
    }
  }, [queryClient, removeFromBoard]);

  // On unmount, fire any pending delete immediately — the alternative
  // (clearing the timer silently) would optimistically remove from cache AND
  // skip the server DELETE, creating data divergence (UI says gone, server
  // still has it) that would re-appear on next refresh.
  React.useEffect(() => {
    return () => {
      if (pendingRemoveRef.current) {
        commitPendingRemove();
      } else if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, [commitPendingRemove]);

  const handleRemove = useCallback(
    (item: FlightBoardItem) => {
      // Double-swipe collision policy: if another remove is pending, auto-commit
      // it immediately (matches Gmail UX) rather than silently dropping the second
      // swipe gesture while its red panel is visually open.
      if (pendingRemoveRef.current) {
        commitPendingRemove();
      }

      // Snapshot current data for undo
      const snapshot = queryClient.getQueryData<FlightBoardResult>(FLIGHT_BOARD_QUERY_KEY);
      undoSnapshotRef.current = snapshot ?? null;
      pendingRemoveRef.current = {
        permitNum: item.permit_num,
        revisionNum: item.revision_num,
      };

      // Optimistic remove
      queryClient.setQueryData<FlightBoardResult>(FLIGHT_BOARD_QUERY_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter(
            (d) =>
              !(d.permit_num === item.permit_num && d.revision_num === item.revision_num),
          ),
        };
      });

      // Show undo snackbar
      setSnackbarText('Job removed.');
      setSnackbarVisible(true);

      // Clear any existing timer
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

      undoTimerRef.current = setTimeout(() => {
        commitPendingRemove();
      }, UNDO_TIMEOUT_MS);
    },
    [queryClient, commitPendingRemove],
  );

  const handleUndo = useCallback(() => {
    // Cancel the deletion and restore
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (undoSnapshotRef.current) {
      queryClient.setQueryData(FLIGHT_BOARD_QUERY_KEY, undoSnapshotRef.current);
      undoSnapshotRef.current = null;
    }
    pendingRemoveRef.current = null;
    setSnackbarVisible(false);
  }, [queryClient]);

  const handleCardPress = useCallback(
    (item: FlightBoardItem) => {
      router.push(`/(app)/[flight-job]?id=${item.permit_num}--${item.revision_num}`);
    },
    [router],
  );

  const boardData = data?.data ?? [];
  // Memoize grouped list so FlashList keys/getItemType stay stable across
  // unrelated parent re-renders (haptic ticks, badge state, etc.).
  const listItems = useMemo(() => buildListItems(boardData), [boardData]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'header') {
        return <TemporalSectionHeader group={item.group} count={item.count} />;
      }
      return (
        <FlightCard
          item={item.item}
          index={item.index}
          onPress={handleCardPress}
          onRemove={handleRemove}
        />
      );
    },
    [handleCardPress, handleRemove],
  );

  const getItemType = useCallback((item: ListItem) => item.type, []);

  // Spec 96 §9 inline-blur: same gate as the lead feed. If the user dismissed
  // the paywall and is still 'expired', render banner + locked placeholders.
  const { data: profile } = useUserProfile();
  const paywallDismissed = usePaywallStore((s) => s.dismissed);
  if (paywallDismissed && profile?.subscription_status === 'expired') {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
        <View className="px-4 pt-4 pb-2 border-b border-zinc-800/50">
          <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
            Flight Board
          </Text>
        </View>
        <InlineBlurBanner />
        <BlurredFeedPlaceholder count={4} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
      {/* Screen header */}
      <View className="px-4 pt-4 pb-2 border-b border-zinc-800/50">
        <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
          Flight Board
        </Text>
      </View>

      <OfflineBanner />

      {isLoading ? (
        <View className="mt-2">
          {SKELETONS.map((_, i) => (
            <FlightCardSkeleton key={i} />
          ))}
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-zinc-500 text-sm font-mono">Failed to load board.</Text>
          <Pressable onPress={() => void refetch()} className="mt-3 active:opacity-70">
            <Text className="text-amber-400 font-mono text-sm">Retry →</Text>
          </Pressable>
        </View>
      ) : boardData.length === 0 ? (
        <EmptyBoardState
          onNavigateFeed={() => router.push('/(app)/')}
        />
      ) : (
        <AnimatedFlashList
          ref={listRef as React.Ref<FlashListRef<ListItem>>}
          data={listItems}
          keyExtractor={(item, index) =>
            item.type === 'header'
              ? `header-${item.group}`
              : `card-${item.item.permit_num}-${item.item.revision_num}-${index}`
          }
          renderItem={renderItem}
          getItemType={getItemType}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                // If an undo window is active, a refetch would re-hydrate the
                // "just-removed" card from the server and produce a confusing
                // ghost state. Commit the pending delete first, then refresh.
                if (pendingRemoveRef.current) {
                  commitPendingRemove();
                }
                mediumImpact();
                void refetch();
              }}
              tintColor="#f59e0b"
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* FAB — search/claim */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 24,
            right: 16,
          },
          fabStyle,
        ]}
      >
        <Pressable
          onPressIn={() => {
            fabScale.value = withSpring(0.92, { stiffness: 400, damping: 20 });
          }}
          onPressOut={() => {
            fabScale.value = withSpring(1.0, { stiffness: 400, damping: 20 });
          }}
          onPress={() => setSearchOpen(true)}
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            backgroundColor: '#f59e0b',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: 'rgba(245,158,11,0.25)',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 1,
            shadowRadius: 8,
            elevation: 8,
          }}
          accessibilityLabel="Search for a job"
          accessibilityRole="button"
        >
          <Search size={24} color="#18181b" strokeWidth={2.5} />
        </Pressable>
      </Animated.View>

      {/* Undo snackbar */}
      {snackbarVisible && (
        <View
          style={{
            position: 'absolute',
            bottom: 96,
            left: 16,
            right: 16,
          }}
        >
          <View className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex-row justify-between items-center">
            <Text className="text-zinc-300 text-sm">{snackbarText}</Text>
            <Pressable
              onPress={handleUndo}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="active:opacity-70"
            >
              <Text className="text-amber-400 font-mono text-sm">UNDO</Text>
            </Pressable>
          </View>
        </View>
      )}

      <SearchPermitsSheet visible={searchOpen} onClose={() => setSearchOpen(false)} />
    </SafeAreaView>
  );
}
