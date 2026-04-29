// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 1
import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useAuthStore } from '@/store/authStore';

export default function OnboardingLayout() {
  const router = useRouter();
  const isComplete = useOnboardingStore((s) => s.isComplete);
  // account_preset is undefined until Spec 95 wires user_profiles hydration.
  const user = useAuthStore((s) => s.user);
  const accountPreset = (user as { account_preset?: string } | null)?.account_preset;

  useEffect(() => {
    if (isComplete) {
      // Deep-link safety: a completed-onboarding user who somehow lands in
      // the onboarding group is redirected to the main app immediately.
      router.replace('/(app)/');
      return;
    }
    if (accountPreset === 'manufacturer') {
      router.replace('/(onboarding)/manufacturer-hold');
    }
  }, [isComplete, accountPreset, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="profession" />
      <Stack.Screen name="path" />
      <Stack.Screen name="address" />
      <Stack.Screen name="supplier" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="complete" />
      <Stack.Screen name="first-permit" />
      <Stack.Screen name="manufacturer-hold" />
    </Stack>
  );
}
