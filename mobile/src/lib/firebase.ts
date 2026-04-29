// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §2, §5 Step 1
import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
// getReactNativePersistence is exported from firebase/auth via the 'react-native'
// conditional package export; TypeScript does not resolve that condition by
// default (would require customConditions in tsconfig). At bundle time Metro
// reads the package's "react-native" field and ships the correct module.
// @ts-expect-error — RN-only export, resolved at bundle time.
import { getReactNativePersistence } from 'firebase/auth';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Fail fast if any required env var is missing — a cryptic Firebase error
// thrown deep inside initializeAuth is much harder to debug than a clear
// startup failure that names the missing key.
const requiredKeys: (keyof typeof firebaseConfig)[] = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
];
for (const key of requiredKeys) {
  if (!firebaseConfig[key]) {
    // camelCase → SCREAMING_SNAKE: apiKey → API_KEY, projectId → PROJECT_ID, etc.
    const envName = `EXPO_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
    throw new Error(
      `Firebase config missing: ${envName}. Set it in mobile/.env.local or via EAS Secrets.`,
    );
  }
}

// Guard against double-initialization in Expo fast-refresh cycles.
const existingApps = getApps();
const app = existingApps.length === 0 ? initializeApp(firebaseConfig) : existingApps[0];

// expo-secure-store does NOT export an AsyncStorage-compatible adapter, so we
// hand-implement the bridge. Tokens stored via SecureStore use Keychain (iOS)
// and Keystore (Android) — never plain text — which is why we use it instead
// of AsyncStorage for Firebase persistence.
//
// Android caveat: removing the device screen lock can wipe Keystore-encrypted
// items, which means the Firebase refresh token disappears and the user is
// signed out unexpectedly. This is an OS-level behavior, not an app bug.
// Spec 93 §3.1 "indefinite persistence" is best-effort under this constraint.
//
// Failures from getItemAsync / setItemAsync are surfaced to Sentry rather than
// silently swallowed — a user being signed out for no apparent reason is
// almost always a SecureStore failure, and we need observability to debug it.
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      Sentry.captureException(err, { tags: { layer: 'auth-persistence', op: 'getItem' } });
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (err) {
      Sentry.captureException(err, { tags: { layer: 'auth-persistence', op: 'setItem' } });
      // Do not re-throw — Firebase has no useful recovery for a persistence
      // failure mid-session, and re-throwing would crash the auth flow.
      // The captured exception lets us diagnose token-loss reports.
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      Sentry.captureException(err, { tags: { layer: 'auth-persistence', op: 'removeItem' } });
    }
  },
};

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ExpoSecureStoreAdapter),
});

export { app };
