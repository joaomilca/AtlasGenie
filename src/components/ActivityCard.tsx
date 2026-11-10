import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Info, MapPin, Pencil, X } from 'lucide-react';
import { Activity, BudgetTier, VoteValue } from '../types/models';
import { getActiveActivityLocation } from '../utils/worldDestinations';
import { TrustBadge } from './TrustBadge';

export interface ActivityCardProps {
  act: Activity;
  idx: number;
  totalCount: number;
  isSelected?: boolean;
  selectedActivityId?: string | null;
  activeTravelerId: string;
  onSelect: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onTierSelect: (id: string, tier: BudgetTier) => void;
  onEscapeCrowds: (act: Activity) => void;
  onVote: (actId: string, vote: VoteValue) => void;
  onQuickExpense: () => void;
  getTierLabel: (tier: BudgetTier) => string;
  onOpenDetails?: (act: Activity) => void;
  onRenameActivity?: (id: string, newTitle: string) => void;
}

const ActivityCardInner: React.FC<ActivityCardProps> = ({
  act,
  idx,
  totalCount,
  isSelected,
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
  onOpenDetails,
  onRenameActivity,
}) => {
  const { t } = useTranslation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(act.title);
  const [localSelectedTier, setLocalSelectedTier] = useState<BudgetTier>(
    act.selectedTier || 'mid'
  );

  useEffect(() => {
    setDraftTitle(act.title);
  }, [act.title]);

  useEffect(() => {
    setLocalSelectedTier(act.selectedTier || 'mid');
  }, [act.selectedTier]);

  const commitTitleEdit = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== act.title && onRenameActivity) {
      onRenameActivity(act.id, trimmed);
    } else {
      setDraftTitle(act.title);
    }
    setIsEditingTitle(false);
  };

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

  const selected = isSelected ?? selectedActivityId === act.id;
  const selectedCost = act.costOptions[localSelectedTier] || act.costOptions.mid;
  const activeLoc = getActiveActivityLocation({ ...act, selectedTier: localSelectedTier });
  const isPriceVerified =
    selectedCost.isPriceVerified !== undefined
      ? Boolean(selectedCost.isPriceVerified)
      : act.isPriceVerified !== undefined
      ? Boolean(act.isPriceVerified)
      : act.priceConfidence.status === 'verified';
  const pricePrefix = isPriceVerified ? '' : '~';
  const resolvedPriceConfidence = {
    ...act.priceConfidence,
    status: isPriceVerified ? ('verified' as const) : ('estimated' as const),
  };
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
        data-testid={`activity-card-${act.id}`}
        data-active-tier={localSelectedTier}
        data-tier-coords={`${activeLoc.lat},${activeLoc.lng}`}
        className={`rounded-2xl bg-white dark:bg-slate-900 border p-4 sm:p-6 md:p-7 space-y-4 shadow-xs transition-all min-w-0 max-w-full overflow-hidden print:border-slate-300 print:shadow-none print:break-inside-avoid ${
          isDragging
            ? 'border-amber-500 shadow-xl ring-2 ring-amber-500/30'
            : selected
            ? 'border-amber-500 dark:border-amber-500 ring-1 ring-amber-500/20'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        {/* Top row: Drag Handle, Pin number, Time, Title & Reorder/Delete controls */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
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

            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                <span className="font-bold text-amber-700 dark:text-amber-400">
                  #{idx + 1} · {act.startTime} ({act.durationMin} min)
                </span>
                <span aria-hidden="true">·</span>
                <span
                  data-testid={`activity-location-${act.id}`}
                  data-tier-coords={`${activeLoc.lat},${activeLoc.lng}`}
                  className="inline-flex flex-wrap items-center gap-1 text-slate-700 dark:text-slate-300 font-medium break-words"
                >
                  <MapPin className="w-3 h-3 text-[#D97706] shrink-0" aria-hidden="true" />
                  <span>{activeLoc.name}</span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    ({activeLoc.lat.toFixed(4)}°, {activeLoc.lng.toFixed(4)}°)
                  </span>
                </span>
                {downVotes > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-rose-700 dark:text-rose-400 font-semibold">
                      ⚠️ {t('trip.needsDiscussion')}
                    </span>
                  </>
                )}
              </div>

              {isEditingTitle ? (
                <div
                  className="flex items-center gap-1.5 pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    data-testid={`input-activity-title-${act.id}`}
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitTitleEdit();
                      } else if (e.key === 'Escape') {
                        setDraftTitle(act.title);
                        setIsEditingTitle(false);
                      }
                    }}
                    autoFocus
                    aria-label={t('logistics.editTitleAria')}
                    className="w-full max-w-md px-2.5 py-1 text-base font-serif-atlas font-bold text-slate-900 dark:text-white bg-[#FAF6F0] dark:bg-slate-800 border border-amber-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    data-testid={`save-activity-title-${act.id}`}
                    onClick={commitTitleEdit}
                    aria-label={t('logistics.saveTitleAria')}
                    className="p-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftTitle(act.title);
                      setIsEditingTitle(false);
                    }}
                    aria-label={t('logistics.cancelTitleAria')}
                    className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group/title">
                  <h3
                    data-testid={`activity-title-${act.id}`}
                    className="font-serif-atlas text-base md:text-lg font-bold text-slate-900 dark:text-white break-words"
                  >
                    {act.title}
                  </h3>
                  {onRenameActivity && (
                    <button
                      type="button"
                      data-testid={`edit-activity-title-${act.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDraftTitle(act.title);
                        setIsEditingTitle(true);
                      }}
                      aria-label={`${t('logistics.editTitleAria')}: ${act.title}`}
                      title={t('logistics.editTitleAria')}
                      className="print:hidden inline-flex items-center justify-center p-1 rounded-md text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
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

        <div className="space-y-1">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {act.description}
          </p>
          {selectedCost.description && selectedCost.description !== act.description && (
            <p
              data-testid={`activity-tier-desc-${act.id}`}
              className="text-xs text-slate-500 dark:text-slate-400 italic"
            >
              {selectedCost.title}: {selectedCost.description}
            </p>
          )}
        </div>

        {/* "Why this activity?" (Feature B7) */}
        <p className="text-xs text-teal-800 dark:text-teal-300 font-medium">
          <span aria-hidden="true">✨ </span>
          {t('trip.whyThis')} {act.whyThis}
        </p>

        {/* Trust Layer Badges (Feature B1: Price & Opening Hours) */}
        <div
          data-tour={idx === 0 ? 'trust-badges-card' : undefined}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 min-w-0 max-w-full"
        >
          <TrustBadge
            type="price"
            testId={`activity-price-badge-${act.id}`}
            confidence={resolvedPriceConfidence}
            valueText={`${pricePrefix}${selectedCost.estimatedCost}€ (${selectedCost.title})`}
          />
          <TrustBadge
            type="hours"
            confidence={act.hoursConfidence}
            valueText={act.openingHoursText || '09:30 – 18:00'}
          />
        </div>

        {/* Cost Tier Selector + Anti-Tourist-Trap + Voting & Expense Quick Action */}
        <div className="print:hidden pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 md:gap-3">
          {/* Budget / Mid / Premium switcher */}
          <div
            role="group"
            aria-label={`${act.title} ${t('hero.budget')}`}
            className="flex flex-wrap items-center gap-2 md:gap-1 bg-slate-100 dark:bg-slate-800 p-1.5 md:p-1 rounded-lg max-w-full"
          >
            {(['budget', 'mid', 'premium'] as BudgetTier[]).map((tier) => (
              <button
                key={tier}
                type="button"
                data-testid={`tier-btn-${act.id}-${tier}`}
                aria-pressed={localSelectedTier === tier}
                onClick={(e) => {
                  e.stopPropagation();
                  setLocalSelectedTier(tier);
                  onTierSelect(act.id, tier);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  localSelectedTier === tier
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {getTierLabel(tier)}: €{act.costOptions[tier].estimatedCost}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Read More / Extended Details Button (Sprint 3) */}
            {onOpenDetails && (
              <button
                type="button"
                data-testid={`read-more-act-${act.id}`}
                aria-label={t('trip.readMoreAria', { title: act.title })}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetails(act);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-[#FAF6F0] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <Info className="w-3.5 h-3.5 text-[#D97706]" aria-hidden="true" />
                <span>{t('trip.readMoreBtn')}</span>
              </button>
            )}

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

function areActivityCardPropsEqual(prev: ActivityCardProps, next: ActivityCardProps): boolean {
  const prevSelected = prev.isSelected ?? prev.selectedActivityId === prev.act.id;
  const nextSelected = next.isSelected ?? next.selectedActivityId === next.act.id;

  return (
    prev.act === next.act &&
    prev.idx === next.idx &&
    prev.totalCount === next.totalCount &&
    prevSelected === nextSelected &&
    prev.activeTravelerId === next.activeTravelerId &&
    prev.onSelect === next.onSelect &&
    prev.onMove === next.onMove &&
    prev.onRemove === next.onRemove &&
    prev.onTierSelect === next.onTierSelect &&
    prev.onEscapeCrowds === next.onEscapeCrowds &&
    prev.onVote === next.onVote &&
    prev.onQuickExpense === next.onQuickExpense &&
    prev.getTierLabel === next.getTierLabel &&
    prev.onOpenDetails === next.onOpenDetails &&
    prev.onRenameActivity === next.onRenameActivity
  );
}

export const ActivityCard = React.memo(ActivityCardInner, areActivityCardPropsEqual);
export const SortableActivityCard = ActivityCard;
export default ActivityCard;
