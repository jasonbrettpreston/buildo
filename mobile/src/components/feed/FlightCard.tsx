// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Card Layout
// Airport departure board card: date right-anchored (non-negotiable).
// Swipe left reveals red Remove panel (80px threshold).
// Amber update flash overlay for background-updated permits (Spec 92 §4.4).
// First-time swipe affordance hint: on the very first Flight Board session the
// first card bounces left-then-right to teach the swipe gesture. MMKV-gated so
// it fires at most once per install.
import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { createMMKV } from 'react-native-mmkv';
import { heavyImpact } from '@/lib/haptics';
import type { FlightBoardItem } from '@/lib/schemas';

const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

// MMKV gate so the swipe hint fires at most once per install.
const hintStore = createMMKV({ id: 'ui-hints' });
const SWIPE_HINT_KEY = 'flight_board_swipe_hint_shown';
function hasShownSwipeHint(): boolean {
  return hintStore.getBoolean(SWIPE_HINT_KEY) ?? false;
}
function markSwipeHintShown(): void {
  hintStore.set(SWIPE_HINT_KEY, true);
}

interface Props {
  item: FlightBoardItem;
  index: number;
  onPress: (item: FlightBoardItem) => void;
  onRemove: (item: FlightBoardItem) => void;
  hasUpdate?: boolean;
}

export function FlightCard({ item, index, onPress, onRemove, hasUpdate }: Props) {
  const swipeRef = useRef<Swipeable>(null);
  const bgOpacity = useSharedValue(0);
  const hintTranslateX = useSharedValue(0);
  // Haptic fire-once guard — onSwipeableWillOpen can fire repeatedly as the
  // user hovers at the threshold (gloves / vibration). Reset on close.
  const hapticFiredRef = useRef(false);

  // Amber update flash when permit was updated in background
  useEffect(() => {
    if (!hasUpdate) return;
    bgOpacity.value = withSequence(
      withTiming(1, { duration: 0 }),
      withDelay(500, withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) })),
    );
  }, [hasUpdate, bgOpacity]);

  // One-shot swipe affordance hint on the first card, first session.
  // Sequence: delay 1000ms → translate -24 → back to 0 (teaches the gesture).
  // MMKV flag is set AFTER the animation completes so a mid-animation unmount
  // (navigation, list re-render, app kill) doesn't silently consume the hint.
  useEffect(() => {
    if (index !== 0) return;
    if (hasShownSwipeHint()) return;
    hintTranslateX.value = withDelay(
      1000,
      withSequence(
        withTiming(-24, { duration: 320, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(markSwipeHintShown)();
        }),
      ),
    );
  }, [index, hintTranslateX]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));
  const hintStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: hintTranslateX.value }],
  }));

  const daysUntilStart =
    item.predicted_start !== null
      ? (new Date(item.predicted_start).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      : null;

  const isUrgent = daysUntilStart !== null && daysUntilStart <= 7;

  function renderRightActions() {
    return (
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onRemove(item);
        }}
        className="bg-red-600 w-20 items-center justify-center rounded-r-xl mb-3 mr-4"
        style={{ minHeight: 44 }}
        accessibilityRole="button"
        accessibilityLabel="Remove from board"
      >
        <Text className="text-white text-xs">Remove</Text>
      </Pressable>
    );
  }

  return (
    <Animated.View style={hintStyle}>
      <Swipeable
        ref={swipeRef}
        renderRightActions={renderRightActions}
        rightThreshold={80}
        overshootRight={false}
        // Heavy haptic fires when the 80px drag threshold completes (spec 77 §4.1),
        // not when the user subsequently taps the revealed panel. Guard against
        // repeated fires on threshold-hover (common with gloves on a job site).
        onSwipeableWillOpen={() => {
          if (!hapticFiredRef.current) {
            heavyImpact();
            hapticFiredRef.current = true;
          }
        }}
        onSwipeableClose={() => {
          hapticFiredRef.current = false;
        }}
      >
        <Pressable
          testID={`flight-card-${index}`}
          onPress={() => onPress(item)}
          // Accessibility actions surface the swipe gesture to VoiceOver / TalkBack
          // users via the Actions rotor — swipe is a visual-only gesture otherwise.
          // Do NOT use 'magicTap' (that is a reserved iOS system gesture for primary
          // safe actions — wiring it to a destructive action breaks HIG contract).
          accessibilityActions={[{ name: 'removeFromBoard', label: 'Remove from board' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'removeFromBoard') {
              onRemove(item);
            }
          }}
          accessibilityHint="Swipe left to reveal remove action"
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mx-4 mb-3 active:bg-zinc-800/70"
        >
          {/* Amber update flash overlay (Spec 77 §3.2 + Spec 92 §4.4). */}
          <Animated.View
            testID="flight-card-update-flash"
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: 12,
                backgroundColor: 'rgba(245,158,11,0.12)',
              },
              flashStyle,
            ]}
          />

          {/* Address row + right-anchored date */}
          <View className="flex-row items-start justify-between">
            <Text className="text-zinc-100 font-semibold text-sm flex-1 mr-3" numberOfLines={1}>
              {item.address}
            </Text>
            <Text className="font-mono text-amber-500 text-base font-bold text-right">
              {formatDate(item.predicted_start)}
            </Text>
          </View>

          {/* Permit number + phase */}
          <View className="flex-row items-center justify-between mt-0.5">
            <Text className="font-mono text-zinc-400 text-xs tracking-wider">
              {item.permit_num}
            </Text>
            <Text className="text-zinc-300 text-xs">
              {item.lifecycle_phase ?? 'Unknown'}
            </Text>
          </View>

          {/* Status badges */}
          {(item.lifecycle_stalled || isUrgent) && (
            <View className="flex-row gap-2 mt-2">
              {item.lifecycle_stalled && (
                <View className="bg-red-500/20 border border-red-500/40 px-2 py-0.5 rounded-md">
                  <Text className="text-red-400 text-xs">⚠ DELAYED</Text>
                </View>
              )}
              {isUrgent && (
                daysUntilStart !== null && daysUntilStart <= 0 ? (
                  <View className="bg-red-500/20 border border-red-500/40 px-2 py-0.5 rounded-md">
                    <Text className="text-red-400 text-xs">⚡ OVERDUE</Text>
                  </View>
                ) : (
                  <View className="bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-md">
                    <Text className="text-amber-400 text-xs">⚡ {Math.ceil(daysUntilStart!)} DAYS</Text>
                  </View>
                )
              )}
            </View>
          )}
        </Pressable>
      </Swipeable>
    </Animated.View>
  );
}
