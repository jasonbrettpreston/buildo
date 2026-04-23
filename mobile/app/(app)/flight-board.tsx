// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Main Flight Board View
// FlashList with temporal section headers (action_required → departing_soon → on_the_horizon).
// FAB launches SearchPermitsSheet. Swipe-to-remove with 3-second undo snackbar.
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
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
import { heavyImpact, mediumImpact } from '@/lib/haptics';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import type { FlightBoardItem, FlightBoardResult } from '@/lib/schemas';

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

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = event.nativeEvent.contentOffset.y;
    const delta = y - tabBarScrollY.value;
    tabBarScrollY.value = y;
    if (y <= 0) {
      tabBarVisible.value = 1;
    } else if (delta > 5) {
      tabBarVisible.value = -1;
    } else if (delta < -5) {
      tabBarVisible.value = 1;
    }
  }, []);

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

  // Clear the undo timer on unmount so the deferred DELETE mutation can't fire on a
  // dead component (e.g., if the user navigates away mid-undo window).
  React.useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, []);

  const handleRemove = useCallback(
    (item: FlightBoardItem) => {
      if (pendingRemoveRef.current) return;

      heavyImpact();

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
        // Capture refs into locals before nulling — onError fires async
        // AFTER the refs are cleared, so the closure needs its own copy.
        const pending = pendingRemoveRef.current;
        const snapshot = undoSnapshotRef.current;
        pendingRemoveRef.current = null;
        undoSnapshotRef.current = null;
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
      }, UNDO_TIMEOUT_MS);
    },
    [queryClient, removeFromBoard],
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
  const listItems = buildListItems(boardData);

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
        <FlashList
          ref={listRef}
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
        >
          <Text style={{ fontSize: 22, color: '#18181b' }}>⌕</Text>
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
