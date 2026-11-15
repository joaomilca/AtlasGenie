import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  auth,
  ensureUserProfile,
  getUserProfile,
  syncUserProfile,
} from '../services/firebase';
import type { TravelerProfilePreferences, UserProfile } from '../types/models';
import {
  extractFirebaseAuthErrorCode,
  mapFirebaseAuthError,
  mapFirebaseAuthErrorToPt,
} from '../utils/domainLogic';

export { mapFirebaseAuthError, mapFirebaseAuthErrorToPt };

export interface AuthContextValue {
  user: User | null;
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<UserProfile | null>;
  updateUserProfile: (updates: Partial<TravelerProfilePreferences>) => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_ACCOUNTS_KEY = 'atlasgenie_local_auth_accounts_v1';
const LOCAL_SESSION_KEY = 'atlasgenie_auth_session_v1';

interface LocalPreviewAccount {
  uid: string;
  email: string;
  password: string;
  displayName: string;
}

function readLocalAccounts(): LocalPreviewAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: LocalPreviewAccount[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore storage errors
  }
}

function readLocalSessionUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid?: string; email?: string; displayName?: string };
    if (!parsed || !parsed.email) return null;
    return createSyntheticFirebaseUser(
      parsed.uid || `local-${Date.now()}`,
      parsed.email,
      parsed.displayName || parsed.email.split('@')[0] || 'Utilizador'
    );
  } catch {
    return null;
  }
}

function writeLocalSessionUser(user: { uid: string; email: string; displayName?: string } | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } else {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
    }
  } catch {
    // ignore storage errors
  }
}

function createSyntheticFirebaseUser(uid: string, email: string, displayName: string): User {
  return {
    uid,
    email,
    displayName,
    emailVerified: false,
    isAnonymous: false,
    metadata: {},
    providerData: [
      {
        providerId: 'password',
        uid: email,
        displayName,
        email,
        phoneNumber: null,
        photoURL: null,
      },
    ],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => '',
    getIdTokenResult: async () => ({} as any),
    reload: async () => {},
    toJSON: () => ({ uid, email, displayName }),
    phoneNumber: null,
    photoURL: null,
    providerId: 'firebase',
  };
}

