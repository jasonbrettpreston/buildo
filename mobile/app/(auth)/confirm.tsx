// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §5 Step 5 (P2-D4 amendment —
//             email-confirmation deep-link catch, confirmations ON at launch)
//
// Deep-link catch route for the sign-up email-confirmation callback
// (`maxbld://auth/confirm?code=<PKCE code>`). The root layout's
// EmailConfirmLinkCatcher forwards the incoming URL here (P2-F3.4 resolution:
// expo-router ~6.0.23 extracts custom-scheme URLs as host+pathname, so
// `maxbld://auth/confirm` maps to `/auth/confirm` — unreachable by any file
// inside the stripped `(auth)` group; a Linking listener bridges the gap).
//
// On success: `exchangeCodeForSession` establishes the session,
// `onAuthStateChange` fires, and AuthGate's existing 5-branch routing takes
// over unchanged — this screen never navigates on success.
// On failure, TWO distinct error states ([verify-pass fold]):
//   - 'invalid'      — expired/invalid/consumed link → generic copy + back to sign-in
//   - 'same-device'  — PKCE code verifier missing/mismatched (link opened on a
//                      different device/install, or AsyncStorage cleared since
//                      signUp()) → "open on the device you signed up with" copy
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { exchangeConfirmationCode, type ConfirmFailureReason } from '@/lib/confirmEmail';

type ConfirmStatus = 'exchanging' | ConfirmFailureReason;

export default function ConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [status, setStatus] = useState<ConfirmStatus>('exchanging');
  // The PKCE code is one-time — guard against effect re-runs (fast refresh,
  // param identity churn) burning it twice.
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    const code = typeof params.code === 'string' ? params.code : undefined;
    if (!code) {
      // Link arrived without a code (malformed / prefetch-stripped) — treat
      // as the generic invalid case.
      setStatus('invalid');
      return;
    }
    void exchangeConfirmationCode(code).then((result) => {
      if (!result.ok) setStatus(result.reason);
      // ok: session established — AuthGate routes away; keep the spinner.
    });
  }, [params.code]);

  if (status === 'exchanging') {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950">
        <View className="flex-1 items-center justify-center px-6" testID="confirm-exchanging">
          <ActivityIndicator size="small" color="#f59e0b" />
          <Text className="text-zinc-400 text-sm text-center mt-4">
            Confirming your email…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isSameDevice = status === 'same-device';
  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <View
        className="flex-1 items-center justify-center px-6"
        testID={isSameDevice ? 'confirm-error-same-device' : 'confirm-error-invalid'}
      >
        <Text className="text-zinc-100 text-base font-bold text-center mb-2">
          {isSameDevice ? 'Almost there' : 'Link expired'}
        </Text>
        <Text className="text-zinc-400 text-sm text-center mb-8 leading-relaxed">
          {isSameDevice
            ? 'Open this link on the device you signed up with, or request a new confirmation email from the sign-up screen.'
            : 'This confirmation link is invalid or has expired. Sign up again or request a new confirmation email.'}
        </Text>
        <Pressable
          onPress={() => router.replace('/(auth)/sign-in')}
          className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 px-8 items-center min-h-[52px] justify-center"
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
          testID="confirm-back-to-sign-in"
        >
          <Text className="text-zinc-950 font-semibold text-sm">Back to sign in</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
