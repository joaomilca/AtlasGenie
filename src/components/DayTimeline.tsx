import React, { useEffect, useMemo, useState } from 'react';
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
} from '@dnd-kit/sortable';
import {
  BedDouble,
  Bus,
  Check,
  Coffee,
  MapPin,
  Pencil,
  Sparkles,
  TrainFront,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import {
  Activity,
  BudgetTier,
  DayAccommodation,
  DayMeals,
  IntercityTransit,
  VoteValue,
} from '../types/models';
import {
  computeDaySubtotal,
  resolveActiveDayAccommodation,
} from '../utils/domainLogic';
import { useI18n } from '../i18n/I18nContext';
import { ActivityCard } from './ActivityCard';

export interface DayTimelineProps {
  dayNumber: number;
  city?: string;
  theme?: string;
  accommodation?: DayAccommodation;
  intercityTransit?: IntercityTransit;
  meals?: DayMeals;
  activities: Activity[];
  travelers?: number;
  selectedActivityId: string | null;
  activeTravelerId: string;
  askingAccommodationAlt?: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  onSelectActivity: (activityId: string) => void;
  onMoveActivity: (index: number, direction: -1 | 1) => void;
  onRemoveActivity: (activityId: string) => void;
  onTierSelect: (activityId: string, tier: BudgetTier) => void;
  onEscapeCrowds: (activity: Activity) => void;
  onVote: (activityId: string, vote: VoteValue) => void;
  onQuickExpense: () => void;
  getTierLabel: (tier: BudgetTier) => string;
  onOpenActivityDetails?: (activity: Activity) => void;
  onRenameActivity?: (activityId: string, newTitle: string) => void;
  onRenameAccommodation?: (newName: string) => void;
  onAccommodationTierSelect?: (tier: BudgetTier) => void;
  onAskAccommodationAlternative?: (tier: BudgetTier) => void;
}

const DayTimelineInner: React.FC<DayTimelineProps> = ({
  dayNumber,
  city,
  theme,
  accommodation,
  intercityTransit,
  meals,
  activities,
  travelers = 1,
  selectedActivityId,
  activeTravelerId,
  askingAccommodationAlt = false,
  onDragEnd,
  onSelectActivity,
  onMoveActivity,
  onRemoveActivity,
  onTierSelect,
  onEscapeCrowds,
  onVote,
  onQuickExpense,
  getTierLabel,
  onOpenActivityDetails,
  onRenameActivity,
  onRenameAccommodation,
  onAccommodationTierSelect,
  onAskAccommodationAlternative,
}) => {
  const { t } = useTranslation();
  const { language } = useI18n();
  const safeTravelers = Math.max(1, Math.round(Number(travelers) || 1));

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

  const itemIds = useMemo(() => activities.map((a) => a.id), [activities]);

  // Day/global tier for Accommodation & Meals (strictly decoupled from individual activity tiers)
  const dominantTier: BudgetTier = accommodation?.selectedTier || 'mid';

  const activeAccommodation = useMemo(
    () => resolveActiveDayAccommodation(accommodation, dominantTier),
    [accommodation, dominantTier]
  );

  // Real-time calculated Daily Total summing:
  // 1. Current global/day tier price for Accommodation
  // 2. Intercity transit (if any)
  // 3. Per-person Meals & Activities multiplied by safeTravelers
  const dailySubtotal = useMemo(
    () =>
      computeDaySubtotal(
        {
          accommodation,
          intercity_transit: intercityTransit,
          meals,
          activities,
        },
        safeTravelers
      ),
    [accommodation, intercityTransit, meals, activities, safeTravelers]
  );
  const perPersonDailyTotal = Math.round(dailySubtotal.total / safeTravelers);
  const perPersonSuffix = language === 'en' ? '/person' : '/pessoa';

  const [isEditingAccTitle, setIsEditingAccTitle] = useState(false);
  const [draftAccTitle, setDraftAccTitle] = useState(activeAccommodation?.name || '');

  useEffect(() => {
    if (activeAccommodation?.name) {
      setDraftAccTitle(activeAccommodation.name);
    }
  }, [activeAccommodation?.name]);

  const commitAccommodationTitleEdit = () => {
    const trimmed = draftAccTitle.trim();
    if (
      trimmed &&
      activeAccommodation &&
      trimmed !== activeAccommodation.name &&
      onRenameAccommodation
    ) {
      onRenameAccommodation(trimmed);
    } else if (activeAccommodation) {
      setDraftAccTitle(activeAccommodation.name);
    }
    setIsEditingAccTitle(false);
  };

  const isBusTransit =
    intercityTransit?.method &&
    /bus|expressos|flixbus|coach|autocarro/i.test(intercityTransit.method);

  return (
    <div className="space-y-6">
      {/* 0. Dynamic Daily Subtotal Header Bar (Sprint 5 Financial UX) */}
      <div
        data-testid={`day-${dayNumber}-daily-total-bar`}
        className="rounded-2xl bg-[#FAF6F0] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs transition-all duration-300"
      >
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-white">
              {t('trip.dayWord')} {dayNumber}
              {city ? ` · ${city}` : ''}
            </span>
            {theme && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-xs sm:max-w-md">{theme}</span>
              </>
            )}
          </div>
          <p className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
            {t('logistics.dailyTotalBreakdown', {
              stay: dailySubtotal.accommodationCost,
              transit:
                dailySubtotal.transitCost > 0
                  ? ` · ${t('trip.transit')} ~€${dailySubtotal.transitCost}`
                  : '',
              meals: dailySubtotal.mealsCost,
              activities: dailySubtotal.activitiesCost,
            })}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            data-testid={`day-${dayNumber}-daily-total`}
            data-daily-total={dailySubtotal.total}
            data-daily-per-person={perPersonDailyTotal}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-mono-tabular text-xs sm:text-sm font-bold border transition-all duration-300 ${
              dominantTier === 'premium'
                ? 'bg-amber-100/90 dark:bg-amber-950/70 text-amber-950 dark:text-amber-200 border-amber-400 dark:border-amber-700 shadow-xs'
                : 'bg-[#0F172A] text-white dark:bg-slate-800 dark:text-amber-300 border-slate-800 dark:border-slate-700'
            }`}
          >
            <Wallet className="w-3.5 h-3.5 text-[#D97706] shrink-0" aria-hidden="true" />
            <span>
              {t('logistics.dailyTotal', { amount: dailySubtotal.total })} (~€{perPersonDailyTotal}
              {perPersonSuffix})
            </span>
          </span>
        </div>
      </div>

      {/* 1. Intercity Transit Banner (shown ONLY on days where the user changes cities) */}
      {intercityTransit && (
        <div
          data-testid={`day-${dayNumber}-intercity-transit`}
          className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-[#D97706] dark:text-amber-400 shrink-0 mt-0.5">
              {isBusTransit ? (
                <Bus className="w-5 h-5" aria-hidden="true" />
              ) : (
                <TrainFront className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <p className="text-[11px] font-mono-tabular uppercase tracking-wider font-semibold text-amber-800 dark:text-amber-300">
                {t('logistics.intercityTransitKicker')}
                {intercityTransit.fromCity && intercityTransit.toCity
                  ? ` · ${intercityTransit.fromCity} → ${intercityTransit.toCity}`
                  : ''}
              </p>
              <h3 className="font-serif-atlas text-base font-bold text-slate-900 dark:text-white mt-0.5">
                {intercityTransit.method}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular shrink-0 pl-11 sm:pl-0">
            <span className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-200 font-semibold">
              ⏱ {intercityTransit.duration}
            </span>
            <span
              data-testid={`day-${dayNumber}-transit-price`}
              className="px-2.5 py-1 rounded-md bg-[#0F172A] text-white dark:bg-amber-600 font-semibold"
            >
              {intercityTransit.isPriceVerified ? '' : '~'}€{intercityTransit.price}
            </span>
            {intercityTransit.isPriceVerified ? (
              <span
                data-testid={`day-${dayNumber}-transit-verified-badge`}
                data-price-verified="true"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
              >
                <span aria-hidden="true">✅</span>
                <span>{t('trip.verified')}</span>
              </span>
            ) : (
              <span
                data-testid={`day-${dayNumber}-transit-verified-badge`}
                data-price-verified="false"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-amber-50/90 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
              >
                <span>{t('trip.estimated')}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 2. Daily Curated Meals Row (Breakfast, Lunch, Dinner with distinct restaurant names & coordinates) */}
      {meals && (
        <section
          data-testid={`day-${dayNumber}-meals`}
          aria-label={t('logistics.mealsKicker')}
          className="rounded-2xl bg-[#FAF6F0] dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-mono-tabular uppercase tracking-wider text-slate-600 dark:text-slate-400 font-semibold">
              <Utensils className="w-3.5 h-3.5 text-[#D97706]" aria-hidden="true" />
              <span>{t('logistics.mealsKicker')}</span>
            </div>
            {city && (
              <span className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                {city}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['breakfast', 'lunch', 'dinner'] as const).map((slotKey) => {
              const rawMeal = meals[slotKey];
              if (!rawMeal) return null;
              const tierMeal = rawMeal.tierVenues?.[dominantTier];
              const mealName = tierMeal?.name || rawMeal.name;
              const mealPrice = tierMeal?.estimatedPrice ?? rawMeal.estimatedPrice;
              const mealCoords = tierMeal?.coordinates || rawMeal.coordinates;
              const isMealPriceVerified =
                tierMeal?.isPriceVerified !== undefined
                  ? Boolean(tierMeal.isPriceVerified)
                  : Boolean(rawMeal.isPriceVerified);
              const mealPricePrefix = isMealPriceVerified ? '' : '~';

              return (
                <div
                  key={slotKey}
                  data-testid={`day-${dayNumber}-meal-${slotKey}`}
                  data-price-verified={isMealPriceVerified ? 'true' : 'false'}
                  className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-3 flex flex-col justify-between gap-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono-tabular uppercase tracking-wide font-semibold text-amber-800 dark:text-amber-400">
                      {slotKey === 'breakfast' ? (
                        <Coffee className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <Utensils className="w-3 h-3" aria-hidden="true" />
                      )}
                      {t(`logistics.${slotKey}`)}
                    </span>
                    <div className="inline-flex items-center gap-1.5">
                      <span
                        data-testid={`day-${dayNumber}-meal-${slotKey}-price`}
                        className="text-xs font-mono-tabular font-bold text-slate-900 dark:text-white transition-all duration-300"
                      >
                        {mealPricePrefix}€{mealPrice}
                      </span>
                      {isMealPriceVerified ? (
                        <span
                          data-testid={`day-${dayNumber}-meal-${slotKey}-badge`}
                          data-price-verified="true"
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                        >
                          <span aria-hidden="true">✅</span>
                          <span>{t('trip.verified')}</span>
                        </span>
                      ) : (
                        <span
                          data-testid={`day-${dayNumber}-meal-${slotKey}-badge`}
                          data-price-verified="false"
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-medium bg-amber-50/90 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                        >
                          <span>{t('trip.estimated')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                    {mealName}
                  </p>
                  {mealCoords && (
                    <p className="text-[10px] font-mono-tabular text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5 text-teal-600 shrink-0" aria-hidden="true" />
                      <span>
                        {mealCoords.lat.toFixed(4)}°, {mealCoords.lng.toFixed(4)}°
                      </span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Sortable Activities Timeline */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <ul
            aria-label={`${t('trip.dayWord')} ${dayNumber} ${t('trip.tabPlan')}`}
            className="space-y-6 list-none p-0 m-0"
          >
            {activities.map((act, idx) => (
              <ActivityCard
                key={act.id}
                act={act}
                idx={idx}
                totalCount={activities.length}
                isSelected={selectedActivityId === act.id}
                selectedActivityId={selectedActivityId}
                activeTravelerId={activeTravelerId}
                onSelect={onSelectActivity}
                onMove={onMoveActivity}
                onRemove={onRemoveActivity}
                onTierSelect={onTierSelect}
                onEscapeCrowds={onEscapeCrowds}
                onVote={onVote}
                onQuickExpense={onQuickExpense}
                getTierLabel={getTierLabel}
                onOpenDetails={onOpenActivityDetails}
                onRenameActivity={onRenameActivity}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {/* 4. Upgraded Swappable & Inline-Editable Accommodation Card at End of Day (Sprint 5) */}
      {activeAccommodation && (
        <article
          data-testid={`day-${dayNumber}-accommodation`}
          data-active-tier={activeAccommodation.selectedTier || dominantTier}
          data-accommodation-price={activeAccommodation.price}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-900/70 p-4 sm:p-5 md:p-6 space-y-4 shadow-xs transition-all"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5">
                <BedDouble className="w-5 h-5" aria-hidden="true" />
              </div>

              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono-tabular uppercase tracking-wider font-semibold text-teal-800 dark:text-teal-300">
                    {t('logistics.accommodationKicker')}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono-tabular uppercase bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                    {activeAccommodation.type}
                  </span>
                  {activeAccommodation.coordinates && (
                    <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-teal-600 shrink-0" aria-hidden="true" />
                      <span>
                        {activeAccommodation.coordinates.lat.toFixed(4)}°,{' '}
                        {activeAccommodation.coordinates.lng.toFixed(4)}°
                      </span>
                    </span>
                  )}
                </div>

                {isEditingAccTitle ? (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <input
                      type="text"
                      data-testid={`input-accommodation-title-day-${dayNumber}`}
                      value={draftAccTitle}
                      onChange={(e) => setDraftAccTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitAccommodationTitleEdit();
                        } else if (e.key === 'Escape') {
                          setDraftAccTitle(activeAccommodation.name);
                          setIsEditingAccTitle(false);
                        }
                      }}
                      autoFocus
                      aria-label={t('logistics.editTitleAria')}
                      className="w-full max-w-md px-2.5 py-1 text-base font-serif-atlas font-bold text-slate-900 dark:text-white bg-[#FAF6F0] dark:bg-slate-800 border border-teal-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      data-testid={`save-accommodation-title-day-${dayNumber}`}
                      onClick={commitAccommodationTitleEdit}
                      aria-label={t('logistics.saveTitleAria')}
                      className="p-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftAccTitle(activeAccommodation.name);
                        setIsEditingAccTitle(false);
                      }}
                      aria-label={t('logistics.cancelTitleAria')}
                      className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3
                      data-testid={`accommodation-title-day-${dayNumber}`}
                      className="font-serif-atlas text-base md:text-lg font-bold text-slate-900 dark:text-white break-words"
                    >
                      {activeAccommodation.name}
                    </h3>
                    {onRenameAccommodation && (
                      <button
                        type="button"
                        data-testid={`edit-accommodation-title-day-${dayNumber}`}
                        onClick={() => {
                          setDraftAccTitle(activeAccommodation.name);
                          setIsEditingAccTitle(true);
                        }}
                        aria-label={`${t('logistics.editTitleAria')}: ${activeAccommodation.name}`}
                        title={t('logistics.editTitleAria')}
                        className="print:hidden inline-flex items-center justify-center p-1 rounded-md text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}

                {accommodation?.whyThis && (
                  <p className="text-xs text-teal-800 dark:text-teal-300 font-medium pt-0.5">
                    <span aria-hidden="true">✨ </span>
                    {accommodation.whyThis}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular shrink-0 pl-11 sm:pl-0">
              <span
                data-testid={`day-${dayNumber}-accommodation-price`}
                data-price-verified={activeAccommodation.isPriceVerified ? 'true' : 'false'}
                className="px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200 font-bold transition-all duration-300"
              >
                {activeAccommodation.isPriceVerified ? '' : '~'}€{activeAccommodation.price}{' '}
                {t('logistics.perNight')}
              </span>
              {activeAccommodation.isPriceVerified ? (
                <span
                  data-testid={`day-${dayNumber}-accommodation-verified-badge`}
                  data-price-verified="true"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                >
                  <span aria-hidden="true">✅</span>
                  <span>{t('trip.verified')}</span>
                </span>
              ) : (
                <span
                  data-testid={`day-${dayNumber}-accommodation-verified-badge`}
                  data-price-verified="false"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50/90 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                >
                  <span>{t('trip.estimated')}</span>
                </span>
              )}
            </div>
          </div>

          {/* Accommodation Controls: Tier Selector & "Ask for Alternative" (Scoped Gemini Diff Proposal) */}
          <div className="print:hidden pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 md:gap-3">
            {accommodation?.tierOptions ? (
              <div
                role="group"
                aria-label={`${activeAccommodation.name} ${t('hero.budget')}`}
                className="flex flex-wrap items-center gap-2 md:gap-1 bg-slate-100 dark:bg-slate-800 p-1.5 md:p-1 rounded-lg max-w-full"
              >
                {(['budget', 'mid', 'premium'] as BudgetTier[]).map((tier) => {
                  const tierOption = accommodation.tierOptions?.[tier];
                  if (!tierOption) return null;
                  const isTierSelected =
                    (activeAccommodation.selectedTier || dominantTier) === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      data-testid={`accommodation-tier-btn-day-${dayNumber}-${tier}`}
                      aria-pressed={isTierSelected}
                      onClick={() => onAccommodationTierSelect?.(tier)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                        isTierSelected
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {getTierLabel(tier)}: €{tierOption.price}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div />
            )}

            {onAskAccommodationAlternative && (
              <button
                type="button"
                data-testid={`ask-accommodation-alt-day-${dayNumber}`}
                disabled={askingAccommodationAlt}
                onClick={() =>
                  onAskAccommodationAlternative(
                    activeAccommodation.selectedTier || dominantTier
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-teal-950 dark:text-teal-100 bg-teal-100/90 dark:bg-teal-950/70 border border-teal-300 dark:border-teal-700 hover:bg-teal-200/80 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
                <span>
                  {askingAccommodationAlt
                    ? t('logistics.askingAlternative')
                    : t('logistics.askAlternative')}
                </span>
              </button>
            )}
          </div>
        </article>
      )}
    </div>
  );
};

export const DayTimeline = React.memo(DayTimelineInner);
export default DayTimeline;


