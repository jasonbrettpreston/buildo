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
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { prepareAppleNonce } from '@/lib/appleAuth';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { mapSupabaseError, isAccountLinkingError } from '@/lib/supabaseErrors';
import { PHONE_AUTH_ENABLED } from '@/lib/featureFlags';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { PhoneInputField } from '@/components/auth/PhoneInputField';
import { OtpInputField } from '@/components/auth/OtpInputField';
import {
  AccountLinkingSheet,
  type AccountLinkingSheetRef,
} from '@/components/auth/AccountLinkingSheet';

type AuthMode = 'idle' | 'email' | 'phone-input' | 'phone-otp';

// The provider identity captured from an `email_exists` rejection, replayed
// through `supabase.auth.linkIdentity({ provider, token, nonce })` after the
// user re-authenticates with their original method (Spec 93 §3.2 native
// ID-token linking path). Replaces the Firebase `pendingCredential` object.
interface PendingIdentity {
  provider: 'google' | 'apple';
  token: string;
  /** Raw nonce for Apple tokens (the token embeds SHA-256(rawNonce)); absent for Google — see P2-F3.1 note below. */
  nonce?: string;
}

// Native Google Sign-In config (Spec 93 §5 Step 4): webClientId is the
// Supabase-dashboard Google provider's WEB client ID — required for the
// idToken audience GoTrue verifies. Configure once at module load;
// sign-up.tsx has no Google button so this stays sign-in-only.
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

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
  const [otpError, setOtpError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  // Supabase `signInWithOtp({ phone })` returns NO confirmation handle
  // (P2-G6) — verification takes the phone number directly via
  // `verifyOtp({ phone, token, type: 'sms' })`, so the ref holds the E.164
  // string itself. Replaces the RNFirebase ConfirmationResult object.
  const pendingPhoneRef = useRef<string | null>(null);

  // Account linking state (Spec 93 §3.2 — Manual Linking). The sheet copy
  // names ONLY the attempted method (P2-G7): Supabase has no
  // fetchSignInMethodsForEmail equivalent by design (anti-enumeration).
  const [linkingNewMethod, setLinkingNewMethod] = useState('');
  const [pendingIdentity, setPendingIdentity] = useState<PendingIdentity | null>(null);
  // The email that produced the linking conflict (when the provider response
  // exposes it). Used to verify that the just-completed sign-in matches the
  // account we expect to link to — prevents linking a Google/Apple identity
  // to an unrelated user's session if the user dismisses the linking sheet
  // and signs in elsewhere. (Fence preserved from the Firebase version.)
  const [linkingExpectedEmail, setLinkingExpectedEmail] = useState('');
  const linkingSheetRef = useRef<AccountLinkingSheetRef>(null);
  const phoneSheetRef = useRef<BottomSheet>(null);

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

  // Global "any auth method in flight" — used as a mutex so the user can't
  // start a second method while the first is pending and corrupt the
  // linkingNewMethod / pendingIdentity state.
  const isAuthenticating =
    appleLoading || googleLoading || emailLoading || phoneLoading || otpLoading;

  // Resets all transient form state when switching between idle/email/phone
  // modes so a stale errorMessage or half-typed input doesn't leak between
  // the four sign-in flows.
  const resetTransientState = useCallback(() => {
    setErrorMessage('');
    setOtpError(false);
  }, []);

  // After a successful sign-in via the user's original method, attach any
  // pending identity captured from the prior `email_exists` rejection via
  // `supabase.auth.linkIdentity()` (Spec 93 §3.2). Without it, pending
  // identities are captured but never merged.
  //
  // Only links if the just-completed sign-in's email matches the email that
  // produced the linking error (when known). Without this guard, a user who
  // dismisses the sheet and signs in to an unrelated account would have the
  // pending identity attached to the wrong uuid.
  const linkPendingIdentity = useCallback(
    async (currentUser: { email?: string | null } | null) => {
      if (!pendingIdentity || !currentUser) return;
      if (
        linkingExpectedEmail &&
        currentUser.email?.toLowerCase() !== linkingExpectedEmail.toLowerCase()
      ) {
        // Wrong account — discard the pending identity rather than attempt
        // a link GoTrue would reject.
        setPendingIdentity(null);
        setLinkingExpectedEmail('');
        return;
      }
      try {
        const { error } = await supabase.auth.linkIdentity({
          provider: pendingIdentity.provider,
          token: pendingIdentity.token,
          ...(pendingIdentity.nonce ? { nonce: pendingIdentity.nonce } : {}),
        });
        if (error) throw error;
        track('auth_account_link_completed', {
          new_method: linkingNewMethod || pendingIdentity.provider,
        });
      } catch (err) {
        // Linking failure is non-fatal — the user is still authenticated with
        // their existing method. Surface to telemetry so we can detect a
        // pattern of linking failures (often signals a provider config issue).
        // Token-never-in-logs: AuthError code/message only — never the
        // session/token object or the pending identity token.
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { layer: 'auth', op: 'linkIdentity' },
        });
        track('auth_account_link_failed', {
          new_method: linkingNewMethod || pendingIdentity.provider,
          code: (err as { code?: string }).code ?? 'unknown',
        });
      } finally {
        setPendingIdentity(null);
        setLinkingExpectedEmail('');
      }
    },
    [pendingIdentity, linkingExpectedEmail, linkingNewMethod],
  );

  const handleAuthError = useCallback(
    async (
      err: unknown,
      attemptedMethod?: string,
      pending?: PendingIdentity,
      attemptedEmail?: string,
    ) => {
      const code = (err as { code?: string }).code;
      if (isAccountLinkingError(code)) {
        // Supabase deliberately cannot reveal WHICH provider owns this email
        // (anti-account-enumeration, Spec 93 §3.2/P2-G7) — the sheet copy
        // names only the attempted method and routes back to the sign-in
        // stack; the user picks their original method themselves.
        if (attemptedEmail) setLinkingExpectedEmail(attemptedEmail);
        if (pending) setPendingIdentity(pending);
        linkingSheetRef.current?.expand();
        track('auth_account_link_shown', {
          new_method: attemptedMethod ?? 'unknown',
        });
        return;
      }
      const message = mapSupabaseError(code);
      if (message) setErrorMessage(message);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    [],
  );

  // Resend cooldown ticker (30s after each "Send code" press).
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleAppleSignIn = useCallback(async () => {
    if (isAuthenticating) return;
    track('auth_method_attempted', { method: 'apple' });
    let identityToken: string | null = null;
    let rawNonceForLink: string | undefined;
    let appleEmail: string | undefined;
    try {
      setAppleLoading(true);
      setErrorMessage('');
      setLinkingNewMethod('Apple');
      // Nonce contract (Spec 93 §2.3): Apple receives the SHA-256 hash and
      // signs the identity token over it; Supabase receives the *raw* value
      // via signInWithIdToken({ nonce }) and recomputes the hash server-side
      // to verify it matches the token's nonce claim. Fresh pair per attempt.
      // The pure helper at mobile/src/lib/appleAuth.ts keeps the relationship
      // unit-testable per Spec 93 §10.
      const { rawNonce, hashedNonce } = await prepareAppleNonce();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      identityToken = credential.identityToken;
      appleEmail = credential.email ?? undefined;
      if (!identityToken) throw new Error('No identity token from Apple');
      rawNonceForLink = rawNonce;
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
        nonce: rawNonce,
      });
      if (error) throw error;
      await linkPendingIdentity(data.user);
      track('auth_method_succeeded', { method: 'apple' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      // ERR_REQUEST_CANCELED fires when the user dismisses the Apple sheet —
      // not an error, just a no-op return (provider-SDK cancel, not a
      // Supabase error — Spec 93 §5 Step 1).
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      track('auth_method_failed', { method: 'apple', code: (err as { code?: string }).code ?? 'unknown' });
      await handleAuthError(
        err,
        'apple',
        identityToken && rawNonceForLink
          ? { provider: 'apple', token: identityToken, nonce: rawNonceForLink }
          : undefined,
        appleEmail,
      );
    } finally {
      setAppleLoading(false);
    }
  }, [handleAuthError, linkPendingIdentity, isAuthenticating]);

  const handleGoogleSignIn = useCallback(async () => {
    if (isAuthenticating) return;
    track('auth_method_attempted', { method: 'google' });
    // NOTE (P2-F3.1 verification, 2026-07-19): custom nonce support is a PAID
    // "Universal" feature of @react-native-google-signin — the FREE Original
    // API pinned here (13.3.1) has no nonce parameter (`SignInParams` is
    // `{ loginHint?: string }` only), so the Google ID token carries no nonce
    // claim and NO nonce is passed to `signInWithIdToken` (passing one would
    // make GoTrue reject the token as a claim mismatch). This is the
    // Supabase-documented free-tier pattern; Apple keeps the full nonce
    // contract. The plan's Item 3 nonce-pair instruction assumed free-line
    // nonce support — that premise failed live verification; flagged for the
    // output-review panel.
    let googleIdToken: string | null = null;
    let googleEmail: string | undefined;
    try {
      setGoogleLoading(true);
      setErrorMessage('');
      setLinkingNewMethod('Google');
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        // User cancelled the native picker — no error message (same contract
        // as the old auth/popup-closed-by-user empty-string branch).
        return;
      }
      // Local variable holding GOOGLE's native ID token — unrelated to the
      // authStore `accessToken` field (P2-D3 rename); this value is an
      // identity assertion consumed once by signInWithIdToken, never stored.
      googleIdToken = response.data.idToken;
      googleEmail = response.data.user.email ?? undefined;
      if (!googleIdToken) {
        setErrorMessage('Google sign-in returned no token. Try again.');
        track('auth_method_failed', { method: 'google', code: 'no_id_token' });
        return;
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: googleIdToken,
      });
      if (error) throw error;
      await linkPendingIdentity(data.user);
      track('auth_method_succeeded', { method: 'google' });
      if (isMountedRef.current) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      if (isErrorWithCode(err) && err.code === statusCodes.IN_PROGRESS) {
        // A previous native sign-in is still resolving — swallow, the
        // isAuthenticating mutex already blocks double-taps at the JS layer.
        return;
      }
      track('auth_method_failed', { method: 'google', code: (err as { code?: string }).code ?? 'unknown' });
      if (isMountedRef.current) {
        await handleAuthError(
          err,
          'google',
          googleIdToken ? { provider: 'google', token: googleIdToken } : undefined,
          googleEmail,
        );
      }
    } finally {
      if (isMountedRef.current) setGoogleLoading(false);
    }
  }, [handleAuthError, linkPendingIdentity, isAuthenticating]);

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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await linkPendingIdentity(data.user);
      track('auth_method_succeeded', { method: 'email' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      track('auth_method_failed', { method: 'email', code: (err as { code?: string }).code ?? 'unknown' });
      await handleAuthError(err, 'email');
    } finally {
      setEmailLoading(false);
    }
  }, [email, password, handleAuthError, linkPendingIdentity, isAuthenticating]);

  const handleSendCode = useCallback(async () => {
    if (isAuthenticating) return;
    if (!phoneNumber || phoneNumber.length < 12) {
      setErrorMessage('Enter a complete phone number.');
      return;
    }
    track('auth_method_attempted', { method: 'phone' });
    try {
      setPhoneLoading(true);
      setErrorMessage('');
      setLinkingNewMethod('phone');
      // Supabase: no confirmation handle is returned (P2-G6) — hold the
      // phone number itself; verifyOtp takes it directly. Bot prevention is
      // GoTrue's SMS rate limits (over_sms_send_rate_limit), not Play
      // Integrity/APN (Spec 93 §6 — no device-attestation equivalent).
      const { error } = await supabase.auth.signInWithOtp({ phone: phoneNumber });
      if (error) throw error;
      pendingPhoneRef.current = phoneNumber;
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
        const phone = pendingPhoneRef.current;
        if (!phone) {
          // Defensive: no phone-auth session active (handleSendCode not
          // called or failed). Surface a clear error rather than null-deref.
          throw Object.assign(new Error('No phone-auth session active'), {
            code: 'otp_expired',
          });
        }
        const { data, error } = await supabase.auth.verifyOtp({
          phone,
          token: code,
          type: 'sms',
        });
        if (error) throw error;
        await linkPendingIdentity(data.user);
        track('auth_otp_verified');
        track('auth_method_succeeded', { method: 'phone' });
        Keyboard.dismiss();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        setOtpError(true);
        // Token-never-in-logs: only the error CODE reaches telemetry — never
        // the session object verifyOtp resolves with.
        track('auth_method_failed', { method: 'phone', code: (err as { code?: string }).code ?? 'unknown' });
        await handleAuthError(err, 'phone');
      } finally {
        setOtpLoading(false);
      }
    },
    [handleAuthError, linkPendingIdentity],
  );

  const handleBackToSignIn = useCallback(() => {
    // P2-G7: Supabase cannot name the existing method, so the sheet's primary
    // action returns the user to the standard sign-in stack — they pick their
    // original method themselves. After that sign-in resolves,
    // linkPendingIdentity (called from each handler) attaches the captured
    // identity.
    linkingSheetRef.current?.close();
    resetTransientState();
    setMode('idle');
  }, [resetTransientState]);

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
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
            {/* D15 / P2-D1 entry point (a): phone-OTP is gated OFF. The flow
                below (sheet, OTP, verifyOtp) stays fully wired — flipping
                PHONE_AUTH_ENABLED re-enables it with no code archaeology. */}
            {PHONE_AUTH_ENABLED && (
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
            )}
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
          <Pressable
            onPress={() => router.push('/(auth)/sign-up')}
            testID="sign-up-link"
            accessibilityRole="button"
            accessibilityLabel="Sign up"
          >
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
            pendingPhoneRef.current = null;
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
        newMethod={linkingNewMethod || 'this account'}
        onLinkPress={handleBackToSignIn}
        onDismiss={() => {
          // Don't clear pendingIdentity here — the user may dismiss the
          // sheet and continue signing in with their original method, at
          // which point linkPendingIdentity will pick it up. It's only
          // cleared after a successful link or a fresh auth attempt.
        }}
      />
    </SafeAreaView>
  );
}
