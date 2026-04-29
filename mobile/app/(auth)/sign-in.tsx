// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §4 Design, §5 Step 4
import {
  View,
  Text,
  Platform,
  Pressable,
  ActivityIndicator,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import {
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  PhoneAuthProvider,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  type AuthCredential,
  type User as FirebaseUser,
} from 'firebase/auth';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { auth, app } from '@/lib/firebase';
import { mapFirebaseError, isAccountLinkingError } from '@/lib/firebaseErrors';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { PhoneInputField } from '@/components/auth/PhoneInputField';
import { OtpInputField } from '@/components/auth/OtpInputField';
import {
  AccountLinkingSheet,
  providerName,
  type AccountLinkingSheetRef,
} from '@/components/auth/AccountLinkingSheet';

type AuthMode = 'idle' | 'email' | 'phone-input' | 'phone-otp';

export default function SignInScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Per-method loading flags so the right button shows a spinner without
  // disabling the whole stack.
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  // Email form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Phone form state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Account linking state
  const [linkingExistingMethod, setLinkingExistingMethod] = useState('');
  const [linkingNewMethod, setLinkingNewMethod] = useState('');
  const [pendingCredential, setPendingCredential] = useState<AuthCredential | null>(null);
  const linkingSheetRef = useRef<AccountLinkingSheetRef>(null);
  const phoneSheetRef = useRef<BottomSheet>(null);
  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal>(null);

  // Google OAuth — useIdTokenAuthRequest is the implicit flow that populates
  // params.id_token directly (vs useAuthRequest code flow which returns a code
  // that requires a separate exchange step). Firebase needs the id_token, so
  // the implicit flow is the correct choice for native sign-in.
  const [, googleResponse, googlePromptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  // Resets all transient form state when switching between idle/email/phone
  // modes so a stale errorMessage or half-typed input doesn't leak between
  // the four sign-in flows.
  const resetTransientState = useCallback(() => {
    setErrorMessage('');
    setOtpError(false);
  }, []);

  // After a successful sign-in via the existing method, attach any pending
  // credential captured from the prior auth/account-exists-with-different-credential
  // failure. This completes the spec §3.2 linking flow — without it, pending
  // credentials are captured but never merged.
  const linkPendingCredential = useCallback(
    async (currentUser: FirebaseUser | null) => {
      if (!pendingCredential || !currentUser) return;
      try {
        await linkWithCredential(currentUser, pendingCredential);
      } catch {
        // Linking failure is non-fatal — the user is still authenticated with
        // their existing method. Surfacing the failure isn't useful here
        // because the primary sign-in already succeeded.
      } finally {
        setPendingCredential(null);
      }
    },
    [pendingCredential],
  );

  const handleAuthError = useCallback(async (err: unknown) => {
    const code = (err as { code?: string }).code;
    if (isAccountLinkingError(code)) {
      // Look up which provider already owns this email so we can tell the user
      // which method to sign in with first.
      const errorEmail = (err as { customData?: { email?: string } }).customData?.email ?? '';
      const credential = (err as { credential?: AuthCredential }).credential ?? null;
      if (errorEmail) {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, errorEmail);
          const existing = methods[0] ?? 'email';
          setLinkingExistingMethod(providerName(existing));
        } catch {
          setLinkingExistingMethod('email');
        }
      }
      setPendingCredential(credential);
      linkingSheetRef.current?.expand();
      return;
    }
    const message = mapFirebaseError(code);
    if (message) setErrorMessage(message);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  // Google response handler — runs whenever the OAuth flow returns.
  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') {
      if (googleResponse.type === 'error') {
        setErrorMessage('Google sign-in failed. Please try again.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setGoogleLoading(false);
      return;
    }
    const idToken = googleResponse.params.id_token;
    if (!idToken) {
      setErrorMessage('Google sign-in returned no token. Try again.');
      setGoogleLoading(false);
      return;
    }
    void (async () => {
      try {
        setLinkingNewMethod('Google');
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        await linkPendingCredential(result.user);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        await handleAuthError(err);
      } finally {
        setGoogleLoading(false);
      }
    })();
  }, [googleResponse, handleAuthError, linkPendingCredential]);

  // Resend cooldown ticker (30s after each "Send code" press).
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleAppleSignIn = useCallback(async () => {
    try {
      setAppleLoading(true);
      setErrorMessage('');
      setLinkingNewMethod('Apple');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { identityToken } = credential;
      if (!identityToken) throw new Error('No identity token from Apple');
      const provider = new OAuthProvider('apple.com');
      const firebaseCredential = provider.credential({ idToken: identityToken });
      const result = await signInWithCredential(auth, firebaseCredential);
      await linkPendingCredential(result.user);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      // ERR_REQUEST_CANCELED fires when the user dismisses the Apple sheet —
      // not an error, just a no-op return.
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      await handleAuthError(err);
    } finally {
      setAppleLoading(false);
    }
  }, [handleAuthError, linkPendingCredential]);

  const handleGoogleSignIn = useCallback(() => {
    // Set loading immediately so the button shows the spinner while the user
    // is in the OAuth web flow. The success/error effect below resets it.
    setGoogleLoading(true);
    setErrorMessage('');
    void googlePromptAsync().catch(() => {
      setGoogleLoading(false);
    });
  }, [googlePromptAsync]);

  const handleEmailSignIn = useCallback(async () => {
    if (!email || !password) {
      setErrorMessage('Enter your email and password.');
      return;
    }
    try {
      setEmailLoading(true);
      setErrorMessage('');
      setLinkingNewMethod('email');
      const result = await signInWithEmailAndPassword(auth, email, password);
      await linkPendingCredential(result.user);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      await handleAuthError(err);
    } finally {
      setEmailLoading(false);
    }
  }, [email, password, handleAuthError, linkPendingCredential]);

  const handleSendCode = useCallback(async () => {
    if (!phoneNumber || phoneNumber.length < 12) {
      setErrorMessage('Enter a complete phone number.');
      return;
    }
    if (!recaptchaVerifier.current) {
      setErrorMessage('reCAPTCHA not ready. Try again.');
      return;
    }
    try {
      setPhoneLoading(true);
      setErrorMessage('');
      setLinkingNewMethod('phone');
      const phoneProvider = new PhoneAuthProvider(auth);
      const id = await phoneProvider.verifyPhoneNumber(phoneNumber, recaptchaVerifier.current);
      setVerificationId(id);
      setMode('phone-otp');
      setResendCooldown(30);
    } catch (err) {
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
        const result = await signInWithCredential(auth, credential);
        await linkPendingCredential(result.user);
        Keyboard.dismiss();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        setOtpError(true);
        await handleAuthError(err);
      } finally {
        setOtpLoading(false);
      }
    },
    [verificationId, handleAuthError, linkPendingCredential],
  );

  const handleLinkExisting = useCallback(async () => {
    // The user must complete the existing method's sign-in flow first; once
    // that succeeds, onAuthStateChanged fires and AuthGate routes them onward.
    // Linking the pending credential happens after that sign-in succeeds —
    // for now, dismiss the sheet and let the user sign in with their existing
    // method. Pending credential is preserved in state for a future
    // linkWithCredential call once the user is authenticated.
    linkingSheetRef.current?.close();
    if (linkingExistingMethod === 'email') setMode('email');
    if (linkingExistingMethod === 'phone') setMode('phone-input');
    // For Apple/Google, the user just taps the corresponding button again.
    // Note: a complete linking flow that re-attaches `pendingCredential` after
    // the existing-method sign-in resolves is a follow-up — see Spec 93 §3.2.
  }, [linkingExistingMethod]);

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={app.options} />
      <View className="flex-1 items-center justify-center px-6">
        {/* Wordmark */}
        <View className="items-center mb-12">
          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-xl bg-amber-500 mr-3" />
            <Text className="text-zinc-100 text-2xl font-bold">Buildo</Text>
          </View>
          <Text className="text-zinc-500 text-sm text-center mt-1">Leads for the trades.</Text>
        </View>

        {/* Button stack */}
        {mode === 'idle' && (
          <View className="w-full" style={{ gap: 12 }}>
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={16}
                style={{ width: '100%', height: 52 }}
                onPress={handleAppleSignIn}
              />
            )}
            <GoogleSignInButton
              onPress={handleGoogleSignIn}
              loading={googleLoading}
              label="Sign in with Google"
            />
            <View className="flex-row items-center my-1" style={{ gap: 12 }}>
              <View className="flex-1 h-px bg-zinc-800" />
              <Text className="text-zinc-600 text-xs">or</Text>
              <View className="flex-1 h-px bg-zinc-800" />
            </View>
            <Pressable
              onPress={() => {
                resetTransientState();
                setMode('phone-input');
                phoneSheetRef.current?.expand();
              }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl py-4 px-5 flex-row items-center justify-center w-full min-h-[52px] active:bg-zinc-800"
              accessibilityRole="button"
              accessibilityLabel="Continue with Phone"
              testID="phone-button"
            >
              <Text className="text-zinc-100 text-sm font-semibold">Continue with Phone</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                resetTransientState();
                setMode('email');
              }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl py-4 px-5 flex-row items-center justify-center w-full min-h-[52px] active:bg-zinc-800"
              accessibilityRole="button"
              accessibilityLabel="Continue with Email"
              testID="email-button"
            >
              <Text className="text-zinc-100 text-sm font-semibold">Continue with Email</Text>
            </Pressable>
          </View>
        )}

        {/* Email form */}
        {mode === 'email' && (
          <View className="w-full">
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
              testID="email-input"
            />
            <TextInput
              className="bg-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 text-base mb-3"
              placeholder="Password"
              placeholderTextColor="#71717a"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              testID="password-input"
            />
            <Pressable
              onPress={handleEmailSignIn}
              disabled={emailLoading}
              style={{ opacity: emailLoading ? 0.7 : 1 }}
              className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full items-center mt-1 min-h-[52px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              testID="email-submit"
            >
              {emailLoading ? (
                <ActivityIndicator size="small" color="#71717a" />
              ) : (
                <Text className="text-zinc-950 font-semibold text-sm">Sign in</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                resetTransientState();
                setEmail('');
                setPassword('');
                setMode('idle');
              }}
              className="mt-4 items-center"
            >
              <Text className="text-zinc-500 text-sm">Back</Text>
            </Pressable>
          </View>
        )}

        {/* Error message */}
        {errorMessage.length > 0 && (
          <Text className="text-red-400 text-xs text-center mt-4">{errorMessage}</Text>
        )}

        {/* Footer link to sign-up */}
        <View className="absolute bottom-12">
          <Pressable onPress={() => router.push('/(auth)/sign-up')}>
            <Text className="text-zinc-500 text-sm text-center">
              Don&apos;t have an account? <Text className="text-amber-500">Sign up</Text>
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Phone bottom sheet */}
      <BottomSheet
        ref={phoneSheetRef}
        index={-1}
        snapPoints={['55%']}
        enablePanDownToClose
        keyboardBehavior="interactive"
        backgroundStyle={{ backgroundColor: '#18181b' }}
        handleIndicatorStyle={{ backgroundColor: '#3f3f46' }}
        onChange={(idx) => {
          if (idx === -1) {
            setMode('idle');
            setVerificationId('');
            setPhoneNumber('');
            resetTransientState();
          }
        }}
      >
        <BottomSheetView style={{ flex: 1, padding: 16 }}>
          {mode === 'phone-input' && (
            <>
              <Text className="text-zinc-100 text-base font-bold text-center mb-2">
                Enter your phone number
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
                testID="send-code-button"
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
          {mode === 'phone-otp' && (
            <>
              <Text className="text-zinc-100 text-base font-bold text-center mb-2">
                Enter the code
              </Text>
              <Text className="text-zinc-500 text-sm text-center mb-6">
                Enter the 6-digit code sent to {phoneNumber}.
              </Text>
              <OtpInputField
                onComplete={handleVerifyOtp}
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
                      setMode('phone-input');
                      setVerificationId('');
                      setOtpError(false);
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
        </BottomSheetView>
      </BottomSheet>

      {/* Account linking sheet */}
      <AccountLinkingSheet
        ref={linkingSheetRef}
        existingMethod={linkingExistingMethod || 'email'}
        newMethod={linkingNewMethod || 'this account'}
        onLinkPress={handleLinkExisting}
        onDismiss={() => {
          // Don't clear pendingCredential here — the user may dismiss the
          // sheet and continue signing in with the existing method, at
          // which point linkPendingCredential will pick it up. It's only
          // cleared after a successful link or a fresh auth attempt.
        }}
      />
    </SafeAreaView>
  );
}
