// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, type Analytics } from 'firebase/analytics';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  arrayUnion,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseAppletConfig from '../firebase-applet-config.json';
import type { FullTripBundle, Trip, Day, Traveler, Expense } from './types/models';

// Use the provisioned AI Studio Firebase configuration (including firestoreDatabaseId)
export const firebaseConfig = firebaseAppletConfig;

// Initialize Firebase
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseAppletConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Initialize Analytics safely in browser environments when measurementId is configured
export const analytics: Analytics | null =
  typeof window !== 'undefined' && Boolean(firebaseConfig.measurementId)
    ? (() => {
        try {
          return getAnalytics(app);
        } catch {
          return null;
        }
      })()
    : null;

function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function getLocalSavedTripsCache(userId: string): FullTripBundle[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`atlasgenie_user_trips_${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalSavedTripsCache(userId: string, bundles: FullTripBundle[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`atlasgenie_user_trips_${userId}`, JSON.stringify(bundles));
  } catch {
    // ignore storage quota errors
  }
}

function extractCreatedAtMillis(data: Record<string, any>): number {
  const ts = data.createdAt;
  if (ts instanceof Timestamp) {
    return ts.toMillis();
  }
  if (ts && typeof ts.seconds === 'number') {
    return ts.seconds * 1000;
  }
  if (typeof data.createdAtMs === 'number') {
    return data.createdAtMs;
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function normalizeTripDocToBundle(
  docId: string,
  data: Record<string, any>,
  fallbackUserId: string,
  subDays?: Day[]
): FullTripBundle {
  const nestedTrip = (data.trip && typeof data.trip === 'object' ? data.trip : {}) as Partial<Trip>;
  const destination = String(data.destination || nestedTrip.destination || 'Lisbon');
  const startDate = String(data.startDate || nestedTrip.startDate || '2026-05-14');
  const endDate = String(data.endDate || nestedTrip.endDate || '2026-05-17');

  const trip: Trip = {
    id: docId || String(nestedTrip.id || data.id || `trip-${Date.now()}`),
    ownerId: String(data.userId || data.ownerId || nestedTrip.ownerId || fallbackUserId),
    destination,
    country: data.country || nestedTrip.country || undefined,
    startDate,
    endDate,
    currency: String(data.currency || nestedTrip.currency || 'EUR'),
    totalBudget: Number(data.totalBudget ?? nestedTrip.totalBudget ?? 800),
    travelersCount: Number(data.travelersCount ?? nestedTrip.travelersCount ?? 2),
    interests: Array.isArray(data.interests)
      ? data.interests
      : Array.isArray(nestedTrip.interests)
      ? nestedTrip.interests
      : ['food', 'culture'],
    defaultPace: Number(data.defaultPace ?? nestedTrip.defaultPace ?? 3),
    status: (data.status || nestedTrip.status || 'planned') as Trip['status'],
    memberIds: Array.isArray(data.memberIds)
      ? data.memberIds
      : Array.isArray(nestedTrip.memberIds)
      ? nestedTrip.memberIds
      : [fallbackUserId],
    inviteCode: String(data.inviteCode || nestedTrip.inviteCode || 'ATLAS26'),
    assumptions: Array.isArray(data.assumptions)
      ? data.assumptions
      : Array.isArray(nestedTrip.assumptions)
      ? nestedTrip.assumptions
      : [],
    groupEnabled: Boolean(data.groupEnabled ?? nestedTrip.groupEnabled ?? false),
    isDemo: false,
  };

  const resolvedDays =
    subDays && subDays.length > 0
      ? subDays
      : Array.isArray(data.days)
      ? (data.days as Day[])
      : [];

  const days: Day[] = resolvedDays
    .map((d) => ({
      ...d,
      tripId: trip.id,
      ownerId: trip.ownerId,
    }))
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const travelers: Traveler[] = Array.isArray(data.travelers)
    ? (data.travelers as Traveler[]).map((t) => ({
        ...t,
        tripId: trip.id,
        ownerId: trip.ownerId,
      }))
    : [];

  const expenses: Expense[] = Array.isArray(data.expenses)
    ? (data.expenses as Expense[]).map((e) => ({
        ...e,
        tripId: trip.id,
        ownerId: trip.ownerId,
      }))
    : [];

  return {
    trip,
    days,
    travelers,
    expenses,
  };
}

/**
 * Adds a new trip document to the `trips` collection in Firestore with a `createdAt` timestamp.
 */
export async function saveTrip(
  userId: string,
  tripData: FullTripBundle | Record<string, any>
): Promise<FullTripBundle> {
  const isBundle = Boolean(
    tripData && typeof tripData === 'object' && 'trip' in tripData && 'days' in tripData
  );
  const rawTrip: Partial<Trip> = isBundle
    ? (tripData as FullTripBundle).trip
    : (tripData as Partial<Trip>);
  const rawDays: Day[] = isBundle
    ? (tripData as FullTripBundle).days
    : Array.isArray((tripData as any)?.days)
    ? (tripData as any).days
    : [];
  const rawTravelers: Traveler[] = isBundle
    ? (tripData as FullTripBundle).travelers
    : Array.isArray((tripData as any)?.travelers)
    ? (tripData as any).travelers
    : [];
  const rawExpenses: Expense[] = isBundle
    ? (tripData as FullTripBundle).expenses
    : Array.isArray((tripData as any)?.expenses)
    ? (tripData as any).expenses
    : [];

  const nowMs = Date.now();
  const tripRef = doc(collection(db, 'trips'));
  const savedDocId = tripRef.id;

  const cleanInviteCode = String(
    rawTrip.inviteCode || `AG${nowMs.toString(36).slice(-4).toUpperCase()}`
  )
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 32) || 'ATLAS26';

  const strictTripDoc = {
    id: savedDocId,
    userId,
    ownerId: userId,
    destination: String(rawTrip.destination || 'Lisbon').slice(0, 120),
    startDate: String(rawTrip.startDate || '2026-05-14').slice(0, 32),
    endDate: String(rawTrip.endDate || '2026-05-17').slice(0, 32),
    currency: String(rawTrip.currency || 'EUR').slice(0, 10),
    totalBudget: Math.min(1000000, Math.max(0, Number(rawTrip.totalBudget ?? 800))),
    travelersCount: Math.min(
      50,
      Math.max(1, Number(rawTrip.travelersCount ?? Math.max(1, rawTravelers.length || 2)))
    ),
    interests: (rawTrip.interests || ['food', 'culture'])
      .slice(0, 10)
      .map((i) => String(i).slice(0, 50)),
    defaultPace: Math.min(5, Math.max(1, Number(rawTrip.defaultPace ?? 3))),
    status:
      rawTrip.status === 'draft' || rawTrip.status === 'ongoing'
        ? rawTrip.status
        : ('planned' as const),
    memberIds: Array.from(new Set([userId, ...(rawTrip.memberIds || [])]))
      .filter((m) => /^[a-zA-Z0-9_-]+$/.test(m))
      .slice(0, 10),
    inviteCode: cleanInviteCode,
    assumptions: (rawTrip.assumptions || [])
      .slice(0, 10)
      .map((a) => String(a).slice(0, 200)),
    groupEnabled: Boolean(rawTrip.groupEnabled),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(tripRef, strictTripDoc);

    for (const day of rawDays) {
      const cleanDayId =
        String(day.id || `day-${day.dayNumber}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) ||
        `day-${day.dayNumber}`;
      await setDoc(doc(db, 'trips', savedDocId, 'days', cleanDayId), {
        id: cleanDayId,
        tripId: savedDocId,
        ownerId: userId,
        date: String(day.date || strictTripDoc.startDate).slice(0, 32),
        dayNumber: Math.min(30, Math.max(1, Number(day.dayNumber || 1))),
        paceLevel: Math.min(5, Math.max(1, Number(day.paceLevel || 3))),
        paceScore: Math.min(100, Math.max(0, Number(day.paceScore || 50))),
        activePlan: day.activePlan === 'B' ? 'B' : 'A',
        activities: sanitizeForFirestore((day.activities || []).slice(0, 10)),
        planB: sanitizeForFirestore((day.planB || []).slice(0, 10)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Firestore saveTrip notice (cached locally):', err);
  }

  const localBundlePayload = sanitizeForFirestore({
    ...strictTripDoc,
    country: rawTrip.country || '',
    days: rawDays,
    travelers: rawTravelers,
    expenses: rawExpenses,
    createdAtMs: nowMs,
  });

  const savedBundle = normalizeTripDocToBundle(savedDocId, localBundlePayload, userId, rawDays);
  const existingLocal = getLocalSavedTripsCache(userId).filter(
    (b) => b.trip.id !== savedBundle.trip.id
  );
  setLocalSavedTripsCache(userId, [savedBundle, ...existingLocal]);

  return savedBundle;
}

/**
 * Queries the `trips` collection in Firestore where `userId` matches the logged-in user,
 * ordered by `createdAt` descending.
 */
export async function getUserTrips(userId: string): Promise<FullTripBundle[]> {
  if (!userId) return [];

  try {
    const tripsRef = collection(db, 'trips');
    let docsList: { id: string; data: Record<string, any> }[] = [];

    try {
      const orderedQuery = query(
        tripsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(orderedQuery);
      docsList = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        data: docSnap.data() as Record<string, any>,
      }));
    } catch {
      // Fallback if composite index (userId ASC, createdAt DESC) is still building in Firestore
      const fallbackQuery = query(tripsRef, where('userId', '==', userId));
      const snapshot = await getDocs(fallbackQuery);
      docsList = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          data: docSnap.data() as Record<string, any>,
        }))
        .sort((a, b) => extractCreatedAtMillis(b.data) - extractCreatedAtMillis(a.data));
    }

    const localCacheById = new Map(
      getLocalSavedTripsCache(userId).map((b) => [b.trip.id, b] as const)
    );

    const firestoreBundles: FullTripBundle[] = await Promise.all(
      docsList.map(async (item) => {
        let subDays: Day[] = [];
        try {
          const daysSnap = await getDocs(collection(db, 'trips', item.id, 'days'));
          subDays = daysSnap.docs.map((d) => d.data() as Day);
        } catch {
          // ignore subcollection fetch error
        }
        const cached = localCacheById.get(item.id);
        const bundle = normalizeTripDocToBundle(
          item.id,
          item.data,
          userId,
          subDays.length > 0 ? subDays : cached?.days
        );
        if (cached) {
          if (bundle.travelers.length === 0) bundle.travelers = cached.travelers;
          if (bundle.expenses.length === 0) bundle.expenses = cached.expenses;
        }
        return bundle;
      })
    );

    if (firestoreBundles.length > 0) {
      setLocalSavedTripsCache(userId, firestoreBundles);
      return firestoreBundles;
    }

    return getLocalSavedTripsCache(userId);
  } catch (err) {
    console.warn('Firestore getUserTrips fallback to local cache:', err);
    return getLocalSavedTripsCache(userId);
  }
}

