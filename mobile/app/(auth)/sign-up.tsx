// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §4 Email Sign-Up, §5 Step 5
import { View, Text, Pressable, ActivityIndicator, TextInput, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  createUserWithEmailAndPassword,
  signInWithCredential,
  PhoneAuthProvider,
} from 'firebase/auth';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { auth, app } from '@/lib/firebase';
import { mapFirebaseError } from '@/lib/firebaseErrors';
import { track } from '@/lib/analytics';
import { PhoneInputField } from '@/components/auth/PhoneInputField';
import { OtpInputField } from '@/components/auth/OtpInputField';

type SignUpMethod = 'email' | 'phone';
type PhoneStage = 'input' | 'otp' | 'backup-email';

export default function SignUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ method?: string }>();
  const initialMethod = (params.method === 'phone' ? 'phone' : 'email') as SignUpMethod;

  const [method, setMethod] = useState<SignUpMethod>(initialMethod);
  const [errorMessage, setErrorMessage] = useState('');

  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  // Phone state
  const [phoneStage, setPhoneStage] = useState<PhoneStage>('input');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [backupEmail, setBackupEmail] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);

  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal>(null);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    track('signup_screen_viewed', { method: initialMethod });
  }, []);

  // 30s cooldown after each "Send code" press — abuse protection per spec §4.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleAuthError = useCallback(async (err: unknown) => {
    const code = (err as { code?: string }).code;
    const message = mapFirebaseError(code);
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
      await createUserWithEmailAndPassword(auth, email, password);
      track('signup_completed', { method: 'email' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // AuthGate routes to onboarding via onAuthStateChanged.
    } catch (err) {
      await handleAuthError(err);
    } finally {
      setEmailLoading(false);
    }
  }, [email, password, confirmPassword, handleAuthError]);

  const handleSendCode = useCallback(async () => {
    if (!phoneNumber || phoneNumber.length < 12) {
      setErrorMessage('Enter a complete phone number.');
      return;
    }
    if (!recaptchaVerifier.current) {
      setErrorMessage('reCAPTCHA not ready. Try again.');
      return;
    }
    track('auth_method_attempted', { method: 'phone' });
    try {
      setPhoneLoading(true);
      setErrorMessage('');
      const phoneProvider = new PhoneAuthProvider(auth);
      const id = await phoneProvider.verifyPhoneNumber(phoneNumber, recaptchaVerifier.current);
      setVerificationId(id);
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
        const credential = PhoneAuthProvider.credential(verificationId, code);
        // Note: signInWithCredential creates the Firebase user if they don't
        // exist (phone auth has no separate "create" call). The backup-email
        // capture happens AFTER the Firebase user is created — Spec 95
        // onboarding writes it to user_profiles.
        await signInWithCredential(auth, credential);
        track('auth_otp_verified');
        Keyboard.dismiss();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPhoneStage('backup-email');
      } catch (err) {
        setOtpError(true);
        track('auth_method_failed', { method: 'phone', code: (err as { code?: string }).code ?? 'unknown' });
        await handleAuthError(err);
      } finally {
        setOtpLoading(false);
      }
    },
    [verificationId, handleAuthError],
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
      <FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={app.options} />
      <View className="flex-1 px-6">
        {/* Wordmark — same as sign-in but mb-10 */}
        <View className="items-center mb-10 mt-10">
          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-xl bg-amber-500 mr-3" />
            <Text className="text-zinc-100 text-2xl font-bold">Buildo</Text>
          </View>
        </View>

        {method === 'email' && (
          <View className="w-full">
            <Text className="text-zinc-100 text-xl font-bold mb-6">Create your account</Text>
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
            <Pressable
              onPress={() => setMethod('phone')}
              className="mt-4 items-center"
            >
              <Text className="text-zinc-500 text-sm">
                Or <Text className="text-amber-500">sign up with phone</Text>
              </Text>
            </Pressable>
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
            setVerificationId('');
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
