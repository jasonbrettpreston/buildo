// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 1
//             docs/specs/03-mobile/93_mobile_auth.md §5 Step 6 (AuthGate routing matrix)
//
// AuthGate (mobile/app/_layout.tsx) is the SOLE routing authority for the
// onboarding ↔ app boundary. This layout used to have its own
// `if (isComplete) router.replace('/(app)/')` effect, but that read the LOCAL
// `useOnboardingStore.isComplete` while AuthGate read SERVER
// `profile.onboarding_complete` — when those two diverged (stale dev-user
// profile in MMKV cache vs. real-user `markComplete()` bridge), the two
// routers undid each other and pinged the user between groups indefinitely
// (Maximum update depth exceeded). Discovered 2026-05-02 via loopDetector
// instrumentation; fix is to leave routing to AuthGate alone.
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
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
