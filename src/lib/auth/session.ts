import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './config';
import type { UserProfile, AccountType } from './types';
import { DEFAULT_PREFERENCES } from './types';

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

async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}
