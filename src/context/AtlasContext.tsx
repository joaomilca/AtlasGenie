import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  db,
  doc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
} from '../services/firebase';
import {
  Activity,
  BudgetTier,
  Day,
  DayAccommodation,
  Expense,
  FullTripBundle,
  ProposalChange,
  Traveler,
  VoteValue,
} from '../types/models';
import { DEMO_TRIPS } from '../data/demoTrips';
import {
  ACTIVE_TRIP_STORAGE_KEY,
  BudgetOptimizationChange,
  applySelectedBudgetProposalsToDays,
  applySingleProposalChange,
  computeCurrentItineraryTotal,
  computePaceMetrics,
  computeTripTotalCost,
  deduplicateAndMergeProposals,
  getProposalTargetKey,
  hasValidItineraryData,
  parseActiveTripFromStorage,
  readActiveTripFromLocalStorage,
  recalculateDayTravelTimes,
  removeExpenseById,
  translateItineraryBundleDeterministic,
  writeActiveTripToLocalStorageGuarded,
} from '../utils/domainLogic';
import { i18n } from '../i18n/I18nContext';
import { useAuth } from './AuthContext';

export type ToastVariant = 'success' | 'alert';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface UndoHistoryEntry {
  tripId: string;
  description: string;
  previousDays: Day[];
}

interface AtlasContextValue {
  currentUser: FirebaseUser | null;
  authReady: boolean;
  isDemoMode: boolean;
  enableDemoMode: () => void;
  trips: Record<string, FullTripBundle>;
  proposalsByTrip: Record<string, ProposalChange[]>;
  undoHistoryByTrip: Record<string, UndoHistoryEntry[]>;
  activeTravelerIdByTrip: Record<string, string>;
  setActiveTravelerId: (tripId: string, travelerId: string) => void;
  saveTripBundle: (bundle: FullTripBundle) => Promise<void>;
  registerFetchedTrips: (bundles: FullTripBundle[]) => void;
  deleteTrip: (tripId: string) => Promise<void>;
  duplicateTrip: (tripId: string) => Promise<string>;
  addProposals: (tripId: string, newProposals: ProposalChange[]) => void;
  acceptProposal: (tripId: string, proposalId: string) => Promise<void>;
  rejectProposal: (tripId: string, proposalId: string) => void;
  acceptAllProposals: (tripId: string) => Promise<void>;
  rejectAllProposals: (tripId: string) => void;
  undoLastChange: (tripId: string) => Promise<void>;
  togglePlanB: (tripId: string, dayId: string) => Promise<void>;
  updateDayActivities: (tripId: string, dayId: string, activities: Activity[], paceLevel?: number) => Promise<void>;
  updateDayAccommodation: (tripId: string, dayId: string, accommodation: DayAccommodation) => Promise<void>;
  setGlobalTripTier: (tripId: string, tier: BudgetTier) => Promise<void>;
  applyBudgetSelections: (tripId: string, newTotalBudget: number, selections: Record<string, BudgetTier>) => Promise<void>;
  applySelectedBudgetProposals: (tripId: string, proposals: BudgetOptimizationChange[]) => Promise<void>;
  castVote: (tripId: string, dayId: string, activityId: string, travelerId: string, vote: VoteValue) => Promise<void>;
  addTraveler: (tripId: string, traveler: Omit<Traveler, 'id' | 'tripId' | 'ownerId'>) => Promise<Traveler>;
  addExpense: (tripId: string, expense: Omit<Expense, 'id' | 'tripId' | 'ownerId' | 'authorId'>) => Promise<void>;
  deleteExpense: (tripId: string, expenseId: string) => Promise<void>;
  toggleExpenseSettled: (tripId: string, expenseId: string) => Promise<void>;
  findTripByInviteCode: (inviteCode: string) => FullTripBundle | undefined;
  toastMessage: string | null;
  toasts: ToastItem[];
  showToast: (msg: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
}

const AtlasContext = createContext<AtlasContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'atlasgenie_trips_v1';

function loadInitialTrips(): Record<string, FullTripBundle> {
  const rawBase = JSON.parse(JSON.stringify(DEMO_TRIPS)) as Record<string, FullTripBundle>;
  const initialLang = i18n.language === 'en' ? 'en' : 'pt-PT';
  const base: Record<string, FullTripBundle> = {};
  for (const [k, b] of Object.entries(rawBase)) {
    base[k] = translateItineraryBundleDeterministic(b, initialLang);
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const activeRaw = localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
    const activeBundle = parseActiveTripFromStorage(activeRaw);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, FullTripBundle>;
      const merged: Record<string, FullTripBundle> = { ...base, ...parsed };
      for (const demoKey of Object.keys(base)) {
        if (merged[demoKey] && base[demoKey]) {
          const sameLang =
            !merged[demoKey].language || merged[demoKey].language === base[demoKey].language;
          merged[demoKey] = {
            ...merged[demoKey],
            trip: {
              ...merged[demoKey].trip,
              destination: base[demoKey].trip.destination,
              country: base[demoKey].trip.country,
              assumptions: sameLang
                ? base[demoKey].trip.assumptions
                : merged[demoKey].trip.assumptions,
              totalBudget: base[demoKey].trip.totalBudget,
            },
            days: merged[demoKey].days.map((day, idx) => ({
              ...day,
              theme:
                sameLang && base[demoKey].days[idx]?.theme
                  ? base[demoKey].days[idx].theme
                  : day.theme,
              city: base[demoKey].days[idx]?.city || day.city,
            })),
          };
        }
      }
      if (activeBundle) {
        merged[activeBundle.trip.id] = activeBundle;
      }
      return merged;
    }
    if (activeBundle) {
      return { ...base, [activeBundle.trip.id]: activeBundle };
    }
  } catch {
    // ignore storage errors
  }
  return base;
}

