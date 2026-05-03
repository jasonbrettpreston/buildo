// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §4 Step 2, §5 Step 4, §6 Step 4, §9 Design, §10 Step 7
// Custom checkboxes (no library), expo-web-browser links.
// Dual completion path: Path L/R → complete.tsx; Path T → flight board directly.
// Path T writes location_mode: 'gps_live' in the final PATCH (Path T skips address step;
// location_mode is required by the Spec 95 server guard and DB CHECK constraint).
import { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useFilterStore } from '@/store/filterStore';
import { fetchWithAuth } from '@/lib/apiClient';
import { ProgressStepper } from '@/components/onboarding/ProgressStepper';

const TOS_URL = 'https://buildo.app/terms';
const PRIVACY_URL = 'https://buildo.app/privacy';

interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
}

function Checkbox({ checked, onToggle }: CheckboxProps) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="min-h-[44px] min-w-[44px] items-center justify-center"
    >
      {checked ? (
        <View className="w-5 h-5 rounded-md bg-amber-500 border-2 border-amber-500 items-center justify-center">
          <Text className="text-white text-xs font-bold text-center">✓</Text>
        </View>
      ) : (
        <View className="w-5 h-5 rounded-md border-2 border-zinc-600" />
      )}
    </Pressable>
  );
}

export default function TermsScreen() {
  const router = useRouter();
  const selectedPath = useOnboardingStore((s) => s.selectedPath);
  const isPathL = selectedPath === 'leads'; // stepper: Path L only
  const goesToComplete = selectedPath !== 'tracking'; // Path L + Path R route to complete.tsx

  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { setLocationMode } = useFilterStore.getState();

  const bothChecked = tosChecked && privacyChecked;

  // Guard against double-tap: React state `disabled` prop only updates after the
  // next render cycle, so two rapid taps can both pass the `!isLoading` check
  // before the re-render propagates. useRef is synchronous.
  const isSubmittingRef = useRef(false);

  const handleConfirm = useCallback(async () => {
    if (!bothChecked || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Step 1: write ToS acceptance timestamp.
      await fetchWithAuth('/api/user-profile', {
        method: 'PATCH',
        body: JSON.stringify({ tos_accepted_at: new Date().toISOString() }),
      });

      if (goesToComplete) {
        // Path L / Path R: proceed to animated completion screen.
        router.push('/(onboarding)/complete');
      } else {
        // Path T: Path T skips the address/GPS step entirely (Spec 94 §6).
        // location_mode is required by the Spec 95 server guard and DB CHECK
        // constraint — GPS Live is the correct default for tracking-path users.
        await fetchWithAuth('/api/user-profile', {
          method: 'PATCH',
          body: JSON.stringify({
            default_tab: 'flight_board',
            location_mode: 'gps_live',
            onboarding_complete: true,
          }),
        });
        // Spec 99 §9.2b: no markComplete() call. Server is sole source of
        // truth (Spec 99 §3.5). AuthGate's next refetch sees
        // onboarding_complete=true and routes to (app)/ via Branch 5.
        setLocationMode('gps_live');
        router.replace('/(app)/flight-board');
      }
    } catch {
      setErrorMessage('Setup failed. Please try again.');
      // On error: server PATCH did not commit; user stays on this screen
      // and can retry. No local mirror to roll back (Spec 99 §9.2b).
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  }, [bothChecked, goesToComplete, setLocationMode, router]);

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
      >
        {isPathL && <ProgressStepper currentStep={4} totalSteps={4} />}

        <Text className="text-zinc-100 text-2xl font-bold mb-2">Terms & Privacy</Text>
        <Text className="text-zinc-400 text-sm mb-6 leading-relaxed">
          Please read and accept before continuing.
        </Text>

        {/* ToS checkbox row */}
        <View className="flex-row items-start gap-3 mt-4 min-h-[44px]">
          <Checkbox checked={tosChecked} onToggle={() => setTosChecked((v) => !v)} />
          <View className="flex-1 pt-2">
            <Text className="text-zinc-300 text-sm leading-relaxed">
              I agree to the{' '}
              <Text
                className="text-amber-400 text-sm underline"
                onPress={() => void WebBrowser.openBrowserAsync(TOS_URL)}
              >
                Terms of Service
              </Text>
            </Text>
          </View>
        </View>

        {/* Privacy checkbox row */}
        <View className="flex-row items-start gap-3 mt-4 min-h-[44px]">
          <Checkbox checked={privacyChecked} onToggle={() => setPrivacyChecked((v) => !v)} />
          <View className="flex-1 pt-2">
            <Text className="text-zinc-300 text-sm leading-relaxed">
              I agree to the{' '}
              <Text
                className="text-amber-400 text-sm underline"
                onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
              >
                Privacy Policy
              </Text>
            </Text>
          </View>
        </View>

        {errorMessage && (
          <Text className="text-red-400 text-xs text-center mt-6">{errorMessage}</Text>
        )}
      </ScrollView>

      <View className="px-6 pb-safe pt-3">
        <Pressable
          onPress={handleConfirm}
          disabled={!bothChecked || isLoading}
          style={{ opacity: isLoading ? 0.7 : bothChecked ? 1 : 0.4 }}
          className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full items-center min-h-[52px] justify-center"
          accessibilityRole="button"
          accessibilityLabel="Accept and continue"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#09090b" />
          ) : (
            <Text className="text-zinc-950 font-bold text-base text-center">
              {goesToComplete ? 'Accept & Continue' : 'Accept & Finish Setup'}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
