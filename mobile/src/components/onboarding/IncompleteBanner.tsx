// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §2 Incomplete profile banner
//             docs/specs/03-mobile/99_mobile_state_architecture.md §3.5 + §9.2a
// Defensive second-layer banner for (app) screens. The hard gate in _layout.tsx
// prevents unauthenticated users from reaching feed screens; this banner handles
// edge cases like deep links or navigation state races that bypass the gate.
//
// Spec 99 §9.2a: reads server `profile.onboarding_complete` directly (NOT the
// previously-mirrored `useOnboardingStore.isComplete`). The local mirror was
// the dual-source-of-truth root cause behind incident #2 (dual-router loop);
// removing the read here unblocks deletion of the bridge in §9.2b and the
// field in §9.2c.
//
// Rendered inside (app) layout AFTER the loading-guard returns, so
// `useUserProfile().data` is guaranteed non-null at this render site.
// Defensive `data?.onboarding_complete` is for type safety only; the
// undefined branch is unreachable in practice (and renders null, which is
// the correct fallback when state is unknown — never show "incomplete" on
// a guess).
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useUserProfile } from '@/hooks/useUserProfile';

export function IncompleteBanner() {
  const { data: profile } = useUserProfile();
  const router = useRouter();

  if (profile?.onboarding_complete !== false) return null;

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
