import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './config';
import type { UserProfile, UserPreferences, AccountType } from './types';
import { DEFAULT_PREFERENCES } from './types';
// Cross-layer import intentional: sign-out MUST clear the lead feed
// store to prevent user A's `snappedLocation` (home GPS coords) from
// being inherited by user B on the same device. Phase 3-holistic WF3
// Phase C (2026-04-09, Independent reviewer C2). No other features
// currently persist user-scoped state; when more do, consider a
// shared `useUserBoundStores` registry instead of direct imports.
import { resetLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';

const googleProvider = new GoogleAuthProvider();

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  accountType: AccountType
): Promise<UserProfile> {
  const auth = getFirebaseAuth();
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  const profile = await createUserProfile(user, displayName, accountType);
  return profile;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<User> {
  const auth = getFirebaseAuth();
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return user;
}

export async function signInWithGoogle(): Promise<User> {
  const auth = getFirebaseAuth();
  const { user } = await signInWithPopup(auth, googleProvider);

  // Check if profile exists, create if not
  const profile = await getUserProfile(user.uid);
  if (!profile) {
    await createUserProfile(user, user.displayName || 'User', 'individual');
  }

  return user;
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
  // Wipe per-device Zustand state + localStorage slice. Run AFTER
  // the Firebase sign-out so a mid-flight exception from Firebase
  // doesn't clear the local store for a user who is still signed
  // in. The reset is a local operation and will not throw.
  resetLeadFeedState();
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

async function createUserProfile(
  user: User,
  displayName: string,
  accountType: AccountType
): Promise<UserProfile> {
  const db = getFirebaseDb();
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email || '',
    display_name: displayName,
    account_type: accountType,
    created_at: new Date(),
    onboarding_completed: false,
  };

  await setDoc(doc(db, 'users', user.uid), profile);
  await setDoc(
    doc(db, 'users', user.uid, 'preferences', 'notifications'),
    DEFAULT_PREFERENCES
  );

  return profile;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function getUserPreferences(uid: string): Promise<UserPreferences> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'notifications'));
  if (!snap.exists()) return DEFAULT_PREFERENCES;
  return snap.data() as UserPreferences;
}

export async function updateUserPreferences(
  uid: string,
  prefs: Partial<UserPreferences>
): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'users', uid, 'preferences', 'notifications'), prefs);
}

export async function completeOnboarding(uid: string): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'users', uid), { onboarding_completed: true });
}

export async function savePermit(
  uid: string,
  permitNum: string,
  revisionNum: string
): Promise<void> {
  const db = getFirebaseDb();
  const permitId = `${permitNum}--${revisionNum}`;
  await setDoc(doc(db, 'users', uid, 'savedPermits', permitId), {
    permit_num: permitNum,
    revision_num: revisionNum,
    status: 'new',
    notes: '',
    saved_at: new Date(),
    updated_at: new Date(),
  });
}

export async function updateSavedPermitStatus(
  uid: string,
  permitId: string,
  status: string,
  notes?: string
): Promise<void> {
  const db = getFirebaseDb();
  const update: Record<string, unknown> = { status, updated_at: new Date() };
  if (notes !== undefined) update.notes = notes;
  await updateDoc(doc(db, 'users', uid, 'savedPermits', permitId), update);
}
