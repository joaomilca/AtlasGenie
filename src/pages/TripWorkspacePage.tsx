import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DragEndEvent } from '@dnd-kit/core';
import {
  Download,
  Printer,
  Calendar as CalendarIcon,
  Compass,
  ChevronDown,
  Gauge,
  Clock,
  Footprints,
  Coffee,
  Loader2,
  X,
  Bookmark,
  Wallet,
} from 'lucide-react';
import { useAtlas } from '../context/AtlasContext';
import { useI18n } from '../i18n/I18nContext';
import { saveTrip, auth } from '../firebase';
import {
  ACTIVE_TRIP_STORAGE_KEY,
  MAX_TRIP_HISTORY_LENGTH,
  computeDaySubtotal,
  computePaceMetrics,
  computeProposalPriceDifference,
  computeReliabilitySummary,
  computeTripTotalCost,
  evaluateBudgetGuard,
  hasValidItineraryData,
  inferItineraryLanguage,
  normalizeJitLanguageCode,
  parseActiveTripFromStorage,
  popTripHistoryState,
  pushTripHistoryState,
  reorderActivitiesList,
  generateIcsCalendar,
  downloadIcsFile,
  writeActiveTripToLocalStorageGuarded,
} from '../utils/domainLogic';
import { Activity, BudgetTier, FullTripBundle, ProposalChange, VoteValue } from '../types/models';
import { SkeletonItinerary } from '../components/SkeletonItinerary';
import { DayTimeline } from '../components/DayTimeline';
import {
  DiffBannerSuspenseFallback,
  MapSuspenseFallback,
  ModalSuspenseFallback,
  TabViewSuspenseFallback,
} from '../components/SuspenseFallback';
import {
  requestAccommodationAlternative,
  requestAiProposals,
  requestJitTripTranslation,
  streamAtlasGenieChat,
} from '../services/api';

// Code-split heavy components that aren't needed synchronously on the initial render
const LazyAtlasMap = lazy(() => import('../components/AtlasMap'));
const LazyDiffReviewBanner = lazy(() => import('../components/DiffReviewBanner'));
const LazyLoginModal = lazy(() => import('../components/LoginModal'));
const LazyActivityDetailsModal = lazy(() => import('../components/ActivityDetailsModal'));
const LazyBudgetTabView = lazy(() =>
  import('../components/BudgetTabView').then((m) => ({ default: m.BudgetTabView }))
);
const LazyGroupTabView = lazy(() =>
  import('../components/GroupTabView').then((m) => ({ default: m.GroupTabView }))
);
const LazyExpensesTabView = lazy(() =>
  import('../components/ExpensesTabView').then((m) => ({ default: m.ExpensesTabView }))
);
const LazyGuidedTourOverlay = lazy(() =>
  import('../components/GuidedTourOverlay').then((m) => ({ default: m.GuidedTourOverlay }))
);

