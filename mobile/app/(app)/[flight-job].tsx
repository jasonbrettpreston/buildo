// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3 Detailed Investigation View
// p25/p75 gauge with Reanimated spring on mount. Best Case / Worst Case labels.
import React, { useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useFlightBoard } from '@/hooks/useFlightBoard';
import { useFlightJobDetail } from '@/hooks/useFlightJobDetail';
import { useFlightBoardSeenStore } from '@/store/flightBoardSeenStore';
import type { FlightBoardItem, FlightBoardDetail } from '@/lib/schemas';
import { ChevronLeft } from 'lucide-react-native';

const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function formatDateLong(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]!;
}

interface GaugeProps {
  predicted_start: string;
  p25_days: number | null;
  p75_days: number | null;
}

function TimelineGauge({ predicted_start, p25_days, p75_days }: GaugeProps) {
  const rangeWidth = useSharedValue(0);
  const rangeLeft = useSharedValue(0);
  const dotLeft = useSharedValue(0);

  // Guard against server bug where p75 < p25 (inverted range): swap so the
  // bar width is never negative (withSpring on negative width renders as 0 and
  // obscures the bug). Also guard NaN via Number.isFinite.
  const rawP25 = p25_days ?? -30;
  const rawP75 = p75_days ?? 30;
  const p25 = Number.isFinite(rawP25) ? Math.min(rawP25, rawP75) : -30;
  const p75 = Number.isFinite(rawP75) ? Math.max(rawP25, rawP75) : 30;
  // Range: p25 to p75 as fraction of a [−90, +90] day window
  const windowDays = 180;
  const p25Frac = Math.max(0, Math.min(1, (p25 + 90) / windowDays));
  const p75Frac = Math.max(0, Math.min(1, (p75 + 90) / windowDays));
  // Median = predicted_start, which is day 0 of the window, so always 0.5.
  const MED_FRAC = 0.5;

  const bestDate = formatDateShort(addDays(predicted_start, p25));
  const worstDate = formatDateShort(addDays(predicted_start, p75));

  useEffect(() => {
    rangeLeft.value = withSpring(p25Frac, { stiffness: 300, damping: 25 });
    rangeWidth.value = withSpring(p75Frac - p25Frac, { stiffness: 300, damping: 25 });
    dotLeft.value = withSpring(MED_FRAC, { stiffness: 300, damping: 25 });
    // rangeLeft/rangeWidth/dotLeft are Reanimated shared values — stable refs,
    // deliberately omitted from deps. Only the forecast fractions should retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p25Frac, p75Frac]);

  const rangeStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: `${rangeLeft.value * 100}%` as unknown as number,
    width: `${rangeWidth.value * 100}%` as unknown as number,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(245,158,11,0.4)',
    borderRadius: 4,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: `${dotLeft.value * 100}%` as unknown as number,
    top: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f59e0b',
    marginLeft: -6,
  }));

  return (
    <View className="mt-2">
      {/* Median date label above the dot — approximated by centering */}
      <View className="flex-row justify-center mb-2">
        <Text className="font-mono text-amber-500 text-sm font-bold">
          {formatDateLong(predicted_start)}
        </Text>
      </View>

      {/* Track */}
      <View className="bg-zinc-800 h-2 rounded-full w-full relative">
        <Animated.View style={rangeStyle} />
        <Animated.View style={dotStyle} />
      </View>

      {/* Best Case / Worst Case labels */}
      <View className="flex-row justify-between mt-1">
        <Text className="font-mono text-xs text-zinc-400">
          Best Case{'\n'}{bestDate}
        </Text>
        <Text className="font-mono text-xs text-zinc-400 text-right">
          Worst Case{'\n'}{worstDate}
        </Text>
      </View>
    </View>
  );
}

