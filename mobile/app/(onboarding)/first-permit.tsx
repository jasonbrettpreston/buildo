// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §6 Step 3, §10 Step 8
//             Spec 77 §3.1 — SearchPermitsSheet reuse
// TODO Spec 77: wire SearchPermitsSheet when Spec 77 is implemented.
// For now: stub with soft prompt + skip path only.
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { successNotification } from '@/lib/haptics';

export default function FirstPermitScreen() {
  const router = useRouter();

  const handleSkip = () => {
    router.push('/(onboarding)/terms');
  };

  // TODO Spec 77: when SearchPermitsSheet is built, render it here and call
  //   successNotification() + router.push('/(onboarding)/terms') on successful claim.
  const handleSearchNow = () => {
    // Placeholder — will open SearchPermitsSheet inline once Spec 77 is built.
    successNotification();
    router.push('/(onboarding)/terms');
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-950 px-6 pt-8" edges={['top', 'bottom']}>
      <Text className="text-zinc-100 text-xl font-bold mb-3">
        Want to add your first active permit now?
      </Text>
      <Text className="text-zinc-400 text-sm leading-relaxed mb-8">
        If you already have a permit you're working on, add it now and you'll land on a populated
        Flight Board — not an empty screen.
      </Text>

      <Pressable
        onPress={handleSearchNow}
        className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full items-center min-h-[52px] justify-center"
        accessibilityRole="button"
        accessibilityLabel="Search for a permit now"
      >
        <Text className="text-zinc-950 font-bold text-base text-center">Yes, search now →</Text>
      </Pressable>

      <Pressable
        onPress={handleSkip}
        className="items-center justify-center mt-6 min-h-[44px]"
      >
        <Text className="text-zinc-500 font-mono text-xs text-center">
          Skip, I'll do it later →
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}
