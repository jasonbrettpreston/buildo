// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §4 Email Sign-Up, §5 Step 5
//             (P2-D4 amendment — email confirmations ON + "check your email" state)
import { View, Text, Pressable, ActivityIndicator, TextInput, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { supabase } from '@/lib/supabase';
import { mapSupabaseError } from '@/lib/supabaseErrors';
import { resendSignupConfirmation } from '@/lib/confirmEmail';
import { PHONE_AUTH_ENABLED, resolveSignUpMethod, type SignUpMethod } from '@/lib/featureFlags';
import { track } from '@/lib/analytics';
import { PhoneInputField } from '@/components/auth/PhoneInputField';
import { OtpInputField } from '@/components/auth/OtpInputField';

type PhoneStage = 'input' | 'otp' | 'backup-email';

// P2-D4 (operator ruling 2026-07-19): email confirmations are ON at launch.
// The redirect target is the POST-rename scheme from day one (Item 5 lands
// before this ships; zero installed users means no in-flight link under the
// old scheme). The deep-link catch is app/(auth)/confirm.tsx via the root
// layout's EmailConfirmLinkCatcher (P2-F3.4 resolution — see confirmEmail.ts).
const EMAIL_CONFIRM_REDIRECT = 'maxbld://auth/confirm';

export default function SignUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ method?: string }>();
  // D15 / P2-D1 entry point (c): the initialMethod COMPUTATION is gated —
  // a stale `?method=phone` deep link must never land the user in the phone
  // flow while the flag is off, even though the buttons are hidden elsewhere.
  const initialMethod = resolveSignUpMethod(params.method);

  const [method, setMethod] = useState<SignUpMethod>(initialMethod);
  const [errorMessage, setErrorMessage] = useState('');

  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  // P2-D4 "check your email" state: signUp() resolves with session: null
  // while confirmations are ON — the screen must not strand the user.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  // Phone state
  const [phoneStage, setPhoneStage] = useState<PhoneStage>('input');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [backupEmail, setBackupEmail] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);

  // Supabase `signInWithOtp({ phone })` returns NO confirmation handle
  // (P2-G6) — the ref holds the E.164 phone string itself; verifyOtp takes
  // the number directly. Replaces the RNFirebase ConfirmationResult object.
  const pendingPhoneRef = useRef<string | null>(null);
  const phoneSheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (method === 'phone') {
      phoneSheetRef.current?.expand();
    }
  }, [method]);

  // Funnel telemetry — Spec 90 §11.
  // Fire ONCE on mount with the initialMethod the user arrived with. Tying
  // this to `method` would re-fire every time the user toggles between
  // email and phone within the same session, inflating funnel counts.
  useEffect(() => {
    track('signup_screen_viewed', { method: initialMethod });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 30s cooldown after each "Send code" press — abuse protection per spec §4.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleAuthError = useCallback(async (err: unknown) => {
    const code = (err as { code?: string }).code;
    const message = mapSupabaseError(code);
    if (message) setErrorMessage(message);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  const handleEmailSignUp = useCallback(async () => {
    if (!email || !password) {
      setErrorMessage('Enter your email and password.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    try {
      setEmailLoading(true);
      setErrorMessage('');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: EMAIL_CONFIRM_REDIRECT },
      });
      if (error) throw error;
      track('signup_completed', { method: 'email' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!data.session) {
        // P2-D4: confirmations ON — no session until the emailed link is
        // tapped on this device. Render the explicit "check your email"
        // state (UX reviewer HIGH: never strand the user on a dead form).
        setAwaitingConfirmation(true);
      }
      // If a session DID arrive (confirmations toggled off in some env),
      // the auth listener fires and AuthGate routes to onboarding.
    } catch (err) {
      await handleAuthError(err);
    } finally {
      setEmailLoading(false);
    }
  }, [email, password, confirmPassword, handleAuthError]);

  const handleResendConfirmation = useCallback(async () => {
    // [verify-pass fold] Resend affordance: mail-provider security scanners
    // can prefetch/consume the one-time PKCE code before the real tap —
    // resend mints a fresh link. Logic lives in confirmEmail.ts (unit-tested).
    if (resendLoading) return;
    setResendLoading(true);
    setResendMessage('');
    const result = await resendSignupConfirmation(email);
    setResendMessage(result.message);
    if (!result.ok) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setResendLoading(false);
  }, [email, resendLoading]);

  const handleSendCode = useCallback(async () => {
    if (!phoneNumber || phoneNumber.length < 12) {
      setErrorMessage('Enter a complete phone number.');
      return;
    }
    track('auth_method_attempted', { method: 'phone' });
    try {
      setPhoneLoading(true);
      setErrorMessage('');
      // Supabase phone OTP creates the user automatically on first verify —
      // no separate "create" call (Spec 93 §5 Step 5). Bot prevention is
      // GoTrue's SMS rate limits, not Play Integrity/APN (Spec 93 §6).
      const { error } = await supabase.auth.signInWithOtp({ phone: phoneNumber });
      if (error) throw error;
      pendingPhoneRef.current = phoneNumber;
      setPhoneStage('otp');
      setResendCooldown(30);
    } catch (err) {
      track('auth_method_failed', { method: 'phone', code: (err as { code?: string }).code ?? 'unknown' });
      await handleAuthError(err);
    } finally {
      setPhoneLoading(false);
    }
  }, [phoneNumber, handleAuthError]);

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      try {
        setOtpLoading(true);
        setOtpError(false);
        setErrorMessage('');
        const phone = pendingPhoneRef.current;
        if (!phone) {
          throw Object.assign(new Error('No phone-auth session active'), {
            code: 'otp_expired',
          });
        }
        // Note: verifyOtp creates the Supabase user if they don't exist
        // (phone auth has no separate "create" call). The backup-email
        // capture happens AFTER the user is created — Spec 95 onboarding
        // writes it to user_profiles.
        const { error } = await supabase.auth.verifyOtp({
          phone,
          token: code,
          type: 'sms',
        });
        if (error) throw error;
        track('auth_otp_verified');
        Keyboard.dismiss();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPhoneStage('backup-email');
      } catch (err) {
        setOtpError(true);
        // Token-never-in-logs: only the error CODE reaches telemetry — never
        // the session object verifyOtp resolves with.
        track('auth_method_failed', { method: 'phone', code: (err as { code?: string }).code ?? 'unknown' });
        await handleAuthError(err);
      } finally {
        setOtpLoading(false);
      }
    },
    [handleAuthError],
  );

  const handleSubmitBackupEmail = useCallback(async () => {
    // Backup email is captured but not verified at registration.
    // Spec 95 onboarding will POST it to /api/user-profile alongside
    // the rest of the onboarding data. For now, persist the value
    // in component state until onboarding picks it up.
    if (!backupEmail.includes('@')) {
      setErrorMessage('Enter a valid recovery email.');
      return;
    }
    setBackupLoading(true);
    // The actual write to user_profiles.backup_email is owned by Spec 94/95.
    // Onboarding reads this from a temporary store / route param.
    // For now, dismiss the sheet — AuthGate routes to onboarding.
    track('signup_completed', { method: 'phone' });
    phoneSheetRef.current?.close();
    setBackupLoading(false);
  }, [backupEmail]);

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <View className="flex-1 px-6">
        {/* Wordmark — same as sign-in but mb-10 (text-only "MaxBLD", P2-F5.4) */}
        <View className="items-center mb-10 mt-10">
          <Text className="text-zinc-100 text-2xl font-bold">MaxBLD</Text>
        </View>

        {method === 'email' && awaitingConfirmation && (
          <View className="w-full" testID="signup-check-email">
            <Text
              className="text-zinc-100 text-xl font-bold mb-4"
              accessibilityRole="header"
            >
              Check your email
            </Text>
            <Text className="text-zinc-400 text-sm mb-6 leading-relaxed">
              We sent a confirmation link to{' '}
              <Text className="text-zinc-100">{email}</Text>. Open it on this
              device to finish creating your account.
            </Text>
            <Pressable
              onPress={() => {
                void handleResendConfirmation();
              }}
              disabled={resendLoading}
              style={{ opacity: resendLoading ? 0.7 : 1 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl py-4 w-full items-center min-h-[52px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Resend confirmation email"
              testID="signup-resend"
            >
              {resendLoading ? (
                <ActivityIndicator size="small" color="#71717a" />
              ) : (
                <Text className="text-zinc-100 text-sm font-semibold">
                  Resend confirmation email
                </Text>
              )}
            </Pressable>
            {resendMessage.length > 0 && (
              <Text className="text-zinc-500 text-xs text-center mt-3" testID="signup-resend-message">
                {resendMessage}
              </Text>
            )}
          </View>
        )}

        {method === 'email' && !awaitingConfirmation && (
          <View className="w-full">
            <Text
              className="text-zinc-100 text-xl font-bold mb-6"
              testID="signup-header"
              accessibilityRole="header"
            >
              Create your account
            </Text>
            <TextInput
              className="bg-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 text-base mb-3"
              placeholder="Email"
              placeholderTextColor="#71717a"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              testID="signup-email-input"
            />
            <TextInput
              className="bg-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 text-base mb-3"
              placeholder="Password"
              placeholderTextColor="#71717a"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              testID="signup-password-input"
            />
            <TextInput
              className="bg-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 text-base mb-3"
              placeholder="Confirm password"
              placeholderTextColor="#71717a"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              testID="signup-confirm-input"
            />
            <Pressable
              onPress={handleEmailSignUp}
              disabled={emailLoading}
              style={{ opacity: emailLoading ? 0.7 : 1 }}
              className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full items-center mt-4 min-h-[52px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Create account"
              testID="signup-submit"
            >
              {emailLoading ? (
                <ActivityIndicator size="small" color="#71717a" />
              ) : (
                <Text className="text-zinc-950 font-semibold text-sm">Create account</Text>
              )}
            </Pressable>
            {/* D15 / P2-D1 entry point (b): the in-page phone toggle is
                render-gated. The sheet + OTP flow below stays fully wired. */}
            {PHONE_AUTH_ENABLED && (
              <Pressable
                onPress={() => setMethod('phone')}
                className="mt-4 items-center"
              >
                <Text className="text-zinc-500 text-sm">
                  Or <Text className="text-amber-500">sign up with phone</Text>
                </Text>
              </Pressable>
            )}
            {errorMessage.length > 0 && (
              <Text className="text-red-400 text-xs text-center mt-4">{errorMessage}</Text>
            )}
          </View>
        )}

        <View className="absolute bottom-12 left-6 right-6">
          <Pressable onPress={() => router.replace('/(auth)/sign-in')}>
            <Text className="text-zinc-500 text-sm text-center">
              Already have an account? <Text className="text-amber-500">Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Phone sheet — input, OTP, backup-email stages */}
      <BottomSheet
        ref={phoneSheetRef}
        index={-1}
        snapPoints={['65%']}
        enablePanDownToClose
        keyboardBehavior="interactive"
        backgroundStyle={{ backgroundColor: '#18181b' }}
        handleIndicatorStyle={{ backgroundColor: '#3f3f46' }}
        onChange={(idx) => {
          if (idx === -1 && method === 'phone') {
            // Closing the sheet returns the user to email signup, not silently dismissing them.
            setMethod('email');
            setPhoneStage('input');
            pendingPhoneRef.current = null;
            setOtpError(false);
          }
        }}
      >
        <BottomSheetView style={{ flex: 1, padding: 16 }}>
          {phoneStage === 'input' && (
            <>
              <Text className="text-zinc-100 text-base font-bold text-center mb-2">
                Sign up with your phone
              </Text>
              <Text className="text-zinc-500 text-sm text-center mb-6">
                We&apos;ll text you a 6-digit code.
              </Text>
              <PhoneInputField
                value={phoneNumber}
                onChange={setPhoneNumber}
                editable={!phoneLoading}
              />
              <Pressable
                onPress={handleSendCode}
                disabled={phoneLoading}
                style={{ opacity: phoneLoading ? 0.7 : 1 }}
                className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 mx-4 mt-4 items-center min-h-[52px] justify-center"
                accessibilityRole="button"
                testID="signup-send-code"
              >
                {phoneLoading ? (
                  <ActivityIndicator size="small" color="#71717a" />
                ) : (
                  <Text className="text-zinc-950 font-semibold text-sm">Send code</Text>
                )}
              </Pressable>
              {errorMessage.length > 0 && (
                <Text className="text-red-400 text-xs text-center mt-2">{errorMessage}</Text>
              )}
            </>
          )}
          {phoneStage === 'otp' && (
            <>
              <Text className="text-zinc-100 text-base font-bold text-center mb-2">
                Enter the code
              </Text>
              <Text className="text-zinc-500 text-sm text-center mb-6">
                6-digit code sent to {phoneNumber}.
              </Text>
              <OtpInputField
                onComplete={handleVerifyOtp}
                onChange={() => {
                  if (otpError) setOtpError(false);
                }}
                errorMode={otpError}
                autoFocus
              />
              {otpLoading && (
                <View className="mt-4 items-center">
                  <ActivityIndicator size="small" color="#71717a" />
                </View>
              )}
              {errorMessage.length > 0 && (
                <Text className="text-red-400 text-xs text-center mt-2">{errorMessage}</Text>
              )}
              <View className="mt-6 items-center">
                {resendCooldown > 0 ? (
                  <Text className="text-zinc-600 text-xs">Resend in {resendCooldown}s</Text>
                ) : (
                  <Pressable
                    onPress={() => {
                      // Re-trigger SMS for the same number rather than reset
                      // back to the input screen.
                      setOtpError(false);
                      setErrorMessage('');
                      void handleSendCode();
                    }}
                  >
                    <Text className="text-zinc-600 text-xs">
                      Didn&apos;t receive it? <Text className="text-amber-500">Resend</Text>
                    </Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
          {phoneStage === 'backup-email' && (
            <>
              <Text className="text-zinc-100 text-base font-bold text-center mb-2">
                One more step
              </Text>
              <Text className="text-zinc-500 text-xs mb-1">
                Recovery email — in case you lose phone access
              </Text>
              <TextInput
                className="bg-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 text-base mb-3"
                placeholder="you@example.com"
                placeholderTextColor="#71717a"
                value={backupEmail}
                onChangeText={setBackupEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                testID="backup-email-input"
              />
              <Pressable
                onPress={handleSubmitBackupEmail}
                disabled={backupLoading}
                style={{ opacity: backupLoading ? 0.7 : 1 }}
                className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 items-center min-h-[52px] justify-center"
                accessibilityRole="button"
                testID="signup-backup-submit"
              >
                {backupLoading ? (
                  <ActivityIndicator size="small" color="#71717a" />
                ) : (
                  <Text className="text-zinc-950 font-semibold text-sm">Continue</Text>
                )}
              </Pressable>
              {errorMessage.length > 0 && (
                <Text className="text-red-400 text-xs text-center mt-2">{errorMessage}</Text>
              )}
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}