/**
 * Queries Firestore for a trip matching the given trip ID or inviteCode,
 * with fallback to locally cached trips so both cloud and demo/local invites resolve reliably.
 */
export async function fetchTripByIdOrInviteCode(
  codeOrId: string,
  localTrips?: Record<string, FullTripBundle>
): Promise<FullTripBundle | null> {
  const cleanRaw = (codeOrId || '').trim();
  if (!cleanRaw) return null;
  const cleanUpper = cleanRaw.toUpperCase();

  // 1. Check local trips first if already loaded in memory
  if (localTrips) {
    const localMatch = (Object.values(localTrips) as FullTripBundle[]).find(
      (b) =>
        b.trip.id === cleanRaw ||
        b.trip.inviteCode.toUpperCase() === cleanUpper
    );
    if (localMatch) {
      return localMatch;
    }
  }

  // 2. Query Firestore by exact document ID or by inviteCode field
  try {
    const directDocRef = doc(db, 'trips', cleanRaw);
    const directSnap = await getDoc(directDocRef);
    if (directSnap.exists()) {
      const data = directSnap.data() as Record<string, any>;
      let subDays: Day[] = [];
      try {
        const daysSnap = await getDocs(collection(db, 'trips', directSnap.id, 'days'));
        subDays = daysSnap.docs.map((d) => d.data() as Day);
      } catch {
        // ignore subcollection read fallback
      }
      return normalizeTripDocToBundle(
        directSnap.id,
        data,
        String(data.ownerId || data.userId || 'owner'),
        subDays
      );
    }

    const inviteQuery = query(
      collection(db, 'trips'),
      where('inviteCode', '==', cleanUpper)
    );
    const querySnap = await getDocs(inviteQuery);
    if (!querySnap.empty) {
      const matchedDoc = querySnap.docs[0];
      const data = matchedDoc.data() as Record<string, any>;
      let subDays: Day[] = [];
      try {
        const daysSnap = await getDocs(collection(db, 'trips', matchedDoc.id, 'days'));
        subDays = daysSnap.docs.map((d) => d.data() as Day);
      } catch {
        // ignore subcollection read fallback
      }
      return normalizeTripDocToBundle(
        matchedDoc.id,
        data,
        String(data.ownerId || data.userId || 'owner'),
        subDays
      );
    }
  } catch (err) {
    console.warn('Firestore fetchTripByIdOrInviteCode notice:', err);
  }

  return null;
}

