// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §2 Incomplete profile banner
// Defensive second-layer banner for (app) screens. The hard gate in _layout.tsx
// prevents unauthenticated users from reaching feed screens; this banner handles
// edge cases like deep links or navigation state races that bypass the gate.
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboardingStore } from '@/store/onboardingStore';

export function IncompleteBanner() {
  const isComplete = useOnboardingStore((s) => s.isComplete);
  const router = useRouter();

  if (isComplete) return null;

  return (
    <Pressable
      onPress={() => router.push('/(onboarding)/profession')}
      className="bg-amber-500/20 border-b border-amber-500/40 py-2 px-4"
    >
      <Text className="text-amber-400 text-sm font-mono">
        Complete your setup to see relevant leads →
      </Text>
    </Pressable>
  );
}
