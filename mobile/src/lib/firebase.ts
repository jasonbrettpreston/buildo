// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §2, §5 Step 1
//
// `@react-native-firebase/auth` auto-initialises from native config files
// (mobile/google-services.json on Android, mobile/GoogleService-Info.plist on
// iOS) at native module load — there is no JS-side initializeApp call. Token
// persistence is handled by native Keychain (iOS) / Keystore (Android)
// automatically — no expo-secure-store adapter required.
//
// Android caveat: removing the device screen lock can wipe Keystore-encrypted
// items, which means the Firebase refresh token disappears and the user is
// signed out unexpectedly. This is an OS-level behaviour, not an app bug.
// Spec 93 §3.1 "indefinite persistence" remains best-effort under this
// constraint.
import auth from '@react-native-firebase/auth';

export { auth };