function createLocalizedAuthError(rawError: unknown): Error & { code: string } {
  const code = extractFirebaseAuthErrorCode(rawError) || 'auth/invalid-credential';
  const ptMessage = mapFirebaseAuthErrorToPt({ code });
  const err = new Error(ptMessage) as Error & { code: string };
  err.code = code;
  return err;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => readLocalSessionUser());
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!isMounted) return;
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        const fallbackSessionUser = readLocalSessionUser();
        setUser(fallbackSessionUser);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Sync userProfile state whenever the authenticated user changes
  useEffect(() => {
    let isMounted = true;
    if (!user?.uid) {
      setUserProfile(null);
      return;
    }

    (async () => {
      const existing = await getUserProfile(
        user.uid,
        user.email || undefined,
        user.displayName || undefined
      );
      if (!isMounted) return;
      if (existing) {
        setUserProfile(existing);
      } else {
        const initialized = await ensureUserProfile(
          user.uid,
          user.displayName || user.email?.split('@')[0] || 'Viajante',
          user.email || 'traveller@atlasgenie.eu'
        );
        if (isMounted) setUserProfile(initialized);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [user?.uid, user?.email, user?.displayName]);

  const refreshUserProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!user?.uid) return null;
    const loaded = await getUserProfile(
      user.uid,
      user.email || undefined,
      user.displayName || undefined
    );
    if (loaded) {
      setUserProfile(loaded);
      return loaded;
    }
    const created = await ensureUserProfile(
      user.uid,
      user.displayName || user.email?.split('@')[0] || 'Viajante',
      user.email || 'traveller@atlasgenie.eu'
    );
    setUserProfile(created);
    return created;
  }, [user?.uid, user?.email, user?.displayName]);

  const updateUserProfile = useCallback(
    async (updates: Partial<TravelerProfilePreferences>): Promise<UserProfile | null> => {
      if (!user?.uid) return null;
      const updated = await syncUserProfile(user.uid, {
        name: user.displayName || user.email?.split('@')[0] || 'Viajante',
        email: user.email || 'traveller@atlasgenie.eu',
        ...updates,
      });
      setUserProfile(updated);
      return updated;
    },
    [user?.uid, user?.email, user?.displayName]
  );

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw createLocalizedAuthError({ code: 'auth/invalid-email' });
    }
    if (!password) {
      throw createLocalizedAuthError({ code: 'auth/missing-password' });
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const displayName = cred.user.displayName || cleanEmail.split('@')[0] || 'Viajante';
      writeLocalSessionUser({
        uid: cred.user.uid,
        email: cred.user.email || cleanEmail,
        displayName,
      });
      const existing = await getUserProfile(cred.user.uid, cred.user.email || cleanEmail, displayName);
      if (existing) {
        setUserProfile(existing);
      } else {
        const initialized = await ensureUserProfile(cred.user.uid, displayName, cred.user.email || cleanEmail);
        setUserProfile(initialized);
      }
      setUser(cred.user);
      return cred.user;
    } catch (error: unknown) {
      const code = extractFirebaseAuthErrorCode(error);
      if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
        const accounts = readLocalAccounts();
        const matched = accounts.find(
          (a) => a.email.toLowerCase() === cleanEmail.toLowerCase() && a.password === password
        );
        if (matched) {
          const synthUser = createSyntheticFirebaseUser(
            matched.uid,
            matched.email,
            matched.displayName
          );
          writeLocalSessionUser({
            uid: matched.uid,
            email: matched.email,
            displayName: matched.displayName,
          });
          const existing = await getUserProfile(matched.uid, matched.email, matched.displayName);
          if (existing) {
            setUserProfile(existing);
          } else {
            const initialized = await ensureUserProfile(matched.uid, matched.displayName, matched.email);
            setUserProfile(initialized);
          }
          setUser(synthUser);
          return synthUser;
        }
        throw createLocalizedAuthError({ code: 'auth/invalid-credential' });
      }
      throw createLocalizedAuthError(error);
    }
  }, []);

  const signup = useCallback(async (email: string, password: string): Promise<User> => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw createLocalizedAuthError({ code: 'auth/invalid-email' });
    }
    if (!password || password.length < 6) {
      throw createLocalizedAuthError({ code: 'auth/weak-password' });
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const displayName = cleanEmail.split('@')[0] || 'Viajante';
      const createdProfile = await ensureUserProfile(cred.user.uid, displayName, cleanEmail);
      setUserProfile(createdProfile);
      writeLocalSessionUser({
        uid: cred.user.uid,
        email: cred.user.email || cleanEmail,
        displayName,
      });
      setUser(cred.user);
      return cred.user;
    } catch (error: unknown) {
      const code = extractFirebaseAuthErrorCode(error);
      if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
        const accounts = readLocalAccounts();
        const exists = accounts.some((a) => a.email.toLowerCase() === cleanEmail.toLowerCase());
        if (exists) {
          throw createLocalizedAuthError({ code: 'auth/email-already-in-use' });
        }
        const uid = `user-${Date.now().toString(36)}`;
        const displayName = cleanEmail.split('@')[0] || 'Viajante';
        const newAccount: LocalPreviewAccount = {
          uid,
          email: cleanEmail,
          password,
          displayName,
        };
        writeLocalAccounts([...accounts, newAccount]);
        writeLocalSessionUser({ uid, email: cleanEmail, displayName });
        const createdProfile = await ensureUserProfile(uid, displayName, cleanEmail);
        setUserProfile(createdProfile);
        const synthUser = createSyntheticFirebaseUser(uid, cleanEmail, displayName);
        setUser(synthUser);
        return synthUser;
      }
      throw createLocalizedAuthError(error);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    writeLocalSessionUser(null);
    try {
      await signOut(auth);
    } catch {
      // ignore signOut errors if already signed out
    }
    setUser(null);
    setUserProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      currentUser: user,
      userProfile,
      loading,
      login,
      signup,
      logout,
      refreshUserProfile,
      updateUserProfile,
    }),
    [user, userProfile, loading, login, signup, logout, refreshUserProfile, updateUserProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

