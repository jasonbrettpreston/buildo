// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §2 Incomplete profile banner
//             docs/specs/03-mobile/99_mobile_state_architecture.md §3.5 + §5.2 + §9.2a
// Defensive second-layer banner for (app) screens. The hard gate in _layout.tsx
// prevents unauthenticated users from reaching feed screens; this banner handles
// edge cases like deep links or navigation state races that bypass the gate.
//
// Spec 99 §9.2a: reads server `profile.onboarding_complete` directly (NOT the
// previously-mirrored `useOnboardingStore.isComplete`). The local mirror was
// the dual-source-of-truth root cause behind incident #2 (dual-router loop).
//
// Hide condition: `profile.onboarding_complete === true` (explicit complete).
// Defensive default — show banner on `undefined`/`false` because the user is
// either incomplete OR in an unknown state (404 / network error / cold-boot
// pre-fetch). The OLD `!isComplete` semantic was strictly safer than the
// `!== false` shortcut; restoring it per WF2-B adversarial review (Gemini H2 +
// DeepSeek M3 — switching to `!== false` lost defensive coverage of the 404
// new-user path).
//
// Stale-profile guard (Spec 99 §5.2 — parity with AuthGate §9.11):
// when the Firebase UID changes (different user signs in on a shared device),
// TanStack returns the previous user's profile until refetch resolves. Reading
// `profile.onboarding_complete` blindly could show "Complete your setup" to a
// user who is already fully onboarded under a different identity. Silently
// hide the banner when uid mismatches.
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuthStore } from '@/store/authStore';

export function IncompleteBanner() {
  const { data: profile } = useUserProfile();
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  // Stale-profile guard (Spec 99 §5.2): hide if UID mismatches.
  if (profile && profile.user_id && user?.uid && profile.user_id !== user.uid) {
    return null;
  }
  // Hide only when explicitly complete. Show on undefined / false /
  // missing-profile because the user IS in an incomplete state and needs
  // the path back to onboarding.
  if (profile?.onboarding_complete === true) return null;

  return (
    <Pressable
      onPress={() => router.push('/(onboarding)/profession')}
      className="bg-amber-500/20 border-b border-amber-500/40 py-2 px-4 min-h-[44px] justify-center"
      accessibilityRole="button"
      accessibilityLabel="Complete your setup"
    >
      <Text className="text-amber-400 text-sm font-mono">
        Complete your setup to see relevant leads →
      </Text>
    </Pressable>
  );
}
