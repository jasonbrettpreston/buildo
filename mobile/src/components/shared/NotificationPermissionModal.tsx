// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.1
// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §5 (prefer bottom sheet)
//
// Pre-prompt bottom sheet shown after the user's first save. The "Allow" CTA
// triggers the system permission request (double-permission pattern). "Maybe
// Later" dismisses without requesting — user can enable later via Settings.
// MMKV-gated: renders at most once per device.
//
// Migrated from centered `<Modal>` → `@gorhom/bottom-sheet` 2026-04-23 to match
// the LeadFilterSheet / SearchPermitsSheet pattern. Bottom-anchored sheets
// dodge keyboard / dynamic island overlap and feel native on both iOS + Android.
// Both CTAs have equal visual weight (bordered containers) so the double-
// permission pattern isn't coercive — the user genuinely has two paths.
import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { successNotification, lightImpact } from '@/lib/haptics';

interface Props {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}

const SNAP_POINTS = ['40%'];

export function NotificationPermissionModal({ visible, onAllow, onDismiss }: Props) {
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const handleAllow = useCallback(() => {
    // Success haptic — user is committing to enable notifications (significant
    // state mutation). Fire before invoking onAllow so the tactile confirmation
    // lands at tap time, not after the system dialog renders.
    successNotification();
    onAllow();
  }, [onAllow]);

  const handleDismiss = useCallback(() => {
    lightImpact();
    onDismiss();
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={SNAP_POINTS}
      onClose={onDismiss}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: '#18181b' }}
      handleIndicatorStyle={{ backgroundColor: '#3f3f46' }}
    >
      <BottomSheetView className="flex-1 px-6 pt-2 pb-8">
        <Text className="text-zinc-100 text-lg font-semibold mb-2">
          Want us to alert you?
        </Text>
        <Text className="text-zinc-400 text-sm mb-6 leading-5">
          Get notified when saved jobs change phases, stall, or are about to start.
          You control exactly which alerts you receive.
        </Text>

        <Pressable
          onPress={handleAllow}
          style={{ minHeight: 44, justifyContent: 'center' }}
          className="bg-amber-500 active:bg-amber-600 rounded-xl py-3 items-center mb-3"
          accessibilityRole="button"
          accessibilityLabel="Allow notifications"
        >
          <Text className="text-zinc-950 font-semibold text-sm">Allow</Text>
        </Pressable>

        {/* "Maybe Later" gets an equal-weight bordered container — the double-
            permission pattern requires both paths to feel equally available. */}
        <Pressable
          onPress={handleDismiss}
          style={{ minHeight: 44, justifyContent: 'center' }}
          className="bg-zinc-800 border border-zinc-700 active:bg-zinc-700/60 rounded-xl py-3 items-center"
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
        >
          <Text className="text-zinc-300 text-sm">Maybe Later</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
}
