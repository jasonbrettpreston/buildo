// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §5 Completion, §9 Design, §10 Step 9
// Staggered Reanimated entry: four elements at 0/80/160/240ms delays.
// withTiming(1, { duration: 300 }) — first arg is TARGET VALUE (1), NOT duration.
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useOnboardingStore } from '@/store/onboardingStore';
import { fetchWithAuth } from '@/lib/apiClient';
import { successNotification } from '@/lib/haptics';

export default function CompleteScreen() {
  const router = useRouter();
  const selectedTradeName = useOnboardingStore((s) => s.selectedTradeName);
  const markComplete = useOnboardingStore((s) => s.markComplete);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Four shared values — one per animated element.
  // withTiming first arg is the TARGET VALUE (1.0), NOT the duration.
  const sv0 = useSharedValue(0);
  const sv1 = useSharedValue(0);
  const sv2 = useSharedValue(0);
  const sv3 = useSharedValue(0);

  useEffect(() => {
    sv0.value = withDelay(0,   withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }));
    sv1.value = withDelay(80,  withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }));
    sv2.value = withDelay(160, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }));
    sv3.value = withDelay(240, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style0 = useAnimatedStyle(() => ({
    opacity: sv0.value,
    transform: [{ translateY: interpolate(sv0.value, [0, 1], [20, 0]) }],
  }));
  const style1 = useAnimatedStyle(() => ({
    opacity: sv1.value,
    transform: [{ translateY: interpolate(sv1.value, [0, 1], [20, 0]) }],
  }));
  const style2 = useAnimatedStyle(() => ({
    opacity: sv2.value,
    transform: [{ translateY: interpolate(sv2.value, [0, 1], [20, 0]) }],
  }));
  const style3 = useAnimatedStyle(() => ({
    opacity: sv3.value,
    transform: [{ translateY: interpolate(sv3.value, [0, 1], [20, 0]) }],
  }));

  const handleCta = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await fetchWithAuth('/api/user-profile', {
        method: 'PATCH',
        body: JSON.stringify({ default_tab: 'feed', onboarding_complete: true }),
      });
      successNotification();
      markComplete();
      router.replace('/(app)/');
    } catch {
      setErrorMessage('Could not complete setup. Please try again.');
      // Do NOT call markComplete on error — user stays on screen and can retry.
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-950 items-center justify-center px-8">
      <Animated.View style={style0} className="self-center bg-amber-500/10 px-3 py-1 rounded-full">
        <Text className="font-mono text-amber-400 text-xs tracking-widest uppercase">
          {selectedTradeName ?? 'Tradesperson'}
        </Text>
      </Animated.View>

      <Animated.View style={style1}>
        <Text className="text-zinc-100 text-2xl font-bold text-center mt-6">You're set up.</Text>
      </Animated.View>

      <Animated.View style={style2}>
        <Text className="text-zinc-400 text-sm text-center mt-3 leading-relaxed">
          These are active building permits matching your trade, updated daily.
        </Text>
      </Animated.View>

      {errorMessage && (
        <Text className="text-red-400 text-xs text-center mt-4">{errorMessage}</Text>
      )}

      <Animated.View style={[style3, { width: '100%' }]}>
        <Pressable
          onPress={handleCta}
          disabled={isLoading}
          style={{ opacity: isLoading ? 0.7 : 1 }}
          className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full mt-10 items-center min-h-[52px] justify-center"
          accessibilityRole="button"
          accessibilityLabel="See your leads"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#09090b" />
          ) : (
            <Text className="text-zinc-950 font-bold text-base text-center">See your leads →</Text>
          )}
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}
