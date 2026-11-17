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
import { normalizeTravelersList } from './utils/domainLogic';

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

export function normalizeTripDocToBundle(
  docId: string,
  data: Record<string, any>,
  fallbackUserId: string,
  subDays?: Day[],
  subTravelers?: Traveler[],
  subExpenses?: Expense[]
): FullTripBundle {
  const nestedTrip = (data.trip && typeof data.trip === 'object' ? data.trip : {}) as Partial<Trip>;
  const destination = String(data.destination || nestedTrip.destination || 'Lisbon');
  const startDate = String(data.startDate || nestedTrip.startDate || '2026-05-14');
  const endDate = String(data.endDate || nestedTrip.endDate || '2026-05-17');
  const resolvedOwnerId = String(
    data.ownerId || data.userId || nestedTrip.ownerId || fallbackUserId || 'owner'
  );
  const resolvedTripId = docId || String(nestedTrip.id || data.id || `trip-${Date.now()}`);
  const resolvedInterests = Array.isArray(data.interests)
    ? data.interests
    : Array.isArray(nestedTrip.interests)
    ? nestedTrip.interests
    : ['food', 'culture'];
  const resolvedTotalBudget = Number(data.totalBudget ?? nestedTrip.totalBudget ?? 800);
  const resolvedTravelersCount = Number(data.travelersCount ?? nestedTrip.travelersCount ?? 2);

  const combinedProfileSources = [
    ...(Array.isArray(subTravelers) ? subTravelers : []),
    ...(Array.isArray(data.travelerProfiles) ? data.travelerProfiles : []),
  ];

  const travelers: Traveler[] = normalizeTravelersList(data.travelers, combinedProfileSources, {
    tripId: resolvedTripId,
    ownerId: resolvedOwnerId,
    ownerName: typeof data.ownerName === 'string' ? data.ownerName : undefined,
    defaultInterests: resolvedInterests,
    totalBudget: resolvedTotalBudget,
    travelersCount: resolvedTravelersCount,
  }).map((t) => ({
    ...t,
    tripId: resolvedTripId,
    ownerId: resolvedOwnerId,
  }));

  const rawMemberIds = Array.isArray(data.memberIds)
    ? data.memberIds
    : Array.isArray(nestedTrip.memberIds)
    ? nestedTrip.memberIds
    : [resolvedOwnerId];
  const mergedMemberIds = Array.from(
    new Set([
      resolvedOwnerId,
      ...rawMemberIds.filter((m): m is string => typeof m === 'string' && Boolean(m.trim())),
      ...travelers.map((t) => t.userId).filter((u): u is string => Boolean(u && !u.startsWith('guest-'))),
    ])
  );

  const resolvedLang = String(
    data.language || nestedTrip.language || 'pt'
  );

  const trip: Trip = {
    id: resolvedTripId,
    ownerId: resolvedOwnerId,
    destination,
    country: data.country || nestedTrip.country || undefined,
    startDate,
    endDate,
    currency: String(data.currency || nestedTrip.currency || 'EUR'),
    totalBudget: resolvedTotalBudget,
    travelersCount: Math.max(resolvedTravelersCount, travelers.length || 1),
    interests: resolvedInterests,
    defaultPace: Number(data.defaultPace ?? nestedTrip.defaultPace ?? 3),
    status: (data.status || nestedTrip.status || 'planned') as Trip['status'],
    memberIds: mergedMemberIds,
    inviteCode: String(data.inviteCode || nestedTrip.inviteCode || 'ATLAS26'),
    assumptions: Array.isArray(data.assumptions)
      ? data.assumptions
      : Array.isArray(nestedTrip.assumptions)
      ? nestedTrip.assumptions
      : [],
    groupEnabled: Boolean(
      data.groupEnabled ?? nestedTrip.groupEnabled ?? travelers.length > 1
    ),
    isDemo: false,
    language: resolvedLang,
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

  const resolvedExpenses =
    subExpenses && subExpenses.length > 0
      ? subExpenses
      : Array.isArray(data.expenses)
      ? (data.expenses as Expense[])
      : [];

  const expenses: Expense[] = resolvedExpenses.map((e) => ({
    ...e,
    tripId: trip.id,
    ownerId: trip.ownerId,
  }));

  return {
    language: resolvedLang,
    trip,
    days,
    travelers,
    expenses,
  };
}

/**
 * Adds or updates a trip document in the `trips` collection in Firestore,
 * preserving the creator and all travelers using `arrayUnion`.
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
  const existingTripId =
    rawTrip.id && !rawTrip.id.startsWith('demo-') ? rawTrip.id : undefined;
  const tripRef = existingTripId
    ? doc(db, 'trips', existingTripId)
    : doc(collection(db, 'trips'));
  const savedDocId = tripRef.id;

  const cleanInviteCode =
    String(rawTrip.inviteCode || `AG${nowMs.toString(36).slice(-4).toUpperCase()}`)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 32) || 'ATLAS26';

  const resolvedInterests = (rawTrip.interests || ['food', 'culture'])
    .slice(0, 10)
    .map((i) => String(i).slice(0, 50));
  const resolvedTotalBudget = Math.min(1000000, Math.max(0, Number(rawTrip.totalBudget ?? 800)));
  const resolvedTravelersCount = Math.min(
    50,
    Math.max(1, Number(rawTrip.travelersCount ?? Math.max(1, rawTravelers.length || 2)))
  );

  const normalizedTravelers = normalizeTravelersList(rawTravelers, undefined, {
    tripId: savedDocId,
    ownerId: userId,
    ownerName:
      auth.currentUser?.displayName ||
      (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Organizer'),
    defaultInterests: resolvedInterests,
    totalBudget: resolvedTotalBudget,
    travelersCount: resolvedTravelersCount,
  });

  if (normalizedTravelers.length === 0 && userId) {
    const fallbackCreatorName =
      auth.currentUser?.displayName ||
      (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Organizer');
    normalizedTravelers.push({
      id: `trav-${userId.slice(0, 6)}`,
      tripId: savedDocId,
      ownerId: userId,
      userId,
      displayName: fallbackCreatorName,
      interests: resolvedInterests,
      budgetPerPerson: Math.round(resolvedTotalBudget / Math.max(1, resolvedTravelersCount)),
      constraints: 'None',
      preferredPace: Math.min(5, Math.max(1, Number(rawTrip.defaultPace ?? 3))),
      color: '#D97706',
      avatar: (fallbackCreatorName[0] || 'O').toUpperCase(),
    });
  }

  const sanitizedTravelers = sanitizeForFirestore(normalizedTravelers);
  const memberUids = Array.from(
    new Set([
      userId,
      ...(rawTrip.memberIds || []),
      ...normalizedTravelers
        .map((t) => t.userId)
        .filter((u): u is string => Boolean(u && !u.startsWith('guest-'))),
    ])
  )
    .filter((m) => /^[a-zA-Z0-9_-]+$/.test(m))
    .slice(0, 10);

  const strictTripDoc = {
    id: savedDocId,
    userId: rawTrip.ownerId || userId,
    ownerId: rawTrip.ownerId || userId,
    destination: String(rawTrip.destination || 'Lisbon').slice(0, 120),
    country: rawTrip.country || '',
    startDate: String(rawTrip.startDate || '2026-05-14').slice(0, 32),
    endDate: String(rawTrip.endDate || '2026-05-17').slice(0, 32),
    currency: String(rawTrip.currency || 'EUR').slice(0, 10),
    totalBudget: resolvedTotalBudget,
    travelersCount: Math.max(resolvedTravelersCount, normalizedTravelers.length),
    interests: resolvedInterests,
    defaultPace: Math.min(5, Math.max(1, Number(rawTrip.defaultPace ?? 3))),
    status:
      rawTrip.status === 'draft' || rawTrip.status === 'ongoing'
        ? rawTrip.status
        : ('planned' as const),
    memberIds: arrayUnion(...memberUids),
    travelers: arrayUnion(...memberUids, ...sanitizedTravelers),
    travelerProfiles: arrayUnion(...sanitizedTravelers),
    days: sanitizeForFirestore(rawDays),
    expenses: sanitizeForFirestore(rawExpenses),
    inviteCode: cleanInviteCode,
    assumptions: (rawTrip.assumptions || [])
      .slice(0, 10)
      .map((a) => String(a).slice(0, 200)),
    groupEnabled: Boolean(rawTrip.groupEnabled || normalizedTravelers.length > 1),
    language: rawTrip.language || (tripData as any)?.language || 'pt',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(tripRef, strictTripDoc, { merge: true });

    for (const traveler of sanitizedTravelers) {
      await setDoc(
        doc(db, 'trips', savedDocId, 'travelers', traveler.id),
        {
          ...traveler,
          tripId: savedDocId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    for (const day of rawDays) {
      const cleanDayId =
        String(day.id || `day-${day.dayNumber}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) ||
        `day-${day.dayNumber}`;
      await setDoc(
        doc(db, 'trips', savedDocId, 'days', cleanDayId),
        {
          id: cleanDayId,
          tripId: savedDocId,
          ownerId: rawTrip.ownerId || userId,
          date: String(day.date || strictTripDoc.startDate).slice(0, 32),
          dayNumber: Math.min(30, Math.max(1, Number(day.dayNumber || 1))),
          paceLevel: Math.min(5, Math.max(1, Number(day.paceLevel || 3))),
          paceScore: Math.min(100, Math.max(0, Number(day.paceScore || 50))),
          activePlan: day.activePlan === 'B' ? 'B' : 'A',
          activities: sanitizeForFirestore((day.activities || []).slice(0, 10)),
          planB: sanitizeForFirestore((day.planB || []).slice(0, 10)),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn('Firestore saveTrip notice (cached locally):', err);
  }

  const localBundlePayload = sanitizeForFirestore({
    ...strictTripDoc,
    id: savedDocId,
    userId: rawTrip.ownerId || userId,
    ownerId: rawTrip.ownerId || userId,
    memberIds: memberUids,
    travelers: sanitizedTravelers,
    travelerProfiles: sanitizedTravelers,
    country: rawTrip.country || '',
    days: rawDays,
    expenses: rawExpenses,
    createdAtMs: nowMs,
  });

  const savedBundle = normalizeTripDocToBundle(
    savedDocId,
    localBundlePayload,
    userId,
    rawDays,
    sanitizedTravelers,
    rawExpenses
  );
  const existingLocal = getLocalSavedTripsCache(userId).filter(
    (b) => b.trip.id !== savedBundle.trip.id
  );
  setLocalSavedTripsCache(userId, [savedBundle, ...existingLocal]);

  return savedBundle;
}

/**
 * Queries the `trips` collection in Firestore where `travelers` array-contains `userId`,
 * `memberIds` array-contains `userId`, or `userId` matches the logged-in user,
 * ordered by `createdAt` descending.
 */
export async function getUserTrips(userId: string): Promise<FullTripBundle[]> {
  if (!userId) return [];

  try {
    const tripsRef = collection(db, 'trips');
    const docMap = new Map<string, Record<string, any>>();

    const collectQueryDocs = async (q: ReturnType<typeof query>) => {
      try {
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
          docMap.set(docSnap.id, docSnap.data() as Record<string, any>);
        }
      } catch {
        // Ignore individual query index error and rely on fallback queries
      }
    };

    // 1. Primary collaborative query: where travelers array-contains userId
    await Promise.all([
      collectQueryDocs(query(tripsRef, where('travelers', 'array-contains', userId))),
      collectQueryDocs(query(tripsRef, where('memberIds', 'array-contains', userId))),
      collectQueryDocs(
        query(tripsRef, where('userId', '==', userId), orderBy('createdAt', 'desc'))
      ),
    ]);

    if (docMap.size === 0) {
      await collectQueryDocs(query(tripsRef, where('userId', '==', userId)));
    }

    const docsList = Array.from(docMap.entries())
      .map(([id, data]) => ({ id, data }))
      .sort((a, b) => extractCreatedAtMillis(b.data) - extractCreatedAtMillis(a.data));

    const localCacheById = new Map(
      getLocalSavedTripsCache(userId).map((b) => [b.trip.id, b] as const)
    );

    const firestoreBundles: FullTripBundle[] = await Promise.all(
      docsList.map(async (item) => {
        let subDays: Day[] = [];
        let subTravelers: Traveler[] = [];
        let subExpenses: Expense[] = [];
        try {
          const [daysSnap, travSnap, expSnap] = await Promise.all([
            getDocs(collection(db, 'trips', item.id, 'days')),
            getDocs(collection(db, 'trips', item.id, 'travelers')),
            getDocs(collection(db, 'trips', item.id, 'expenses')),
          ]);
          subDays = daysSnap.docs.map((d) => d.data() as Day);
          subTravelers = travSnap.docs.map((t) => t.data() as Traveler);
          subExpenses = expSnap.docs.map((e) => e.data() as Expense);
        } catch {
          // ignore subcollection fetch error
        }
        const cached = localCacheById.get(item.id);
        const bundle = normalizeTripDocToBundle(
          item.id,
          item.data,
          userId,
          subDays.length > 0 ? subDays : cached?.days,
          subTravelers.length > 0 ? subTravelers : cached?.travelers,
          subExpenses.length > 0 ? subExpenses : cached?.expenses
        );
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
    const hydrateDocSnap = async (docId: string, data: Record<string, any>) => {
      let subDays: Day[] = [];
      let subTravelers: Traveler[] = [];
      let subExpenses: Expense[] = [];
      try {
        const [daysSnap, travSnap, expSnap] = await Promise.all([
          getDocs(collection(db, 'trips', docId, 'days')),
          getDocs(collection(db, 'trips', docId, 'travelers')),
          getDocs(collection(db, 'trips', docId, 'expenses')),
        ]);
        subDays = daysSnap.docs.map((d) => d.data() as Day);
        subTravelers = travSnap.docs.map((t) => t.data() as Traveler);
        subExpenses = expSnap.docs.map((e) => e.data() as Expense);
      } catch {
        // ignore subcollection read fallback
      }
      return normalizeTripDocToBundle(
        docId,
        data,
        String(data.ownerId || data.userId || 'owner'),
        subDays,
        subTravelers,
        subExpenses
      );
    };

    const directDocRef = doc(db, 'trips', cleanRaw);
    const directSnap = await getDoc(directDocRef);
    if (directSnap.exists()) {
      return await hydrateDocSnap(directSnap.id, directSnap.data() as Record<string, any>);
    }

    const inviteQuery = query(
      collection(db, 'trips'),
      where('inviteCode', '==', cleanUpper)
    );
    const querySnap = await getDocs(inviteQuery);
    if (!querySnap.empty) {
      const matchedDoc = querySnap.docs[0];
      return await hydrateDocSnap(matchedDoc.id, matchedDoc.data() as Record<string, any>);
    }
  } catch (err) {
    console.warn('Firestore fetchTripByIdOrInviteCode notice:', err);
  }

  return null;
}

/**
 * Uses Firestore's `arrayUnion` to append the authenticated `userUid` and `travelerRecord`
 * into the trip's `travelers`, `travelerProfiles`, and `memberIds` arrays without overwriting
 * existing travelers or kicking out the original creator.
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

  const sanitizedTraveler = travelerRecord
    ? sanitizeForFirestore({
        ...travelerRecord,
        id: travelerRecord.id || `trav-${cleanUid.slice(0, 6)}`,
        tripId: cleanTripId,
        userId: cleanUid,
        displayName: travelerRecord.displayName || 'Traveler',
        interests: Array.isArray(travelerRecord.interests)
          ? travelerRecord.interests
          : ['food', 'culture'],
        budgetPerPerson: Number(travelerRecord.budgetPerPerson) || 400,
        constraints: String(travelerRecord.constraints || 'None'),
        preferredPace: Number(travelerRecord.preferredPace) || 3,
        color: travelerRecord.color || '#0D9488',
        avatar: (
          travelerRecord.avatar ||
          travelerRecord.displayName?.[0] ||
          'T'
        ).toUpperCase(),
      })
    : undefined;

  try {
    const tripDocRef = doc(db, 'trips', cleanTripId);
    await updateDoc(tripDocRef, {
      travelers: sanitizedTraveler
        ? arrayUnion(cleanUid, sanitizedTraveler)
        : arrayUnion(cleanUid),
      ...(sanitizedTraveler
        ? { travelerProfiles: arrayUnion(sanitizedTraveler) }
        : {}),
      memberIds: arrayUnion(cleanUid),
      groupEnabled: true,
      updatedAt: serverTimestamp(),
    });

    if (sanitizedTraveler) {
      await setDoc(
        doc(db, 'trips', cleanTripId, 'travelers', sanitizedTraveler.id),
        {
          ...sanitizedTraveler,
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


