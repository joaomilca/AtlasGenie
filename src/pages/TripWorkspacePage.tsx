import React, { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAtlas } from '../context/AtlasContext';
import { useI18n } from '../i18n/I18nContext';
import {
  computePaceMetrics,
  computeReliabilitySummary,
} from '../utils/domainLogic';
import { Activity, BudgetTier, ProposalChange, VoteValue } from '../types/models';
import { TrustBadge } from '../components/TrustBadge';
import { DiffReviewBanner } from '../components/DiffReviewBanner';
import { AtlasMap } from '../components/AtlasMap';
import { BudgetTabView } from '../components/BudgetTabView';
import { GroupTabView } from '../components/GroupTabView';
import { ExpensesTabView } from '../components/ExpensesTabView';
import { requestAiProposals } from '../services/api';

export const TripWorkspacePage: React.FC = () => {
  const { id = 'demo-lisbon-4d' } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const {
    trips,
    proposalsByTrip,
    undoHistoryByTrip,
    activeTravelerIdByTrip,
    addProposals,
    acceptProposal,
    rejectProposal,
    acceptAllProposals,
    rejectAllProposals,
    undoLastChange,
    togglePlanB,
    updateDayActivities,
    castVote,
    showToast,
  } = useAtlas();

  const bundle = trips[id] || trips['demo-lisbon-4d'];
  const proposals = proposalsByTrip[bundle.trip.id] || [];
  const undoStack = undoHistoryByTrip[bundle.trip.id] || [];
  const activeTravelerId =
    activeTravelerIdByTrip[bundle.trip.id] || bundle.travelers[0]?.id || 'ana';

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
  const [chatHistory, setChatHistory] = useState<{ sender: 'user' | 'genie'; text: string }[]>([
    {
      sender: 'genie',
      text: `Welcome to your ${bundle.trip.destination} Atlas! Ask me anything or tap a quick action below—every change I suggest appears as an Accept/Reject diff so you stay in control.`,
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

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

  const reliability = useMemo(() => computeReliabilitySummary(bundle.days), [bundle.days]);
  const paceMetrics = useMemo(() => computePaceMetrics(currentDay), [currentDay]);

  const handleVibeSliderChange = async (nextPace: number) => {
    await updateDayActivities(bundle.trip.id, currentDay.id, activeActivities, nextPace);
    const res = await requestAiProposals({
      taskType: 'pace',
      destination: bundle.trip.destination,
      message: `Adjust day pace to level ${nextPace}/5`,
      currentDay: { ...currentDay, paceLevel: nextPace },
      travelers: bundle.travelers,
    });
    addProposals(bundle.trip.id, res.proposals);
  };

  const handleEscapeCrowds = (act: Activity) => {
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
              title: `${alt.title} (Light option)`,
              estimatedCost: Math.max(0, Math.round(alt.estimatedCost * 0.6)),
              description: 'Local entry/snack',
            },
            mid: {
              title: `${alt.title} (Standard)`,
              estimatedCost: alt.estimatedCost,
              description: alt.description,
            },
            premium: {
              title: `${alt.title} (Full Tasting / Guided)`,
              estimatedCost: Math.round(alt.estimatedCost * 1.8),
              description: 'Curated local experience',
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
          title: `Local Neighbourhood Gem near ${act.location.name}`,
          description: 'Authentic low-crowd alternative within 12 minutes.',
          touristTrapScore: 20,
          priceConfidence: { status: 'to_confirm', notes: 'Local spot — confirm on arrival' },
          hoursConfidence: { status: 'to_confirm', notes: 'Confirm local hours' },
          whyThis: 'Locals actually go here to avoid tour bus crowds.',
        };

    const prop: ProposalChange = {
      id: `prop-local-${Date.now()}`,
      dayId: currentDay.id,
      dayNumber: currentDay.dayNumber,
      type: 'replace',
      targetActivityId: act.id,
      targetActivityTitle: act.title,
      payload: replacementPayload,
      reason: alt
        ? `${alt.reason} (${alt.travelMinutesAway} min away via ${alt.travelSource === 'maps_api' ? 'Maps API' : 'estimate'})`
        : 'Authentic local alternative within 12 minutes',
      source: 'local_alt',
      status: 'pending',
    };

    addProposals(bundle.trip.id, [prop]);
    showToast('Local alternative proposed in the Diff Bar above!');
  };

  const handleMoveActivity = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activeActivities.length) return;
    const copy = [...activeActivities];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    await updateDayActivities(bundle.trip.id, currentDay.id, copy);
    showToast('Reordered stops and recalculated travel times.');
  };

  const handleRemoveActivityDirect = async (activityId: string) => {
    const next = activeActivities.filter((a) => a.id !== activityId);
    await updateDayActivities(bundle.trip.id, currentDay.id, next);
    showToast('Removed activity and updated travel times.');
  };

  const handleTierSelect = async (activityId: string, tier: BudgetTier) => {
    const next = activeActivities.map((a) =>
      a.id === activityId ? { ...a, selectedTier: tier } : a
    );
    await updateDayActivities(bundle.trip.id, currentDay.id, next);
  };

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
      description: 'Custom stop added to your personal atlas.',
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
        budget: { title: 'Budget Option', estimatedCost: Math.max(0, Math.round(newActCost * 0.6)), description: 'Basic entry' },
        mid: { title: 'Standard Option', estimatedCost: Number(newActCost), description: 'Standard cost' },
        premium: { title: 'Premium Option', estimatedCost: Math.round(newActCost * 1.8), description: 'Enhanced experience' },
      },
      selectedTier: 'mid',
      priceConfidence: { status: 'to_confirm', notes: 'User-added activity — confirm rate' },
      hoursConfidence: { status: 'to_confirm', notes: 'Confirm opening hours' },
      whyThis: 'Added directly by you.',
      touristTrapScore: 20,
      votes: {},
    };
    const next = [...activeActivities, created].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    await updateDayActivities(bundle.trip.id, currentDay.id, next);
    setNewActTitle('');
    setAddingActivity(false);
    showToast(`Added "${created.title}".`);
  };

  const handleSendChat = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean) return;
    setChatHistory((prev) => [...prev, { sender: 'user', text: clean }]);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await requestAiProposals({
        taskType: 'chat',
        destination: bundle.trip.destination,
        message: clean,
        currentDay,
        travelers: bundle.travelers,
      });
      setChatHistory((prev) => [...prev, { sender: 'genie', text: res.reply }]);
      addProposals(bundle.trip.id, res.proposals);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 pb-24 md:pb-12">
      {/* Top Trip Workspace Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 mb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            <span>{bundle.trip.startDate} → {bundle.trip.endDate}</span>
            <span>·</span>
            <span>{bundle.trip.travelersCount} Travellers</span>
            <span>·</span>
            <span>Budget €{bundle.trip.totalBudget}</span>
            <span>·</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              {t('trip.reliability')}: 🟢 {reliability.verifiedPercent}% {t('trip.verified')} ({reliability.verifiedCount}/{reliability.totalChecks})
            </span>
          </div>
          <h1 className="font-serif-atlas text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {bundle.trip.destination} Atlas
          </h1>
        </div>

        {/* Sub-route Navigation Tabs */}
        <div className="flex items-center gap-2 shrink-0">
          {undoStack.length > 0 && (
            <button
              type="button"
              onClick={() => undoLastChange(bundle.trip.id)}
              className="px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-lg whitespace-nowrap"
            >
              ↶ {t('trip.undoLast')}
            </button>
          )}

          <div
            role="tablist"
            aria-label="Trip Workspace Views"
            className="hidden md:flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg"
          >
            <Link
              to={`/trips/${bundle.trip.id}`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'plan'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {t('trip.tabPlan')}
            </Link>
            <Link
              to={`/trips/${bundle.trip.id}/budget`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'budget'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {t('trip.tabBudget')}
            </Link>
            <Link
              to={`/trips/${bundle.trip.id}/group`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'group'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {t('trip.tabGroup')}
            </Link>
            <Link
              to={`/trips/${bundle.trip.id}/expenses`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'expenses'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {t('trip.tabExpenses')}
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setChatOpen((prev) => !prev)}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            💬 {t('chat.title')}
          </button>
        </div>
      </div>

      {/* Visual Diff Accept / Reject Bar (AI Architecture Rule #4) */}
      <DiffReviewBanner
        proposals={proposals}
        onAccept={(pId) => acceptProposal(bundle.trip.id, pId)}
        onReject={(pId) => rejectProposal(bundle.trip.id, pId)}
        onAcceptAll={() => acceptAllProposals(bundle.trip.id)}
        onRejectAll={() => rejectAllProposals(bundle.trip.id)}
      />

      {/* Sub-Views: Budget / Group / Expenses */}
      {activeTab === 'budget' && <BudgetTabView bundle={bundle} />}
      {activeTab === 'group' && <GroupTabView bundle={bundle} />}
      {activeTab === 'expenses' && <ExpensesTabView bundle={bundle} />}

      {/* Main Itinerary + Map View */}
      {activeTab === 'plan' && (
        <div className="space-y-6">
          {/* Day Selector Tabs & One-Tap Plan B Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {bundle.days.map((day, idx) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setSelectedDayIndex(idx)}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    selectedDayIndex === idx
                      ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-amber-600 dark:border-amber-500'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                  }`}
                >
                  Day {day.dayNumber} · {day.date.slice(5)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => togglePlanB(bundle.trip.id, currentDay.id)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                  currentDay.activePlan === 'B'
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                ☔ {currentDay.activePlan === 'B' ? t('trip.planBActive') : t('trip.planBBtn')}
              </button>
              <button
                type="button"
                onClick={() => setAddingActivity((prev) => !prev)}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors whitespace-nowrap"
              >
                + {t('trip.addActivity')}
              </button>
            </div>
          </div>

          {/* Vibe Slider & Deterministic Pace Indicator Bar */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  Day {currentDay.dayNumber} {currentDay.activePlan === 'B' ? '(PLAN B INDOOR ACTIVE)' : ''}
                </p>
                <h2 className="font-serif-atlas text-xl font-bold text-slate-900 dark:text-white">
                  {currentDay.theme || `Day ${currentDay.dayNumber} Itinerary`}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-mono-tabular">
                <span>
                  Pace Indicator:{' '}
                  <strong
                    className={
                      paceMetrics.label === 'Packed'
                        ? 'text-amber-700 dark:text-amber-400'
                        : paceMetrics.label === 'Relaxed'
                        ? 'text-teal-700 dark:text-teal-400'
                        : 'text-slate-900 dark:text-white'
                    }
                  >
                    {paceMetrics.label} ({paceMetrics.paceScore}/100)
                  </strong>
                </span>
                <span>·</span>
                <span>Scheduled: {Math.round((paceMetrics.scheduledMinutes / 60) * 10) / 10}h</span>
                <span>·</span>
                <span>Transit/Walk: {paceMetrics.travelMinutes}m</span>
                <span>·</span>
                <span>Free Buffer: {Math.round((paceMetrics.freeBufferMinutes / 60) * 10) / 10}h</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label htmlFor="vibe-slider" className="text-xs font-medium whitespace-nowrap">
                {t('trip.vibeSlider')} (1 = {t('trip.paceRelaxed')} → 5 = {t('trip.pacePacked')}):
              </label>
              <input
                id="vibe-slider"
                type="range"
                min={1}
                max={5}
                step={1}
                value={currentDay.paceLevel}
                onChange={(e) => handleVibeSliderChange(Number(e.target.value))}
                className="flex-1 accent-amber-600 cursor-pointer"
              />
              <span className="text-xs font-mono-tabular font-semibold whitespace-nowrap">
                Step {currentDay.paceLevel}/5
              </span>
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
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-4 flex flex-col sm:flex-row items-end gap-3"
            >
              <div className="flex-1 w-full">
                <label htmlFor="new-act-title" className="block text-xs font-medium mb-1">
                  Activity Name
                </label>
                <input
                  id="new-act-title"
                  type="text"
                  required
                  placeholder="e.g. Miradouro de Santa Catarina Sunset"
                  value={newActTitle}
                  onChange={(e) => setNewActTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label htmlFor="new-act-time" className="block text-xs font-medium mb-1">
                  Start Time
                </label>
                <input
                  id="new-act-time"
                  type="time"
                  value={newActTime}
                  onChange={(e) => setNewActTime(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="new-act-cost" className="block text-xs font-medium mb-1">
                  Est. Cost (€)
                </label>
                <input
                  id="new-act-cost"
                  type="number"
                  min={0}
                  value={newActCost}
                  onChange={(e) => setNewActCost(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 font-mono-tabular"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg"
              >
                Save Stop
              </button>
            </form>
          )}

          {/* Split Desktop Grid: Timeline Left (7 cols) + Map Right (5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Timeline Column */}
            <div
              className={`lg:col-span-7 space-y-4 ${
                mobileView === 'map' ? 'hidden lg:block' : 'block'
              }`}
            >
              {activeActivities.map((act, idx) => {
                const selectedCost = act.costOptions[act.selectedTier];
                const pricePrefix = act.priceConfidence.status === 'verified' ? '' : '~';
                const isTrap = act.touristTrapScore >= 70;
                const downVotes = Object.values(act.votes || {}).filter((v) => v === 'down').length;

                return (
                  <React.Fragment key={act.id}>
                    {/* Travel Connector from previous activity (Feature B6) */}
                    {idx > 0 && act.travelFromPrevious && (
                      <div className="pl-6 flex items-center gap-2 text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                        <span>↓</span>
                        <span>
                          {act.travelFromPrevious.mode === 'WALKING'
                            ? '🚶 Walk'
                            : act.travelFromPrevious.mode === 'TRANSIT'
                            ? '🚋 Transit'
                            : '🚕 Drive'}{' '}
                          · {act.travelFromPrevious.minutes} min ({act.travelFromPrevious.distanceKm} km)
                        </span>
                        <span>·</span>
                        <span>
                          Source:{' '}
                          {act.travelFromPrevious.source === 'maps_api'
                            ? 'Google Maps API'
                            : 'estimated (~)'}
                        </span>
                      </div>
                    )}

                    {/* Activity Card */}
                    <article
                      onClick={() => setSelectedActivityId(act.id)}
                      className={`rounded-xl bg-white dark:bg-slate-900 border p-5 space-y-3.5 transition-colors ${
                        selectedActivityId === act.id
                          ? 'border-amber-500 dark:border-amber-500'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {/* Top row: Pin number, Time, Title & Reorder/Delete controls */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-amber-700 dark:text-amber-400">
                              #{idx + 1} · {act.startTime} ({act.durationMin} min)
                            </span>
                            <span>·</span>
                            <span>{act.location.name}</span>
                            {downVotes > 0 && (
                              <>
                                <span>·</span>
                                <span className="text-rose-700 dark:text-rose-400 font-semibold">
                                  ⚠️ {t('trip.needsDiscussion')}
                                </span>
                              </>
                            )}
                          </div>
                          <h3 className="font-serif-atlas text-lg font-bold text-slate-900 dark:text-white">
                            {act.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveActivity(idx, -1);
                            }}
                            disabled={idx === 0}
                            aria-label={`Move ${act.title} earlier`}
                            className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveActivity(idx, 1);
                            }}
                            disabled={idx === activeActivities.length - 1}
                            aria-label={`Move ${act.title} later`}
                            className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveActivityDirect(act.id);
                            }}
                            aria-label={`Remove ${act.title}`}
                            className="px-2 py-1 text-xs text-rose-600 rounded border border-slate-200 dark:border-slate-700 hover:bg-rose-50"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {act.description}
                      </p>

                      {/* "Why this activity?" (Feature B7) */}
                      <p className="text-xs text-teal-800 dark:text-teal-300 font-medium">
                        ✨ {t('trip.whyThis')} {act.whyThis}
                      </p>

                      {/* Trust Layer Badges (Feature B1: Price & Opening Hours) */}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
                        <TrustBadge
                          type="price"
                          confidence={act.priceConfidence}
                          valueText={`${pricePrefix}${selectedCost.estimatedCost}€ (${selectedCost.title})`}
                        />
                        <TrustBadge
                          type="hours"
                          confidence={act.hoursConfidence}
                          valueText={act.openingHoursText || '09:30 – 18:00'}
                        />
                      </div>

                      {/* Cost Tier Selector + Anti-Tourist-Trap + Voting & Expense Quick Action */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        {/* Budget / Mid / Premium switcher */}
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                          {(['budget', 'mid', 'premium'] as BudgetTier[]).map((tier) => (
                            <button
                              key={tier}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTierSelect(act.id, tier);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                                act.selectedTier === tier
                                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {tier}: €{act.costOptions[tier].estimatedCost}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* Anti-Tourist-Trap Filter (Feature B4: score >= 70) */}
                          {isTrap && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEscapeCrowds(act);
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap"
                            >
                              🧭 {t('trip.escapeCrowds')} ({act.touristTrapScore}/100)
                            </button>
                          )}

                          {/* Quick Vote */}
                          <div className="flex items-center gap-1">
                            {(['up', 'down'] as VoteValue[]).map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  castVote(
                                    bundle.trip.id,
                                    currentDay.id,
                                    act.id,
                                    activeTravelerId,
                                    v
                                  );
                                }}
                                aria-label={`Vote ${v} for ${act.title}`}
                                className={`px-2 py-1 text-xs rounded border ${
                                  act.votes?.[activeTravelerId] === v
                                    ? 'bg-slate-900 text-white dark:bg-amber-600'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {v === 'up' ? '👍' : '👎'}
                              </button>
                            ))}
                          </div>

                          {/* Quick Add Expense Link */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/trips/${bundle.trip.id}/expenses`);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline whitespace-nowrap"
                          >
                            + Expense
                          </button>
                        </div>
                      </div>
                    </article>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Sticky Map Column */}
            <div
              className={`lg:col-span-5 lg:sticky lg:top-20 h-[440px] lg:h-[600px] ${
                mobileView === 'plan' ? 'hidden lg:block' : 'block'
              }`}
            >
              <AtlasMap
                activities={activeActivities}
                selectedActivityId={selectedActivityId}
                onSelectActivity={(actId) => setSelectedActivityId(actId)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Conversational Assistant Side Panel (Feature A7) */}
      {chatOpen && (
        <aside
          aria-label="Atlas Genie Conversational Assistant"
          className="fixed right-4 bottom-20 md:bottom-6 z-40 w-[calc(100vw-2rem)] sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-2xl flex flex-col max-h-[520px]"
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-serif-atlas text-base font-bold text-slate-900 dark:text-white">
                {t('chat.title')}
              </h3>
              <p className="text-[11px] text-slate-500">
                Proposes non-destructive diffs for Day {currentDay.dayNumber}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Close assistant panel"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Quick-Action Chips */}
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
            {[
              { label: t('chat.chipCheaper'), prompt: 'Make today cheaper with local budget spots' },
              { label: t('chat.chipLessWalking'), prompt: 'Less walking and shorter transit legs' },
              { label: t('chat.chipMoreLocal'), prompt: 'Replace touristy stops with authentic local taverns' },
              { label: t('chat.chipRainy'), prompt: 'Propose rainy day indoor alternatives' },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleSendChat(chip.prompt)}
                className="px-2.5 py-1 text-[11px] font-medium bg-[#FAF6F0] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:border-amber-500 whitespace-nowrap shrink-0"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs max-h-64">
            {chatHistory.map((m, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl ${
                  m.sender === 'user'
                    ? 'bg-[#0F172A] text-white ml-8'
                    : 'bg-[#FAF6F0] dark:bg-slate-800 text-slate-800 dark:text-slate-200 mr-6'
                }`}
              >
                {m.text}
              </div>
            ))}
            {chatLoading && (
              <p className="text-xs text-amber-700 dark:text-amber-400 italic">
                {t('hero.miniGenLoading')}
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
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={t('chat.placeholder')}
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-[#FAF6F0] dark:bg-slate-800"
            />
            <button
              type="submit"
              className="px-3.5 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg"
            >
              Send
            </button>
          </form>
        </aside>
      )}

      {/* Mobile Bottom Navigation Bar (Plan / Map / Budget / Group / Expenses) */}
      <nav
        aria-label="Mobile Workspace Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center text-center text-[11px] font-medium"
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
          Plan
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
          Map
        </button>
        <Link
          to={`/trips/${bundle.trip.id}/budget`}
          className={
            activeTab === 'budget'
              ? 'text-amber-700 dark:text-amber-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }
        >
          Budget
        </Link>
        <Link
          to={`/trips/${bundle.trip.id}/group`}
          className={
            activeTab === 'group'
              ? 'text-amber-700 dark:text-amber-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }
        >
          Group
        </Link>
        <Link
          to={`/trips/${bundle.trip.id}/expenses`}
          className={
            activeTab === 'expenses'
              ? 'text-amber-700 dark:text-amber-400 font-bold'
              : 'text-slate-600 dark:text-slate-400'
          }
        >
          Expenses
        </Link>
      </nav>
    </main>
  );
};
