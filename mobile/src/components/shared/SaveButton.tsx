// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3.2 SaveButton
// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.1
//
// Optimistic heart button with contextual notification permission flow.
// On the first save, shows the NotificationPermissionModal pre-prompt
// (double-permission pattern) gated by MMKV hasAskedPermission flag.
// Scale-pulses on save via Reanimated withSpring.
import React, { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import {
  hasAskedPermission,
  markAskedPermission,
  requestPermissionAndRegister,
} from '@/lib/pushTokens';
import { NotificationPermissionModal } from '@/components/shared/NotificationPermissionModal';

interface Props {
  leadId: string;
  isSaved: boolean;
  onToggle: (leadId: string, saved: boolean) => void;
  testID?: string;
}

export function SaveButton({ leadId, isSaved, onToggle, testID }: Props) {
  const scale = useSharedValue(1);
  const [showPermModal, setShowPermModal] = useState(false);

  // Pulse when saved state flips to true
  useEffect(() => {
    if (isSaved) {
      scale.value = withSequence(
        withSpring(1.35, { stiffness: 400, damping: 10 }),
        withSpring(1.0, { stiffness: 400, damping: 20 }),
      );
    }
  }, [isSaved]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    const willSave = !isSaved;
    onToggle(leadId, willSave);

    if (willSave && !hasAskedPermission()) {
      markAskedPermission();
      setShowPermModal(true);
    }
  };

  return (
    <>
      <Pressable
        testID={testID ?? `save-button-${leadId}`}
        onPress={handlePress}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Animated.View
          style={style}
          testID={
            testID
              ? (isSaved
                  ? testID.replace('save-button-', 'save-heart-filled-')
                  : testID.replace('save-button-', 'save-heart-'))
              : (isSaved ? `save-heart-filled-${leadId}` : `save-heart-${leadId}`)
          }
        >
          <Text style={{ fontSize: 22, color: isSaved ? '#f59e0b' : '#71717a' }}>
            {isSaved ? '♥' : '♡'}
          </Text>
        </Animated.View>
      </Pressable>

      <NotificationPermissionModal
        visible={showPermModal}
        onAllow={() => {
          setShowPermModal(false);
          void requestPermissionAndRegister();
        }}
        onDismiss={() => setShowPermModal(false)}
      />
    </>
  );
}
