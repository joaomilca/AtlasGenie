import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Download,
  Printer,
  Calendar as CalendarIcon,
  Compass,
  ChevronDown,
  Gauge,
  Clock,
  Footprints,
  Coffee,
  X,
} from 'lucide-react';
import { useAtlas } from '../context/AtlasContext';
import { useI18n } from '../i18n/I18nContext';
import {
  computePaceMetrics,
  computeReliabilitySummary,
  reorderActivitiesList,
  generateIcsCalendar,
  downloadIcsFile,
} from '../utils/domainLogic';
import { Activity, BudgetTier, ProposalChange, VoteValue } from '../types/models';
import { TrustBadge } from '../components/TrustBadge';
import { DiffReviewBanner } from '../components/DiffReviewBanner';
import { AtlasMap } from '../components/AtlasMap';
import { BudgetTabView } from '../components/BudgetTabView';
import { GroupTabView } from '../components/GroupTabView';
import { ExpensesTabView } from '../components/ExpensesTabView';
import { SkeletonItinerary } from '../components/SkeletonItinerary';
import { GuidedTourOverlay } from '../components/GuidedTourOverlay';
import { requestAiProposals, streamAtlasGenieChat } from '../services/api';

interface SortableActivityCardProps {
  act: Activity;
  idx: number;
  totalCount: number;
  selectedActivityId: string | null;
  activeTravelerId: string;
  onSelect: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onTierSelect: (id: string, tier: BudgetTier) => void;
  onEscapeCrowds: (act: Activity) => void;
  onVote: (actId: string, vote: VoteValue) => void;
  onQuickExpense: () => void;
  getTierLabel: (tier: BudgetTier) => string;
}

const SortableActivityCard: React.FC<SortableActivityCardProps> = ({
  act,
  idx,
  totalCount,
  selectedActivityId,
  activeTravelerId,
  onSelect,
  onMove,
  onRemove,
  onTierSelect,
  onEscapeCrowds,
  onVote,
  onQuickExpense,
  getTierLabel,
}) => {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: act.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };

  const selectedCost = act.costOptions[act.selectedTier];
  const pricePrefix = act.priceConfidence.status === 'verified' ? '' : '~';
  const isTrap = act.touristTrapScore >= 70;
  const downVotes = Object.values(act.votes || {}).filter((v) => v === 'down').length;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`list-none ${isDragging ? 'opacity-90 scale-[1.01]' : ''}`}
    >
      {/* Travel Connector from previous activity (Feature B6) */}
      {idx > 0 && act.travelFromPrevious && (
        <div className="pl-7 pb-4 flex items-center gap-2 text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
          <span aria-hidden="true">↓</span>
          <span>
            {act.travelFromPrevious.mode === 'WALKING'
              ? `🚶 ${t('trip.walk')}`
              : act.travelFromPrevious.mode === 'TRANSIT'
              ? `🚋 ${t('trip.transit')}`
              : `🚕 ${t('trip.drive')}`}{' '}
            · {act.travelFromPrevious.minutes} min ({act.travelFromPrevious.distanceKm} km)
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t('hero.sourceLabel')}{' '}
            {act.travelFromPrevious.source === 'maps_api'
              ? t('trip.mapsApiSource')
              : t('trip.estimatedSource')}
          </span>
        </div>
      )}

      {/* Activity Card with generous breathing room */}
      <article
        onClick={() => onSelect(act.id)}
        className={`rounded-2xl bg-white dark:bg-slate-900 border p-6 sm:p-7 space-y-4 shadow-xs transition-all print:border-slate-300 print:shadow-none print:break-inside-avoid ${
          isDragging
            ? 'border-amber-500 shadow-xl ring-2 ring-amber-500/30'
            : selectedActivityId === act.id
            ? 'border-amber-500 dark:border-amber-500 ring-1 ring-amber-500/20'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        {/* Top row: Drag Handle, Pin number, Time, Title & Reorder/Delete controls */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {/* Drag Handle */}
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              aria-label={t('dnd.dragHandleAria', { title: act.title })}
              title={t('dnd.dragHint')}
              className="print:hidden mt-0.5 p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing transition-colors shrink-0 touch-none focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <GripVertical className="w-4 h-4" aria-hidden="true" />
            </button>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                <span className="font-bold text-amber-700 dark:text-amber-400">
                  #{idx + 1} · {act.startTime} ({act.durationMin} min)
                </span>
                <span aria-hidden="true">·</span>
                <span>{act.location.name}</span>
                {downVotes > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
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
          </div>

          <div className="print:hidden flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMove(idx, -1);
              }}
              disabled={idx === 0}
              aria-label={`Move ${act.title} up`}
              className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMove(idx, 1);
              }}
              disabled={idx === totalCount - 1}
              aria-label={`Move ${act.title} down`}
              className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <span aria-hidden="true">↓</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(act.id);
              }}
              aria-label={`${t('dash.delete')} ${act.title}`}
              className="px-2 py-1 text-xs text-rose-600 rounded border border-slate-200 dark:border-slate-700 hover:bg-rose-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {act.description}
        </p>

        {/* "Why this activity?" (Feature B7) */}
        <p className="text-xs text-teal-800 dark:text-teal-300 font-medium">
          <span aria-hidden="true">✨ </span>
          {t('trip.whyThis')} {act.whyThis}
        </p>

        {/* Trust Layer Badges (Feature B1: Price & Opening Hours) */}
        <div
          data-tour={idx === 0 ? 'trust-badges-card' : undefined}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1"
        >
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
        <div className="print:hidden pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Budget / Mid / Premium switcher */}
          <div
            role="group"
            aria-label={`${act.title} ${t('hero.budget')}`}
            className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg"
          >
            {(['budget', 'mid', 'premium'] as BudgetTier[]).map((tier) => (
              <button
                key={tier}
                type="button"
                aria-pressed={act.selectedTier === tier}
                onClick={(e) => {
                  e.stopPropagation();
                  onTierSelect(act.id, tier);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  act.selectedTier === tier
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {getTierLabel(tier)}: €{act.costOptions[tier].estimatedCost}
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
                  onEscapeCrowds(act);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <span aria-hidden="true">🧭 </span>
                {t('trip.escapeCrowds')} ({act.touristTrapScore}/100)
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
                    onVote(act.id, v);
                  }}
                  aria-label={`Vote ${v} ${act.title}`}
                  aria-pressed={act.votes?.[activeTravelerId] === v}
                  className={`px-2 py-1 text-xs rounded border cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    act.votes?.[activeTravelerId] === v
                      ? 'bg-slate-900 text-white dark:bg-amber-600'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span aria-hidden="true">{v === 'up' ? '👍' : '👎'}</span>
                </button>
              ))}
            </div>

            {/* Quick Add Expense Link */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickExpense();
              }}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline whitespace-nowrap cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {t('trip.addExpenseQuick')}
            </button>
          </div>
        </div>
      </article>
    </li>
  );
};

