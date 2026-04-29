/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §5 Testing Gates
//
// Auth state machine tests:
//  - onAuthStateChanged with a user → store hydrated, isLoading=false
//  - onAuthStateChanged(null) → store cleared (forced sign-out path)
//  - signOut() → Firebase sign-out + store resets (filter, notification)
//  - account-exists-with-different-credential → linking detected
//  - error-code mapping for the surface-level user messages

// Mock the firebase module BEFORE importing anything that uses it. The
// mocked auth + onAuthStateChanged / signOut keep the test hermetic — no
// real Firebase calls, no SecureStore, no MMKV native module.
const mockSignOut = jest.fn(() => Promise.resolve());
let authStateHandler: ((user: unknown) => void) | null = null;
const mockOnAuthStateChanged = jest.fn((_auth: unknown, handler: (user: unknown) => void) => {
  authStateHandler = handler;
  return jest.fn(); // unsubscribe
});

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (a: unknown, h: (u: unknown) => void) => mockOnAuthStateChanged(a, h),
  signOut: () => mockSignOut(),
  getReactNativePersistence: jest.fn(() => ({})),
  initializeAuth: jest.fn(() => ({})),
}));
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ options: {} })),
  getApps: jest.fn(() => []),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn(() => null),
    set: jest.fn(),
    remove: jest.fn(),
  }),
}));

import { useAuthStore, initFirebaseAuthListener } from '@/store/authStore';
import { useFilterStore } from '@/store/filterStore';
import { useNotificationStore } from '@/store/notificationStore';
import { mapFirebaseError, isAccountLinkingError } from '@/lib/firebaseErrors';

describe('authStore.signOut', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    useAuthStore.setState({ user: { uid: 'u1', email: 'a@b.com', displayName: null }, idToken: 'tok', isLoading: false });
    useFilterStore.setState({ tradeSlug: 'plumbing', radiusKm: 25, homeBaseLocation: { lat: 43, lng: -79 } });
    useNotificationStore.setState({ unreadFlightBoard: 5 });
  });

  it('calls firebase.auth().signOut()', async () => {
    await useAuthStore.getState().signOut();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('resets filterStore to initial defaults', async () => {
    await useAuthStore.getState().signOut();
    const state = useFilterStore.getState();
    expect(state.tradeSlug).toBe('');
    expect(state.radiusKm).toBe(10);
    expect(state.homeBaseLocation).toBeNull();
  });

  it('resets notificationStore unread counter', async () => {
    await useAuthStore.getState().signOut();
    expect(useNotificationStore.getState().unreadFlightBoard).toBe(0);
  });

  it('clears the auth user and idToken in-memory', async () => {
    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().idToken).toBeNull();
  });
});

describe('initFirebaseAuthListener', () => {
  beforeEach(() => {
    mockOnAuthStateChanged.mockClear();
    authStateHandler = null;
    useAuthStore.setState({ user: null, idToken: null, isLoading: true });
  });

  it('subscribes to onAuthStateChanged exactly once', () => {
    initFirebaseAuthListener();
    expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);
  });

  it('clears the store when onAuthStateChanged fires null (forced sign-out)', () => {
    initFirebaseAuthListener();
    useAuthStore.setState({ user: { uid: 'x', email: null, displayName: null }, idToken: 'tok', isLoading: false });
    authStateHandler?.(null);
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.idToken).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('hydrates the store when a Firebase user arrives', async () => {
    initFirebaseAuthListener();
    const fakeUser = {
      uid: 'abc123',
      email: 'tradesperson@buildo.app',
      displayName: 'Tradesperson',
      getIdToken: jest.fn(() => Promise.resolve('idtoken-xyz')),
    };
    authStateHandler?.(fakeUser);
    await new Promise((r) => setImmediate(r)); // flush the getIdToken promise chain
    const state = useAuthStore.getState();
    expect(state.user?.uid).toBe('abc123');
    expect(state.user?.email).toBe('tradesperson@buildo.app');
    expect(state.idToken).toBe('idtoken-xyz');
    expect(state.isLoading).toBe(false);
  });

  it('falls back to clearAuth when getIdToken rejects', async () => {
    initFirebaseAuthListener();
    const fakeUser = {
      uid: 'abc123',
      email: 'a@b.com',
      displayName: null,
      getIdToken: jest.fn(() => Promise.reject(new Error('network'))),
    };
    useAuthStore.setState({ user: { uid: 'old', email: null, displayName: null }, idToken: 'old' });
    authStateHandler?.(fakeUser);
    await new Promise((r) => setImmediate(r));
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().idToken).toBeNull();
  });
});

describe('mapFirebaseError', () => {
  it('returns user-facing message for wrong password', () => {
    expect(mapFirebaseError('auth/wrong-password')).toBe('Incorrect email or password.');
    expect(mapFirebaseError('auth/invalid-credential')).toBe('Incorrect email or password.');
  });

  it('returns rate-limit message for too-many-requests', () => {
    expect(mapFirebaseError('auth/too-many-requests')).toBe('Too many attempts. Try again in a few minutes.');
  });

  it('returns empty string when user cancels the popup', () => {
    expect(mapFirebaseError('auth/popup-closed-by-user')).toBe('');
    expect(mapFirebaseError('auth/cancelled-popup-request')).toBe('');
  });

  it('returns generic message for unknown codes', () => {
    expect(mapFirebaseError('auth/some-unknown-code')).toBe('Sign-in failed. Please try again.');
    expect(mapFirebaseError(undefined)).toBe('Sign-in failed. Please try again.');
  });
});

describe('isAccountLinkingError', () => {
  it('detects auth/account-exists-with-different-credential', () => {
    expect(isAccountLinkingError('auth/account-exists-with-different-credential')).toBe(true);
  });

  it('rejects unrelated codes', () => {
    expect(isAccountLinkingError('auth/wrong-password')).toBe(false);
    expect(isAccountLinkingError(undefined)).toBe(false);
  });
});

// Spec 95 dependent tests — re-enable after /api/user-profile is wired.
describe.skip('AuthGate profile-check (BLOCKED on Spec 95)', () => {
  it('routes to onboarding on 404', () => {
    // TODO Spec 95: enable after fetchWithAuth /api/user-profile exists.
  });
  it('routes to (app) on 200 + onboarding_complete=true', () => {
    // TODO Spec 95
  });
  it('shows reactivation modal on 403', () => {
    // TODO Spec 95
  });
  it('retries 3 times with exponential backoff on network failure', () => {
    // TODO Spec 95
  });
});
