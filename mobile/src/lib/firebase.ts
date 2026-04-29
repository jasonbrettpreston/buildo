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

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Guard against double-initialization in Expo fast-refresh cycles.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// expo-secure-store does NOT export an AsyncStorage-compatible adapter, so we
// hand-implement the bridge. Tokens stored via SecureStore use Keychain (iOS)
// and Keystore (Android) — never plain text — which is why we use it instead
// of AsyncStorage for Firebase persistence.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ExpoSecureStoreAdapter),
});

export { app };
