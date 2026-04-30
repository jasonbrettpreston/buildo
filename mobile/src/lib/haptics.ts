// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.3
// Typed haptics wrappers — all components must call these; no raw
// expo-haptics calls in feature code.
import * as Haptics from 'expo-haptics';

export function lightImpact(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function mediumImpact(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function heavyImpact(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

export function successNotification(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

// Engineering Standards §1.3 "the error variant for failures" — a distinct
// haptic signal that a destructive or critical action failed, so the user
// knows to check the screen for an error toast.
export function errorNotification(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
