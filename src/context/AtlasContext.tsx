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
  Expense,
  FullTripBundle,
  ProposalChange,
  Traveler,
  VoteValue,
} from '../types/models';
import { DEMO_TRIPS } from '../data/demoTrips';
import {
  applySingleProposalChange,
  computePaceMetrics,
  recalculateDayTravelTimes,
} from '../utils/domainLogic';

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
  applyBudgetSelections: (tripId: string, newTotalBudget: number, selections: Record<string, BudgetTier>) => Promise<void>;
  castVote: (tripId: string, dayId: string, activityId: string, travelerId: string, vote: VoteValue) => Promise<void>;
  addTraveler: (tripId: string, traveler: Omit<Traveler, 'id' | 'tripId' | 'ownerId'>) => Promise<Traveler>;
  addExpense: (tripId: string, expense: Omit<Expense, 'id' | 'tripId' | 'ownerId' | 'authorId'>) => Promise<void>;
  toggleExpenseSettled: (tripId: string, expenseId: string) => Promise<void>;
  findTripByInviteCode: (inviteCode: string) => FullTripBundle | undefined;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const AtlasContext = createContext<AtlasContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'atlasgenie_trips_v1';

function loadInitialTrips(): Record<string, FullTripBundle> {
  const base = JSON.parse(JSON.stringify(DEMO_TRIPS)) as Record<string, FullTripBundle>;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...base, ...parsed };
    }
  } catch {
    // ignore storage errors
  }
  return base;
}

