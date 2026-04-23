// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.2
//
// In-app foreground notification toast. Drops from safe-area top with a
// withSpring entrance. Auto-dismisses after 4 seconds. Does NOT auto-navigate.
// User can swipe up or tap X to dismiss early.
import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';

export type NotificationType =
  | 'NEW_HIGH_VALUE_LEAD'
  | 'LIFECYCLE_PHASE_CHANGED'
  | 'LIFECYCLE_STALLED'
  | 'START_DATE_URGENT';

interface Props {
  title: string;
  body: string;
  notificationType: NotificationType;
  onDismiss: () => void;
  onTap?: () => void;
}

const TYPE_DOT_COLOR: Record<NotificationType, string> = {
  NEW_HIGH_VALUE_LEAD:     'bg-amber-500',
  LIFECYCLE_PHASE_CHANGED: 'bg-green-500',
  LIFECYCLE_STALLED:       'bg-red-500',
  START_DATE_URGENT:       'bg-amber-500',
};

const TYPE_BORDER: Record<NotificationType, string> = {
  NEW_HIGH_VALUE_LEAD:     'border-amber-500/30',
  LIFECYCLE_PHASE_CHANGED: 'border-green-500/30',
  LIFECYCLE_STALLED:       'border-red-500/30',
  START_DATE_URGENT:       'border-amber-500/30',
};

// Entrance target: -8 (just inside safe area top)
// Dismissed: -120 (fully off-screen above)
const RESTING_Y = -8;
const HIDDEN_Y = -120;

export function NotificationToast({ title, body, notificationType, onDismiss, onTap }: Props) {
  const translateY = useSharedValue(HIDDEN_Y);
  // timerRef holds the 4s auto-dismiss trigger; unmountTimerRef holds the 240ms
  // post-animation unmount delay. Both must be cleared on unmount so a rapid
  // replacement toast doesn't fire onDismiss on the already-unmounted component.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Both dismiss paths (tap X + auto-dismiss) go through this so onDismiss can
  // only fire once — clears both pending timers before scheduling the new one.
  const scheduleDismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    translateY.value = withTiming(HIDDEN_Y, { duration: 220, easing: Easing.in(Easing.ease) });
    unmountTimerRef.current = setTimeout(() => onDismissRef.current(), 240);
  };

  const dismiss = () => {
    scheduleDismiss();
  };

  useEffect(() => {
    translateY.value = withSpring(RESTING_Y, { stiffness: 400, damping: 28, mass: 1 });
    timerRef.current = setTimeout(() => {
      scheduleDismiss();
    }, 4000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
    };
    // translateY is a Reanimated shared value — stable reference, safe to omit.
    // scheduleDismiss captures refs (stable) and the worklet-safe shared value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const swipeUp = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY < 0) {
        translateY.value = RESTING_Y + e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY < -30) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withSpring(RESTING_Y, { stiffness: 400, damping: 28 });
      }
    });

  const dotClass = TYPE_DOT_COLOR[notificationType];
  const borderClass = TYPE_BORDER[notificationType];

  return (
    <Animated.View
      style={[animatedStyle, { position: 'absolute', top: 0, left: 16, right: 16, zIndex: 50 }]}
    >
      <GestureDetector gesture={swipeUp}>
        <Pressable
          onPress={onTap}
          className={`bg-zinc-800 border ${borderClass} rounded-xl px-4 py-3 flex-row items-center gap-3`}
          accessibilityRole="alert"
        >
          <View className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
          <View className="flex-1">
            <Text className="text-zinc-100 font-semibold text-sm">{title}</Text>
            {!!body && <Text className="text-zinc-400 text-xs mt-0.5">{body}</Text>}
          </View>
          {/* 44×44 dismiss touch target */}
          <Pressable
            onPress={dismiss}
            className="w-11 h-11 items-center justify-center"
            accessibilityLabel="Dismiss notification"
            accessibilityRole="button"
          >
            <X size={18} color="#71717a" strokeWidth={2} />
          </Pressable>
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
}
