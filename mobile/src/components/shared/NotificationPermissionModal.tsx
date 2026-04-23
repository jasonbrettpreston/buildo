// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.1
//
// Pre-prompt modal shown after the user's first save. The "Allow" CTA
// triggers the system permission request (double-permission pattern).
// "Maybe Later" dismisses without requesting — user can enable later via
// Settings. MMKV-gated: renders at most once per device.
import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';

interface Props {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}

export function NotificationPermissionModal({ visible, onAllow, onDismiss }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-black/60 items-center justify-center px-6">
        <View className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm">
          <Text className="text-zinc-100 text-lg font-semibold mb-2">
            Want us to alert you?
          </Text>
          <Text className="text-zinc-400 text-sm mb-6 leading-5">
            Get notified when saved jobs change phases, stall, or are about to start.
            You control exactly which alerts you receive.
          </Text>

          <Pressable
            onPress={onAllow}
            className="bg-amber-500 rounded-xl py-3 items-center mb-3"
            accessibilityRole="button"
            accessibilityLabel="Allow notifications"
          >
            <Text className="text-zinc-950 font-semibold text-sm">Allow</Text>
          </Pressable>

          <Pressable
            onPress={onDismiss}
            className="py-3 items-center"
            accessibilityRole="button"
            accessibilityLabel="Maybe later"
          >
            <Text className="text-zinc-500 text-sm">Maybe Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
