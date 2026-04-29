// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §5 Step 1, §6 Step 1, §9 Design, §10 Step 4
// Two large cards — tapping navigates immediately. No Continue CTA. No PATCH.
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useOnboardingStore } from '@/store/onboardingStore';

export default function PathScreen() {
  const router = useRouter();
  const setPath = useOnboardingStore((s) => s.setPath);

  return (
    <SafeAreaView className="flex-1 bg-zinc-950 justify-center" edges={['top', 'bottom']}>

      <Text className="text-zinc-100 text-2xl font-bold text-center px-6 mb-2">
        How will you use Buildo?
      </Text>
      <Text className="text-zinc-400 text-sm text-center px-6 mb-10">
        Choose the experience that fits your workflow.
      </Text>

      <View className="gap-4 mx-4">
        <Pressable
          onPress={() => {
            setPath('leads');
            router.push('/(onboarding)/address');
          }}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 active:border-amber-500 active:bg-amber-500/5"
          accessibilityRole="button"
          accessibilityLabel="Find new leads"
        >
          <Text className="text-4xl text-center mb-3">🎯</Text>
          <Text className="text-lg font-bold text-zinc-100 text-center">Find New Leads</Text>
          <Text className="text-sm text-zinc-400 text-center mt-1 leading-relaxed">
            Discover active building permits in your area and win new business.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setPath('tracking');
            router.push('/(onboarding)/supplier');
          }}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 active:border-amber-500 active:bg-amber-500/5"
          accessibilityRole="button"
          accessibilityLabel="Track active projects"
        >
          <Text className="text-4xl text-center mb-3">📋</Text>
          <Text className="text-lg font-bold text-zinc-100 text-center">
            Track Active Projects
          </Text>
          <Text className="text-sm text-zinc-400 text-center mt-1 leading-relaxed">
            Monitor your existing jobs and stay ahead of permit phase changes.
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
