import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BudgetTier, FullTripBundle } from '../types/models';
import {
  BudgetOptimizationChange,
  computeCurrentItineraryTotal,
  computeExpenseBalancesAndSettlement,
  optimizeBudgetTiers,
} from '../utils/domainLogic';
import { useAtlas } from '../context/AtlasContext';

interface BudgetTabViewProps {
  bundle: FullTripBundle;
}

export const BudgetTabView: React.FC<BudgetTabViewProps> = ({ bundle }) => {
  const { t } = useTranslation();
  const { applySelectedBudgetProposals } = useAtlas();

  const scale = Math.max(1, bundle.trip.travelersCount);

  // Exact current itinerary total based on active activities and their selected tiers
  const currentItineraryTotal = useMemo(
    () => computeCurrentItineraryTotal(bundle.days, scale),
    [bundle.days, scale]
  );

  const [whatIfBudget, setWhatIfBudget] = useState<number>(currentItineraryTotal);
  const [proposals, setProposals] = useState<BudgetOptimizationChange[]>(() =>
    optimizeBudgetTiers(bundle.days, currentItineraryTotal, scale).changes.map((chg) => ({
      ...chg,
      selected: chg.selected ?? true,
    }))
  );

  // Sync baseline when the underlying itinerary changes externally
  useEffect(() => {
    setWhatIfBudget(currentItineraryTotal);
    setProposals([]);
  }, [currentItineraryTotal]);

  const handleSliderChange = (nextBudget: number) => {
    setWhatIfBudget(nextBudget);
    const nextOptimization = optimizeBudgetTiers(bundle.days, nextBudget, scale);
    setProposals(
      nextOptimization.changes.map((chg) => ({
        ...chg,
        selected: true,
      }))
    );
  };

  const handleToggleProposalSelected = (activityId: string) => {
    setProposals((prev) =>
      prev.map((item) =>
        item.activityId === activityId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const handleApplyTierChanges = async () => {
    const selectedProposals = proposals.filter((p) => p.selected === true);
    if (selectedProposals.length === 0) return;
    await applySelectedBudgetProposals(bundle.trip.id, proposals);
    setProposals([]);
  };

  const handleResetSlider = () => {
    setProposals([]);
    setWhatIfBudget(currentItineraryTotal);
  };

  const expenseSummary = useMemo(
    () => computeExpenseBalancesAndSettlement(bundle.expenses, bundle.travelers),
    [bundle.expenses, bundle.travelers]
  );

  // Map of selected proposal overrides (only where selected === true)
  const activeSelectedTierOverrides = useMemo(() => {
    return proposals
      .filter((p) => p.selected === true)
      .reduce<Record<string, BudgetTier>>(
        (acc, p) => ({
          ...acc,
          [p.activityId]: p.toTier,
        }),
        {}
      );
  }, [proposals]);

  // Category, daily, and total estimated breakdown under the active selected What-If proposals
  const breakdown = useMemo(() => {
    const byCat: Record<string, number> = {
      food: 0,
      culture: 0,
      nature: 0,
      nightlife: 0,
      shopping: 0,
      other: 0,
    };
    const byDay: { dayNumber: number; date: string; estimated: number }[] = [];
    let totalEstimatedCost = 0;

    for (const day of bundle.days) {
      const list = day.activePlan === 'B' && day.planB.length > 0 ? day.planB : day.activities;
      let dayTotal = 0;
      for (const act of list) {
        const tier: BudgetTier = activeSelectedTierOverrides[act.id] || act.selectedTier || 'mid';
        const cost = act.costOptions[tier].estimatedCost * scale;
        dayTotal += cost;
        totalEstimatedCost += cost;
        byCat[act.category] = (byCat[act.category] || 0) + cost;
      }
      byDay.push({ dayNumber: day.dayNumber, date: day.date, estimated: dayTotal });
    }

    return {
      byCat,
      byDay,
      totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
      withinBudget: totalEstimatedCost <= whatIfBudget,
    };
  }, [bundle.days, scale, activeSelectedTierOverrides, whatIfBudget]);

  const usagePercent = Math.min(
    100,
    Math.round((breakdown.totalEstimatedCost / Math.max(1, whatIfBudget)) * 100)
  );
  const isNearOrOver = breakdown.totalEstimatedCost > whatIfBudget * 0.9;
  const selectedProposalsCount = useMemo(
    () => proposals.filter((p) => p.selected === true).length,
    [proposals]
  );

  return (
    <div className="space-y-8">
      {/* Living Budget Header & What-If Slider */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-serif-atlas text-xl md:text-2xl font-bold text-slate-900 dark:text-white break-words">
              {t('budget.title')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
              {t('budget.whatIfLabel')} · {t('budget.unverifiedNote')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono-tabular">
            <div>
              <span className="block text-[11px] text-slate-500 uppercase">
                {t('budget.targetBudget')}
              </span>
              <span
                data-testid="what-if-target-budget"
                className="text-lg md:text-xl font-bold text-slate-900 dark:text-white"
              >
                €{whatIfBudget}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 uppercase">
                {t('budget.estimatedTotal')}
              </span>
              <span
                data-testid="what-if-estimated-total"
                className="text-lg md:text-xl font-bold text-amber-700 dark:text-amber-400"
              >
                ~€{breakdown.totalEstimatedCost}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 uppercase">
                {t('budget.actualSpent')}
              </span>
              <span className="text-lg md:text-xl font-bold text-teal-700 dark:text-teal-400">
                €{expenseSummary.totalSpent.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive What-If Slider */}
        <div className="space-y-2 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
            <label htmlFor="what-if-slider">
              {t('budget.sliderLabel', { count: bundle.trip.travelersCount })}
            </label>
            <span className="font-mono-tabular font-semibold">
              €{Math.round(whatIfBudget / Math.max(1, bundle.trip.travelersCount))}{' '}
              {t('budget.perPerson')}
            </span>
          </div>
          <input
            id="what-if-slider"
            data-testid="what-if-slider"
            type="range"
            min={150}
            max={3000}
            step={25}
            value={whatIfBudget}
            aria-valuemin={150}
            aria-valuemax={3000}
            aria-valuenow={whatIfBudget}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            className="w-full accent-amber-600 cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          />

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              style={{ width: `${usagePercent}%` }}
              className={`h-full transition-all ${
                !breakdown.withinBudget
                  ? 'bg-rose-600'
                  : isNearOrOver
                  ? 'bg-amber-500'
                  : 'bg-teal-600'
              }`}
            />
          </div>

          {(!breakdown.withinBudget || isNearOrOver) && (
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
              ⚠️ {t('budget.overBudgetWarn')}
            </p>
          )}
        </div>

        {/* Live What-If Diff Summary */}
        <div
          data-testid="budget-upgrade-proposals-panel"
          className="rounded-xl bg-[#FAF6F0] dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-3 overflow-hidden"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <h3 className="text-xs font-mono-tabular font-semibold uppercase text-slate-700 dark:text-slate-300 break-words">
              {t('budget.rebalanceSummary', { count: proposals.length })}{' '}
              {proposals.length > 0 && (
                <span className="text-slate-500 dark:text-slate-400">
                  ({selectedProposalsCount}/{proposals.length})
                </span>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="apply-tier-changes-btn"
                disabled={selectedProposalsCount === 0}
                onClick={handleApplyTierChanges}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {t('budget.applyChanges')}
              </button>
              <button
                type="button"
                data-testid="reset-slider-btn"
                onClick={handleResetSlider}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {t('budget.discardChanges')}
              </button>
            </div>
          </div>

          {proposals.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('budget.optimalNote', { budget: whatIfBudget })}
            </p>
          ) : (
            <ul
              data-testid="budget-upgrade-proposals-list"
              className="space-y-2 md:space-y-1.5 text-xs"
            >
              {proposals.map((chg) => (
                <li
                  key={chg.activityId}
                  data-testid={`budget-upgrade-item-${chg.activityId}`}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 md:px-2 md:py-1.5 rounded-lg md:rounded-none bg-white/85 md:bg-transparent dark:bg-slate-900/80 md:dark:bg-transparent border border-slate-200/70 md:border-0 md:border-b border-slate-200/60 dark:border-slate-800 last:border-b-0 transition-opacity ${
                    chg.selected ? 'opacity-100' : 'opacity-60'
                  }`}
                >
                  <label className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid={`proposal-checkbox-${chg.activityId}`}
                      checked={chg.selected === true}
                      onChange={() => handleToggleProposalSelected(chg.activityId)}
                      className="mt-0.5 sm:mt-0 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-amber-600 focus:ring-amber-500 cursor-pointer shrink-0"
                    />
                    <span className="min-w-0 flex-1 break-words leading-relaxed">
                      <strong
                        className={
                          chg.costDelta >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }
                      >
                        {chg.costDelta >= 0 ? t('budget.upgraded') : t('budget.economised')}{' '}
                        {t('trip.dayWord')} {chg.dayNumber}:
                      </strong>{' '}
                      {chg.activityTitle} → <em>{chg.newOptionTitle}</em> ({chg.fromTier} →{' '}
                      {chg.toTier})
                    </span>
                  </label>
                  <span className="font-mono-tabular font-semibold whitespace-nowrap shrink-0 self-end sm:self-auto">
                    {chg.costDelta >= 0 ? `+€${chg.costDelta}` : `-€${Math.abs(chg.costDelta)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Per-Category & Per-Day Breakdown + Per-Person Group Budget Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
          <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
            {t('budget.estVsActualTitle')}
          </h3>
          <div className="space-y-2.5 text-xs">
            {Object.entries(breakdown.byCat)
              .filter(([, est]) => est > 0)
              .map(([cat, est]) => {
                const actual = expenseSummary.byCategory[cat] || 0;
                return (
                  <div
                    key={cat}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800"
                  >
                    <span className="font-medium">
                      {t(`interest.${cat}`, { defaultValue: cat })}
                    </span>
                    <span className="font-mono-tabular">
                      {t('budget.estShort')} ~€{est} · {t('budget.actualShort')} €{actual.toFixed(2)}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
          <h3 className="font-serif-atlas text-base md:text-lg font-semibold text-slate-900 dark:text-white">
            {t('budget.dailyTargetsTitle')}
          </h3>
          <div className="space-y-2 text-xs">
            {breakdown.byDay.map((d) => (
              <div
                key={d.dayNumber}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800"
              >
                <span>
                  {t('trip.dayWord')} {d.dayNumber} ({d.date})
                </span>
                <span className="font-mono-tabular font-semibold">
                  ~€{d.estimated} {t('budget.groupTotal')}
                </span>
              </div>
            ))}
          </div>

          {bundle.travelers.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {t('budget.perPersonStatus')}
              </p>
              {bundle.travelers.map((tr) => {
                const estPerPerson = Math.round(
                  breakdown.totalEstimatedCost / Math.max(1, bundle.trip.travelersCount)
                );
                const overPersonal = estPerPerson > tr.budgetPerPerson;
                return (
                  <div
                    key={tr.id}
                    className="flex flex-wrap items-center justify-between gap-2 font-mono-tabular"
                  >
                    <span>
                      {tr.displayName} ({t('budget.limit')} €{tr.budgetPerPerson})
                    </span>
                    <span
                      className={
                        overPersonal
                          ? 'text-rose-600 font-semibold'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }
                    >
                      ~€{estPerPerson}{' '}
                      {overPersonal ? t('budget.aboveCap') : t('budget.withinCap')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
