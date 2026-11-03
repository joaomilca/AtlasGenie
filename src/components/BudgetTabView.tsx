import React, { useState, useMemo } from 'react';
import { FullTripBundle } from '../types/models';
import {
  computeExpenseBalancesAndSettlement,
  optimizeBudgetTiers,
} from '../utils/domainLogic';
import { useI18n } from '../i18n/I18nContext';
import { useAtlas } from '../context/AtlasContext';

interface BudgetTabViewProps {
  bundle: FullTripBundle;
}

export const BudgetTabView: React.FC<BudgetTabViewProps> = ({ bundle }) => {
  const { t } = useI18n();
  const { applyBudgetSelections } = useAtlas();

  const [whatIfBudget, setWhatIfBudget] = useState<number>(bundle.trip.totalBudget);

  // Instant deterministic What-If calculation (Feature B2 — zero AI latency)
  const optimization = useMemo(
    () =>
      optimizeBudgetTiers(
        bundle.days,
        whatIfBudget,
        Math.max(1, bundle.trip.travelersCount)
      ),
    [bundle.days, whatIfBudget, bundle.trip.travelersCount]
  );

  const expenseSummary = useMemo(
    () => computeExpenseBalancesAndSettlement(bundle.expenses, bundle.travelers),
    [bundle.expenses, bundle.travelers]
  );

  // Category & daily breakdown under the What-If selections
  const breakdown = useMemo(() => {
    const scale = Math.max(1, bundle.trip.travelersCount);
    const byCat: Record<string, number> = {
      food: 0,
      culture: 0,
      nature: 0,
      nightlife: 0,
      shopping: 0,
      other: 0,
    };
    const byDay: { dayNumber: number; date: string; estimated: number }[] = [];

    for (const day of bundle.days) {
      const list = day.activePlan === 'B' && day.planB.length > 0 ? day.planB : day.activities;
      let dayTotal = 0;
      for (const act of list) {
        const tier = optimization.selections[act.id] || act.selectedTier;
        const cost = act.costOptions[tier].estimatedCost * scale;
        dayTotal += cost;
        byCat[act.category] = (byCat[act.category] || 0) + cost;
      }
      byDay.push({ dayNumber: day.dayNumber, date: day.date, estimated: dayTotal });
    }

    return { byCat, byDay };
  }, [bundle.days, bundle.trip.travelersCount, optimization.selections]);

  const usagePercent = Math.min(
    100,
    Math.round((optimization.totalEstimatedCost / Math.max(1, whatIfBudget)) * 100)
  );
  const isNearOrOver = optimization.totalEstimatedCost > whatIfBudget * 0.9;

  return (
    <div className="space-y-8">
      {/* Living Budget Header & What-If Slider */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
              {t('budget.title')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {t('budget.whatIfLabel')} · All unverified prices are marked as estimates (~).
            </p>
          </div>

          <div className="flex items-center gap-6 font-mono-tabular">
            <div>
              <span className="block text-[11px] text-slate-500 uppercase">Target Budget</span>
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                €{whatIfBudget}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 uppercase">
                {t('budget.estimatedTotal')}
              </span>
              <span className="text-xl font-bold text-amber-700 dark:text-amber-400">
                ~€{optimization.totalEstimatedCost}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 uppercase">
                {t('budget.actualSpent')}
              </span>
              <span className="text-xl font-bold text-teal-700 dark:text-teal-400">
                €{expenseSummary.totalSpent.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive What-If Slider */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <label htmlFor="what-if-slider">
              Slide Total Trip Budget (€150 – €3,000 for {bundle.trip.travelersCount} travellers)
            </label>
            <span className="font-mono-tabular font-semibold">
              €{Math.round(whatIfBudget / Math.max(1, bundle.trip.travelersCount))} / person
            </span>
          </div>
          <input
            id="what-if-slider"
            type="range"
            min={150}
            max={3000}
            step={25}
            value={whatIfBudget}
            onChange={(e) => setWhatIfBudget(Number(e.target.value))}
            className="w-full accent-amber-600 cursor-pointer"
          />

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              style={{ width: `${usagePercent}%` }}
              className={`h-full transition-all ${
                !optimization.withinBudget
                  ? 'bg-rose-600'
                  : isNearOrOver
                  ? 'bg-amber-500'
                  : 'bg-teal-600'
              }`}
            />
          </div>

          {(!optimization.withinBudget || isNearOrOver) && (
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
              ⚠️ {t('budget.overBudgetWarn')}
            </p>
          )}
        </div>

        {/* Live What-If Diff Summary */}
        <div className="rounded-lg bg-[#FAF6F0] dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-mono-tabular font-semibold uppercase text-slate-700 dark:text-slate-300">
              What-If Tier Rebalance Summary ({optimization.changes.length} activity adjustments)
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  applyBudgetSelections(
                    bundle.trip.id,
                    whatIfBudget,
                    optimization.selections
                  )
                }
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                {t('budget.applyChanges')}
              </button>
              <button
                type="button"
                onClick={() => setWhatIfBudget(bundle.trip.totalBudget)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap"
              >
                {t('budget.discardChanges')}
              </button>
            </div>
          </div>

          {optimization.changes.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Current activity tiers are already optimal for €{whatIfBudget}. Drag the slider left or right to preview upgrades or savings.
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {optimization.changes.map((chg) => (
                <li
                  key={chg.activityId}
                  className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/60 dark:border-slate-800 last:border-b-0"
                >
                  <span>
                    <strong className={chg.costDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>
                      {chg.costDelta >= 0 ? '+ Upgraded' : '− Economised'} Day {chg.dayNumber}:
                    </strong>{' '}
                    {chg.activityTitle} → <em>{chg.newOptionTitle}</em> ({chg.fromTier} → {chg.toTier})
                  </span>
                  <span className="font-mono-tabular font-semibold whitespace-nowrap">
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
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
            Estimated vs Actual by Category
          </h3>
          <div className="space-y-2.5 text-xs">
            {Object.entries(breakdown.byCat)
              .filter(([, est]) => est > 0)
              .map(([cat, est]) => {
                const actual = expenseSummary.byCategory[cat] || 0;
                return (
                  <div
                    key={cat}
                    className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800"
                  >
                    <span className="capitalize font-medium">{cat}</span>
                    <span className="font-mono-tabular">
                      Est: ~€{est} · Actual: €{actual.toFixed(2)}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <h3 className="font-serif-atlas text-lg font-semibold text-slate-900 dark:text-white">
            Daily Cost &amp; Group Per-Person Targets
          </h3>
          <div className="space-y-2 text-xs">
            {breakdown.byDay.map((d) => (
              <div
                key={d.dayNumber}
                className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800"
              >
                <span>
                  Day {d.dayNumber} ({d.date})
                </span>
                <span className="font-mono-tabular font-semibold">~€{d.estimated} group total</span>
              </div>
            ))}
          </div>

          {bundle.travelers.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Per-Person Group Budget Status:
              </p>
              {bundle.travelers.map((tr) => {
                const estPerPerson = Math.round(
                  optimization.totalEstimatedCost / Math.max(1, bundle.trip.travelersCount)
                );
                const overPersonal = estPerPerson > tr.budgetPerPerson;
                return (
                  <div key={tr.id} className="flex items-center justify-between font-mono-tabular">
                    <span>
                      {tr.displayName} (Limit €{tr.budgetPerPerson})
                    </span>
                    <span className={overPersonal ? 'text-rose-600 font-semibold' : 'text-emerald-700 dark:text-emerald-400'}>
                      ~€{estPerPerson} {overPersonal ? '⚠️ Above personal cap' : '✓ Within cap'}
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