export const TripWorkspacePage: React.FC = () => {
  const { id = 'demo-lisbon-4d' } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { language } = useI18n();
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
  const [chatHistory, setChatHistory] = useState<
    { id: string; sender: 'user' | 'genie'; text: string; grounded?: boolean }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [fetchingPlaceName, setFetchingPlaceName] = useState<string | null>(null);
  const [vibeRecalculating, setVibeRecalculating] = useState(false);

  // Export Dropdown State
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
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

  const reliability = useMemo(() => computeReliabilitySummary(bundle.days), [bundle.days]);
  const paceMetrics = useMemo(() => computePaceMetrics(currentDay), [currentDay]);

  // DnD Sensors (Pointer with 5px activation distance so card clicks work seamlessly + Keyboard)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activeActivities.findIndex((a) => a.id === active.id);
    const newIndex = activeActivities.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = reorderActivitiesList(activeActivities, oldIndex, newIndex);
    await updateDayActivities(bundle.trip.id, currentDay.id, reordered);
    showToast(t('toast.itineraryUpdated'));
  };

  const localizedPaceLabel =
    paceMetrics.label === 'Packed'
      ? t('trip.pacePacked')
      : paceMetrics.label === 'Relaxed'
      ? t('trip.paceRelaxed')
      : t('trip.paceBalanced');

  const getTierLabel = (tier: BudgetTier) => {
    if (tier === 'budget') return t('trip.tierBudget');
    if (tier === 'mid') return t('trip.tierMid');
    return t('trip.tierPremium');
  };

  const handleVibeSliderChange = async (nextPace: number) => {
    setVibeRecalculating(true);
    try {
      await updateDayActivities(bundle.trip.id, currentDay.id, activeActivities, nextPace);
      const [res] = await Promise.all([
        requestAiProposals({
          taskType: 'pace',
          destination: bundle.trip.destination,
          message: `Adjust day pace to level ${nextPace}/5`,
          currentDay: { ...currentDay, paceLevel: nextPace },
          travelers: bundle.travelers,
        }),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);
      addProposals(bundle.trip.id, res.proposals);
    } finally {
      setVibeRecalculating(false);
    }
  };

  const handleExportPdf = () => {
    setExportDropdownOpen(false);
    showToast(t('export.printToast'));
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handleExportIcsDay = () => {
    setExportDropdownOpen(false);
    const ics = generateIcsCalendar(bundle, currentDay);
    const slug = bundle.trip.destination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `atlasgenie-${slug}-day-${currentDay.dayNumber}.ics`;
    downloadIcsFile(ics, filename);
    showToast(t('export.icsToast', { filename }));
  };

  const handleExportIcsFull = () => {
    setExportDropdownOpen(false);
    const ics = generateIcsCalendar(bundle);
    const slug = bundle.trip.destination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `atlasgenie-${slug}-full-trip.ics`;
    downloadIcsFile(ics, filename);
    showToast(t('export.icsToast', { filename }));
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
      id: `prop-local-${Date.now()}`,
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
    showToast(
      language === 'pt'
        ? 'Alternativa local proposta na barra de revisão acima!'
        : 'Local alternative proposed in the Diff Bar above!'
    );
  };

  const handleMoveActivity = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activeActivities.length) return;
    const reordered = reorderActivitiesList(activeActivities, index, targetIdx);
    await updateDayActivities(bundle.trip.id, currentDay.id, reordered);
    showToast(t('toast.itineraryUpdated'));
  };

  const handleRemoveActivityDirect = async (activityId: string) => {
    const next = activeActivities.filter((a) => a.id !== activityId);
    await updateDayActivities(bundle.trip.id, currentDay.id, next);
    showToast(
      language === 'pt'
        ? 'Atividade removida e tempos de deslocação atualizados.'
        : 'Removed activity and updated travel times.'
    );
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
      description:
        language === 'pt'
          ? 'Paragem personalizada adicionada ao seu atlas pessoal.'
          : 'Custom stop added to your personal atlas.',
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
      whyThis: language === 'pt' ? 'Adicionada diretamente por si.' : 'Added directly by you.',
      touristTrapScore: 20,
      votes: {},
    };
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
        travelers: bundle.travelers,
        language,
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
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 pb-28 md:pb-16 print:py-2 print:px-0">
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
              {bundle.trip.travelersCount} {t('hero.travellers')} · {t('hero.budget')} €
              {bundle.trip.totalBudget}
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
      <div className="print:hidden flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-6 mb-8 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            <span>
              {bundle.trip.startDate} → {bundle.trip.endDate}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {bundle.trip.travelersCount} {t('hero.travellers')}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t('hero.budget')} €{bundle.trip.totalBudget}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              {t('trip.reliability')}: <span aria-hidden="true">🟢</span>{' '}
              <span className="sr-only">Verified Source </span>
              {reliability.verifiedPercent}% {t('trip.verified')} ({reliability.verifiedCount}/
              {reliability.totalChecks})
            </span>
          </div>
          <h1 className="font-serif-atlas text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            {bundle.trip.destination} {t('trip.atlasSuffix')}
          </h1>
        </div>

        {/* Sub-route Navigation Tabs + Guided Tour + Export Dropdown + Assistant */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {undoStack.length > 0 && (
            <button
              type="button"
              onClick={() => undoLastChange(bundle.trip.id)}
              className="px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-lg whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              ↶ {t('trip.undoLast')}
            </button>
          )}

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

      {/* Visual Diff Accept / Reject Bar (AI Architecture Rule #4) */}
      <div className="print:hidden">
        <DiffReviewBanner
          proposals={proposals}
          onAccept={(pId) => acceptProposal(bundle.trip.id, pId)}
          onReject={(pId) => rejectProposal(bundle.trip.id, pId)}
          onAcceptAll={() => acceptAllProposals(bundle.trip.id)}
          onRejectAll={() => rejectAllProposals(bundle.trip.id)}
        />
      </div>

      {/* Sub-Views: Budget / Group / Expenses */}
      {activeTab === 'budget' && <BudgetTabView bundle={bundle} />}
      {activeTab === 'group' && <GroupTabView bundle={bundle} />}
      {activeTab === 'expenses' && <ExpensesTabView bundle={bundle} />}

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
                    });
                    addProposals(bundle.trip.id, res.proposals);
                    showToast(
                      language === 'pt'
                        ? 'Proposta de alteração pronta acima — clique em Aceitar ou Rejeitar!'
                        : 'Visual Diff Proposal ready above — click Accept or Reject!'
                    );
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
                  onClick={() => togglePlanB(bundle.trip.id, currentDay.id)}
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
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xs"
          >
            <div className="space-y-3">
              <div>
                <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  {t('trip.dayWord')} {currentDay.dayNumber} · {currentDay.date}{' '}
                  {currentDay.activePlan === 'B' ? t('trip.planBIndoorTag') : ''}
                </p>
                <h2 className="font-serif-atlas text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                  {currentDay.theme || `${t('trip.dayWord')} ${currentDay.dayNumber}`}
                </h2>
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

            <div className="print:hidden flex flex-col sm:flex-row sm:items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
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
                aria-valuemin={1}
                aria-valuemax={5}
                aria-valuenow={currentDay.paceLevel}
                aria-valuetext={`${t('trip.step')} ${currentDay.paceLevel} (${localizedPaceLabel})`}
                onChange={(e) => handleVibeSliderChange(Number(e.target.value))}
                className="flex-1 accent-amber-600 cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              />
              <span className="text-xs font-mono-tabular font-semibold whitespace-nowrap">
                {t('trip.step')} {currentDay.paceLevel}/5
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
              <div>
                <label htmlFor="new-act-time" className="block text-xs font-medium mb-1">
                  {t('trip.actStartTime')}
                </label>
                <input
                  id="new-act-time"
                  type="time"
                  value={newActTime}
                  onChange={(e) => setNewActTime(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 font-mono-tabular focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="new-act-cost" className="block text-xs font-medium mb-1">
                  {t('trip.actEstCost')}
                </label>
                <input
                  id="new-act-cost"
                  type="number"
                  min={0}
                  value={newActCost}
                  onChange={(e) => setNewActCost(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 font-mono-tabular focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={activeActivities.map((a) => a.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul
                      aria-label={`${t('trip.dayWord')} ${currentDay.dayNumber} ${t('trip.tabPlan')}`}
                      className="space-y-6 list-none p-0 m-0"
                    >
                      {activeActivities.map((act, idx) => (
                        <SortableActivityCard
                          key={act.id}
                          act={act}
                          idx={idx}
                          totalCount={activeActivities.length}
                          selectedActivityId={selectedActivityId}
                          activeTravelerId={activeTravelerId}
                          onSelect={(actId) => setSelectedActivityId(actId)}
                          onMove={handleMoveActivity}
                          onRemove={handleRemoveActivityDirect}
                          onTierSelect={handleTierSelect}
                          onEscapeCrowds={handleEscapeCrowds}
                          onVote={(actId, v) =>
                            castVote(bundle.trip.id, currentDay.id, actId, activeTravelerId, v)
                          }
                          onQuickExpense={() => navigate(`/trips/${bundle.trip.id}/expenses`)}
                          getTierLabel={getTierLabel}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* Sticky Map Column with Elevated Breathing Room (Hidden in print mode) */}
            <div
              className={`print:hidden lg:col-span-5 lg:sticky lg:top-24 h-[460px] lg:h-[620px] p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs ${
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

      {/* Interactive 4-Step First-Time User Onboarding Guided Tour */}
      <GuidedTourOverlay isOpen={tourOpen} onClose={handleCloseTour} />

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
                prompt: 'What are the opening hours, rating, and reviews for Time Out Market in Lisbon?',
              },
              { label: t('chat.chipCheaper'), prompt: 'Make today cheaper with local budget spots' },
              { label: t('chat.chipLessWalking'), prompt: 'Less walking and shorter transit legs' },
              { label: t('chat.chipMoreLocal'), prompt: 'Replace touristy stops with authentic local taverns' },
              { label: t('chat.chipRainy'), prompt: 'Propose rainy day indoor alternatives' },
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
                {language === 'pt'
                  ? `Bem-vindo ao seu Atlas de ${bundle.trip.destination}! Faça perguntas sobre qualquer local (horários, avaliação, preços) ou toque num botão acima — cada sugestão aparece na barra de revisão para manter o controlo.`
                  : `Welcome to your ${bundle.trip.destination} Atlas! Ask about any place (rating, hours, reviews) or tap a quick action above—every itinerary change appears as an Accept/Reject diff so you stay in control.`}
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
    </main>
  );
};