export const AtlasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: authContextUser, loading: authContextLoading } = useAuth();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(authContextUser);
  const [authReady, setAuthReady] = useState(!authContextLoading);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(!authContextUser);
  const [trips, setTrips] = useState<Record<string, FullTripBundle>>(loadInitialTrips);
  const [proposalsByTrip, setProposalsByTrip] = useState<Record<string, ProposalChange[]>>({});
  const [undoHistoryByTrip, setUndoHistoryByTrip] = useState<Record<string, UndoHistoryEntry[]>>({});
  const [activeTravelerIdByTrip, setActiveTravelerIdByTrip] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  const showToast = (msg: string, variant: ToastVariant = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, message: msg, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3500);
  };

  const toastMessage = toasts.length > 0 ? toasts[toasts.length - 1].message : null;

  // Persist local/demo state seamlessly
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trips));
    } catch {
      // ignore quota
    }
  }, [trips]);

  // Sync with AuthContext user
  useEffect(() => {
    setCurrentUser(authContextUser);
    setAuthReady(!authContextLoading);
    if (authContextUser) {
      setIsDemoMode(false);
    }
  }, [authContextUser, authContextLoading]);

  // Listen to Firebase Auth state with safe unmount cleanup
  useEffect(() => {
    let isMounted = true;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!isMounted) return;
      if (user) {
        setCurrentUser(user);
        setIsDemoMode(false);
      }
      setAuthReady(true);
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Real-time Firestore listener for authenticated user's trips
  useEffect(() => {
    if (!authReady || !currentUser || !auth.currentUser) return;

    const tripsPath = 'trips';
    const q = query(collection(db, tripsPath), where('memberIds', 'array-contains', currentUser.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const tripData = change.doc.data() as any;
          const tripId = change.doc.id;
          if (change.type === 'removed') {
            setTrips((prev) => {
              const next = { ...prev };
              delete next[tripId];
              return next;
            });
          } else {
            setTrips((prev) => {
              const existing = prev[tripId];
              const activePersisted = readActiveTripFromLocalStorage();
              const fallbackExisting =
                existing ||
                (activePersisted && activePersisted.trip.id === tripId ? activePersisted : undefined);
              const resolvedDays =
                Array.isArray(tripData.days) && tripData.days.length > 0
                  ? tripData.days
                  : fallbackExisting?.days || [];
              if (resolvedDays.length === 0) {
                return prev;
              }
              const nestedTrip = tripData.trip && typeof tripData.trip === 'object' ? tripData.trip : {};
              return {
                ...prev,
                [tripId]: {
                  trip: {
                    id: tripId,
                    ownerId: tripData.userId || tripData.ownerId || nestedTrip.ownerId || currentUser.uid,
                    destination: tripData.destination || nestedTrip.destination || 'Lisbon',
                    country: tripData.country || nestedTrip.country,
                    startDate: tripData.startDate || nestedTrip.startDate || '2026-05-14',
                    endDate: tripData.endDate || nestedTrip.endDate || '2026-05-17',
                    currency: tripData.currency || nestedTrip.currency || 'EUR',
                    totalBudget: Number(tripData.totalBudget ?? nestedTrip.totalBudget ?? 800),
                    travelersCount: Number(tripData.travelersCount ?? nestedTrip.travelersCount ?? 2),
                    interests: tripData.interests || nestedTrip.interests || [],
                    defaultPace: tripData.defaultPace || nestedTrip.defaultPace || 3,
                    status: tripData.status || nestedTrip.status || 'planned',
                    memberIds: tripData.memberIds || nestedTrip.memberIds || [currentUser.uid],
                    inviteCode: tripData.inviteCode || nestedTrip.inviteCode || 'ATLAS1',
                    assumptions: tripData.assumptions || nestedTrip.assumptions || [],
                    groupEnabled: Boolean(tripData.groupEnabled ?? nestedTrip.groupEnabled),
                    isDemo: false,
                  },
                  days: resolvedDays,
                  travelers:
                    Array.isArray(tripData.travelers) && tripData.travelers.length > 0
                      ? tripData.travelers
                      : fallbackExisting?.travelers || [],
                  expenses:
                    Array.isArray(tripData.expenses) && tripData.expenses.length > 0
                      ? tripData.expenses
                      : fallbackExisting?.expenses || [],
                },
              };
            });
          }
        });
      },
      (error) => {
        console.warn('Firestore snapshot listener notice:', error);
      }
    );

    return () => unsub();
  }, [authReady, currentUser]);

  const syncBundleToFirestore = async (bundle: FullTripBundle) => {
    if (!currentUser || !currentUser.emailVerified || bundle.trip.isDemo) return;
    const tripId = bundle.trip.id;
    const tripPath = `trips/${tripId}`;
    try {
      await setDoc(
        doc(db, 'trips', tripId),
        {
          id: bundle.trip.id,
          userId: bundle.trip.ownerId,
          ownerId: bundle.trip.ownerId,
          destination: bundle.trip.destination.slice(0, 120),
          startDate: bundle.trip.startDate.slice(0, 32),
          endDate: bundle.trip.endDate.slice(0, 32),
          currency: bundle.trip.currency.slice(0, 10),
          totalBudget: Number(bundle.trip.totalBudget),
          travelersCount: Number(bundle.trip.travelersCount),
          interests: bundle.trip.interests.slice(0, 10),
          defaultPace: Number(bundle.trip.defaultPace),
          status: bundle.trip.status,
          memberIds: bundle.trip.memberIds.slice(0, 10),
          inviteCode: bundle.trip.inviteCode.slice(0, 32),
          assumptions: bundle.trip.assumptions.slice(0, 10),
          groupEnabled: Boolean(bundle.trip.groupEnabled),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      for (const day of bundle.days) {
        await setDoc(
          doc(db, 'trips', tripId, 'days', day.id),
          {
            id: day.id,
            tripId,
            ownerId: bundle.trip.ownerId,
            date: day.date,
            dayNumber: day.dayNumber,
            paceLevel: day.paceLevel,
            paceScore: day.paceScore,
            activePlan: day.activePlan,
            activities: day.activities.slice(0, 10),
            planB: day.planB.slice(0, 10),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, tripPath);
    }
  };

  const enableDemoMode = () => {
    setIsDemoMode(true);
  };

  const setActiveTravelerId = (tripId: string, travelerId: string) => {
    setActiveTravelerIdByTrip((prev) => ({ ...prev, [tripId]: travelerId }));
  };

  const saveTripBundle = async (bundle: FullTripBundle) => {
    if (!hasValidItineraryData(bundle)) return;
    setTrips((prev) => ({ ...prev, [bundle.trip.id]: bundle }));
    writeActiveTripToLocalStorageGuarded(bundle, { allowDemoOverwrite: true });
    await syncBundleToFirestore(bundle);
  };

  const registerFetchedTrips = (bundles: FullTripBundle[]) => {
    if (!bundles || bundles.length === 0) return;
    setTrips((prev) => {
      const next = { ...prev };
      for (const b of bundles) {
        if (hasValidItineraryData(b)) {
          next[b.trip.id] = b;
        }
      }
      return next;
    });
  };

  const deleteTrip = async (tripId: string) => {
    const target = trips[tripId];
    setTrips((prev) => {
      const next = { ...prev };
      delete next[tripId];
      return next;
    });
    const activePersisted = readActiveTripFromLocalStorage();
    if (activePersisted && activePersisted.trip.id === tripId) {
      writeActiveTripToLocalStorageGuarded(null, { explicitClear: true });
    }
    if (currentUser && currentUser.emailVerified && target && !target.trip.isDemo) {
      try {
        await deleteDoc(doc(db, 'trips', tripId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `trips/${tripId}`);
      }
    }
    showToast(String(i18n.t('toast.tripRemoved')), 'alert');
  };

  const duplicateTrip = async (tripId: string): Promise<string> => {
    const source = trips[tripId];
    if (!source) return tripId;
    const newId = `trip-copy-${Date.now().toString(36)}`;
    const copy: FullTripBundle = JSON.parse(JSON.stringify(source));
    copy.trip.id = newId;
    copy.trip.destination = `${source.trip.destination} (Copy)`;
    copy.trip.isDemo = Boolean(!currentUser);
    copy.trip.inviteCode = `CPY${Math.floor(100 + Math.random() * 899)}`;
    copy.days = copy.days.map((d, idx) => ({ ...d, id: `${newId}-d${idx + 1}`, tripId: newId }));
    copy.travelers = copy.travelers.map((t) => ({ ...t, tripId: newId }));
    copy.expenses = copy.expenses.map((e) => ({ ...e, tripId: newId }));
    await saveTripBundle(copy);
    showToast(String(i18n.t('toast.tripDuplicated', { destination: source.trip.destination })));
    return newId;
  };

  const addProposals = (tripId: string, newProposals: ProposalChange[]) => {
    setProposalsByTrip((prev) => ({
      ...prev,
      [tripId]: deduplicateAndMergeProposals(
        prev[tripId] || [],
        newProposals,
        trips[tripId]?.days
      ),
    }));
  };

  const acceptProposal = async (tripId: string, proposalId: string) => {
    const list = proposalsByTrip[tripId] || [];
    const proposal = list.find((p) => p.id === proposalId);
    const currentBundle = trips[tripId];
    if (!currentBundle || !proposal) return;

    const acceptedKey = getProposalTargetKey(proposal);
    const snapshotDays = JSON.parse(JSON.stringify(currentBundle.days)) as Day[];

    setProposalsByTrip((prev) => ({
      ...prev,
      [tripId]: (prev[tripId] || []).filter(
        (p) =>
          p.id !== proposalId &&
          getProposalTargetKey(p) !== acceptedKey &&
          !(
            proposal.targetActivityId &&
            p.dayId === proposal.dayId &&
            p.targetActivityId === proposal.targetActivityId
          )
      ),
    }));

    setUndoHistoryByTrip((prev) => ({
      ...prev,
      [tripId]: [
        {
          tripId,
          description: proposal.reason,
          previousDays: snapshotDays,
        },
        ...(prev[tripId] || []).slice(0, 9),
      ],
    }));

    let syncedBundle: FullTripBundle | null = null;
    setTrips((prev) => {
      const targetBundle = prev[tripId];
      if (!targetBundle) return prev;
      const updatedDays = applySingleProposalChange(targetBundle.days, proposal);
      const nextBundle: FullTripBundle = {
        ...targetBundle,
        days: updatedDays,
      };
      syncedBundle = nextBundle;
      return { ...prev, [tripId]: nextBundle };
    });

    if (syncedBundle) {
      writeActiveTripToLocalStorageGuarded(syncedBundle, { allowDemoOverwrite: true });
      await syncBundleToFirestore(syncedBundle);
    }
    showToast(String(i18n.t('toast.proposalAccepted')));
  };

  const rejectProposal = (tripId: string, proposalId: string) => {
    setProposalsByTrip((prev) => ({
      ...prev,
      [tripId]: (prev[tripId] || []).filter((p) => p.id !== proposalId),
    }));
    showToast(String(i18n.t('toast.proposalRejected')), 'alert');
  };

  const acceptAllProposals = async (tripId: string) => {
    const currentBundle = trips[tripId];
    const rawList = proposalsByTrip[tripId] || [];
    if (!currentBundle || rawList.length === 0) return;

    const dedupedList = deduplicateAndMergeProposals([], rawList, currentBundle.days);
    const snapshotDays = JSON.parse(JSON.stringify(currentBundle.days)) as Day[];

    setProposalsByTrip((prev) => ({ ...prev, [tripId]: [] }));

    setUndoHistoryByTrip((prev) => ({
      ...prev,
      [tripId]: [
        {
          tripId,
          description: `Accepted ${dedupedList.length} proposed changes`,
          previousDays: snapshotDays,
        },
        ...(prev[tripId] || []).slice(0, 9),
      ],
    }));

    let syncedBundle: FullTripBundle | null = null;
    setTrips((prev) => {
      const targetBundle = prev[tripId];
      if (!targetBundle) return prev;
      let workingDays = [...targetBundle.days];
      for (const prop of dedupedList) {
        workingDays = applySingleProposalChange(workingDays, prop);
      }
      const nextBundle: FullTripBundle = {
        ...targetBundle,
        days: workingDays,
      };
      syncedBundle = nextBundle;
      return { ...prev, [tripId]: nextBundle };
    });

    if (syncedBundle) {
      writeActiveTripToLocalStorageGuarded(syncedBundle, { allowDemoOverwrite: true });
      await syncBundleToFirestore(syncedBundle);
    }
    showToast(String(i18n.t('toast.allProposalsAccepted', { count: dedupedList.length })));
  };

  const rejectAllProposals = (tripId: string) => {
    setProposalsByTrip((prev) => ({ ...prev, [tripId]: [] }));
    showToast(String(i18n.t('toast.allProposalsRejected')), 'alert');
  };

  const undoLastChange = async (tripId: string) => {
    const history = undoHistoryByTrip[tripId] || [];
    const bundle = trips[tripId];
    if (!bundle || history.length === 0) return;

    const [latest, ...rest] = history;
    const nextBundle: FullTripBundle = {
      ...bundle,
      days: latest.previousDays,
    };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    setUndoHistoryByTrip((prev) => ({ ...prev, [tripId]: rest }));
    writeActiveTripToLocalStorageGuarded(nextBundle, { allowDemoOverwrite: true });
    await syncBundleToFirestore(nextBundle);
    showToast(String(i18n.t('toast.undidLastChange')), 'alert');
  };

  const togglePlanB = async (tripId: string, dayId: string) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const snapshotDays = JSON.parse(JSON.stringify(bundle.days)) as Day[];
    setUndoHistoryByTrip((prev) => ({
      ...prev,
      [tripId]: [
        {
          tripId,
          description: `Switched Plan A/B for day ${dayId}`,
          previousDays: snapshotDays,
        },
        ...(prev[tripId] || []).slice(0, 9),
      ],
    }));

    const nextDays = bundle.days.map((d) => {
      if (d.id !== dayId) return d;
      const nextPlan: 'A' | 'B' = d.activePlan === 'A' ? 'B' : 'A';
      // Ensure Plan B has activities if switching to B
      let planBList = d.planB;
      if (nextPlan === 'B' && planBList.length === 0) {
        planBList = d.activities.map((act) => ({
          ...act,
          id: `${act.id}-planb`,
          title: act.isOutdoor ? `Indoor Museum & Covered Gallery (${bundle.trip.destination})` : act.title,
          description: act.isOutdoor
            ? 'Rain-proof indoor cultural alternative keeping your schedule intact.'
            : act.description,
          isOutdoor: false,
        }));
      }
      const updated: Day = {
        ...d,
        activePlan: nextPlan,
        planB: planBList,
      };
      updated.paceScore = computePaceMetrics(updated).paceScore;
      return updated;
    });

    const nextBundle: FullTripBundle = { ...bundle, days: nextDays };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    writeActiveTripToLocalStorageGuarded(nextBundle, { allowDemoOverwrite: true });
    await syncBundleToFirestore(nextBundle);
    showToast(String(i18n.t('toast.itineraryUpdated')));
  };

  const updateDayActivities = async (
    tripId: string,
    dayId: string,
    activities: Activity[],
    paceLevel?: number
  ) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const snapshotDays = JSON.parse(JSON.stringify(bundle.days)) as Day[];
    setUndoHistoryByTrip((prev) => ({
      ...prev,
      [tripId]: [
        {
          tripId,
          description: `Updated activities for day ${dayId}`,
          previousDays: snapshotDays,
        },
        ...(prev[tripId] || []).slice(0, 9),
      ],
    }));

    const recalculated = recalculateDayTravelTimes(activities);
    const nextDays = bundle.days.map((d) => {
      if (d.id !== dayId) return d;
      const isPlanB = d.activePlan === 'B' && d.planB.length > 0;
      const updated: Day = {
        ...d,
        paceLevel: paceLevel ?? d.paceLevel,
        activities: isPlanB ? d.activities : recalculated,
        planB: isPlanB ? recalculated : d.planB,
      };
      updated.paceScore = computePaceMetrics(updated).paceScore;
      return updated;
    });

    const nextBundle = {
      ...bundle,
      days: nextDays,
    };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    writeActiveTripToLocalStorageGuarded(nextBundle, { allowDemoOverwrite: true });
    await syncBundleToFirestore(nextBundle);
  };

  const updateDayAccommodation = async (
    tripId: string,
    dayId: string,
    accommodation: DayAccommodation
  ) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const snapshotDays = JSON.parse(JSON.stringify(bundle.days)) as Day[];
    setUndoHistoryByTrip((prev) => ({
      ...prev,
      [tripId]: [
        {
          tripId,
          description: `Updated accommodation for day ${dayId}`,
          previousDays: snapshotDays,
        },
        ...(prev[tripId] || []).slice(0, 9),
      ],
    }));

    const nextDays = bundle.days.map((d) =>
      d.id === dayId ? { ...d, accommodation } : d
    );
    const nextBundle: FullTripBundle = {
      ...bundle,
      days: nextDays,
    };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    writeActiveTripToLocalStorageGuarded(nextBundle, { allowDemoOverwrite: true });
    await syncBundleToFirestore(nextBundle);
  };

  const setGlobalTripTier = async (tripId: string, tier: BudgetTier) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const snapshotDays = JSON.parse(JSON.stringify(bundle.days)) as Day[];
    const nextDays = bundle.days.map((d) => {
      const tierOpt = d.accommodation?.tierOptions?.[tier];
      return {
        ...d,
        accommodation: d.accommodation
          ? {
              ...d.accommodation,
              ...(tierOpt
                ? {
                    name: tierOpt.name,
                    type: tierOpt.type || d.accommodation.type,
                    price: tierOpt.price,
                    coordinates: tierOpt.coordinates || d.accommodation.coordinates,
                  }
                : {}),
              selectedTier: tier,
              customPriceLocked: false,
            }
          : d.accommodation,
        activities: d.activities.map((a) => ({ ...a, selectedTier: tier })),
        planB: d.planB.map((a) => ({ ...a, selectedTier: tier })),
      };
    });

    const recomputedTotal = computeTripTotalCost(
      nextDays,
      bundle.trip.travelersCount || 1
    ).total;

    setUndoHistoryByTrip((prev) => ({
      ...prev,
      [tripId]: [
        {
          tripId,
          description: `Switched global tier to ${tier} (~€${recomputedTotal})`,
          previousDays: snapshotDays,
        },
        ...(prev[tripId] || []).slice(0, 9),
      ],
    }));

    const nextBundle: FullTripBundle = {
      ...bundle,
      days: nextDays,
    };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    writeActiveTripToLocalStorageGuarded(nextBundle, { allowDemoOverwrite: true });
    await syncBundleToFirestore(nextBundle);
  };

  const applyBudgetSelections = async (
    tripId: string,
    newTotalBudget: number,
    selections: Record<string, BudgetTier>
  ) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const snapshotDays = JSON.parse(JSON.stringify(bundle.days)) as Day[];
    const nextDays = bundle.days.map((d) => ({
      ...d,
      activities: d.activities.map((a) =>
        selections[a.id] ? { ...a, selectedTier: selections[a.id] } : a
      ),
      planB: d.planB.map((a) =>
        selections[a.id] ? { ...a, selectedTier: selections[a.id] } : a
      ),
    }));

    setUndoHistoryByTrip((prev) => ({
      ...prev,
      [tripId]: [
        {
          tripId,
          description: `Updated budget to €${newTotalBudget}`,
          previousDays: snapshotDays,
        },
        ...(prev[tripId] || []).slice(0, 9),
      ],
    }));

    const nextBundle: FullTripBundle = {
      ...bundle,
      trip: { ...bundle.trip, totalBudget: newTotalBudget },
      days: nextDays,
    };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    await syncBundleToFirestore(nextBundle);
    showToast(String(i18n.t('toast.appliedBudgetTiers', { budget: newTotalBudget })));
  };

  const applySelectedBudgetProposals = async (
    tripId: string,
    proposals: BudgetOptimizationChange[]
  ) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const selectedOnly = proposals.filter((p) => p.selected === true);
    if (selectedOnly.length === 0) return;

    const snapshotDays = JSON.parse(JSON.stringify(bundle.days)) as Day[];
    const nextDays = applySelectedBudgetProposalsToDays(bundle.days, proposals);
    const nextItineraryTotal = computeCurrentItineraryTotal(
      nextDays,
      Math.max(1, bundle.trip.travelersCount)
    );

    setUndoHistoryByTrip((prev) => ({
      ...prev,
      [tripId]: [
        {
          tripId,
          description: `Applied ${selectedOnly.length} selected tier adjustment(s) (€${nextItineraryTotal})`,
          previousDays: snapshotDays,
        },
        ...(prev[tripId] || []).slice(0, 9),
      ],
    }));

    const nextBundle: FullTripBundle = {
      ...bundle,
      trip: { ...bundle.trip, totalBudget: nextItineraryTotal },
      days: nextDays,
    };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    await syncBundleToFirestore(nextBundle);
    showToast(
      String(
        i18n.t('toast.appliedSelectedTiers', {
          count: selectedOnly.length,
          total: nextItineraryTotal,
        })
      )
    );
  };

  const castVote = async (
    tripId: string,
    dayId: string,
    activityId: string,
    travelerId: string,
    vote: VoteValue
  ) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const nextDays = bundle.days.map((d) => {
      if (d.id !== dayId) return d;
      const updateList = (list: Activity[]) =>
        list.map((a) =>
          a.id === activityId
            ? { ...a, votes: { ...(a.votes || {}), [travelerId]: vote } }
            : a
        );
      return {
        ...d,
        activities: updateList(d.activities),
        planB: updateList(d.planB),
      };
    });

    const nextBundle = { ...bundle, days: nextDays };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    await syncBundleToFirestore(nextBundle);
  };

  const addTraveler = async (
    tripId: string,
    travelerInput: Omit<Traveler, 'id' | 'tripId' | 'ownerId'>
  ): Promise<Traveler> => {
    const bundle = trips[tripId];
    const id = `trav-${Date.now().toString(36)}`;
    const newTraveler: Traveler = {
      ...travelerInput,
      id,
      tripId,
      ownerId: bundle?.trip.ownerId || 'demo-user',
    };

    if (bundle) {
      const nextTravelers = [...bundle.travelers, newTraveler];
      const nextBundle: FullTripBundle = {
        ...bundle,
        trip: {
          ...bundle.trip,
          groupEnabled: true,
          travelersCount: nextTravelers.length,
        },
        travelers: nextTravelers,
      };
      setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
      setActiveTravelerId(tripId, id);
      await syncBundleToFirestore(nextBundle);
      showToast(String(i18n.t('toast.travelerJoined', { name: newTraveler.displayName })));
    }
    return newTraveler;
  };

  const addExpense = async (
    tripId: string,
    expenseInput: Omit<Expense, 'id' | 'tripId' | 'ownerId' | 'authorId'>
  ) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const newExpense: Expense = {
      ...expenseInput,
      id: `exp-${Date.now().toString(36)}`,
      tripId,
      ownerId: bundle.trip.ownerId,
      authorId: currentUser?.uid || 'demo-user',
    };

    const nextBundle: FullTripBundle = {
      ...bundle,
      expenses: [newExpense, ...bundle.expenses],
    };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));

    if (currentUser && currentUser.emailVerified && !bundle.trip.isDemo) {
      try {
        await setDoc(doc(db, 'trips', tripId, 'expenses', newExpense.id), {
          ...newExpense,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `trips/${tripId}/expenses/${newExpense.id}`);
      }
    }
    showToast(String(i18n.t('toast.expenseRecorded')));
  };

  const deleteExpense = async (tripId: string, expenseId: string) => {
    const currentBundle = trips[tripId];
    setTrips((prev) => {
      const bundle = prev[tripId];
      if (!bundle) return prev;
      const nextExpenses = removeExpenseById(bundle.expenses, expenseId);
      return {
        ...prev,
        [tripId]: {
          ...bundle,
          expenses: nextExpenses,
        },
      };
    });

    if (currentUser && currentUser.emailVerified && currentBundle && !currentBundle.trip.isDemo) {
      try {
        await deleteDoc(doc(db, 'trips', tripId, 'expenses', expenseId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `trips/${tripId}/expenses/${expenseId}`);
      }
    }
    showToast(String(i18n.t('expenses.deletedToast', { defaultValue: 'Expense deleted.' })));
  };

  const toggleExpenseSettled = async (tripId: string, expenseId: string) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const nextExpenses = bundle.expenses.map((e) =>
      e.id === expenseId ? { ...e, settled: !e.settled } : e
    );
    const nextBundle: FullTripBundle = { ...bundle, expenses: nextExpenses };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    showToast(String(i18n.t('toast.settlementUpdated')));
  };

  const findTripByInviteCode = (inviteCode: string): FullTripBundle | undefined => {
    const clean = inviteCode.trim().toUpperCase();
    return (Object.values(trips) as FullTripBundle[]).find(
      (b) => b.trip.inviteCode.toUpperCase() === clean || b.trip.id === inviteCode
    );
  };

  return (
    <AtlasContext.Provider
      value={{
        currentUser,
        authReady,
        isDemoMode,
        enableDemoMode,
        trips,
        proposalsByTrip,
        undoHistoryByTrip,
        activeTravelerIdByTrip,
        setActiveTravelerId,
        saveTripBundle,
        registerFetchedTrips,
        deleteTrip,
        duplicateTrip,
        addProposals,
        acceptProposal,
        rejectProposal,
        acceptAllProposals,
        rejectAllProposals,
        undoLastChange,
        togglePlanB,
        updateDayActivities,
        updateDayAccommodation,
        setGlobalTripTier,
        applyBudgetSelections,
        applySelectedBudgetProposals,
        castVote,
        addTraveler,
        addExpense,
        deleteExpense,
        toggleExpenseSettled,
        findTripByInviteCode,
        toastMessage,
        toasts,
        showToast,
        dismissToast,
      }}
    >
      {children}
    </AtlasContext.Provider>
  );
};

export function useAtlas() {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error('useAtlas must be used within AtlasProvider');
  return ctx;
}