export const AtlasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [trips, setTrips] = useState<Record<string, FullTripBundle>>(loadInitialTrips);
  const [proposalsByTrip, setProposalsByTrip] = useState<Record<string, ProposalChange[]>>({});
  const [undoHistoryByTrip, setUndoHistoryByTrip] = useState<Record<string, UndoHistoryEntry[]>>({});
  const [activeTravelerIdByTrip, setActiveTravelerIdByTrip] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Persist local/demo state seamlessly
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trips));
    } catch {
      // ignore quota
    }
  }, [trips]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user) {
        setIsDemoMode(false);
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listener for authenticated user's trips
  useEffect(() => {
    if (!authReady || !currentUser) return;

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
              return {
                ...prev,
                [tripId]: {
                  trip: {
                    id: tripData.id,
                    ownerId: tripData.ownerId,
                    destination: tripData.destination,
                    startDate: tripData.startDate,
                    endDate: tripData.endDate,
                    currency: tripData.currency,
                    totalBudget: tripData.totalBudget,
                    travelersCount: tripData.travelersCount,
                    interests: tripData.interests || [],
                    defaultPace: tripData.defaultPace || 3,
                    status: tripData.status || 'planned',
                    memberIds: tripData.memberIds || [currentUser.uid],
                    inviteCode: tripData.inviteCode || 'ATLAS1',
                    assumptions: tripData.assumptions || [],
                    groupEnabled: Boolean(tripData.groupEnabled),
                  },
                  days: existing?.days || [],
                  travelers: existing?.travelers || [],
                  expenses: existing?.expenses || [],
                },
              };
            });
          }
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, tripsPath);
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
    setTrips((prev) => ({ ...prev, [bundle.trip.id]: bundle }));
    await syncBundleToFirestore(bundle);
  };

  const deleteTrip = async (tripId: string) => {
    const target = trips[tripId];
    setTrips((prev) => {
      const next = { ...prev };
      delete next[tripId];
      return next;
    });
    if (currentUser && currentUser.emailVerified && target && !target.trip.isDemo) {
      try {
        await deleteDoc(doc(db, 'trips', tripId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `trips/${tripId}`);
      }
    }
    showToast('Trip removed from your Atlas.');
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
    showToast(`Duplicated "${source.trip.destination}".`);
    return newId;
  };

  const addProposals = (tripId: string, newProposals: ProposalChange[]) => {
    setProposalsByTrip((prev) => ({
      ...prev,
      [tripId]: [...(prev[tripId] || []), ...newProposals],
    }));
  };

  const acceptProposal = async (tripId: string, proposalId: string) => {
    const bundle = trips[tripId];
    const list = proposalsByTrip[tripId] || [];
    const proposal = list.find((p) => p.id === proposalId);
    if (!bundle || !proposal) return;

    const snapshotDays = JSON.parse(JSON.stringify(bundle.days)) as Day[];
    const updatedDays = applySingleProposalChange(bundle.days, proposal);

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

    const nextBundle: FullTripBundle = {
      ...bundle,
      days: updatedDays,
    };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    setProposalsByTrip((prev) => ({
      ...prev,
      [tripId]: (prev[tripId] || []).filter((p) => p.id !== proposalId),
    }));
    await syncBundleToFirestore(nextBundle);
    showToast('Change accepted and applied to your itinerary.');
  };

  const rejectProposal = (tripId: string, proposalId: string) => {
    setProposalsByTrip((prev) => ({
      ...prev,
      [tripId]: (prev[tripId] || []).filter((p) => p.id !== proposalId),
    }));
    showToast('Proposal rejected — your original plan remains untouched.');
  };

  const acceptAllProposals = async (tripId: string) => {
    const bundle = trips[tripId];
    const list = proposalsByTrip[tripId] || [];
    if (!bundle || list.length === 0) return;

    const snapshotDays = JSON.parse(JSON.stringify(bundle.days)) as Day[];
    let workingDays = [...bundle.days];
    for (const prop of list) {
      workingDays = applySingleProposalChange(workingDays, prop);
    }

    setUndoHistoryByTrip((prev) => ({
      ...prev,
      [tripId]: [
        {
          tripId,
          description: `Accepted ${list.length} proposed changes`,
          previousDays: snapshotDays,
        },
        ...(prev[tripId] || []).slice(0, 9),
      ],
    }));

    const nextBundle: FullTripBundle = { ...bundle, days: workingDays };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    setProposalsByTrip((prev) => ({ ...prev, [tripId]: [] }));
    await syncBundleToFirestore(nextBundle);
    showToast(`Applied all ${list.length} changes.`);
  };

  const rejectAllProposals = (tripId: string) => {
    setProposalsByTrip((prev) => ({ ...prev, [tripId]: [] }));
    showToast('Discarded all pending suggestions.');
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
    await syncBundleToFirestore(nextBundle);
    showToast('Undid last change.');
  };

  const togglePlanB = async (tripId: string, dayId: string) => {
    const bundle = trips[tripId];
    if (!bundle) return;

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
    await syncBundleToFirestore(nextBundle);
    showToast('Switched day plan mode.');
  };

  const updateDayActivities = async (
    tripId: string,
    dayId: string,
    activities: Activity[],
    paceLevel?: number
  ) => {
    const bundle = trips[tripId];
    if (!bundle) return;
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

    const nextBundle = { ...bundle, days: nextDays };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
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
    showToast(`Applied new budget tiers (€${newTotalBudget}).`);
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
      showToast(`${newTraveler.displayName} joined the group!`);
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
    showToast(`Added expense "${newExpense.description}" (€${newExpense.amount.toFixed(2)}).`);
  };

  const toggleExpenseSettled = async (tripId: string, expenseId: string) => {
    const bundle = trips[tripId];
    if (!bundle) return;

    const nextExpenses = bundle.expenses.map((e) =>
      e.id === expenseId ? { ...e, settled: !e.settled } : e
    );
    const nextBundle: FullTripBundle = { ...bundle, expenses: nextExpenses };
    setTrips((prev) => ({ ...prev, [tripId]: nextBundle }));
    showToast('Updated settlement status.');
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
        applyBudgetSelections,
        castVote,
        addTraveler,
        addExpense,
        toggleExpenseSettled,
        findTripByInviteCode,
        toastMessage,
        showToast,
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
