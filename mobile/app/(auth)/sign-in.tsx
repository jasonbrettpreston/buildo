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
import * as Sentry from '@sentry/react-native';
import { auth, app } from '@/lib/firebase';
import { track } from '@/lib/analytics';
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
  // The email captured from auth/account-exists-with-different-credential. Used
  // to verify that the just-completed sign-in matches the account we expect to
  // link to — prevents linking a Google credential to an unrelated user's
  // session if the user dismisses the linking sheet and signs in elsewhere.
  const [linkingExpectedEmail, setLinkingExpectedEmail] = useState('');
  const linkingSheetRef = useRef<AccountLinkingSheetRef>(null);
  const phoneSheetRef = useRef<BottomSheet>(null);
  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal>(null);

  // Tracks whether the component is still mounted so async sign-in flows
  // don't call setState on an unmounted component (React warning + memory
  // leak). Set to false in the cleanup of a setup effect.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Funnel telemetry — Spec 90 §11.
  useEffect(() => {
    track('auth_screen_viewed', { screen: 'sign-in' });
  }, []);

  // Tracks the last googleResponse instance the success-handler effect has
  // processed, so re-renders triggered by other state changes (e.g.,
  // pendingCredential) don't cause the same response to be processed twice.
  const lastProcessedGoogleResponseRef = useRef<typeof googleResponse | null>(null);

  // Global "any auth method in flight" — used as a mutex so the user can't
  // start a second method while the first is pending and corrupt the
  // linkingNewMethod / pendingCredential state.
  const isAuthenticating =
    appleLoading || googleLoading || emailLoading || phoneLoading || otpLoading;

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
  //
  // Only links if the just-completed sign-in's email matches the email that
  // produced the linking error. Without this guard, a user who dismisses the
  // sheet and signs in to an unrelated account would have the pending
  // credential silently attached (and rejected by Firebase) to the wrong UID.
  const linkPendingCredential = useCallback(
    async (currentUser: FirebaseUser | null) => {
      if (!pendingCredential || !currentUser) return;
      if (linkingExpectedEmail && currentUser.email?.toLowerCase() !== linkingExpectedEmail.toLowerCase()) {
        // Wrong account — discard the pending credential rather than attempt
        // a link that would fail with auth/credential-already-in-use.
        setPendingCredential(null);
        setLinkingExpectedEmail('');
        return;
      }
      try {
        await linkWithCredential(currentUser, pendingCredential);
        track('auth_account_link_completed', {
          existing_method: linkingExistingMethod || 'email',
          new_method: linkingNewMethod || 'unknown',
        });
      } catch (err) {
        // Linking failure is non-fatal — the user is still authenticated with
        // their existing method. Surface to telemetry so we can detect a
        // pattern of linking failures (often signals a Firebase config issue).
        Sentry.captureException(err, { tags: { layer: 'auth', op: 'linkWithCredential' } });
        track('auth_account_link_failed', {
          existing_method: linkingExistingMethod || 'email',
          new_method: linkingNewMethod || 'unknown',
          code: (err as { code?: string }).code ?? 'unknown',
        });
      } finally {
        setPendingCredential(null);
        setLinkingExpectedEmail('');
      }
    },
    [pendingCredential, linkingExpectedEmail, linkingExistingMethod, linkingNewMethod],
  );

  const handleAuthError = useCallback(async (err: unknown, attemptedMethod?: string) => {
    const code = (err as { code?: string }).code;
    if (isAccountLinkingError(code)) {
      // Look up which provider already owns this email so we can tell the user
      // which method to sign in with first.
      const errorEmail = (err as { customData?: { email?: string } }).customData?.email ?? '';
      const credential = (err as { credential?: AuthCredential }).credential ?? null;
      let existingProviderId = 'password';
      if (errorEmail) {
        setLinkingExpectedEmail(errorEmail);
        try {
          const methods = await fetchSignInMethodsForEmail(auth, errorEmail);
          existingProviderId = methods[0] ?? 'password';
          setLinkingExistingMethod(providerName(existingProviderId));
        } catch {
          setLinkingExistingMethod('email');
        }
      }
      setPendingCredential(credential);
      linkingSheetRef.current?.expand();
      track('auth_account_link_shown', {
        existing_method: providerName(existingProviderId),
        new_method: attemptedMethod ?? 'unknown',
      });
      return;
    }
    const message = mapFirebaseError(code);
    if (message) setErrorMessage(message);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  // Google response handler — runs whenever the OAuth flow returns.
  // Dedupe via a ref so re-renders triggered by other state (pendingCredential
  // changing during a linking flow) don't cause the same response to be
  // processed twice — which would attempt a second signInWithCredential with
  // a stale id_token.
  useEffect(() => {
    if (!googleResponse) return;
    if (lastProcessedGoogleResponseRef.current === googleResponse) return;
    lastProcessedGoogleResponseRef.current = googleResponse;

    if (googleResponse.type !== 'success') {
      if (googleResponse.type === 'error') {
        setErrorMessage('Google sign-in failed. Please try again.');
        track('auth_method_failed', { method: 'google', code: 'oauth_response_error' });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setGoogleLoading(false);
      return;
    }
    const idToken = googleResponse.params.id_token;
    if (!idToken) {
      setErrorMessage('Google sign-in returned no token. Try again.');
      track('auth_method_failed', { method: 'google', code: 'no_id_token' });
      setGoogleLoading(false);
      return;
    }
    void (async () => {
      try {
        setLinkingNewMethod('Google');
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        await linkPendingCredential(result.user);
        track('auth_method_succeeded', { method: 'google' });
        if (isMountedRef.current) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (err) {
        track('auth_method_failed', { method: 'google', code: (err as { code?: string }).code ?? 'unknown' });
        if (isMountedRef.current) await handleAuthError(err, 'google');
      } finally {
        if (isMountedRef.current) setGoogleLoading(false);
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
    if (isAuthenticating) return;
    track('auth_method_attempted', { method: 'apple' });
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
      track('auth_method_succeeded', { method: 'apple' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      // ERR_REQUEST_CANCELED fires when the user dismisses the Apple sheet —
      // not an error, just a no-op return.
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      track('auth_method_failed', { method: 'apple', code: (err as { code?: string }).code ?? 'unknown' });
      await handleAuthError(err, 'apple');
    } finally {
      setAppleLoading(false);
    }
  }, [handleAuthError, linkPendingCredential, isAuthenticating]);

  const handleGoogleSignIn = useCallback(() => {
    if (isAuthenticating) return;
    track('auth_method_attempted', { method: 'google' });
    // Set loading immediately so the button shows the spinner while the user
    // is in the OAuth web flow. The success/error effect below resets it.
    setGoogleLoading(true);
    setErrorMessage('');
    void googlePromptAsync().catch(() => {
      setGoogleLoading(false);
    });
  }, [googlePromptAsync, isAuthenticating]);

  const handleEmailSignIn = useCallback(async () => {
    if (isAuthenticating) return;
    if (!email || !password) {
      setErrorMessage('Enter your email and password.');
      return;
    }
    track('auth_method_attempted', { method: 'email' });
    try {
      setEmailLoading(true);
      setErrorMessage('');
      setLinkingNewMethod('email');
      const result = await signInWithEmailAndPassword(auth, email, password);
      await linkPendingCredential(result.user);
      track('auth_method_succeeded', { method: 'email' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      track('auth_method_failed', { method: 'email', code: (err as { code?: string }).code ?? 'unknown' });
      await handleAuthError(err, 'email');
    } finally {
      setEmailLoading(false);
    }
  }, [email, password, handleAuthError, linkPendingCredential, isAuthenticating]);

  const handleSendCode = useCallback(async () => {
    if (isAuthenticating) return;
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
      setLinkingNewMethod('phone');
      const phoneProvider = new PhoneAuthProvider(auth);
      const id = await phoneProvider.verifyPhoneNumber(phoneNumber, recaptchaVerifier.current);
      setVerificationId(id);
      setMode('phone-otp');
      setResendCooldown(30);
    } catch (err) {
      track('auth_method_failed', { method: 'phone', code: (err as { code?: string }).code ?? 'unknown' });
      await handleAuthError(err, 'phone');
    } finally {
      setPhoneLoading(false);
    }
  }, [phoneNumber, handleAuthError, isAuthenticating]);

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      try {
        setOtpLoading(true);
        setOtpError(false);
        setErrorMessage('');
        const credential = PhoneAuthProvider.credential(verificationId, code);
        const result = await signInWithCredential(auth, credential);
        await linkPendingCredential(result.user);
        track('auth_otp_verified');
        track('auth_method_succeeded', { method: 'phone' });
        Keyboard.dismiss();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        setOtpError(true);
        track('auth_method_failed', { method: 'phone', code: (err as { code?: string }).code ?? 'unknown' });
        await handleAuthError(err, 'phone');
      } finally {
        setOtpLoading(false);
      }
    },
    [verificationId, handleAuthError, linkPendingCredential],
  );

  const handleLinkExisting = useCallback(async () => {
    // Close the linking sheet and route the user into the existing method's
    // sign-in surface. After that sign-in resolves, linkPendingCredential
    // (called from each handler) attaches the captured credential.
    linkingSheetRef.current?.close();
    if (linkingExistingMethod === 'email') {
      setMode('email');
    } else if (linkingExistingMethod === 'phone') {
      // The phone-input surface lives inside phoneSheetRef — the sheet must
      // be expanded explicitly, otherwise setMode reveals nothing.
      setMode('phone-input');
      phoneSheetRef.current?.expand();
    }
    // For Apple/Google existing methods, the user taps the corresponding
    // button again on the idle stack. Adding a transient toast cue is
    // tracked in review_followups.md.
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
                setMode('idle');
                // Preserve email + password — user may have hit Back to look
                // at another method and is likely to come back to this form.
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
                onChange={() => {
                  // Clear the red error border the moment the user starts
                  // typing fresh digits per spec §4 OTP Entry.
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
                      // Re-trigger the SMS for the SAME phone number rather
                      // than dropping the user back to the input screen — the
                      // old reset path forced them to re-type their number.
                      track('auth_otp_resend_requested');
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