export default function FlightJobDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading: boardLoading } = useFlightBoard();

  // Parse permit_num and revision_num from id: "PERMIT_NUM--REVISION_NUM"
  const [permitNum, revisionNum] = (id ?? '').split('--');

  const cachedItem: FlightBoardItem | undefined = data?.data.find(
    (d) => d.permit_num === permitNum && d.revision_num === revisionNum,
  );

  // Cold-boot fallback (Spec 77 §3.3.1): when push deep-link opens this screen
  // and the board has resolved without a hit (permit not in user's saved
  // board cache), fetch the single permit by id. Gated to fire only after
  // the board resolved without a hit, so cache-hit fast path is preserved.
  const detailQuery = useFlightJobDetail(id, {
    enabled: !boardLoading && !cachedItem,
  });

  const item: FlightBoardItem | FlightBoardDetail | undefined =
    cachedItem ?? detailQuery.data;

  const isLoading = boardLoading || (!cachedItem && detailQuery.isLoading);

  // Spec 77 §3.2 — when the user opens the detail screen, write the current
  // updated_at back to the MMKV last-seen map so the amber update flash on
  // the parent flight-board quietens until the next backend change.
  useEffect(() => {
    if (!item || !item.updated_at) return;
    const permitId = `${item.permit_num}--${item.revision_num}`;
    useFlightBoardSeenStore.getState().markSeen(permitId, item.updated_at);
  }, [item?.permit_num, item?.revision_num, item?.updated_at]);

  const isUrgent =
    item?.predicted_start !== null &&
    item?.predicted_start !== undefined &&
    (new Date(item.predicted_start).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 7;

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
      {/* Nav bar — contextual "Flight Board" label tells the user which pillar
          the Back arrow returns to (design-audit finding). */}
      <View className="px-4 pt-4 pb-3 border-b border-zinc-800 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          style={{ minHeight: 44, justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="Back to Flight Board"
          className="mr-2 active:opacity-70 flex-row items-center"
        >
          <ChevronLeft size={20} color="#fbbf24" strokeWidth={2.5} />
          <Text className="text-amber-400 font-mono text-sm -ml-0.5">Flight Board</Text>
        </Pressable>
        <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest flex-1 text-right">
          Job Detail
        </Text>
      </View>

      {isLoading ? (
        // Cold-boot deep-link from a push notification hits this path while
        // either the board query OR the single-permit fallback is in flight.
        // Render a skeleton instead of the "Job not found" state that would
        // otherwise flash — making the urgent notification feel broken.
        <View className="flex-1 px-4 pt-6">
          <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 h-24" />
          <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 h-40" />
          <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 h-24" />
        </View>
      ) : !item ? (
        // Both list AND single-permit fetch resolved without a hit — the
        // permit isn't on this user's saved board (404) or detail fetch
        // errored permanently.
        <View className="flex-1 items-center justify-center">
          <Text className="text-zinc-500 text-sm font-mono">Job not found in board.</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        >
          {/* Address */}
          <Text className="text-zinc-100 text-xl font-bold" numberOfLines={2}>
            {item.address}
          </Text>

          {/* Permit number */}
          <Text className="font-mono text-zinc-500 text-sm tracking-wider mt-1">
            {item.permit_num}
            {item.revision_num && item.revision_num !== '00' ? ` · Rev ${item.revision_num}` : ''}
          </Text>

          {/* Status badges */}
          <View className="flex-row flex-wrap gap-2 mt-3">
            {item.lifecycle_phase && (
              <View className="bg-zinc-800 border border-zinc-700 px-3 py-1 rounded-md">
                <Text className="font-mono text-xs text-zinc-300">{item.lifecycle_phase}</Text>
              </View>
            )}
            {item.lifecycle_stalled && (
              <View className="bg-red-500/20 border border-red-500/40 px-3 py-1 rounded-md">
                <Text className="text-red-400 text-xs font-mono">⚠ DELAYED</Text>
              </View>
            )}
            {isUrgent && (
              <View className="bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-md">
                <Text className="text-amber-400 text-xs font-mono">⚡ URGENT</Text>
              </View>
            )}
          </View>

          {/* Divider */}
          <View className="border-b border-zinc-800 my-5" />

          {/* Timeline engine */}
          <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">
            Timeline Forecast
          </Text>

          {item.predicted_start ? (
            <TimelineGauge
              predicted_start={item.predicted_start}
              p25_days={item.p25_days}
              p75_days={item.p75_days}
            />
          ) : (
            <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 items-center">
              <Text className="text-zinc-600 text-xs font-mono">
                No forecast data available yet
              </Text>
            </View>
          )}

          {/* Divider */}
          <View className="border-b border-zinc-800 my-5" />

          {/* Target date */}
          {item.predicted_start && (
            <View className="mb-5">
              <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-2">
                Target Date
              </Text>
              <Text className="font-mono text-amber-500 text-2xl font-bold">
                {formatDateLong(item.predicted_start)}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