export const TripWorkspacePage: React.FC = () => {
  const { id = 'demo-lisbon-4d' } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { language } = useI18n();
  const uiLanguage = language;
  const [isTranslating, setIsTranslating] = useState(false);
  const {
    currentUser,
    trips,
    proposalsByTrip,
    activeTravelerIdByTrip,
    registerFetchedTrips,
    saveTripBundle,
    addProposals,
    acceptProposal,
    rejectProposal,
    acceptAllProposals,
    rejectAllProposals,
    togglePlanB,
    updateDayActivities,
    updateDayAccommodation,
    setGlobalTripTier,
    castVote,
    showToast,
  } = useAtlas();

  // 1. Synchronous Lazy Initialization from localStorage (`atlasgenie_active_trip`)
  const [itinerary, setItinerary] = useState<FullTripBundle | null>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
      const parsed = saved ? parseActiveTripFromStorage(saved) : null;
      if (!parsed) return null;
      const lang = parsed.language || parsed.trip?.language || inferItineraryLanguage(parsed);
      return {
        ...parsed,
        language: lang,
        trip: {
          ...parsed.trip,
          language: lang,
        },
      };
    } catch {
      return null;
    }
  });

  // Resolve the active bundle synchronously on mount without falling back to empty/demo state if a matching persisted trip exists
  const rawBundle =
    (itinerary && itinerary.trip.id === id ? itinerary : null) ||
    trips[id] ||
    (itinerary && !trips[id] ? itinerary : null) ||
    trips['demo-lisbon-4d'];
  const resolvedBundleLang =
    rawBundle.language || rawBundle.trip?.language || inferItineraryLanguage(rawBundle);
  const bundle: FullTripBundle = useMemo(
    () =>
      rawBundle.language === resolvedBundleLang && rawBundle.trip?.language === resolvedBundleLang
        ? rawBundle
        : {
            ...rawBundle,
            language: resolvedBundleLang,
            trip: {
              ...rawBundle.trip,
              language: resolvedBundleLang,
            },
          },
    [rawBundle, resolvedBundleLang]
  );

  // Keep local `itinerary` state synchronized when `trips[id]` updates from context mutations
  useEffect(() => {
    const contextTrip = trips[id];
    if (contextTrip && hasValidItineraryData(contextTrip) && contextTrip !== itinerary) {
      const lang =
        contextTrip.language || contextTrip.trip?.language || inferItineraryLanguage(contextTrip);
      const stamped =
        contextTrip.language === lang && contextTrip.trip?.language === lang
          ? contextTrip
          : {
              ...contextTrip,
              language: lang,
              trip: { ...contextTrip.trip, language: lang },
            };
      setItinerary(stamped);
    } else if (itinerary && hasValidItineraryData(itinerary) && !trips[itinerary.trip.id]) {
      registerFetchedTrips([itinerary]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, trips]);

  // 2. Guarded Persistence (`useEffect`): ONLY save to localStorage if the itinerary has valid, non-empty activities
  useEffect(() => {
    const activeTarget = trips[id] || itinerary || bundle;
    if (
      activeTarget &&
      hasValidItineraryData(activeTarget) &&
      activeTarget.days.some((d) => Array.isArray(d.activities) && d.activities.length > 0)
    ) {
      writeActiveTripToLocalStorageGuarded(activeTarget);
    }
  }, [bundle, id, itinerary, trips]);

  // 3. JIT Translation Trigger (`useEffect` on `[uiLanguage]`):
  // Translates the active itinerary in the background via `/api/translate-trip` when `itinerary.language !== uiLanguage`
  useEffect(() => {
    const activeTarget =
      itinerary && itinerary.trip.id === bundle.trip.id ? itinerary : bundle;
    if (!activeTarget || !hasValidItineraryData(activeTarget)) return;

    const currentItinLang =
      activeTarget.language ||
      activeTarget.trip?.language ||
      inferItineraryLanguage(activeTarget);

    if (
      currentItinLang === uiLanguage ||
      normalizeJitLanguageCode(currentItinLang) === normalizeJitLanguageCode(uiLanguage)
    ) {
      return;
    }

    let isCancelled = false;
    setIsTranslating(true);

    (async () => {
      try {
        const translated = await requestJitTripTranslation(activeTarget, uiLanguage);
        if (isCancelled) return;
        const updatedItinerary: FullTripBundle = {
          ...translated,
          language: uiLanguage,
          trip: {
            ...translated.trip,
            language: uiLanguage,
          },
        };
        setItinerary(updatedItinerary);
        writeActiveTripToLocalStorageGuarded(updatedItinerary, { allowDemoOverwrite: true });
        await saveTripBundle(updatedItinerary);
      } catch (error) {
        console.error('JIT Translation API failed:', error);
      } finally {
        if (!isCancelled) {
          setIsTranslating(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiLanguage, id]);

  const proposals = proposalsByTrip[bundle.trip.id] || [];
  const activeTravelerId =
    activeTravelerIdByTrip[bundle.trip.id] || bundle.travelers[0]?.id || 'ana';

  // Undo History Stack (stores deep clones of up to the last 10 trip states)
  const [tripHistory, setTripHistory] = useState<FullTripBundle[]>([]);

  const recordTripHistorySnapshot = useCallback(() => {
    setTripHistory((prev) => pushTripHistoryState(prev, bundle, MAX_TRIP_HISTORY_LENGTH));
  }, [bundle]);

  const handleUndo = useCallback(async () => {
    if (tripHistory.length === 0) return;
    const { restoredState, nextHistory } = popTripHistoryState(tripHistory);
    if (!restoredState) return;
    setTripHistory(nextHistory);
    setItinerary(restoredState);
    writeActiveTripToLocalStorageGuarded(restoredState, { allowDemoOverwrite: true });
    await saveTripBundle(restoredState);
    showToast(t('toast.undidLastChange'), 'alert');
  }, [saveTripBundle, showToast, t, tripHistory]);

  // Active sub-route determination
  const activeTab: 'plan' | 'map' | 'budget' | 'group' | 'expenses' = useMemo(() => {
    if (location.pathname.endsWith('/budget')) return 'budget';
    if (location.pathname.endsWith('/group')) return 'group';
    if (location.pathname.endsWith('/expenses')) return 'expenses';
    return 'plan';
  }, [location.pathname]);

  const [mobileView, setMobileView] = useState<'plan' | 'map'>('plan');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<
    { id: string; sender: 'user' | 'genie'; text: string; grounded?: boolean }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [fetchingPlaceName, setFetchingPlaceName] = useState<string | null>(null);
  const [vibeRecalculating, setVibeRecalculating] = useState(false);
  const [askingAccommodationAlt, setAskingAccommodationAlt] = useState(false);
  const [pricePulseActive, setPricePulseActive] = useState(false);

  // Export Dropdown & Save Trip State
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [detailsModalState, setDetailsModalState] = useState<{
    activity?: Activity | null;
    proposal?: ProposalChange | null;
  } | null>(null);
  const [budgetGuardModal, setBudgetGuardModal] = useState<{
    warningMessage: string;
    prospectiveTotal: number;
    targetBudget: number;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  // Collapsible Trust Badges Legend State (Closed by default for decluttered UI)
  const [badgesLegendOpen, setBadgesLegendOpen] = useState(false);

  // Guided Tour State (First-time itinerary visitor onboarding)
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (activeTab !== 'plan') return;
    if (searchParams.get('notour') === '1') return;
    try {
      const seen = localStorage.getItem('atlasgenie_tour_seen_v1');
      if (!seen) {
        const timer = setTimeout(() => setTourOpen(true), 450);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore storage access errors
    }
  }, [activeTab, searchParams]);

  const handleCloseTour = () => {
    setTourOpen(false);
    try {
      localStorage.setItem('atlasgenie_tour_seen_v1', 'true');
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    if (exportDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [exportDropdownOpen]);

  // Add Activity Modal State
  const [addingActivity, setAddingActivity] = useState(false);
  const [newActTitle, setNewActTitle] = useState('');
  const [newActTime, setNewActTime] = useState('16:30');
  const [newActCost, setNewActCost] = useState(15);

  const currentDay = bundle.days[selectedDayIndex] || bundle.days[0];
  const activeActivities =
    currentDay.activePlan === 'B' && currentDay.planB.length > 0
      ? currentDay.planB
      : currentDay.activities;

  const travelers = Math.max(1, Math.round(Number(bundle.trip.travelersCount) || 1));
  const reliability = useMemo(() => computeReliabilitySummary(bundle.days), [bundle.days]);
  const paceMetrics = useMemo(() => computePaceMetrics(currentDay), [currentDay]);
  const daySubtotal = useMemo(
    () => computeDaySubtotal(currentDay, travelers),
    [currentDay, activeActivities, travelers]
  );
  const tripTotalInfo = useMemo(
    () => computeTripTotalCost(bundle.days, travelers),
    [bundle.days, activeActivities, travelers]
  );
  const perPersonTotal = useMemo(
    () => Math.round(tripTotalInfo.total / travelers),
    [tripTotalInfo.total, activeActivities, travelers]
  );
  const perPersonSuffix = language === 'en' ? '/person' : '/pessoa';

  // Trigger a subtle visual pulse whenever the live Trip Total changes
  const prevTripTotalRef = useRef<number>(tripTotalInfo.total);
  useEffect(() => {
    if (prevTripTotalRef.current !== tripTotalInfo.total) {
      prevTripTotalRef.current = tripTotalInfo.total;
      setPricePulseActive(true);
      const timer = setTimeout(() => setPricePulseActive(false), 450);
      return () => clearTimeout(timer);
    }
  }, [tripTotalInfo.total]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = activeActivities.findIndex((a) => a.id === active.id);
      const newIndex = activeActivities.findIndex((a) => a.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      recordTripHistorySnapshot();
      const reordered = reorderActivitiesList(activeActivities, oldIndex, newIndex);
      await updateDayActivities(bundle.trip.id, currentDay.id, reordered);
      showToast(t('toast.itineraryUpdated'));
    },
    [
      activeActivities,
      bundle.trip.id,
      currentDay.id,
      recordTripHistorySnapshot,
      showToast,
      t,
      updateDayActivities,
    ]
  );

  const localizedPaceLabel =
    paceMetrics.label === 'Packed'
      ? t('trip.pacePacked')
      : paceMetrics.label === 'Relaxed'
      ? t('trip.paceRelaxed')
      : t('trip.paceBalanced');

  const getTierLabel = useCallback(
    (tier: BudgetTier) => {
      if (tier === 'budget') return t('trip.tierBudget');
      if (tier === 'mid') return t('trip.tierMid');
      return t('trip.tierPremium');
    },
    [t, language]
  );

  const handleVibeSliderChange = useCallback(
    async (nextPace: number) => {
      recordTripHistorySnapshot();
      setVibeRecalculating(true);
      try {
        await updateDayActivities(bundle.trip.id, currentDay.id, activeActivities, nextPace);
        const [res] = await Promise.all([
          requestAiProposals({
            taskType: 'pace',
            destination: bundle.trip.destination,
            message: `Adjust day pace to level ${nextPace}/5`,
            currentDay: { ...currentDay, paceLevel: nextPace },
            itinerary: bundle,
            travelers: bundle.travelers,
            language,
            uiLanguage: language === 'pt' ? 'pt-PT' : 'en',
          }),
          new Promise((resolve) => setTimeout(resolve, 900)),
        ]);
        addProposals(bundle.trip.id, res.proposals);
      } finally {
        setVibeRecalculating(false);
      }
    },
    [
      activeActivities,
      addProposals,
      bundle,
      currentDay,
      language,
      recordTripHistorySnapshot,
      updateDayActivities,
    ]
  );

  const handleSaveTrip = useCallback(async () => {
    setExportDropdownOpen(false);
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser) {
      showToast(t('toast.loginToSave'), 'alert');
      setLoginModalOpen(true);
      return;
    }
    setIsSavingTrip(true);
    try {
      const savedBundle = await saveTrip(activeUser.uid, bundle);
      registerFetchedTrips([savedBundle]);
      showToast(t('toast.tripSaved'));
    } finally {
      setIsSavingTrip(false);
    }
  }, [bundle, currentUser, registerFetchedTrips, showToast, t]);

  const handleExportPdf = useCallback(() => {
    setExportDropdownOpen(false);
    showToast(t('export.printToast'));
    setTimeout(() => {
      window.print();
    }, 120);
  }, [showToast, t]);

  const handleExportIcsDay = useCallback(() => {
    setExportDropdownOpen(false);
    const ics = generateIcsCalendar(bundle, currentDay);
    const slug = bundle.trip.destination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `atlasgenie-${slug}-day-${currentDay.dayNumber}.ics`;
    downloadIcsFile(ics, filename);
    showToast(t('export.icsToast', { filename }));
  }, [bundle, currentDay, showToast, t]);

  const handleExportIcsFull = useCallback(() => {
    setExportDropdownOpen(false);
    const ics = generateIcsCalendar(bundle);
    const slug = bundle.trip.destination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `atlasgenie-${slug}-full-trip.ics`;
    downloadIcsFile(ics, filename);
    showToast(t('export.icsToast', { filename }));
  }, [bundle, showToast, t]);

  const handleEscapeCrowds = useCallback(
    (act: Activity) => {
      const alt = act.localAlternative;
      const replacementPayload: Activity = alt
        ? {
            id: alt.id,
            title: alt.title,
            category: alt.category,
            description: alt.description,
            startTime: act.startTime,
            durationMin: act.durationMin,
            openingHoursText: act.openingHoursText,
            isOutdoor: act.isOutdoor,
            interestTags: act.interestTags,
            location: alt.location,
            costOptions: {
              budget: {
                title: `${alt.title} (${t('trip.tierBudget')})`,
                estimatedCost: Math.max(0, Math.round(alt.estimatedCost * 0.6)),
                description: alt.description,
              },
              mid: {
                title: `${alt.title} (${t('trip.tierMid')})`,
                estimatedCost: alt.estimatedCost,
                description: alt.description,
              },
              premium: {
                title: `${alt.title} (${t('trip.tierPremium')})`,
                estimatedCost: Math.round(alt.estimatedCost * 1.8),
                description: alt.description,
              },
            },
            selectedTier: 'mid',
            priceConfidence: alt.priceConfidence,
            hoursConfidence: alt.hoursConfidence,
            whyThis: alt.reason,
            touristTrapScore: 18,
            votes: {},
          }
        : {
            ...act,
            id: `${act.id}-local`,
            title: `Local Gem · ${act.location.name}`,
            description: act.description,
            touristTrapScore: 20,
            priceConfidence: { status: 'to_confirm', notes: t('trip.toConfirm') },
            hoursConfidence: { status: 'to_confirm', notes: t('trip.toConfirm') },
            whyThis: act.whyThis,
          };

      const prop: ProposalChange = {
        id: `prop-local-${currentDay.id}-${act.id}`,
        dayId: currentDay.id,
        dayNumber: currentDay.dayNumber,
        type: 'replace',
        targetActivityId: act.id,
        targetActivityTitle: act.title,
        payload: replacementPayload,
        reason: alt
          ? `${alt.reason} (${alt.travelMinutesAway} min · ${alt.travelSource === 'maps_api' ? 'Maps API' : '~'})`
          : replacementPayload.whyThis,
        source: 'local_alt',
        status: 'pending',
      };

      addProposals(bundle.trip.id, [prop]);
      showToast(t('toast.localAltProposed'));
    },
    [addProposals, bundle.trip.id, currentDay.dayNumber, currentDay.id, showToast, t]
  );

  const handleMoveActivity = useCallback(
    async (index: number, direction: -1 | 1) => {
      const targetIdx = index + direction;
      if (targetIdx < 0 || targetIdx >= activeActivities.length) return;
      recordTripHistorySnapshot();
      const reordered = reorderActivitiesList(activeActivities, index, targetIdx);
      await updateDayActivities(bundle.trip.id, currentDay.id, reordered);
      showToast(t('toast.itineraryUpdated'));
    },
    [
      activeActivities,
      bundle.trip.id,
      currentDay.id,
      recordTripHistorySnapshot,
      showToast,
      t,
      updateDayActivities,
    ]
  );

  const handleRemoveActivityDirect = useCallback(
    async (activityId: string) => {
      recordTripHistorySnapshot();
      const removed = activeActivities.find((a) => a.id === activityId);
      const next = activeActivities.filter((a) => a.id !== activityId);
      await updateDayActivities(bundle.trip.id, currentDay.id, next);
      showToast(
        t('toast.activityRemoved', {
          title: removed?.title || '',
          day: currentDay.dayNumber,
        })
      );
    },
    [
      activeActivities,
      bundle.trip.id,
      currentDay.dayNumber,
      currentDay.id,
      recordTripHistorySnapshot,
      showToast,
      t,
      updateDayActivities,
    ]
  );

  const handleTierSelect = useCallback(
    async (activityId: string, tier: BudgetTier) => {
      const next = activeActivities.map((a) =>
        a.id === activityId ? { ...a, selectedTier: tier } : a
      );
      const isPlanB = currentDay.activePlan === 'B' && currentDay.planB.length > 0;
      const prospectiveDays = bundle.days.map((d) =>
        d.id !== currentDay.id
          ? d
          : {
              ...d,
              activities: isPlanB ? d.activities : next,
              planB: isPlanB ? next : d.planB,
            }
      );
      const currentTotal = tripTotalInfo.total;
      const nextTotal = computeTripTotalCost(prospectiveDays, travelers).total;
      const priceDifference = nextTotal - currentTotal;
      const guard = evaluateBudgetGuard({
        currentTotal,
        priceDifference,
        targetBudget: bundle.trip.totalBudget,
        language,
      });

      if (guard.exceedsBudget) {
        setBudgetGuardModal({
          warningMessage: guard.warningMessage,
          prospectiveTotal: guard.prospectiveTotal,
          targetBudget: guard.targetBudget,
          onConfirm: async () => {
            recordTripHistorySnapshot();
            await updateDayActivities(bundle.trip.id, currentDay.id, next);
          },
        });
        return;
      }

      recordTripHistorySnapshot();
      await updateDayActivities(bundle.trip.id, currentDay.id, next);
    },
    [
      activeActivities,
      bundle.days,
      bundle.trip.id,
      bundle.trip.totalBudget,
      currentDay.activePlan,
      currentDay.id,
      currentDay.planB.length,
      language,
      recordTripHistorySnapshot,
      travelers,
      tripTotalInfo.total,
      updateDayActivities,
    ]
  );

  const handleRenameActivity = useCallback(
    async (activityId: string, newTitle: string) => {
      const cleanTitle = newTitle.trim();
      if (!cleanTitle) return;
      recordTripHistorySnapshot();
      const next = activeActivities.map((a) =>
        a.id === activityId ? { ...a, title: cleanTitle } : a
      );
      await updateDayActivities(bundle.trip.id, currentDay.id, next);
      showToast(t('toast.itineraryUpdated'));
    },
    [
      activeActivities,
      bundle.trip.id,
      currentDay.id,
      recordTripHistorySnapshot,
      showToast,
      t,
      updateDayActivities,
    ]
  );

  const handleRenameAccommodation = useCallback(
    async (newName: string) => {
      const cleanName = newName.trim();
      if (!cleanName || !currentDay.accommodation) return;
      recordTripHistorySnapshot();
      const currentAcc = currentDay.accommodation;
      const activeTier = daySubtotal.dominantTier;
      const updatedAcc = {
        ...currentAcc,
        name: cleanName,
        tierOptions: currentAcc.tierOptions
          ? {
              ...currentAcc.tierOptions,
              [activeTier]: {
                ...currentAcc.tierOptions[activeTier],
                name: cleanName,
              },
            }
          : undefined,
      };
      await updateDayAccommodation(bundle.trip.id, currentDay.id, updatedAcc);
      showToast(t('toast.itineraryUpdated'));
    },
    [
      bundle.trip.id,
      currentDay.accommodation,
      currentDay.id,
      daySubtotal.dominantTier,
      recordTripHistorySnapshot,
      showToast,
      t,
      updateDayAccommodation,
    ]
  );

  const handleAccommodationTierSelect = useCallback(
    async (tier: BudgetTier) => {
      if (!currentDay.accommodation) return;
      const tierOpt = currentDay.accommodation.tierOptions?.[tier];
      const updatedAcc = {
        ...currentDay.accommodation,
        selectedTier: tier,
        customPriceLocked: false,
        ...(tierOpt
          ? {
              name: tierOpt.name,
              type: tierOpt.type || currentDay.accommodation.type,
              price: tierOpt.price,
              coordinates: tierOpt.coordinates || currentDay.accommodation.coordinates,
            }
          : {}),
      };
      const prospectiveDays = bundle.days.map((d) =>
        d.id === currentDay.id ? { ...d, accommodation: updatedAcc } : d
      );
      const currentTotal = tripTotalInfo.total;
      const nextTotal = computeTripTotalCost(prospectiveDays, travelers).total;
      const priceDifference = nextTotal - currentTotal;
      const guard = evaluateBudgetGuard({
        currentTotal,
        priceDifference,
        targetBudget: bundle.trip.totalBudget,
        language,
      });

      if (guard.exceedsBudget) {
        setBudgetGuardModal({
          warningMessage: guard.warningMessage,
          prospectiveTotal: guard.prospectiveTotal,
          targetBudget: guard.targetBudget,
          onConfirm: async () => {
            recordTripHistorySnapshot();
            await updateDayAccommodation(bundle.trip.id, currentDay.id, updatedAcc);
          },
        });
        return;
      }

      recordTripHistorySnapshot();
      await updateDayAccommodation(bundle.trip.id, currentDay.id, updatedAcc);
    },
    [
      bundle.days,
      bundle.trip.id,
      bundle.trip.totalBudget,
      currentDay.accommodation,
      currentDay.id,
      language,
      recordTripHistorySnapshot,
      travelers,
      tripTotalInfo.total,
      updateDayAccommodation,
    ]
  );

  const handleAskAccommodationAlternative = useCallback(
    async (tier: BudgetTier) => {
      setAskingAccommodationAlt(true);
      try {
        const res = await requestAccommodationAlternative({
          city: currentDay.city || bundle.trip.destination,
          country: bundle.trip.country || bundle.trip.destination,
          day: currentDay,
          tier,
          language,
          uiLanguage: language === 'pt' ? 'pt-PT' : 'en',
        });
        addProposals(bundle.trip.id, [res.proposal]);
        showToast(t('toast.accommodationAltProposed'));
      } finally {
        setAskingAccommodationAlt(false);
      }
    },
    [
      addProposals,
      bundle.trip.country,
      bundle.trip.destination,
      bundle.trip.id,
      currentDay,
      language,
      showToast,
      t,
    ]
  );

  const handleGlobalTierSwitch = useCallback(
    async (tier: BudgetTier) => {
      const prospectiveDays = bundle.days.map((d) => {
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
      const currentTotal = tripTotalInfo.total;
      const nextTotal = computeTripTotalCost(prospectiveDays, travelers).total;
      const priceDifference = nextTotal - currentTotal;
      const guard = evaluateBudgetGuard({
        currentTotal,
        priceDifference,
        targetBudget: bundle.trip.totalBudget,
        language,
      });

      const applySwitch = async () => {
        recordTripHistorySnapshot();
        await setGlobalTripTier(bundle.trip.id, tier);
        showToast(t('toast.globalTierSwitched', { tier: getTierLabel(tier) }));
      };

      if (guard.exceedsBudget) {
        setBudgetGuardModal({
          warningMessage: guard.warningMessage,
          prospectiveTotal: guard.prospectiveTotal,
          targetBudget: guard.targetBudget,
          onConfirm: applySwitch,
        });
        return;
      }

      await applySwitch();
    },
    [
      bundle.days,
      bundle.trip.id,
      bundle.trip.totalBudget,
      getTierLabel,
      language,
      recordTripHistorySnapshot,
      setGlobalTripTier,
      showToast,
      t,
      travelers,
      tripTotalInfo.total,
    ]
  );

  const handleSelectActivity = useCallback((actId: string) => {
    setSelectedActivityId(actId);
  }, []);

  const handleVoteActivity = useCallback(
    (actId: string, v: VoteValue) => {
      castVote(bundle.trip.id, currentDay.id, actId, activeTravelerId, v);
    },
    [activeTravelerId, bundle.trip.id, castVote, currentDay.id]
  );

  const handleQuickExpense = useCallback(() => {
    navigate(`/trips/${bundle.trip.id}/expenses`);
  }, [bundle.trip.id, navigate]);

  const handleAcceptProposal = useCallback(
    (pId: string) => {
      const proposal = proposals.find((p) => p.id === pId);
      const currentTotal = tripTotalInfo.total;
      const priceDifference = proposal
        ? computeProposalPriceDifference(bundle.days, proposal, travelers)
        : 0;
      const guard = evaluateBudgetGuard({
        currentTotal,
        priceDifference,
        targetBudget: bundle.trip.totalBudget,
        language,
      });

      if (guard.exceedsBudget) {
        setBudgetGuardModal({
          warningMessage: guard.warningMessage,
          prospectiveTotal: guard.prospectiveTotal,
          targetBudget: guard.targetBudget,
          onConfirm: async () => {
            recordTripHistorySnapshot();
            await acceptProposal(bundle.trip.id, pId);
          },
        });
        return;
      }

      recordTripHistorySnapshot();
      void acceptProposal(bundle.trip.id, pId);
    },
    [
      acceptProposal,
      bundle.days,
      bundle.trip.id,
      bundle.trip.totalBudget,
      language,
      proposals,
      recordTripHistorySnapshot,
      travelers,
      tripTotalInfo.total,
    ]
  );

  const handleRejectProposal = useCallback(
    (pId: string) => rejectProposal(bundle.trip.id, pId),
    [bundle.trip.id, rejectProposal]
  );

  const handleAcceptAllProposals = useCallback(() => {
    recordTripHistorySnapshot();
    void acceptAllProposals(bundle.trip.id);
  }, [acceptAllProposals, bundle.trip.id, recordTripHistorySnapshot]);

  const handleRejectAllProposals = useCallback(
    () => rejectAllProposals(bundle.trip.id),
    [bundle.trip.id, rejectAllProposals]
  );

  const handleTogglePlanB = useCallback(async () => {
    recordTripHistorySnapshot();
    await togglePlanB(bundle.trip.id, currentDay.id);
  }, [bundle.trip.id, currentDay.id, recordTripHistorySnapshot, togglePlanB]);

  const handleOpenActivityDetails = useCallback((act: Activity) => {
    setDetailsModalState({ activity: act, proposal: null });
  }, []);

  const handleOpenProposalDetails = useCallback(
    (proposal: ProposalChange) => {
      const propDay =
        bundle.days.find(
          (d) => (proposal.dayId && d.id === proposal.dayId) || d.dayNumber === proposal.dayNumber
        ) || currentDay;
      const dayActs =
        propDay.activePlan === 'B' && propDay.planB.length > 0
          ? propDay.planB
          : propDay.activities;
      const targetAct = proposal.targetActivityId
        ? dayActs.find((a) => a.id === proposal.targetActivityId) ||
          activeActivities.find((a) => a.id === proposal.targetActivityId) ||
          null
        : null;
      setDetailsModalState({
        activity: proposal.payload || targetAct,
        proposal,
      });
    },
    [activeActivities, bundle.days, currentDay]
  );

  const handleCloseDetailsModal = useCallback(() => {
    setDetailsModalState(null);
  }, []);

  const handleCloseLoginModal = useCallback(() => {
    setLoginModalOpen(false);
  }, []);

  const handleLoginSuccess = useCallback(async () => {
    const user = auth.currentUser;
    if (user) {
      setIsSavingTrip(true);
      try {
        const savedBundle = await saveTrip(user.uid, bundle);
        registerFetchedTrips([savedBundle]);
        showToast(t('toast.tripSaved'));
      } finally {
        setIsSavingTrip(false);
      }
    }
  }, [bundle, registerFetchedTrips, showToast, t]);

  const handleAddActivitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActTitle.trim()) return;
    const refLoc = activeActivities[0]?.location || {
      name: bundle.trip.destination,
      lat: 38.7139,
      lng: -9.1334,
    };
    const created: Activity = {
      id: `custom-${Date.now().toString(36)}`,
      title: newActTitle.trim(),
      category: 'culture',
      description: t('trip.customStopDesc'),
      startTime: newActTime,
      durationMin: 75,
      openingHoursText: '09:30 – 19:00',
      isOutdoor: false,
      interestTags: bundle.trip.interests.slice(0, 2),
      location: {
        name: `${bundle.trip.destination} Central`,
        lat: refLoc.lat + 0.003,
        lng: refLoc.lng + 0.002,
      },
      costOptions: {
        budget: {
          title: t('trip.tierBudget'),
          estimatedCost: Math.max(0, Math.round(newActCost * 0.6)),
          description: t('trip.tierBudget'),
        },
        mid: {
          title: t('trip.tierMid'),
          estimatedCost: Number(newActCost),
          description: t('trip.tierMid'),
        },
        premium: {
          title: t('trip.tierPremium'),
          estimatedCost: Math.round(newActCost * 1.8),
          description: t('trip.tierPremium'),
        },
      },
      selectedTier: 'mid',
      priceConfidence: { status: 'to_confirm', notes: t('trip.toConfirm') },
      hoursConfidence: { status: 'to_confirm', notes: t('trip.toConfirm') },
      whyThis: t('trip.customStopWhy'),
      touristTrapScore: 20,
      votes: {},
    };
    recordTripHistorySnapshot();
    const next = [...activeActivities, created].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    await updateDayActivities(bundle.trip.id, currentDay.id, next);
    setNewActTitle('');
    setAddingActivity(false);
  };

  const handleSendChat = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean) return;
    const userMsgId = `msg-user-${Date.now()}`;
    const genieMsgId = `msg-genie-${Date.now() + 1}`;

    setChatHistory((prev) => [
      ...prev,
      { id: userMsgId, sender: 'user', text: clean },
      { id: genieMsgId, sender: 'genie', text: '' },
    ]);
    setChatInput('');
    setChatLoading(true);
    setFetchingPlaceName(null);

    try {
      const res = await streamAtlasGenieChat({
        destination: bundle.trip.destination,
        message: clean,
        currentDay,
        itinerary: bundle,
        travelers: bundle.travelers,
        language,
        uiLanguage: language === 'pt' ? 'pt-PT' : 'en',
        onToolFetching: (info) => {
          setFetchingPlaceName(info.placeName);
        },
        onChunk: (accumulatedText) => {
          setChatHistory((prev) =>
            prev.map((m) =>
              m.id === genieMsgId
                ? { ...m, text: accumulatedText }
                : m
            )
          );
        },
      });

      setChatHistory((prev) =>
        prev.map((m) =>
          m.id === genieMsgId
            ? {
                ...m,
                text: res.reply,
                grounded: res.toolUsed === 'fetch_google_place_details',
              }
            : m
        )
      );

      if (res.proposals && res.proposals.length > 0) {
        addProposals(bundle.trip.id, res.proposals);
      }
    } finally {
      setChatLoading(false);
      setFetchingPlaceName(null);
    }
  };

  return (
    <main
      data-itinerary-language={bundle.language || uiLanguage}
      className="relative max-w-7xl mx-auto px-0 md:px-8 py-6 md:py-8 pb-24 md:pb-16 print:py-2 print:px-0"
    >
      {/* JIT Translation Loading Overlay */}
      {isTranslating && (
        <div
          data-testid="jit-translation-overlay"
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs print:hidden"
        >
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 shadow-xl text-sm font-semibold text-slate-900 dark:text-white">
            <Loader2 className="w-4 h-4 text-[#D97706] animate-spin shrink-0" />
            <span>
              {uiLanguage === 'en' ? 'Translating itinerary...' : 'A traduzir roteiro...'}
            </span>
          </div>
        </div>
      )}

      {/* Print-Only Header (visible only when printing / exporting PDF) */}
      <div className="hidden print:block pb-4 mb-6 border-b-2 border-slate-900" aria-hidden="true">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-mono-tabular uppercase tracking-widest text-slate-600">
              AtlasGenie · {t('export.printSubtitle')}
            </p>
            <p className="font-serif-atlas text-3xl font-bold text-slate-900 mt-0.5">
              {bundle.trip.destination} {t('trip.atlasSuffix')}
            </p>
          </div>
          <div className="text-right text-xs font-mono-tabular text-slate-700">
            <p>
              {bundle.trip.startDate} → {bundle.trip.endDate}
            </p>
            <p>
              {bundle.trip.travelersCount} {t('hero.travellers')} · {t('hero.budget')} ~€
              {tripTotalInfo.total} (~€{perPersonTotal}
              {perPersonSuffix})
            </p>
            <p>
              {t('trip.reliability')}: {reliability.verifiedPercent}% {t('trip.verified')}
            </p>
          </div>
        </div>
      </div>

      {/* Prominent Clear Navigation: Back to My Trips */}
      <div className="print:hidden mb-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 dark:hover:border-amber-500 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {t('trip.backToMyTrips')}
        </Link>
      </div>

      {/* Top Trip Workspace Header */}
      <div className="print:hidden flex flex-col gap-4 pb-6 mb-8 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            <span>
              {bundle.trip.startDate} → {bundle.trip.endDate}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {bundle.trip.travelersCount} {t('hero.travellers')}
            </span>
            <span aria-hidden="true">·</span>

            {/* Live Reactive Trip Total Counter + Per-Person Breakdown + Global Tier Switcher */}
            <span
              data-testid="trip-total-counter"
              data-trip-total={tripTotalInfo.total}
              data-per-person-total={perPersonTotal}
              data-active-global-tier={tripTotalInfo.dominantTier}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono-tabular font-bold border transition-all duration-300 ${
                pricePulseActive ? 'scale-105 ring-2 ring-amber-500/50' : 'scale-100'
              } ${
                tripTotalInfo.dominantTier === 'premium'
                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-200 border-amber-400 dark:border-amber-700 shadow-xs'
                  : 'bg-[#FAF6F0] dark:bg-slate-800 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700'
              }`}
            >
              <Wallet className="w-3.5 h-3.5 text-[#D97706] shrink-0" aria-hidden="true" />
              <span>
                {t('trip.tripTotalLive', { amount: tripTotalInfo.total })} (~€{perPersonTotal}
                {perPersonSuffix})
              </span>
            </span>

            <div
              data-testid="global-tier-switcher"
              role="group"
              aria-label={t('trip.globalTierLabel')}
              className="inline-flex flex-wrap items-center gap-1.5 md:gap-1 bg-slate-100 dark:bg-slate-800 p-1 md:p-0.5 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              {(['budget', 'mid', 'premium'] as BudgetTier[]).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  data-testid={`global-tier-btn-${tier}`}
                  aria-pressed={tripTotalInfo.dominantTier === tier}
                  onClick={() => handleGlobalTierSwitch(tier)}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    tripTotalInfo.dominantTier === tier
                      ? tier === 'premium'
                        ? 'bg-[#D97706] text-white shadow-2xs'
                        : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {getTierLabel(tier)}
                </button>
              ))}
            </div>

            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              {t('trip.reliability')}: <span aria-hidden="true">🟢</span>{' '}
              <span className="sr-only">Verified Source </span>
              {reliability.verifiedPercent}% {t('trip.verified')} ({reliability.verifiedCount}/
              {reliability.totalChecks})
            </span>
          </div>
          <h1 className="font-serif-atlas text-xl md:text-3xl font-bold text-slate-900 dark:text-white break-words">
            {bundle.trip.destination} {t('trip.atlasSuffix')}
          </h1>
        </div>

        {/* Sub-route Navigation Tabs + Undo + Guided Tour + Export Dropdown + Assistant */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="undo-last-action-btn"
            disabled={tripHistory.length === 0}
            onClick={handleUndo}
            className="px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            ↶ {t('trip.undoLast')}
          </button>

          {/* Workspace Tabs (Target #4 of Guided Tour) */}
          <div
            data-tour="workspace-tabs"
            role="tablist"
            aria-label={t('trip.tabPlan')}
            className="hidden md:flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg"
          >
            <Link
              to={`/trips/${bundle.trip.id}`}
              role="tab"
              aria-selected={activeTab === 'plan'}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                activeTab === 'plan'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {t('trip.tabPlan')}
            </Link>
            <Link
              to={`/trips/${bundle.trip.id}/budget`}
              role="tab"
              aria-selected={activeTab === 'budget'}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                activeTab === 'budget'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {t('trip.tabBudget')}
            </Link>
            <Link
              to={`/trips/${bundle.trip.id}/group`}
              role="tab"
              aria-selected={activeTab === 'group'}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                activeTab === 'group'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {t('trip.tabGroup')}
            </Link>
            <Link
              to={`/trips/${bundle.trip.id}/expenses`}
              role="tab"
              aria-selected={activeTab === 'expenses'}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                activeTab === 'expenses'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {t('trip.tabExpenses')}
            </Link>
          </div>

          {/* Interactive Onboarding Guided Tour Trigger */}
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            aria-label={t('tour.triggerAria')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <Compass className="w-3.5 h-3.5 text-[#D97706]" aria-hidden="true" />
            <span>{t('tour.triggerBtn')}</span>
          </button>

          {/* Save Trip to Firestore Button */}
          <button
            type="button"
            data-testid="save-trip-btn"
            disabled={isSavingTrip}
            onClick={handleSaveTrip}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isSavingTrip ? t('trip.savingTripBtn') : t('trip.saveTripBtn')}</span>
          </button>

          {/* Magic Export (PDF & Calendar .ics) Dropdown */}
          <div ref={exportRef} className="relative">
            <button
              type="button"
              onClick={() => setExportDropdownOpen((prev) => !prev)}
              aria-expanded={exportDropdownOpen}
              aria-haspopup="menu"
              aria-controls="export-dropdown-menu"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-amber-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <Download className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              <span>{t('export.buttonLabel')}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
            </button>

            {exportDropdownOpen && (
              <div
                id="export-dropdown-menu"
                role="menu"
                className="absolute right-0 mt-2 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleExportPdf}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-start gap-2.5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-inset"
                >
                  <Printer className="w-4 h-4 text-[#D97706] mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {t('export.pdfOption')}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('export.pdfDesc')}
                    </p>
                  </div>
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleExportIcsDay}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-start gap-2.5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-inset"
                >
                  <CalendarIcon className="w-4 h-4 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {t('export.icsDayOption')} ({t('trip.dayWord')} {currentDay.dayNumber})
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('export.icsDayDesc')}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleExportIcsFull}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-start gap-2.5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-inset"
                >
                  <CalendarIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {t('export.icsFullOption')}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('export.icsFullDesc')}
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            aria-expanded={chatOpen}
            aria-controls="genie-chat-panel"
            onClick={() => setChatOpen((prev) => !prev)}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <span aria-hidden="true">💬 </span>
            {t('chat.title')}
          </button>
        </div>
      </div>

      {/* Visual Diff Accept / Reject Bar (AI Architecture Rule #4) — Lazy-loaded via Suspense */}
      {proposals.length > 0 && (
        <div className="print:hidden">
          <Suspense fallback={<DiffBannerSuspenseFallback />}>
            <LazyDiffReviewBanner
              proposals={proposals}
              onAccept={handleAcceptProposal}
              onReject={handleRejectProposal}
              onAcceptAll={handleAcceptAllProposals}
              onRejectAll={handleRejectAllProposals}
              onOpenDetails={handleOpenProposalDetails}
            />
          </Suspense>
        </div>
      )}

      {/* Sub-Views: Budget / Group / Expenses (Lazy-loaded via Suspense) */}
      {activeTab === 'budget' && (
        <Suspense fallback={<TabViewSuspenseFallback />}>
          <LazyBudgetTabView bundle={bundle} />
        </Suspense>
      )}
      {activeTab === 'group' && (
        <Suspense fallback={<TabViewSuspenseFallback />}>
          <LazyGroupTabView bundle={bundle} />
        </Suspense>
      )}
      {activeTab === 'expenses' && (
        <Suspense fallback={<TabViewSuspenseFallback />}>
          <LazyExpensesTabView bundle={bundle} />
        </Suspense>
      )}

      {/* Main Itinerary + Map View */}
      {activeTab === 'plan' && (
        <div className="space-y-8">
          {/* Day Selector Tabs, Collapsible Badges Toggle & Action Controls */}
          <div className="print:hidden space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div
                role="tablist"
                aria-label={t('hero.days')}
                className="flex items-center gap-2 overflow-x-auto pb-1"
              >
                {bundle.days.map((day, idx) => (
                  <button
                    key={day.id}
                    type="button"
                    role="tab"
                    data-testid={`day-tab-${day.dayNumber}`}
                    aria-selected={selectedDayIndex === idx}
                    onClick={() => setSelectedDayIndex(idx)}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                      selectedDayIndex === idx
                        ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-amber-600 dark:border-amber-500'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {t('trip.dayWord')} {day.dayNumber} · {day.date.slice(5)}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Collapsible Trust Layer Badges Trigger (Target #1 of Guided Tour, closed by default) */}
                <button
                  id="trust-badges-legend-btn"
                  type="button"
                  data-tour="trust-badges"
                  aria-expanded={badgesLegendOpen}
                  aria-controls="trust-badges-legend-panel"
                  onClick={() => setBadgesLegendOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    badgesLegendOpen
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <span>{t('trip.understandBadgesBtn')}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 transition-transform ${
                      badgesLegendOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const res = await requestAiProposals({
                      taskType: 'chat',
                      destination: bundle.trip.destination,
                      message: 'Suggest a verified local afternoon highlight',
                      currentDay,
                      travelers: bundle.travelers,
                      language,
                      uiLanguage: language === 'pt' ? 'pt-PT' : 'en',
                    });
                    addProposals(bundle.trip.id, res.proposals);
                    showToast(t('toast.diffProposalReady'));
                  }}
                  className="px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 hover:bg-amber-200/80 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {t('trip.testDiffBtn')}
                </button>
                {/* Plan B Toggle Button (Target #3 of Guided Tour) */}
                <button
                  type="button"
                  data-tour="plan-b"
                  aria-pressed={currentDay.activePlan === 'B'}
                  onClick={handleTogglePlanB}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 ${
                    currentDay.activePlan === 'B'
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span aria-hidden="true">☔ </span>
                  {currentDay.activePlan === 'B' ? t('trip.planBActive') : t('trip.planBBtn')}
                </button>
                <button
                  type="button"
                  aria-expanded={addingActivity}
                  onClick={() => setAddingActivity((prev) => !prev)}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
                >
                  + {t('trip.addActivity')}
                </button>
              </div>
            </div>

            {/* Collapsible Trust Layer Confidence Badge Legend (Closed by default) */}
            <div
              id="trust-badges-legend-panel"
              role="region"
              aria-labelledby="trust-badges-legend-btn"
              hidden={!badgesLegendOpen}
              className={
                badgesLegendOpen
                  ? 'flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs shadow-xs'
                  : 'hidden'
              }
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {t('trip.trustLegendTitle')}
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-800 dark:text-emerald-300 font-medium">
                  <span aria-hidden="true">🟢</span>
                  <span className="sr-only">Verified Source:</span>
                  <strong>{t('trip.verified')}</strong> {t('trip.trustLegendVerified')}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-medium">
                  <span aria-hidden="true">🟡</span>
                  <span className="sr-only">AI Estimated:</span>
                  <strong>{t('trip.estimated')}</strong> {t('trip.trustLegendEstimated')}
                </span>
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  <span aria-hidden="true">⚪</span>
                  <strong>{t('trip.toConfirm')}</strong> {t('trip.trustLegendConfirm')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono-tabular text-[11px] text-slate-500">
                  {t('dnd.dragHint')} · {t('trip.trustLegendHint')}
                </span>
                <button
                  type="button"
                  onClick={() => setBadgesLegendOpen(false)}
                  aria-label={t('trip.hideBadgesBtn')}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Day Header + Stat Chips Row + Vibe Slider (Target #2 of Guided Tour) */}
          <div
            data-tour="vibe-slider"
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4 shadow-2xs overflow-hidden"
          >
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                    {t('trip.dayWord')} {currentDay.dayNumber} · {currentDay.date}{' '}
                    {currentDay.activePlan === 'B' ? t('trip.planBIndoorTag') : ''}
                  </p>
                  <h2 className="font-serif-atlas text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-white mt-0.5 break-words">
                    {currentDay.theme || `${t('trip.dayWord')} ${currentDay.dayNumber}`}
                  </h2>
                </div>

                {/* Real-time Calculated Daily Total Counter in Day Header (Sprint 5 #1) */}
                <span
                  data-testid="day-header-daily-total"
                  data-daily-total={daySubtotal.total}
                  data-daily-per-person={daySubtotal.perPersonTotal}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-mono-tabular text-xs sm:text-sm font-bold border transition-all duration-300 self-start sm:self-center ${
                    daySubtotal.dominantTier === 'premium'
                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-200 border-amber-400 dark:border-amber-700'
                      : 'bg-[#FAF6F0] dark:bg-slate-800 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Wallet className="w-3.5 h-3.5 text-[#D97706] shrink-0" aria-hidden="true" />
                  <span>
                    {t('logistics.dailyTotal', { amount: daySubtotal.total })} (~€
                    {daySubtotal.perPersonTotal}
                    {perPersonSuffix})
                  </span>
                </span>
              </div>

              {/* Single Row of Clean Stat Chips Below Day Title */}
              <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                {/* Pace Indicator Chip */}
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-mono-tabular font-medium ${
                    paceMetrics.label === 'Packed'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                      : paceMetrics.label === 'Relaxed'
                      ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {t('trip.paceIndicator')} <strong>{localizedPaceLabel}</strong> ({paceMetrics.paceScore}/100)
                  </span>
                </span>

                {/* Scheduled Time Chip */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FAF6F0] dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-700 dark:text-slate-200">
                  <Clock className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                  <span>
                    {t('trip.scheduled')}{' '}
                    <strong>{Math.round((paceMetrics.scheduledMinutes / 60) * 10) / 10}h</strong>
                  </span>
                </span>

                {/* Transit Time Chip */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FAF6F0] dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-700 dark:text-slate-200">
                  <Footprints className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span>
                    {t('trip.transitWalk')} <strong>{paceMetrics.travelMinutes}m</strong>
                  </span>
                </span>

                {/* Free Buffer Chip */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FAF6F0] dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs font-mono-tabular text-slate-700 dark:text-slate-200">
                  <Coffee className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                  <span>
                    {t('trip.freeBuffer')}{' '}
                    <strong>{Math.round((paceMetrics.freeBufferMinutes / 60) * 10) / 10}h</strong>
                  </span>
                </span>
              </div>
            </div>

            <div
              data-testid="vibe-slider-container"
              className="print:hidden flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 overflow-hidden"
            >
              <label
                htmlFor="vibe-slider"
                data-testid="vibe-slider-label"
                className="w-full md:w-auto max-w-full whitespace-normal break-words text-xs md:text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                {t('trip.vibeSlider')} (1 = {t('trip.paceRelaxed')} → 5 = {t('trip.pacePacked')}):
              </label>
              <div className="flex items-center gap-3 w-full md:w-auto md:flex-1 min-w-0">
                <input
                  id="vibe-slider"
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={currentDay.paceLevel}
                  aria-valuemin={1}
                  aria-valuemax={5}
                  aria-valuenow={currentDay.paceLevel}
                  aria-valuetext={`${t('trip.step')} ${currentDay.paceLevel} (${localizedPaceLabel})`}
                  onChange={(e) => handleVibeSliderChange(Number(e.target.value))}
                  className="flex-1 min-w-0 accent-amber-600 cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                />
                <span className="text-xs font-mono-tabular font-semibold whitespace-nowrap shrink-0">
                  {t('trip.step')} {currentDay.paceLevel}/5
                </span>
              </div>
            </div>

            {paceMetrics.isUnrealistic && (
              <div
                role="alert"
                className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200"
              >
                ⚠️ {t('trip.unrealisticWarn')}
              </div>
            )}
          </div>

          {/* Add Activity Inline Form */}
          {addingActivity && (
            <form
              onSubmit={handleAddActivitySubmit}
              className="print:hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-4 flex flex-col sm:flex-row items-end gap-3"
            >
              <div className="flex-1 w-full">
                <label htmlFor="new-act-title" className="block text-xs font-medium mb-1">
                  {t('trip.actNameLabel')}
                </label>
                <input
                  id="new-act-title"
                  type="text"
                  required
                  placeholder={t('trip.actNamePlaceholder')}
                  value={newActTitle}
                  onChange={(e) => setNewActTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label htmlFor="new-act-time" className="block text-xs font-medium mb-1">
                  {t('trip.actStartTime')}
                </label>
                <input
                  id="new-act-time"
                  type="time"
                  value={newActTime}
                  onChange={(e) => setNewActTime(e.target.value)}
                  className="w-full sm:w-auto px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 font-mono-tabular focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label htmlFor="new-act-cost" className="block text-xs font-medium mb-1">
                  {t('trip.actEstCost')}
                </label>
                <input
                  id="new-act-cost"
                  type="number"
                  min={0}
                  value={newActCost}
                  onChange={(e) => setNewActCost(Number(e.target.value))}
                  className="w-full sm:w-24 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 font-mono-tabular focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {t('trip.saveStopBtn')}
              </button>
            </form>
          )}

          {/* Split Desktop Grid with Generous Breathing Room: Timeline Left (7 cols) + Map Right (5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start print:block">
            {/* Timeline Column */}
            <div
              className={`lg:col-span-7 print:w-full space-y-6 ${
                mobileView === 'map' ? 'hidden lg:block print:block' : 'block'
              }`}
            >
              {vibeRecalculating ? (
                <SkeletonItinerary cardsCount={3} destination={bundle.trip.destination} />
              ) : (
                <DayTimeline
                  dayNumber={currentDay.dayNumber}
                  city={currentDay.city}
                  theme={currentDay.theme}
                  accommodation={currentDay.accommodation}
                  intercityTransit={currentDay.intercity_transit}
                  meals={currentDay.meals}
                  activities={activeActivities}
                  travelers={travelers}
                  selectedActivityId={selectedActivityId}
                  activeTravelerId={activeTravelerId}
                  askingAccommodationAlt={askingAccommodationAlt}
                  onDragEnd={handleDragEnd}
                  onSelectActivity={handleSelectActivity}
                  onMoveActivity={handleMoveActivity}
                  onRemoveActivity={handleRemoveActivityDirect}
                  onTierSelect={handleTierSelect}
                  onEscapeCrowds={handleEscapeCrowds}
                  onVote={handleVoteActivity}
                  onQuickExpense={handleQuickExpense}
                  getTierLabel={getTierLabel}
                  onOpenActivityDetails={handleOpenActivityDetails}
                  onRenameActivity={handleRenameActivity}
                  onRenameAccommodation={handleRenameAccommodation}
                  onAccommodationTierSelect={handleAccommodationTierSelect}
                  onAskAccommodationAlternative={handleAskAccommodationAlternative}
                />
              )}
            </div>

            {/* Sticky Map Column with Elevated Breathing Room (Hidden in print mode, Lazy-loaded via Suspense) */}
            <div
              className={`print:hidden lg:col-span-5 lg:sticky lg:top-24 h-[460px] lg:h-[620px] p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs ${
                mobileView === 'plan' ? 'hidden lg:block' : 'block'
              }`}
            >
              <Suspense fallback={<MapSuspenseFallback />}>
                <LazyAtlasMap
                  activities={activeActivities}
                  accommodation={currentDay.accommodation}
                  selectedActivityId={selectedActivityId}
                  onSelectActivity={handleSelectActivity}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Interactive 4-Step First-Time User Onboarding Guided Tour */}
      {tourOpen && (
        <Suspense fallback={null}>
          <LazyGuidedTourOverlay isOpen={tourOpen} onClose={handleCloseTour} />
        </Suspense>
      )}

      {/* Collapsible Conversational Assistant Side Panel (Feature A7, hidden in print) */}
      {chatOpen && (
        <aside
          id="genie-chat-panel"
          aria-label={t('chat.title')}
          className="print:hidden fixed right-4 bottom-20 md:bottom-6 z-40 w-[calc(100vw-2rem)] sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-2xl flex flex-col max-h-[520px]"
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="font-serif-atlas text-base font-bold text-slate-900 dark:text-white">
                {t('chat.title')}
              </h2>
              <p className="text-[11px] text-slate-500">
                {t('chat.subtitle', { day: currentDay.dayNumber })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label={t('support.closeAria')}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          {/* Quick-Action Chips */}
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
            {[
              {
                label: t('chat.chipPlaceDetails'),
                prompt: t('chat.promptPlaceDetails'),
              },
              { label: t('chat.chipCheaper'), prompt: t('chat.promptCheaper') },
              { label: t('chat.chipLessWalking'), prompt: t('chat.promptLessWalking') },
              { label: t('chat.chipMoreLocal'), prompt: t('chat.promptMoreLocal') },
              { label: t('chat.chipRainy'), prompt: t('chat.promptRainy') },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleSendChat(chip.prompt)}
                className="px-2.5 py-1 text-[11px] font-medium bg-[#FAF6F0] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:border-amber-500 whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs max-h-64">
            {chatHistory.length === 0 && (
              <div className="p-3 rounded-xl bg-[#FAF6F0] dark:bg-slate-800 text-slate-800 dark:text-slate-200 mr-6">
                {t('chat.welcomeMessage', { destination: bundle.trip.destination })}
              </div>
            )}
            {chatHistory
              .filter((m) => m.sender === 'user' || m.text.trim().length > 0)
              .map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl whitespace-pre-line leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-[#0F172A] text-white ml-8'
                      : 'bg-[#FAF6F0] dark:bg-slate-800 text-slate-800 dark:text-slate-200 mr-6'
                  }`}
                >
                  {m.grounded && (
                    <div className="mb-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-semibold">
                      <span aria-hidden="true">🟢</span>
                      <span>{t('chat.groundedBadge')}</span>
                    </div>
                  )}
                  <div>{m.text}</div>
                </div>
              ))}
            {chatLoading && (
              <p
                role="status"
                aria-live="polite"
                className="text-xs text-amber-700 dark:text-amber-400 italic"
              >
                {fetchingPlaceName
                  ? t('chat.fetchingPlace', { place: fetchingPlaceName })
                  : t('hero.miniGenLoading')}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat(chatInput);
            }}
            className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
          >
            <label htmlFor="genie-chat-input" className="sr-only">
              {t('chat.placeholder')}
            </label>
            <input
              id="genie-chat-input"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={t('chat.placeholder')}
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="px-3.5 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {t('chat.sendBtn')}
            </button>
          </form>
        </aside>
      )}

      {/* Mobile Bottom Navigation Bar (Plan / Map / Budget / Group / Expenses, hidden in print) */}
      <nav
        aria-label={t('nav.mainNavAria')}
        className="print:hidden md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center text-center text-[11px] font-medium"
      >
        <button
          type="button"
          onClick={() => {
            setMobileView('plan');
            navigate(`/trips/${bundle.trip.id}`);
          }}
          className={
            activeTab === 'plan' && mobileView === 'plan'
              ? 'text-amber-700 dark:text-amber-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }
        >
          {t('trip.mobilePlan')}
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileView('map');
            navigate(`/trips/${bundle.trip.id}`);
          }}
          className={
            activeTab === 'plan' && mobileView === 'map'
              ? 'text-amber-700 dark:text-amber-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }
        >
          {t('trip.mobileMap')}
        </button>
        <Link
          to={`/trips/${bundle.trip.id}/budget`}
          className={
            activeTab === 'budget'
              ? 'text-amber-700 dark:text-amber-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }
        >
          {t('trip.mobileBudget')}
        </Link>
        <Link
          to={`/trips/${bundle.trip.id}/group`}
          className={
            activeTab === 'group'
              ? 'text-amber-700 dark:text-amber-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }
        >
          {t('trip.mobileGroup')}
        </Link>
        <Link
          to={`/trips/${bundle.trip.id}/expenses`}
          className={
            activeTab === 'expenses'
              ? 'text-amber-700 dark:text-amber-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }
        >
          {t('trip.mobileExpenses')}
        </Link>
      </nav>
      {/* Login Modal triggered when unauthenticated user clicks Save Trip (Lazy-loaded via Suspense) */}
      {loginModalOpen && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <LazyLoginModal
            isOpen={loginModalOpen}
            onClose={handleCloseLoginModal}
            onSuccess={handleLoginSuccess}
          />
        </Suspense>
      )}
      {/* Activity & Proposal Extended Details Modal (Sprint 3, Lazy-loaded via Suspense) */}
      {detailsModalState && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <LazyActivityDetailsModal
            isOpen={Boolean(detailsModalState)}
            onClose={handleCloseDetailsModal}
            activity={detailsModalState.activity}
            proposal={detailsModalState.proposal}
            onAcceptProposal={handleAcceptProposal}
            onRejectProposal={handleRejectProposal}
            onEscapeCrowds={handleEscapeCrowds}
          />
        </Suspense>
      )}
      {/* Non-Blocking Budget Guard Confirmation Modal (Sprint 21) */}
      {budgetGuardModal && (
        <div
          data-testid="budget-guard-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="budget-guard-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-bold text-sm">
                  !
                </span>
                <h2
                  id="budget-guard-modal-title"
                  className="font-serif-atlas text-lg font-bold text-slate-900 dark:text-white"
                >
                  {t('budget.guardTitle')}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t('support.closeAria')}
                onClick={() => setBudgetGuardModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <p
              data-testid="budget-guard-modal-message"
              className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-medium"
            >
              {budgetGuardModal.warningMessage}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                data-testid="budget-guard-cancel-btn"
                onClick={() => setBudgetGuardModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {t('budget.guardCancelBtn')}
              </button>
              <button
                type="button"
                data-testid="budget-guard-confirm-btn"
                onClick={async () => {
                  const action = budgetGuardModal.onConfirm;
                  setBudgetGuardModal(null);
                  await action();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {t('budget.guardContinueBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
