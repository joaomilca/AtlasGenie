import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { app, db, auth, analytics, firebaseConfig, saveTrip, getUserTrips } from '../firebase';
import type { TravelerProfilePreferences, UserProfile } from '../types/models';
import {
  buildInitialUserProfileDocument,
  normalizeUserProfileSnapshot,
} from '../utils/domainLogic';

export { app, db, auth, analytics, firebaseConfig, saveTrip, getUserTrips };

const LOCAL_USER_PROFILE_PREFIX = 'atlasgenie_user_profile_';

function readLocalUserProfile(uid: string): Record<string, unknown> | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_USER_PROFILE_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function writeLocalUserProfile(uid: string, profile: UserProfile): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    window.localStorage.setItem(`${LOCAL_USER_PROFILE_PREFIX}${uid}`, JSON.stringify(profile));
  } catch {
    // ignore storage quota errors
  }
}

// Validate connection to Firestore on boot (Mandatory per Firebase Integration Skill)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
if (typeof window !== 'undefined') {
  testConnection();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  await ensureUserProfile(cred.user.uid, cred.user.displayName || 'Traveller', cred.user.email || '');
  return cred.user;
}

export async function loginWithEmail(email: string, pass: string) {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  return cred.user;
}

export async function registerWithEmail(name: string, email: string, pass: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  if (name) {
    await updateProfile(cred.user, { displayName: name });
  }
  await ensureUserProfile(cred.user.uid, name || 'Traveller', email);
  return cred.user;
}

export async function resetUserPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function logoutUser() {
  await fbSignOut(auth);
}

/**
 * Fetches the authenticated user's profile document from `users/{uid}` in Firestore,
 * falling back to local profile storage when offline or in local preview auth mode.
 */
export async function getUserProfile(
  uid: string,
  fallbackEmail?: string,
  fallbackName?: string
): Promise<UserProfile | null> {
  if (!uid) return null;
  const cachedRaw = readLocalUserProfile(uid);

  if (auth.currentUser && auth.currentUser.uid === uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const remoteData = snap.data() as Record<string, unknown>;
        const normalized = normalizeUserProfileSnapshot(
          uid,
          { ...(cachedRaw || {}), ...remoteData },
          fallbackEmail || auth.currentUser.email || undefined,
          fallbackName || auth.currentUser.displayName || undefined
        );
        writeLocalUserProfile(uid, normalized);
        return normalized;
      }
    } catch {
      // Fall back to local profile cache if rules/network restrict unverified preview reads
    }
  }

  if (cachedRaw) {
    return normalizeUserProfileSnapshot(uid, cachedRaw, fallbackEmail, fallbackName);
  }

  return null;
}

/**
 * Generic Firestore helper function to sync the authenticated user's profile & preferences
 * (`defaultGroupSize`, `defaultPaceLevel`, `savedInterests`, `savedRestrictions`) to `users/{uid}`.
 */
export async function syncUserProfile(
  uid: string,
  updates: Partial<UserProfile> & Partial<TravelerProfilePreferences> & {
    name?: string;
    email?: string;
  }
): Promise<UserProfile> {
  const existing = await getUserProfile(
    uid,
    updates.email || auth.currentUser?.email || undefined,
    updates.name || auth.currentUser?.displayName || undefined
  );

  const mergedDoc = buildInitialUserProfileDocument({
    uid,
    name: updates.name ?? existing?.name ?? auth.currentUser?.displayName ?? undefined,
    email: updates.email ?? existing?.email ?? auth.currentUser?.email ?? undefined,
    language: updates.language ?? existing?.language ?? 'pt',
    notificationEnabled:
      updates.notificationEnabled ??
      updates.notificationPrefs?.enabled ??
      existing?.notificationEnabled ??
      true,
    reminderDaysBefore:
      updates.reminderDaysBefore ??
      updates.notificationPrefs?.daysBefore ??
      existing?.reminderDaysBefore ??
      3,
    defaultGroupSize: updates.defaultGroupSize ?? existing?.defaultGroupSize,
    defaultPaceLevel: updates.defaultPaceLevel ?? existing?.defaultPaceLevel,
    savedInterests: updates.savedInterests ?? existing?.savedInterests,
    savedRestrictions: updates.savedRestrictions ?? existing?.savedRestrictions,
  });

  const normalizedProfile: UserProfile = {
    ...mergedDoc,
    notificationPrefs: {
      enabled: mergedDoc.notificationEnabled,
      daysBefore: mergedDoc.reminderDaysBefore,
    },
  };

  writeLocalUserProfile(uid, normalizedProfile);

  if (auth.currentUser && auth.currentUser.uid === uid && auth.currentUser.emailVerified) {
    const path = `users/${uid}`;
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          ...mergedDoc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  } else if (auth.currentUser && auth.currentUser.uid === uid) {
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          ...mergedDoc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // Unverified email/password user in preview environment; profile is persisted in local cache
    }
  }

  return normalizedProfile;
}

/**
 * Automatically creates or initializes a `users/{uid}` document when a user signs up via Firebase Auth.
 */
export async function ensureUserProfile(
  uid: string,
  name: string,
  email: string,
  overrides?: Partial<TravelerProfilePreferences>
): Promise<UserProfile> {
  const existing = readLocalUserProfile(uid);
  return syncUserProfile(uid, {
    name: name || (typeof existing?.name === 'string' ? existing.name : 'Viajante'),
    email: email || (typeof existing?.email === 'string' ? existing.email : 'traveller@atlasgenie.eu'),
    defaultGroupSize:
      overrides?.defaultGroupSize ??
      (typeof existing?.defaultGroupSize === 'number' ? existing.defaultGroupSize : undefined),
    defaultPaceLevel:
      overrides?.defaultPaceLevel ??
      (typeof existing?.defaultPaceLevel === 'number' ? existing.defaultPaceLevel : undefined),
    savedInterests:
      overrides?.savedInterests ??
      (Array.isArray(existing?.savedInterests) ? (existing.savedInterests as string[]) : undefined),
    savedRestrictions:
      overrides?.savedRestrictions ??
      (Array.isArray(existing?.savedRestrictions)
        ? (existing.savedRestrictions as string[])
        : undefined),
  });
}

export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
};