/**
 * Uses Firestore's `arrayUnion` to push the authenticated `userUid` into the trip's
 * `travelers` and `memberIds` arrays, and optionally writes the Traveler subcollection doc.
 */
export async function joinTripWithArrayUnion(
  tripId: string,
  userUid: string,
  travelerRecord?: Traveler
): Promise<{ joined: boolean; tripId: string; userUid: string }> {
  const cleanTripId = (tripId || '').trim();
  const cleanUid = (userUid || '').trim();
  if (!cleanTripId || !cleanUid) {
    throw new Error('Valid tripId and authenticated user.uid are required to join a trip.');
  }

  try {
    const tripDocRef = doc(db, 'trips', cleanTripId);
    await updateDoc(tripDocRef, {
      travelers: arrayUnion(cleanUid),
      memberIds: arrayUnion(cleanUid),
      groupEnabled: true,
      updatedAt: serverTimestamp(),
    });

    if (travelerRecord) {
      await setDoc(
        doc(db, 'trips', cleanTripId, 'travelers', travelerRecord.id),
        {
          ...sanitizeForFirestore(travelerRecord),
          userId: cleanUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn('Firestore joinTripWithArrayUnion notice (applied to local state):', err);
  }

  return {
    joined: true,
    tripId: cleanTripId,
    userUid: cleanUid,
  };
}

